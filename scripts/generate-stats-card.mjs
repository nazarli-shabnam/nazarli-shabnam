/**
 * Renders profile/stats.svg ourselves instead of relying on
 * readme-tools/github-readme-stats-action.
 *
 * That action's "stats" card runs one combined GraphQL query for everything
 * (commits, PRs, issues, contributedTo, repos+stargazers, ...). For this
 * account the combined cost of several of those fields together trips
 * GitHub's RESOURCE_LIMITS_EXCEEDED guard — each field is cheap on its own,
 * but computing them together in a single request is not. Splitting the
 * same data across a few small, targeted requests avoids that entirely.
 */
import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.GITHUB_USERNAME;
const OUT_PATH = path.join(process.cwd(), "profile", "stats.svg");

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

async function fetchTotalStars() {
  let total = 0;
  let cursor = null;
  let hasMore = true;
  while (hasMore) {
    const query = `
      query ($login: String!, $cursor: String) {
        user(login: $login) {
          repositories(ownerAffiliations: OWNER, first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { stargazerCount }
          }
        }
      }
    `;
    const data = await ghGraphQL(query, { login: USERNAME, cursor });
    const repos = data.user.repositories;
    for (const repo of repos.nodes) total += repo.stargazerCount;
    hasMore = repos.pageInfo.hasNextPage;
    cursor = repos.pageInfo.endCursor;
  }
  return total;
}

async function fetchTotalCommits() {
  const query = `
    query ($login: String!) {
      user(login: $login) {
        contributionsCollection { totalCommitContributions }
      }
    }
  `;
  const data = await ghGraphQL(query, { login: USERNAME });
  return data.user.contributionsCollection.totalCommitContributions;
}

async function fetchTotalPRs() {
  const query = `
    query ($login: String!) {
      user(login: $login) {
        pullRequests(first: 1) { totalCount }
      }
    }
  `;
  const data = await ghGraphQL(query, { login: USERNAME });
  return data.user.pullRequests.totalCount;
}

async function fetchIssuesAndFollowers() {
  const query = `
    query ($login: String!) {
      user(login: $login) {
        openIssues: issues(states: OPEN) { totalCount }
        closedIssues: issues(states: CLOSED) { totalCount }
        followers { totalCount }
      }
    }
  `;
  const data = await ghGraphQL(query, { login: USERNAME });
  return {
    issues: data.user.openIssues.totalCount + data.user.closedIssues.totalCount,
    followers: data.user.followers.totalCount,
  };
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Unified Tokyo Night palette — matches theme=tokyonight already used by the
// streak card and Top Languages card, and the badge/fingerprint SVGs.
const PALETTE = {
  bg: "#1a1b26",
  border: "#3b4261",
  text: "#c0caf5",
  dim: "#565f89",
  blue: "#7aa2f7",
};

function statsCardSvg(stats) {
  const rows = [
    ["Total Stars", stats.stars, "#e0af68"],
    ["Total Commits", stats.commits, "#7aa2f7"],
    ["Total PRs", stats.prs, "#bb9af7"],
    ["Total Issues", stats.issues, "#9ece6a"],
    ["Followers", stats.followers, "#f7768e"],
  ];

  const W = 300;
  const rowHeight = 27;
  const headerH = 54;
  const H = headerH + rows.length * rowHeight + 14;

  const rowsSvg = rows
    .map(
      (row, i) => `
    <g transform="translate(26, ${headerH + i * rowHeight})">
      <circle cx="-10" cy="-4" r="3" fill="${row[2]}"/>
      <text class="label" x="0" y="0">${escapeXml(row[0])}</text>
      <text class="value" x="${W - 52}" y="0" text-anchor="end">${escapeXml(row[1])}</text>
    </g>`
    )
    .join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .header { font: 600 16px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${PALETTE.text}; }
    .subhead { font: 400 11px 'Segoe UI', Ubuntu, Sans-Serif; letter-spacing: 0.06em; fill: ${PALETTE.dim}; text-transform: uppercase; }
    .label { font: 400 13px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${PALETTE.dim}; }
    .value { font: 600 13px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${PALETTE.text}; font-variant-numeric: tabular-nums; }
  </style>
  <rect data-testid="card-bg" x="0.5" y="0.5" rx="8" width="${W - 1}" height="${H - 1}" fill="${PALETTE.bg}" stroke="${PALETTE.border}"/>
  <text x="26" y="26" class="header">${escapeXml(USERNAME)}</text>
  <text x="26" y="41" class="subhead">GITHUB STATS</text>
  <line x1="26" y1="${headerH - 10}" x2="${W - 26}" y2="${headerH - 10}" stroke="${PALETTE.border}"/>
  ${rowsSvg}
</svg>`;
}

async function main() {
  const [stars, commits, prs, { issues, followers }] = await Promise.all([
    fetchTotalStars(),
    fetchTotalCommits(),
    fetchTotalPRs(),
    fetchIssuesAndFollowers(),
  ]);

  const svg = statsCardSvg({ stars, commits, prs, issues, followers });
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, svg, "utf8");
  console.log("Wrote profile/stats.svg with", { stars, commits, prs, issues, followers });
}

await main();
