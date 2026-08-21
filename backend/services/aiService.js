const HAS_AI = !!process.env.GEMINI_API_KEY;
let genAI = null;
let textModel = null;
let embedModel = null;

if (HAS_AI) {
    try {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        console.log("✅ AI mode: ENABLED (Google Gemini)");
    } catch (e) {
        console.log("⚠️ @google/generative-ai package missing. Run: npm install @google/generative-ai");
    }
} else {
    console.log("ℹ️ AI mode: HEURISTIC (no GEMINI_API_KEY set). App still fully functional.");
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const STOPWORDS = new Set([
    "the", "is", "at", "which", "on", "a", "an", "and", "or", "of", "to", "in", "it", "that",
    "this", "for", "with", "as", "are", "was", "were", "be", "by", "from", "has", "have",
    "had", "will", "can", "its", "their", "about", "into", "also", "which", "these", "those"
]);

function extractKeywords(text, n) {
    n = n || 8;
    const freq = {};
    (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).forEach((w) => {
        if (w.length > 3 && !STOPWORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]);
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function capitalize(s) { return (s || "").charAt(0).toUpperCase() + (s || "").slice(1); }

function ensureMinKeywords(topic, keywords, minCount) {
    const kws = (keywords || []).slice();
    let i = 1;
    while (kws.length < minCount) { kws.push(topic + " point " + i); i++; }
    return kws;
}

function buildFallbackQuiz(topic, keywords) {
    const kws = ensureMinKeywords(topic, keywords, 5);
    const count = Math.min(5, kws.length);
    const qs = [];
    for (let i = 0; i < count; i++) {
        const correct = kws[i];
        const pool = kws.filter((k) => k !== correct);
        const options = shuffleArray([
            correct,
            pool[0] || topic + " (unrelated)",
            pool[1] || "None of these",
            pool[2] || "Not covered in this lesson",
        ]);
        qs.push({
            question: 'Which of these was discussed in relation to "' + topic + '"?',
            options,
            answerIndex: options.indexOf(correct),
        });
    }
    return qs;
}

// Build flashcards from a heading/topic WITHOUT calling the AI.
// Links are resolved server-side by visualLibrary.resolveFlashcards.
function buildFlashcardsForHeading(heading, keywords) {
    const kws = ensureMinKeywords(heading, keywords, 3);
    const labels = {
        "3d": { singular: "3D Model", verb: "shows a 3D model of" },
        "animation": { singular: "Animation", verb: "animates" },
        "simulation": { singular: "Simulation", verb: "provides an interactive simulation of" },
    };
    const result = {};
    ["3d", "animation", "simulation"].forEach((type) => {
        const lab = labels[type];
        result[type] = [0, 1, 2].map((i) => {
            const kw = kws[i % kws.length] || heading;
            const query = (kw + " " + heading).replace(/\s+/g, " ").trim();
            return {
                title: capitalize(kw) + " — " + lab.singular,
                description: "This " + lab.singular.toLowerCase() + " " + lab.verb + ' "' + kw + '" from the section "' + heading + '".',
                query: query,
            };
        });
    });
    return result;
}

// Legacy fallback kept for backward compatibility.
function buildFallbackFlashcards(topic, keywords) {
    return buildFlashcardsForHeading(topic, keywords);
}

function extractJSON(text) {
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON found in AI response");
    return JSON.parse(cleaned.slice(start, end + 1));
}

function isRateLimitError(e) {
    const msg = (e && e.message || "").toLowerCase();
    return msg.includes("429") || msg.includes("rate") || msg.includes("quota") || msg.includes("resource_exhausted");
}

function isValidFlashcards(fc) {
    if (!fc) return false;
    const types = ["3d", "animation", "simulation"];
    return types.every((t) => Array.isArray(fc[t]) && fc[t].length > 0);
}

function isValidQuiz(q) {
    return Array.isArray(q) && q.length > 0 && q.every((item) =>
        item.question && Array.isArray(item.options) && item.options.length === 4 &&
        typeof item.answerIndex === "number"
    );
}

async function embedText(text) {
    if (!HAS_AI || !embedModel) return null;
    try {
        const res = await embedModel.embedContent((text || "").slice(0, 8000));
        return res.embedding.values;
    } catch (e) {
        console.log("embed error:", e.message);
        return null;
    }
}

function cosineSim(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function keywordOverlapScore(text, chunk) {
    const words = new Set((text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/));
    let score = 0;
    (chunk.keywords || []).forEach((k) => { if (words.has(k)) score++; });
    return score;
}

// ---------------------------------------------------------------------------
// Heading-level AI helpers
// ---------------------------------------------------------------------------

// Single AI pass that extracts headings when PDF font heuristics fail.
async function extractHeadingsWithAI(rawText) {
    if (!HAS_AI || !textModel) return null;
    try {
        const prompt =
            "You are analyzing a textbook/lesson PDF for a classroom app. " +
            "Identify the MAIN section headings in the passage below (aim for 5–15 headings). " +
            "For each heading return a short excerpt of the text under that heading (max 400 characters) " +
            "and 3-6 specific technical keywords.\n\n" +
            "Return STRICT JSON only of shape: " +
            '{"sections":[{"heading":"...","passage":"...","keywords":["..."]}]}\n\n' +
            "PASSAGE:\n" + (rawText || "").slice(0, 12000);

        const result = await textModel.generateContent(prompt);
        const parsed = extractJSON(result.response.text());
        if (!parsed || !Array.isArray(parsed.sections) || !parsed.sections.length) return null;
        return parsed.sections
            .filter((s) => s && s.heading)
            .map((s) => ({
                heading: String(s.heading).trim().slice(0, 100),
                text: (s.passage ? s.heading + "\n\n" + s.passage : s.heading).slice(0, 1500),
                keywords: Array.isArray(s.keywords) ? s.keywords.slice(0, 6) : [],
            }));
    } catch (e) {
        console.log("extractHeadingsWithAI failed:", e.message);
        return null;
    }
}

// Generate quiz for a single heading/section.
async function generateQuizForSection(heading, text, keywords) {
    if (!HAS_AI || !textModel) return buildFallbackQuiz(heading, keywords);

    const prompt =
        "Create a short quiz for school students about this section of a lesson.\n" +
        "SECTION HEADING: " + heading + "\n" +
        "SECTION TEXT: " + (text || "").slice(0, 1500) + "\n\n" +
        "Return STRICT JSON only: {\"quiz\":[" +
        '{"question":"...","options":["a","b","c","d"],"answerIndex":0-3}]} ' +
        "Exactly 5 questions. Each question must test real understanding, use 4 plausible options, " +
        "and be answerable ONLY from the section text above. No markdown.";

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const result = await textModel.generateContent(prompt);
            const parsed = extractJSON(result.response.text());
            if (isValidQuiz(parsed.quiz)) return parsed.quiz;
        } catch (e) {
            if (isRateLimitError(e)) {
                const backoff = 5000 * (attempt + 1);
                console.log("Quiz rate limited, retrying in " + backoff + "ms...");
                await sleep(backoff);
                continue;
            }
            console.log("Quiz generation failed:", e.message);
            break;
        }
    }
    return buildFallbackQuiz(heading, keywords);
}

// Main per-heading analysis used by the upload pipeline.
// section = { heading, text, page, keywords? }
async function analyzeSection(section) {
    const heading = (section && (section.heading || section.topic) || "General Topic").trim();
    const body = (section && section.text) || heading;
    let keywords = (section && Array.isArray(section.keywords) && section.keywords.length)
        ? section.keywords
        : extractKeywords(body, 6);

    if (HAS_AI && textModel && keywords.length < 3) {
        // Heuristics didn't find strong keywords; let AI try once.
        try {
            const result = await textModel.generateContent(
                "Return STRICT JSON only: {\"keywords\":[\"...\",\"...\",\"...\",\"...\",\"...\",\"...\"]} " +
                "with 6 lowercase specific technical keywords from this passage about \"" + heading + "\":\n" +
                body.slice(0, 1200)
            );
            const parsed = extractJSON(result.response.text());
            if (parsed && Array.isArray(parsed.keywords) && parsed.keywords.length) {
                keywords = parsed.keywords.slice(0, 6);
            }
        } catch (e) { /* ignore, keep heuristics */ }
    }

    const quiz = await generateQuizForSection(heading, body, keywords);
    const flashcards = buildFlashcardsForHeading(heading, keywords);

    return {
        topic: heading,
        heading: heading,
        keywords,
        flashcards,
        quiz,
    };
}

// Legacy whole-chunk analyzer retained for any external callers.
async function callGeminiForChunk(text) {
    const prompt =
        "Analyze this textbook passage for a teaching app aimed at school students. Return STRICT JSON only, no markdown formatting, with keys: " +
        "topic (short specific string naming the exact concept, not generic), " +
        "keywords (array of 6 lowercase specific technical terms from the passage), " +
        "flashcards (object with keys '3d','animation','simulation', each an array of exactly 3 objects shaped as " +
        '{"title": short catchy specific title, "description": 1-2 sentence description of exactly what this visualization would show for THIS specific concept, "query": short specific search phrase}), ' +
        'quiz (array of exactly 5 objects shaped as {"question": a specific, non-trivial question testing real understanding of this passage, "options": array of exactly 4 plausible strings, "answerIndex": number 0-3 for the correct option}). ' +
        "Base everything strictly on the actual content below, be specific and technical, not generic. Passage: " + (text || "").slice(0, 2000);

    const result = await textModel.generateContent(prompt);
    return extractJSON(result.response.text());
}

async function analyzeChunk(text) {
    if (HAS_AI && textModel) {
        let lastError = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const parsed = await callGeminiForChunk(text);
                if (parsed.topic && isValidFlashcards(parsed.flashcards)) {
                    if (!isValidQuiz(parsed.quiz)) parsed.quiz = buildFallbackQuiz(parsed.topic, parsed.keywords || []);
                    return parsed;
                }
                lastError = new Error("Incomplete AI response structure");
            } catch (e) {
                lastError = e;
                if (isRateLimitError(e)) {
                    const backoff = 5000 * (attempt + 1);
                    console.log("Rate limited, retrying in " + backoff + "ms (attempt " + (attempt + 1) + "/3)...");
                    await sleep(backoff);
                    continue;
                }
                break;
            }
        }
        console.log("analyzeChunk AI failed after retries, using fallback:", lastError && lastError.message);
    }
    const keywords = extractKeywords(text);
    const topic = keywords.slice(0, 3).join(" ") || "General Topic";
    return {
        topic,
        keywords,
        flashcards: buildFallbackFlashcards(topic, keywords),
        quiz: buildFallbackQuiz(topic, keywords),
    };
}

