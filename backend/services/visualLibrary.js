// ---------------------------------------------------------------------------
// Visual library
// Resolves a flashcard query/heading into a concrete, background-fetched link.
// Priority order per type:
//   simulation  -> curated PhET sim, else PhET search page
//   3d          -> Wikimedia Commons image (embeddable), else Wikipedia page,
//                  else Sketchfab search
//   animation   -> Wikimedia Commons video/GIF (embeddable), else curated
//                  YouTube video, else YouTube search
// ---------------------------------------------------------------------------

const PHET_SIMS = {
    "pendulum-lab": { keys: ["pendulum", "simple pendulum", "oscillation", "harmonic motion"], title: "Pendulum Lab" },
    "photosynthesis": { keys: ["photosynthesis", "chlorophyll", "light reaction", "calvin cycle"], title: "Photosynthesis" },
    "circuit-construction-kit-dc": { keys: ["circuit", "electric circuit", "resistor", "battery", "ohm", "voltage", "current"], title: "Circuit Construction Kit" },
    "wave-on-a-string": { keys: ["wave", "wavelength", "frequency", "amplitude", "transverse wave"], title: "Wave on a String" },
    "gravity-and-orbits": { keys: ["gravity", "orbit", "orbital", "kepler", "solar system", "gravitational"], title: "Gravity and Orbits" },
    "energy-forms-and-changes": { keys: ["energy", "energy transfer", "forms of energy", "thermal energy"], title: "Energy Forms and Changes" },
    "build-an-atom": { keys: ["atom", "proton", "neutron", "electron", "atomic structure"], title: "Build an Atom" },
    "ohms-law": { keys: ["ohm's law", "ohm's", "v=ir"], title: "Ohm's Law" },
    "forces-and-motion-basics": { keys: ["force", "friction", "motion", "newton", "acceleration", "net force"], title: "Forces and Motion" },
    "masses-and-springs": { keys: ["spring", "hooke", "elastic", "spring constant"], title: "Masses and Springs" },
    "projectile-motion": { keys: ["projectile", "trajectory", "parabola"], title: "Projectile Motion" },
    "states-of-matter-basics": { keys: ["states of matter", "solid", "liquid", "gas", "phase change", "melting", "boiling"], title: "States of Matter" },
    "gas-properties": { keys: ["gas law", "ideal gas", "boyle", "charles", "pressure gas", "kinetic theory"], title: "Gas Properties" },
    "density": { keys: ["density", "buoyancy", "mass volume"], title: "Density" },
    "balancing-chemical-equations": { keys: ["balancing equation", "chemical equation", "stoichiometry"], title: "Balancing Chemical Equations" },
    "build-a-molecule": { keys: ["molecule", "covalent bond", "molecular formula"], title: "Build a Molecule" },
    "reactants-products-and-leftovers": { keys: ["reactant", "product", "leftover", "limiting reagent"], title: "Reactants, Products and Leftovers" },
    "molarity": { keys: ["molarity", "concentration solution", "mole solution"], title: "Molarity" },
    "acid-base-solutions": { keys: ["acid", "base", "ph", "alkali", "neutralization"], title: "Acid-Base Solutions" },
    "ph-scale": { keys: ["ph scale", "ph level"], title: "pH Scale" },
    "isotopes-and-atomic-mass": { keys: ["isotope", "atomic mass", "mass number"], title: "Isotopes and Atomic Mass" },
    "molecule-shapes": { keys: ["molecule shape", "vsepr", "molecular geometry"], title: "Molecule Shapes" },
    "states-of-matter": { keys: ["states of matter advanced", "intermolecular", "lennard-jones"], title: "States of Matter" },
    "friction": { keys: ["friction force", "kinetic friction"], title: "Friction" },
    "gravity-force-lab": { keys: ["gravity force", "gravitational force", "newton gravity"], title: "Gravity Force Lab" },
    "coulombs-law": { keys: ["coulomb", "electrostatic", "electric force"], title: "Coulomb's Law" },
    "bending-light": { keys: ["refraction", "reflection", "bending light", "snell", "lens", "prism"], title: "Bending Light" },
    "color-vision": { keys: ["color vision", "rgb", "light color"], title: "Color Vision" },
    "geometric-optics": { keys: ["geometric optics", "convex lens", "concave mirror", "focal point"], title: "Geometric Optics" },
    "faradays-law": { keys: ["faraday", "electromagnetic induction", "magnetic flux"], title: "Faraday's Law" },
    "magnets-and-electromagnets": { keys: ["magnet", "electromagnet", "magnetic field", "solenoid"], title: "Magnets and Electromagnets" },
    "john-travoltage": { keys: ["static electricity", "electric discharge", "travoltage"], title: "John Travoltage" },
    "balloons-and-static-electricity": { keys: ["static", "charge", "balloon static"], title: "Balloons and Static Electricity" },
    "energy-skate-park": { keys: ["skate park", "potential kinetic energy", "conservation of energy"], title: "Energy Skate Park" },
    "collision-lab": { keys: ["collision", "momentum", "elastic collision", "impulse"], title: "Collision Lab" },
    "rotation": { keys: ["rotation", "angular velocity", "torque", "moment of inertia"], title: "Rotation" },
    "torque": { keys: ["torque", "lever arm", "fulcrum"], title: "Torque" },
    "plate-tectonics": { keys: ["plate tectonics", "tectonic plates", "continental drift"], title: "Plate Tectonics" },
    "greenhouse-effect": { keys: ["greenhouse effect", "global warming", "greenhouse gases"], title: "Greenhouse Effect" },
    "glaciers": { keys: ["glacier", "ice age", "melting ice"], title: "Glaciers" },
    "natural-selection": { keys: ["natural selection", "evolution", "darwin", "adaptation"], title: "Natural Selection" },
    "gene-expression-essentials": { keys: ["gene expression", "transcription", "translation", "protein synthesis"], title: "Gene Expression Essentials" },
    "neural-network": { keys: ["neural network", "neuron", "perceptron"], title: "Neural Network" },
    "wave-interference": { keys: ["interference", "diffraction", "double slit", "standing wave"], title: "Wave Interference" },
    "sound": { keys: ["sound wave", "sound", "pitch", "loudness"], title: "Sound" },
    "blackbody-spectrum": { keys: ["blackbody", "radiation spectrum", "planck", "thermal radiation"], title: "Blackbody Spectrum" },
    "atomic-interactions": { keys: ["atomic interaction", "london dispersion", "van der waals"], title: "Atomic Interactions" },
    "rutherford-scattering": { keys: ["rutherford", "alpha particle", "gold foil"], title: "Rutherford Scattering" },
    "models-of-the-hydrogen-atom": { keys: ["hydrogen atom", "bohr model", "energy level", "spectrum"], title: "Models of the Hydrogen Atom" },
    "beers-law-lab": { keys: ["beer's law", "absorbance", "spectrophotometer"], title: "Beer's Law Lab" },
    "concentration": { keys: ["concentration", "dilution", "solute"], title: "Concentration" },
};

