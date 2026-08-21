const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const { auth } = require("../middleware/auth");
const { db, persist, genId } = require("../utils/db");
const { extractTextFromFile, extractSections, chunkText } = require("../services/pdfService");
const {
    analyzeSection, embedText, HAS_AI,
    extractHeadingsWithAI, extractKeywords,
    buildFlashcardsForHeading, buildFallbackQuiz,
} = require("../services/aiService");
const { resolveFlashcards } = require("../services/visualLibrary");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// ===========================================================================
// BACKGROUND ANALYSIS
// Runs AFTER the response is sent so the teacher can start teaching
// immediately. Updates the material in-place; the frontend polls
// GET /material/:id to pick up new flashcards / quizzes / embeddings.
// ===========================================================================
async function runBackgroundAnalysis(material, sections, rawText) {
    try {
        let working = sections;

        // If fast heuristics only found 1 section, ask AI for headings
        // (this is the only AI call that can change the chunk list).
        if (working.length <= 1 && HAS_AI && rawText && rawText.length > 200) {
            material.analysisStatus = "detecting-headings";
            persist();
            console.log("📑 Few headings detected; asking AI to extract section headings...");
            const aiSections = await extractHeadingsWithAI(rawText);
            if (aiSections && aiSections.length >= 2) {
                working = aiSections;
                // Rebuild the chunk list with the AI-detected headings.
                material.chunks = working.map((sec, i) => ({
                    id: genId(),
                    page: sec.page || Math.floor(i / Math.max(1, working.length / (material.numPages || 1))) + 1,
                    text: sec.text,
                    topic: sec.heading,
                    heading: sec.heading,
                    keywords: extractKeywords(sec.text, 6),
                    flashcards: { "3d": [], animation: [], simulation: [] },
                    quiz: [],
                    embedding: null,
                    analyzing: true,
                }));
                persist();
            }
        }

        material.analysisStatus = "analyzing";
        material.analysisProgress = { done: 0, total: working.length };
        persist();

        console.log("🤖 Background AI analysis started for " + working.length + " heading(s).");

        for (let i = 0; i < working.length; i++) {
            const sec = working[i];
            console.log("  → Analyzing heading " + (i + 1) + "/" + working.length + ": " + (sec.heading || "Untitled"));

            const analysis = await analyzeSection(sec);
            const flashcards = await resolveFlashcards(analysis.flashcards);
            const embedding = await embedText(sec.text);

            // Update the matching chunk (by index; if AI heading rebuild
            // happened, indexes line up with the rebuilt array).
            const chunk = material.chunks[i];
            if (chunk) {
                chunk.text = sec.text;
                chunk.topic = analysis.topic || sec.heading;
                chunk.heading = analysis.heading || sec.heading;
                chunk.keywords = analysis.keywords;
                chunk.flashcards = flashcards;
                chunk.quiz = analysis.quiz || [];
                chunk.embedding = embedding;
                chunk.analyzing = false;
            }

            material.analysisProgress = { done: i + 1, total: working.length };
            persist();

            if (HAS_AI && i < working.length - 1) {
                await sleep(4500); // stay under Gemini free-tier rate limit
            }
        }

        material.analysisStatus = "ready";
        material.analysisProgress = { done: working.length, total: working.length };
        persist();
        console.log("✅ Background AI analysis complete: " + working.length + " heading(s).");
    } catch (e) {
        console.error("❌ Background analysis failed:", e);
        material.analysisStatus = "error";
        material.analysisError = e.message;
        (material.chunks || []).forEach((c) => { c.analyzing = false; });
        persist();
    }
}

router.post("/upload/:classroomId", auth(["teacher"]), upload.single("pdf"), async (req, res) => {
    try {
        const classroomId = req.params.classroomId;
        if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });

        const filePath = req.file.path;
        const fileUrl = "/uploads/" + path.basename(filePath);

        // Fast text + heading detection (no AI calls here so the response
        // comes back immediately).
        const extracted = await extractTextFromFile(filePath);
        const rawText = extracted.text;
        const numPages = extracted.numPages;
        const sections = await extractSections(filePath, rawText, numPages);

        // Absolute fallback so there is always at least one chunk to show.
        const initialSections = sections.length
            ? sections
            : chunkText(rawText, 25).map((t, i) => ({ heading: "Section " + (i + 1), text: t, page: 1 }));

        console.log("📄 PDF uploaded. " + initialSections.length + " heading(s) found instantly.");

        // Build chunks with immediately-available data. Heuristic keywords
        // are filled in so live transcript matching works before AI finishes.
        const chunks = initialSections.map((sec, i) => ({
            id: genId(),
            page: sec.page || Math.floor(i / Math.max(1, initialSections.length / (numPages || 1))) + 1,
            text: sec.text,
            topic: sec.heading,
            heading: sec.heading,
            keywords: extractKeywords(sec.text, 6),
            flashcards: { "3d": [], animation: [], simulation: [] },
            quiz: [],
            embedding: null,
            analyzing: true,
        }));

        const material = {
            id: genId(),
            classroomId,
            title: req.body.title || req.file.originalname,
            fileUrl,
            rawText,
            numPages,
            chunks,
            analysisStatus: HAS_AI ? "detecting-headings" : "ready",
            analysisProgress: { done: 0, total: initialSections.length },
            createdAt: new Date().toISOString(),
        };

        // If there's no AI key, resolve links + heuristic quiz right away
        // (no rate-limited calls to wait on) before returning.
        if (!HAS_AI) {
            for (const c of chunks) {
                c.flashcards = await resolveFlashcards(buildFlashcardsForHeading(c.heading, c.keywords));
                c.quiz = buildFallbackQuiz(c.heading, c.keywords);
                c.analyzing = false;
            }
        }

        db.materials.push(material);

        const post = {
            id: genId(), classroomId, type: "material",
            title: "📄 New Material: " + material.title, materialId: material.id,
            fileUrl, createdAt: new Date().toISOString(),
        };
        db.posts.push(post);
        persist();

        // Respond FIRST so the UI can open the PDF immediately...
        res.json(material);

        // ...then kick off AI analysis in the background.
        if (HAS_AI) {
            // Don't await — intentional fire-and-forget after response.
            runBackgroundAnalysis(material, initialSections, rawText)
                .catch((e) => console.error("Background analysis crashed:", e));
        } else {
            console.log("ℹ️ No GEMINI_API_KEY — PDF ready without AI analysis.");
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Upload processing failed: " + e.message });
    }
});

router.get("/:id", auth(), (req, res) => {
    const m = db.materials.find((x) => x.id === req.params.id);
    if (!m) return res.status(404).json({ error: "Not found" });
    const clean = JSON.parse(JSON.stringify(m));
    clean.chunks.forEach((c) => delete c.embedding);
    res.json(clean);
});

module.exports = router;
