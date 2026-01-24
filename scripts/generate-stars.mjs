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

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchOpenMoji(code) {
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

function wrapBadgeSvg(innerSvg, title, starCount) {
  const W = 64,
    H = 64;
  const scale = 0.7; // Smaller scale to make room for number
  const tx = (W - W * scale) / 2;
  const ty = (H - H * scale) / 2 - 4; // Shift up a bit
  const inner =
    innerSvg ||
    `<text x="32" y="36" font-family="system-ui, -apple-system, Arial" font-size="16" fill="#fff" text-anchor="middle">?</text>`;
  
  // Add star count text below the star icon
  const countText = `<text x="32" y="52" font-family="system-ui, -apple-system, Arial" font-size="16" fill="#fff" font-weight="700" text-anchor="middle">${starCount}</text>`;
  
  return `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n  <rect width="100%" height="100%" rx="8" fill="#111216"/>\n  <g transform="translate(${tx},${ty}) scale(${scale})">\n    ${inner}\n  </g>\n  ${countText}\n  <title>${escapeXml(title)}</title>\n</svg>`;
}

(async function main() {
  // Get total star count from all user repositories using pagination
  let totalStars = 0;
  let hasMore = true;
  let cursor = null;

  // GitHub GraphQL has pagination limits, so we need to fetch in batches
  while (hasMore) {
    const query = `
      query($login: String!, $cursor: String) {
        user(login: $login) {
          repositories(ownerAffiliations: OWNER, isFork: false, first: 100, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              stargazerCount
            }
          }
        }
      }
    `;

    const data = await ghGraphQL(query, { login: USERNAME, cursor: cursor || null });
    const repos = data.user.repositories;
    
    for (const repo of repos.nodes) {
      totalStars += repo.stargazerCount;
    }

    hasMore = repos.pageInfo.hasNextPage;
    cursor = repos.pageInfo.endCursor;
    
    // Safety limit to prevent infinite loops
    if (!cursor && !hasMore) break;
  }

  // Fetch star emoji
  const starEmoji = await fetchOpenMoji("2B50");
  const innerSvg = extractInnerSvg(starEmoji);

  const title = `I collected ${totalStars} stars.`;
  const desc = `I have ${totalStars} stars across my repos.`;
  const svg = wrapBadgeSvg(innerSvg, title, totalStars);
  
  fs.writeFileSync(path.join(OUT_DIR, "stars-4.svg"), svg, "utf8");
  const md = `---\nlayout: default\n---\n# ${title}\n\n${desc}\n`;
  fs.writeFileSync(path.join(OUT_DIR, "stars-4.md"), md, "utf8");
  console.log("Wrote stars-4.svg with count", totalStars);
})();
