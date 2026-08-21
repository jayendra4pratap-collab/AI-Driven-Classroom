const pdfParse = require("pdf-parse");
const fs = require("fs");

async function extractTextFromFile(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(dataBuffer);
    return { text: parsed.text || "", numPages: parsed.numpages || 1 };
}

// ---------------------------------------------------------------------------
// Heading / section extraction
// ---------------------------------------------------------------------------
// Strategy (in order):
//   1. Try pdfjs-dist font-metadata heuristics (larger/bold text = heading).
//   2. Fall back to line-based regex heuristics on the extracted text.
//   3. Caller (aiService) can pass the result through an AI pass if too few
//      sections were found.
// ---------------------------------------------------------------------------

let pdfjsLib = null;
try {
    // v3 legacy build works reliably in CommonJS / Node without a worker.
    pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
} catch (e) {
    console.log("ℹ️ pdfjs-dist not installed; using text-based heading heuristics. Run: npm install pdfjs-dist@3.11.174");
}

// Lines that are short, Title-Cased or ALL CAPS, and not a sentence are
// strong heading candidates when font metadata is unavailable.
const HEADING_REGEX = /^(\d+(\.\d+)*\.?\s+)?[A-Z0-9][A-Za-z0-9 ,&()\-:/'+]{2,80}$/;
const SENTENCE_LIKE = /[.,;?]\s*$|^(the|a|an|this|these|those|it|we|they|in|on|for|of|to|and|but|if|when|while)\b/i;

function looksLikeHeadingLine(line) {
    const t = (line || "").trim();
    if (t.length < 3 || t.length > 80) return false;
    if (t.split(/\s+/).length > 12) return false;
    if (SENTENCE_LIKE.test(t)) return false;
    return HEADING_REGEX.test(t);
}

function splitByLineHeadings(text) {
    const paragraphs = (text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const sections = [];
    let current = null;
    let preamble = [];

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const firstLine = p.split("\n")[0].trim();
        if (looksLikeHeadingLine(firstLine) && firstLine.length < 60) {
            if (current) sections.push(current);
            current = {
                heading: firstLine.replace(/^\d+(\.\d+)*\.?\s+/, "").trim(),
                text: p,
                page: 1,
            };
        } else if (current) {
            current.text += "\n\n" + p;
        } else {
            preamble.push(p);
        }
    }
    if (current) sections.push(current);

    // If no real headings were found, return null so caller can fall back.
    if (sections.length < 2) {
        const fallbackText = sections.length ? sections[0].text : text;
        return [{ heading: "Overview", text: fallbackText, page: 1 }];
    }

    // Anything before the first heading becomes a short "Introduction" section.
    if (preamble.length) {
        sections.unshift({ heading: "Introduction", text: preamble.join("\n\n"), page: 1 });
    }
    return sections;
}

async function splitByFontMetadata(filePath) {
    if (!pdfjsLib) return null;

    let doc;
    try {
        const data = new Uint8Array(fs.readFileSync(filePath));
        doc = await pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
    } catch (e) {
        console.log("pdfjs load failed:", e.message);
        return null;
    }

    const allLines = []; // { text, size, bold, page, y }
    let lastPage = 1;

    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        lastPage = p;
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });

        // Group items into visual lines by their Y coordinate.
        const lineMap = new Map();
        for (const item of content.items) {
            if (!item.str || !item.str.trim()) continue;
            // item.transform[5] is y, item.transform[0] is font size approx
            const y = Math.round(item.transform[5]);
            const size = Math.round((item.height || item.transform[0] || 10) * 10) / 10;
            const bold = (item.fontName && /bold|black|heavy|demi/i.test(item.fontName)) ||
                (item.fontName && /bold/i.test(item.fontName));
            const key = p + ":" + y;
            if (!lineMap.has(key)) {
                lineMap.set(key, { text: "", size, bold, page: p, y, x: item.transform[4] });
            }
            const line = lineMap.get(key);
            line.text += item.str;
            line.size = Math.max(line.size, size);
            line.bold = line.bold || bold;
        }

        const lines = Array.from(lineMap.values()).sort((a, b) => (a.y < b.y ? 1 : a.y > b.y ? -1 : a.x - b.x));
        for (const l of lines) allLines.push(l);
    }

    if (!allLines.length) return null;

    // Compute dominant body font size. Heuristic: a line is a heading if its
    // font size is at least 1.25x the most common size, OR it is bold AND
    // notably larger than the small-text average.
    const sizeCounts = {};
    for (const l of allLines) sizeCounts[l.size] = (sizeCounts[l.size] || 0) + 1;
    const bodySize = parseFloat(
        Object.entries(sizeCounts).sort((a, b) => b[1] - a[1])[0][0]
    );
    const headingThreshold = Math.round(bodySize * 1.2 * 10) / 10;

    // Avoid picking page numbers / stray large text: require heading-looking text.
    const headings = [];
    for (let i = 0; i < allLines.length; i++) {
        const l = allLines[i];
        const t = l.text.trim();
        if (!t || t.length < 3 || t.length > 80) continue;
        const isBig = l.size >= headingThreshold;
        const isBoldHeading = l.bold && l.size >= bodySize + 1 && looksLikeHeadingLine(t);
        if ((isBig || isBoldHeading) && looksLikeHeadingLine(t)) {
            headings.push({ index: i, text: t.replace(/^\d+(\.\d+)*\.?\s+/, "").trim(), page: l.page });
        }
    }

    // Deduplicate consecutive repeats (PDFs sometimes duplicate text layers).
    const filtered = [];
    for (const h of headings) {
        const prev = filtered[filtered.length - 1];
        if (prev && prev.text === h.text && Math.abs(prev.index - h.index) <= 3) continue;
        filtered.push(h);
    }

    if (filtered.length < 2) return null;

    // Build sections: heading + all lines until the next heading.
    const sections = [];
    for (let i = 0; i < filtered.length; i++) {
        const start = filtered[i].index + 1;
        const end = i + 1 < filtered.length ? filtered[i + 1].index : allLines.length;
        const body = allLines.slice(start, end).map((l) => l.text).join(" ").trim();
        sections.push({
            heading: filtered[i].text,
            text: filtered[i].text + "\n\n" + body,
            page: filtered[i].page,
        });
    }

    return sections;
}