// Curated YouTube videos (only very well-known ones we're confident about).
// Fallback is always a YouTube search, so this is a small list.
const YOUTUBE_VIDEOS = {
    "photosynthesis": { id: "UPBMG5EYydo", title: "Photosynthesis explained" },
    "newton laws": { id: "kKKM8Y-u7ds", title: "Newton's Laws of Motion" },
    "mitosis": { id: "f-ldPgEfAHI", title: "Mitosis" },
    "meiosis": { id: "Vz18q-dI3Rk", title: "Meiosis" },
    "water cycle": { id: "al-doLYWr7U", title: "The Water Cycle" },
    "solar system": { id: "libKVRa01L8", title: "The Solar System" },
    "gravity": { id: "hZVQ6bBm_7I", title: "Gravity explained" },
};

function phetUrl(slug) {
    return "https://phet.colorado.edu/sims/html/" + slug + "/latest/" + slug + "_en.html";
}

function matchPhet(query) {
    const q = " " + (query || "").toLowerCase() + " ";
    let best = null;
    let bestScore = 0;
    for (const slug of Object.keys(PHET_SIMS)) {
        const entry = PHET_SIMS[slug];
        for (const k of entry.keys) {
            if (q.includes(" " + k + " ") || q.includes(k + " ") || q.includes(" " + k)) {
                const score = k.length;
                if (score > bestScore) { bestScore = score; best = slug; }
            }
        }
    }
    return best;
}

function matchYoutube(query) {
    const q = " " + (query || "").toLowerCase() + " ";
    for (const key of Object.keys(YOUTUBE_VIDEOS)) {
        if (q.includes(key)) return YOUTUBE_VIDEOS[key];
    }
    return null;
}

