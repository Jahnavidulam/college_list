// Build a single self-contained HTML file of the College Directory, for hosts
// that only accept one HTML file with no external requests (the easyloops
// artifacts store: one file, at most 5 MB, CDN/font requests blocked).
//
// Everything the localhost version loads is inlined: CSS, FontAwesome and
// Google fonts (as data URIs), Chart.js, app.js, and the data files plus SheetJS
// (gzip + base64, unpacked in the browser and served to app.js through fetch).
//
// Usage (from the project root, Node 18+):
//     node pipeline/build_single_file.js [out.html]
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "college_directory_single.html"));
const MAX_BYTES = 5 * 1024 * 1024;

const CHART_JS = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.1/chart.umd.min.js";
const SHEET_JS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// Files app.js fetches by name -> where the bytes come from.
const EMBEDDED_FILES = {
    "colleges_db.json": { file: "colleges_db.json", minifyJson: true, type: "application/json" },
    "team_assignments.json": { file: "team_assignments.json", minifyJson: true, type: "application/json" },
    "india_engineering_colleges.csv": { file: "india_engineering_colleges.csv", type: "text/csv" },
    // Only needed for the Excel download, so it is stored compressed and
    // unpacked by app.js on demand.
    "xlsx.full.min.js": { url: SHEET_JS, type: "text/javascript" },
};

const read = (p) => fs.readFileSync(path.join(ROOT, p));
const readText = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

async function download(url, asText = true) {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    return asText ? res.text() : Buffer.from(await res.arrayBuffer());
}

const dataUri = (buf, mime) => `data:${mime};base64,${buf.toString("base64")}`;
// Keep inlined code from closing its own <script>/<style> tag early.
const safeScript = (js) => js.replace(/<\/script/gi, "<\\/script");
const safeStyle = (css) => css.replace(/<\/style/gi, "<\\/style");

async function googleFontsCss() {
    const css = await download(GOOGLE_FONTS);
    // Keep only the latin subset; inline each font file.
    const blocks = css.split(/(?=\/\* [\w-]+ \*\/)/).filter(b => b.startsWith("/* latin */"));
    const urls = [...new Set(blocks.join("").match(/https:\/\/[^)]+\.woff2/g))];
    const files = Object.fromEntries(await Promise.all(urls.map(async u => [u, await download(u, false)])));
    return blocks.join("\n").replace(/https:\/\/[^)]+\.woff2/g, u => dataUri(files[u], "font/woff2"));
}

function fontAwesomeCss() {
    // Drop the .ttf fallbacks (never needed next to woff2, and they'd be blocked requests).
    return readText("fontawesome.min.css").replace(/,\s*url\(fonts\/[\w.-]+\.ttf\)\s*format\(["']truetype["']\)/g, "").replace(/url\(fonts\/([\w.-]+\.woff2)\)/g, (m, name) => {
        const p = path.join(ROOT, "fonts", name);
        return fs.existsSync(p) ? `url(${dataUri(fs.readFileSync(p), "font/woff2")})` : m;
    });
}

async function embeddedDataScripts() {
    const tags = [];
    const map = {};
    for (const [i, [name, spec]] of Object.entries(EMBEDDED_FILES).entries()) {
        let bytes = spec.url ? await download(spec.url, false) : read(spec.file);
        if (spec.minifyJson) bytes = Buffer.from(JSON.stringify(JSON.parse(bytes.toString("utf8"))));
        const id = `embedded-file-${i}`;
        map[name] = { id, type: spec.type };
        tags.push(`<script type="application/octet-stream" id="${id}">${zlib.gzipSync(bytes, { level: 9 }).toString("base64")}</script>`);
    }
    const shim = `
window.EMBEDDED_SINGLE_FILE = true;
(function () {
    var FILES = ${JSON.stringify(map)};
    var cache = {};
    function unpack(name) {
        if (!cache[name]) {
            var b64 = document.getElementById(FILES[name].id).textContent.trim();
            var bin = atob(b64);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
            cache[name] = new Response(stream).text();
        }
        return cache[name];
    }
    var originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        var name = typeof input === "string" ? input.split("?")[0].split("#")[0] : null;
        if (name && FILES[name]) {
            return unpack(name).then(function (text) {
                return new Response(text, { status: 200, headers: { "Content-Type": FILES[name].type } });
            });
        }
        return originalFetch(input, init);
    };
})();`;
    return tags.join("\n") + `\n<script>${shim}</script>`;
}

async function main() {
    const html = readText("index.html");
    const title = (html.match(/<title>[\s\S]*?<\/title>/) || ["<title>College Directory</title>"])[0];

    // Page body: everything after the head links, up to the app.js include
    // (which may carry a cache-busting query, e.g. app.js?v=4).
    const bodyStart = html.indexOf("<!-- Glassmorphic Background Blur Orbs -->");
    const bodyEnd = html.search(/<script src="app\.js(\?[^"]*)?"/);
    if (bodyStart < 0 || bodyEnd < 0) throw new Error("index.html layout changed; update build_single_file.js");
    const body = html.slice(bodyStart, bodyEnd).replace(/<!-- JS Application Script -->\s*$/, "");

    const [gfonts, chartJs, dataScripts] = await Promise.all([googleFontsCss(), download(CHART_JS), embeddedDataScripts()]);

    const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${title}
<style>${safeStyle(gfonts)}</style>
<style>${safeStyle(fontAwesomeCss())}</style>
<style>${safeStyle(readText("index.css"))}</style>
<script>${safeScript(chartJs)}</script>
</head>
<body>
${body}
${dataScripts}
<script>${safeScript(readText("app.js"))}</script>
</body>
</html>
`;
    fs.writeFileSync(OUT, out);
    const size = Buffer.byteLength(out);
    console.log(`Wrote ${OUT} (${(size / 1024 / 1024).toFixed(2)} MB)`);
    if (size > MAX_BYTES) {
        console.error(`Too large: over the 5 MB limit by ${((size - MAX_BYTES) / 1024).toFixed(0)} KB`);
        process.exit(1);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
