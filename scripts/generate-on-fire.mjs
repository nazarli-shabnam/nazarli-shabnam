import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.GITHUB_USERNAME;
const OUT_DIR = path.join(process.cwd(), "my-badges");
fs.mkdirSync(OUT_DIR, { recursive: true });

if (!TOKEN) throw new Error("Missing GITHUB_TOKEN");
if (!USERNAME) throw new Error("Missing GITHUB_USERNAME");

async function ghGraphQL(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GraphQL request failed ${res.status}: ${txt}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

function computeOnFire(days, windowDays = 30, threshold = 10) {
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setUTCDate(today.getUTCDate() - windowDays + 1);
  let count = 0;
  for (const d of days) {
    const dt = new Date(d.date + "T00:00:00Z");
    if (dt >= cutoff && d.count >= threshold) count += 1;
  }
  return count;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgBadge(onFireCount) {
  const W = 64,
    H = 64;
  const flame = "🔥";
  return `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n  <rect width="100%" height="100%" rx="8" fill="#111216"/>\n  <text x="16" y="40" font-family="system-ui, -apple-system, Arial" font-size="28" fill="#ff7b7b">${escapeXml(flame)}</text>\n  <text x="44" y="46" font-family="system-ui, -apple-system, Arial" font-size="22" fill="#fff" font-weight="700" text-anchor="middle">${onFireCount}</text>\n  <title>on fire (30d): ${onFireCount}</title>\n</svg>`;
}

(async function main() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
    }
  `;

  const data = await ghGraphQL(query, { login: USERNAME });
  const days = data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));

  const onFireCount = computeOnFire(days, 30, 10);
  const svg = svgBadge(onFireCount);
  fs.writeFileSync(path.join(OUT_DIR, "on-fire-30.svg"), svg, "utf8");
  const md = `---\nlayout: default\n---\n# on fire (30d)\n\nDays with ≥10 contributions in last 30 days: ${onFireCount}\n`;
  fs.writeFileSync(path.join(OUT_DIR, "on-fire-30.md"), md, "utf8");
  console.log("Wrote on-fire-30.svg with count", onFireCount);
})();
