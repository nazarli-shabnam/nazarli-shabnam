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

function wrapBadgeSvg(innerSvg, title) {
  const W = 64,
    H = 64;
  const scale = 0.8;
  const tx = (W - W * scale) / 2;
  const ty = (H - W * scale) / 2;
  const inner =
    innerSvg ||
    `<text x="32" y="36" font-family="system-ui, -apple-system, Arial" font-size="16" fill="#fff" text-anchor="middle">?</text>`;
  return `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n  <rect width="100%" height="100%" rx="8" fill="#111216"/>\n  <g transform="translate(${tx},${ty}) scale(${scale})">\n    ${inner}\n  </g>\n  <title>${escapeXml(title)}</title>\n</svg>`;
}

function findMostCommonWord(commitMessages) {
  // Common words to exclude
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
    'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'fix', 'fixes', 'fixed', 'update', 'updates', 'updated', 'change',
    'changes', 'changed', 'remove', 'removes', 'removed', 'delete',
    'deletes', 'deleted', 'refactor', 'refactors', 'refactored', 'merge',
    'merges', 'merged', 'commit', 'commits', 'committed'
  ]);

  const wordCount = new Map();
  
  for (const message of commitMessages) {
    if (!message) continue;
    
    // Extract words from commit message (lowercase, alphanumeric)
    const words = message
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
    
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }
  }

  // Find the most common word
  let maxCount = 0;
  let favoriteWord = 'add'; // default fallback
  
  for (const [word, count] of wordCount.entries()) {
    if (count > maxCount) {
      maxCount = count;
      favoriteWord = word;
    }
  }

  return { word: favoriteWord, count: maxCount };
}

(async function main() {
  // Get commit messages from all user repositories
  let allCommitMessages = [];
  let hasMore = true;
  let repoCursor = null;
  const MAX_COMMITS = 500; // Limit to prevent rate limits

  // Get repositories and their commits
  while (hasMore && allCommitMessages.length < MAX_COMMITS) {
    const reposQuery = `
      query($login: String!, $repoCursor: String) {
        user(login: $login) {
          repositories(ownerAffiliations: OWNER, isFork: false, first: 20, after: $repoCursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              name
              defaultBranchRef {
                target {
                  ... on Commit {
                    history(first: 50) {
                      nodes {
                        message
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await ghGraphQL(reposQuery, { login: USERNAME, repoCursor: repoCursor || null });
    const repos = data.user.repositories;
    
    // Extract commit messages from each repo
    for (const repo of repos.nodes) {
      if (repo.defaultBranchRef?.target?.history?.nodes) {
        for (const commit of repo.defaultBranchRef.target.history.nodes) {
          if (commit.message && allCommitMessages.length < MAX_COMMITS) {
            allCommitMessages.push(commit.message);
          }
        }
      }
    }

    hasMore = repos.pageInfo.hasNextPage;
    repoCursor = repos.pageInfo.endCursor;
    
    if (!repoCursor && !hasMore) break;
  }
  
  if (allCommitMessages.length === 0) {
    console.log("No commit messages found, using default 'add'");
    allCommitMessages = ["add"];
  }

  // Find the most common word
  const { word: favoriteWord, count } = findMostCommonWord(allCommitMessages);

  // Get the plus emoji (code 2795) for the badge
  const plusEmoji = await fetchOpenMoji("2795");
  const innerSvg = extractInnerSvg(plusEmoji);

  const title = `My favorite commit word is "${favoriteWord}".`;
  const desc = `My favorite commit message word is '${favoriteWord}' (appears ${count} times).`;
  const svg = wrapBadgeSvg(innerSvg, title);
  
  fs.writeFileSync(path.join(OUT_DIR, "favorite-word-add.svg"), svg, "utf8");
  const md = `---\nlayout: default\n---\n# ${title}\n\n${desc}\n`;
  fs.writeFileSync(path.join(OUT_DIR, "favorite-word-add.md"), md, "utf8");
  console.log(`Wrote favorite-word-add.svg with word: "${favoriteWord}" (${count} occurrences)`);
})();