// Main entry point used by the upload route. Returns sections in the shape:
// [{ heading, text, page }]. Always returns at least one section.
async function extractSections(filePath, rawText, numPages) {
    let sections = null;

    if (pdfjsLib) {
        try {
            sections = await splitByFontMetadata(filePath);
        } catch (e) {
            console.log("Font heading detection failed:", e.message);
        }
    }

    if (!sections || sections.length < 2) {
        sections = splitByLineHeadings(rawText || "");
    }

    // Annotate a guessed page number if missing (pdf-parse doesn't expose
    // per-line pages, but font-detection does).
    const perPage = Math.max(1, Math.ceil(sections.length / (numPages || 1)));
    sections.forEach((s, i) => {
        if (!s.page) s.page = Math.min(numPages || 1, Math.floor(i / perPage) + 1);
    });

    return sections;
}

// Legacy chunker kept for backwards compatibility / fallback.
function chunkText(text, maxChunks) {
    maxChunks = maxChunks || 25;
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return ["Empty document"];

    let size = 350;
    let totalChunks = Math.ceil(words.length / size);
    if (totalChunks > maxChunks) size = Math.ceil(words.length / maxChunks);

    const chunks = [];
    for (let i = 0; i < words.length; i += size) {
        chunks.push(words.slice(i, i + size).join(" "));
    }
    return chunks;
}

module.exports = { extractTextFromFile, chunkText, extractSections, splitByLineHeadings };
