import fs from "node:fs";
import path from "node:path";

const DATA = JSON.parse(
  fs.readFileSync(new URL("./badges.json", import.meta.url), "utf8"),
);
const OUT_DIR = path.join(process.cwd(), "my-badges");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function fetchOpenMoji(code) {
  // use jsdelivr CDN for OpenMoji
  const url = `https://cdn.jsdelivr.net/npm/openmoji@14.0.0/color/svg/${code}.svg`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    return txt;
  } catch (e) {
    return null;
  }
}

function extractInnerSvg(svgText) {
  if (!svgText) return null;
  const m = svgText.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  return m ? m[1] : svgText;
}

function wrapBadgeSvg(innerSvg, title) {
  const W = 64,
    H = 64;
  const scale = 0.8; // scale down inner sticker
  const tx = (W - W * scale) / 2;
  const ty = (H - W * scale) / 2;
  const inner =
    innerSvg ||
    `<text x="32" y="36" font-family="system-ui, -apple-system, Arial" font-size="16" fill="#fff" text-anchor="middle">?</text>`;
  return `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n  <rect width="100%" height="100%" rx="8" fill="#111216"/>\n  <g transform="translate(${tx},${ty}) scale(${scale})">\n    ${inner}\n  </g>\n  <title>${escapeXml(title)}</title>\n</svg>`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

(async function main() {
  console.log("Generating", DATA.length, "badges...");
  for (const b of DATA) {
    let inner = null;
    if (b.openmoji) {
      const svgText = await fetchOpenMoji(b.openmoji);
      inner = extractInnerSvg(svgText);
    }

    const svg = wrapBadgeSvg(inner, b.title);
    fs.writeFileSync(path.join(OUT_DIR, `${b.slug}.svg`), svg, "utf8");

    const md = `---\nlayout: default\n---\n# ${b.title}\n\n${b.desc}\n`;
    fs.writeFileSync(path.join(OUT_DIR, `${b.slug}.md`), md, "utf8");
    console.log("  wrote", b.slug);
  }
  console.log("Done — badges in", OUT_DIR);
})();