async function generateSummary(rawText, transcript, matchedTopics) {
    if (HAS_AI && textModel) {
        try {
            const prompt =
                "Create a structured class summary for students who may have missed class. " +
                "Sections required: 'Topics Covered', 'Key Explanations', 'Visuals/Demos Shown', 'Important Definitions', " +
                "'3 Practice Questions'. Base it primarily on the TRANSCRIPT, using the PDF as backup context.\n\n" +
                "PDF CONTENT:\n" + (rawText || "").slice(0, 3000) +
                "\n\nTRANSCRIPT:\n" + (transcript || "(no transcript captured)").slice(0, 3000) +
                "\n\nVISUALS SHOWN:\n" + JSON.stringify(matchedTopics);

            const result = await textModel.generateContent(prompt);
            return result.response.text();
        } catch (e) {
            console.log("generateSummary AI failed, using fallback:", e.message);
        }
    }
    const topics = Array.from(new Set((matchedTopics || []).map((t) => t.topic)));
    return (
        "## Class Summary (auto-generated)\n\n**Topics Covered:**\n" +
        (topics.length ? topics.map((t) => "- " + t).join("\n") : "- General overview of the material") +
        "\n\n**Transcript Excerpt:**\n" +
        (transcript ? transcript.slice(0, 800) : "No voice transcript was captured this session.") +
        "\n\n**Note:** Set GEMINI_API_KEY for richer AI-generated summaries."
    );
}

