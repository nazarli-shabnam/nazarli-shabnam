import fs from "node:fs";
import path from "node:path";

const CONTRIBUTIONS_PAT = process.env.CONTRIBUTIONS_PAT;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.GITHUB_USERNAME;

const TOKEN = CONTRIBUTIONS_PAT || GITHUB_TOKEN;
const useViewer = Boolean(CONTRIBUTIONS_PAT);

const ON_FIRE_THRESHOLD = 5;
const BADGE_SLUG = "on-fire-ytd";
const OUT_DIR = path.join(process.cwd(), "my-badges");
fs.mkdirSync(OUT_DIR, { recursive: true });

if (!TOKEN) throw new Error("Missing GITHUB_TOKEN (or optional CONTRIBUTIONS_PAT)");
if (!useViewer && !USERNAME) throw new Error("Missing GITHUB_USERNAME");

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

/** Today as YYYY-MM-DD in UTC (same date labels GitHub uses on the graph). */
function utcDateString(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Count days in [year-01-01, today UTC] with contributions >= threshold.
 * Calendar must cover that range (use default contributionsCollection, not a
 * narrow from/to, so GitHub returns a full ~1y grid).
 */
function countOnFireDays(days, year, threshold = ON_FIRE_THRESHOLD) {
  const start = `${year}-01-01`;
  const end = utcDateString(new Date());
  let count = 0;
  for (const d of days) {
    if (d.date >= start && d.date <= end && d.count >= threshold) count += 1;
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

function svgBadge(onFireCount, year) {
  const W = 64,
    H = 64;
  const flame = "🔥";
  const n = String(onFireCount);
  const numFont = n.length > 2 ? 14 : n.length > 1 ? 18 : 22;
  const title = `on fire (YTD ${year}): ${onFireCount}`;
  return `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n  <rect width="100%" height="100%" rx="8" fill="#111216"/>\n  <text x="16" y="40" font-family="system-ui, -apple-system, Arial" font-size="28" fill="#ff7b7b">${escapeXml(flame)}</text>\n  <text x="44" y="46" font-family="system-ui, -apple-system, Arial" font-size="${numFont}" fill="#fff" font-weight="700" text-anchor="middle">${escapeXml(n)}</text>\n  <title>${escapeXml(title)}</title>\n</svg>`;
}

(async function main() {
  const now = new Date();
  const year = now.getUTCFullYear();

  let collection;
  if (useViewer) {
    const query = `
      query {
        viewer {
          contributionsCollection {
            contributionCalendar {
              weeks { contributionDays { date contributionCount } }
            }
          }
        }
      }
    `;
    const data = await ghGraphQL(query, {});
    collection = data.viewer?.contributionsCollection;
  } else {
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
    collection = data.user?.contributionsCollection;
  }

  if (!collection?.contributionCalendar?.weeks) {
    throw new Error("No contribution calendar returned");
  }

  const days = collection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));

  const onFireCount = countOnFireDays(days, year);
  const svg = svgBadge(onFireCount, year);
  fs.writeFileSync(path.join(OUT_DIR, `${BADGE_SLUG}.svg`), svg, "utf8");
  const md = `---\nlayout: default\n---\n# on fire (YTD ${year})\n\nDays from Jan 1 through today (UTC) with ≥${ON_FIRE_THRESHOLD} contributions: ${onFireCount}\n`;
  fs.writeFileSync(path.join(OUT_DIR, `${BADGE_SLUG}.md`), md, "utf8");
  console.log(`Wrote ${BADGE_SLUG}.svg with count`, onFireCount, useViewer ? "(viewer + PAT)" : "(public API)");
})();