// Clean a query/heading into a Wikipedia-friendly title.
function toWikiTitle(query) {
    const t = (query || "")
        .replace(/[^a-zA-Z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!t) return "";
    return t.charAt(0).toUpperCase() + t.slice(1);
}

// Query Wikimedia Commons for an image (mime: image/*) about a subject.
async function commonsSearch(query, fileType) {
    const term = (query || "").trim();
    if (!term) return null;
    const typeFilter = fileType === "video"
        ? "filetype:video/*"
        : "filetype:image/*";
    const params = new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrsearch: term + " " + typeFilter,
        gsrnamespace: "6",
        gsrlimit: "3",
        prop: "imageinfo",
        iiprop: "url|mime|size",
        iiurlwidth: fileType === "video" ? "640" : "900",
    });
    const url = "https://commons.wikimedia.org/w/api.php?" + params.toString() + "&origin=*";

    try {
        const controller = new AbortController();
        const timer = setTimeout(function () { controller.abort(); }, 4500);
        const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "SmartClassroom/1.0" } });
        clearTimeout(timer);
        if (!res.ok) return null;
        const data = await res.json();
        const pages = data && data.query && data.query.pages;
        if (!pages) return null;
        const sorted = Object.values(pages).sort(function (a, b) { return (a.index || 99) - (b.index || 99); });
        for (const p of sorted) {
            const ii = p.imageinfo && p.imageinfo[0];
            if (!ii) continue;
            if (fileType === "video" && ii.mime && ii.mime.indexOf("video") === 0) {
                return { url: ii.url, thumb: ii.thumburl || ii.url, mime: ii.mime, title: p.title };
            }
            if (fileType !== "video" && ii.mime && ii.mime.indexOf("image") === 0) {
                return { url: ii.url, mime: ii.mime, title: p.title };
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

function isEmbeddableHost(url) {
    return /phet\.colorado\.edu|wikimedia\.org|wikipedia\.org|youtube(-nocookie)?\.com|youtu\.be/i.test(url || "");
}

async function resolveVisual(type, query, cardTitle) {
    const q = (query || cardTitle || "").toLowerCase();
    const searchTerm = (query || cardTitle || "").trim();

    if (type === "simulation") {
        const slug = matchPhet(q);
        if (slug) {
            return {
                embeddable: true,
                url: phetUrl(slug),
                kind: "iframe",
                title: PHET_SIMS[slug].title,
            };
        }
        return {
            embeddable: false,
            url: "https://phet.colorado.edu/en/simulations/filter?search=" + encodeURIComponent(searchTerm),
            kind: "link",
        };
    }

    if (type === "3d" || type === "image") {
        const img = await commonsSearch(searchTerm, "image");
        if (img) {
            return {
                embeddable: true,
                url: img.url,
                kind: "image",
                title: img.title,
            };
        }
        const wikiTitle = toWikiTitle(searchTerm);
        if (wikiTitle) {
            return {
                embeddable: true,
                // Special:FilePath redirects to the lead image when no file is given.
                url: "https://en.wikipedia.org/wiki/Special:FilePath/" + encodeURIComponent(wikiTitle) + "?width=900",
                kind: "image",
                title: wikiTitle,
            };
        }
        return {
            embeddable: false,
            url: "https://sketchfab.com/search?q=" + encodeURIComponent(searchTerm) + "&type=models",
            kind: "link",
        };
    }

    if (type === "animation") {
        const vid = await commonsSearch(searchTerm, "video");
        if (vid) {
            return {
                embeddable: true,
                url: vid.url,
                kind: "video",
                title: vid.title,
                poster: vid.thumb,
            };
        }
        const yt = matchYoutube(q);
        if (yt) {
            return {
                embeddable: true,
                url: "https://www.youtube-nocookie.com/embed/" + yt.id + "?rel=0",
                kind: "iframe",
                title: yt.title,
            };
        }
        return {
            embeddable: false,
            url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(searchTerm + " animation explained"),
            kind: "link",
        };
    }

    return { embeddable: false, url: "#", kind: "link" };
}

async function resolveFlashcards(flashcards) {
    const result = {};
    const types = Object.keys(flashcards || {});
    for (let t = 0; t < types.length; t++) {
        const type = types[t];
        const list = flashcards[type] || [];
        const resolvedList = [];
        for (let i = 0; i < list.length; i++) {
            const card = list[i];
            const r = await resolveVisual(type, card.query, card.title);
            resolvedList.push({
                id: type + "-" + i + "-" + Math.random().toString(36).slice(2, 7),
                type: type,
                title: card.title,
                description: card.description,
                query: card.query,
                url: r.url,
                embeddable: r.embeddable,
                kind: r.kind || (r.embeddable ? "iframe" : "link"),
                poster: r.poster || null,
            });
        }
        result[type] = resolvedList;
    }
    return result;
}

module.exports = { resolveVisual, resolveFlashcards, matchPhet, toWikiTitle };