async function answerFromContext(question, chunks, summary) {
    if (HAS_AI && textModel) {
        try {
            const context = (chunks || []).map((c, i) => "[" + i + "] " + c.text).join("\n\n");
            const prompt =
                "You are a classroom AI tutor. Answer using ONLY the class content below, in the same terms the teacher used. " +
                "If not covered, say so honestly, then give a brief general answer flagged as outside class content.\n\n" +
                "CLASS SUMMARY:\n" + (summary || "N/A") + "\n\nRELEVANT SOURCE SECTIONS:\n" + context +
                "\n\nSTUDENT QUESTION: " + question;

            const result = await textModel.generateContent(prompt);
            return result.response.text();
        } catch (e) {
            console.log("answerFromContext AI failed, using fallback:", e.message);
        }
    }
    if (!chunks || !chunks.length) return "I couldn't find this in the class content yet. Try asking after the teacher covers it.";
    return "Based on what was covered in class:\n\n" + chunks.map((c) => "- " + c.text).join("\n\n");
}

async function matchTranscriptToChunk(transcriptChunk, material) {
    const canEmbed = HAS_AI && material.chunks.length && material.chunks.every((c) => c.embedding);
    if (canEmbed) {
        const emb = await embedText(transcriptChunk);
        if (emb) {
            let best = null, bestScore = -1;
            material.chunks.forEach((c) => {
                const score = cosineSim(emb, c.embedding);
                if (score > bestScore) { bestScore = score; best = c; }
            });
            return { chunk: best, score: bestScore, threshold: 0.55 };
        }
    }
    let best = null, bestScore = -1;
    material.chunks.forEach((c) => {
        const score = keywordOverlapScore(transcriptChunk, c);
        if (score > bestScore) { bestScore = score; best = c; }
    });
    return { chunk: best, score: bestScore, threshold: 1 };
}

async function rankChunksForQuestion(question, material, topN) {
    topN = topN || 4;
    const canEmbed = HAS_AI && material.chunks.length && material.chunks.every((c) => c.embedding);
    if (canEmbed) {
        const emb = await embedText(question);
        if (emb) {
            return material.chunks
                .map((c) => Object.assign({}, c, { score: cosineSim(emb, c.embedding) }))
                .sort((a, b) => b.score - a.score).slice(0, topN);
        }
    }
    return material.chunks
        .map((c) => Object.assign({}, c, { score: keywordOverlapScore(question, c) }))
        .sort((a, b) => b.score - a.score).slice(0, topN);
}

module.exports = {
    HAS_AI, embedText, cosineSim, analyzeChunk, analyzeSection,
    extractHeadingsWithAI, buildFlashcardsForHeading,
    generateSummary, answerFromContext, matchTranscriptToChunk, rankChunksForQuestion,
    extractKeywords,
};
