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

function statsCardSvg(stats) {
  const rows = [
    ["Total Stars", stats.stars],
    ["Total Commits", stats.commits],
    ["Total PRs", stats.prs],
    ["Total Issues", stats.issues],
    ["Followers", stats.followers],
  ];

  const W = 300;
  const rowHeight = 25;
  const H = 55 + rows.length * rowHeight;

  const rowsSvg = rows
    .map(
      (row, i) => `
    <g transform="translate(25, ${55 + i * rowHeight})">
      <text class="label" x="0" y="0">${escapeXml(row[0])}</text>
      <text class="value" x="${W - 50}" y="0" text-anchor="end">${escapeXml(row[1])}</text>
    </g>`
    )
    .join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .header { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #70a5fd; }
    .label { font: 400 13px 'Segoe UI', Ubuntu, Sans-Serif; fill: #38bdae; }
    .value { font: 600 13px 'Segoe UI', Ubuntu, Sans-Serif; fill: #ffffff; }
  </style>
  <rect data-testid="card-bg" x="0.5" y="0.5" rx="4.5" width="${W - 1}" height="${H - 1}" fill="#1a1b27" stroke="#e4e2e2" stroke-opacity="0"/>
  <text x="25" y="30" class="header">${escapeXml(USERNAME)}'s GitHub Stats</text>
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
