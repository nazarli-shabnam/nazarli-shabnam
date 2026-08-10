/**
 * Renders two "Commit Fingerprint" SVGs from real commit history + the
 * contribution calendar — a generative mark that only your own git history
 * could produce, replacing the chess board as the profile's signature visual.
 *
 * Commit fetch mirrors the GraphQL pagination pattern in generate-favorite-word.mjs
 * (repos -> defaultBranchRef.target.history), extended to pull `oid` + `committedDate`
 * instead of just `message`. The contribution calendar fetch mirrors generate-on-fire.mjs.
 */
import fs from "node:fs";
import path from "node:path";

const CONTRIBUTIONS_PAT = process.env.CONTRIBUTIONS_PAT;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.GITHUB_USERNAME;

const TOKEN = CONTRIBUTIONS_PAT || GITHUB_TOKEN;
const useViewer = Boolean(CONTRIBUTIONS_PAT);

const OUT_DIR = path.join(process.cwd(), "profile");
fs.mkdirSync(OUT_DIR, { recursive: true });

const MAX_COMMITS = 400;
const SIZE = 420;

// Unified Tokyo Night palette (matches theme=tokyonight already used by the
// streak card and Top Languages card).
const PALETTE = {
  bg: "#1a1b26",
  surface: "#20222f",
  border: "#3b4261",
  text: "#c0caf5",
  dim: "#565f89",
  blue: "#7aa2f7",
  purple: "#bb9af7",
  green: "#9ece6a",
  orange: "#e0af68",
  red: "#f7768e",
};

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

async function fetchCommits() {
  const commits = [];
  let hasMore = true;
  let repoCursor = null;

  while (hasMore && commits.length < MAX_COMMITS) {
    const query = `
      query($login: String!, $repoCursor: String) {
        user(login: $login) {
          repositories(ownerAffiliations: OWNER, isFork: false, first: 20, after: $repoCursor, orderBy: { field: PUSHED_AT, direction: DESC }) {
            pageInfo { hasNextPage endCursor }
            nodes {
              name
              defaultBranchRef {
                target {
                  ... on Commit {
                    history(first: 50) {
                      nodes { oid committedDate }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const data = await ghGraphQL(query, { login: USERNAME, repoCursor });
    const repos = data.user.repositories;

    for (const repo of repos.nodes) {
      const nodes = repo.defaultBranchRef?.target?.history?.nodes || [];
      for (const c of nodes) {
        if (commits.length >= MAX_COMMITS) break;
        commits.push({ oid: c.oid, date: new Date(c.committedDate) });
      }
    }

    hasMore = repos.pageInfo.hasNextPage;
    repoCursor = repos.pageInfo.endCursor;
    if (!repoCursor && !hasMore) break;
  }

  return commits;
}

async function fetchContributionCalendar() {
  const query = useViewer
    ? `
      query {
        viewer {
          contributionsCollection {
            contributionCalendar {
              weeks { contributionDays { date contributionCount } }
            }
          }
        }
      }
    `
    : `
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
  const data = await ghGraphQL(query, useViewer ? {} : { login: USERNAME });
  const collection = useViewer ? data.viewer?.contributionsCollection : data.user?.contributionsCollection;
  return collection?.contributionCalendar?.weeks || [];
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Stable 0..1 float derived from an oid, used as a size/weight proxy since we don't fetch diff stats. */
function weightFromOid(oid) {
  let h = 2166136261;
  for (let i = 0; i < oid.length; i++) {
    h ^= oid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function mixHex(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

function hourColor(hour) {
  const t = hour / 24;
  return t < 0.5
    ? mixHex(PALETTE.purple, PALETTE.orange, t * 2)
    : mixHex(PALETTE.orange, PALETTE.blue, (t - 0.5) * 2);
}

function svgFrame(title, body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <title>${escapeXml(title)}</title>
  <rect width="100%" height="100%" rx="10" fill="${PALETTE.bg}"/>
  <rect x="0.5" y="0.5" width="${SIZE - 1}" height="${SIZE - 1}" rx="9.5" fill="none" stroke="${PALETTE.border}"/>
${body}
</svg>`;
}

function renderConstellation(commits) {
  const cx = SIZE / 2, cy = SIZE / 2;
  const byDay = new Map();
  for (const c of commits) {
    const dayKey = c.date.toISOString().slice(0, 10);
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(c);
  }

  function pos(c) {
    const hour = c.date.getUTCHours() + c.date.getUTCMinutes() / 60;
    const weekday = c.date.getUTCDay();
    const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
    const radius = 44 + (weekday / 6) * (SIZE * 0.36);
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  }

  const lines = [];
  for (const list of byDay.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.date - b.date);
    for (let i = 0; i < list.length - 1; i++) {
      const p1 = pos(list[i]), p2 = pos(list[i + 1]);
      lines.push(`<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${PALETTE.dim}" stroke-opacity="0.28" stroke-width="1"/>`);
    }
  }

  const dots = commits.map((c) => {
    const p = pos(c);
    const hour = c.date.getUTCHours() + c.date.getUTCMinutes() / 60;
    const r = (1.5 + weightFromOid(c.oid) * 3.2).toFixed(2);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${hourColor(hour)}" fill-opacity="0.88"/>`;
  });

  return svgFrame(
    "Commit Fingerprint — Constellation",
    `  <g>${lines.join("")}</g>\n  <g>${dots.join("")}</g>`
  );
}

function renderRadialRings(commits, calendarWeeks) {
  const cx = SIZE / 2, cy = SIZE / 2;

  // Most recent N weeks of the real contribution calendar become concentric rings.
  const RING_COUNT = Math.min(16, calendarWeeks.length) || 1;
  const recentWeeks = calendarWeeks.slice(-RING_COUNT);
  const innerR = 26;
  const outerR = SIZE * 0.42;
  const ringGap = (outerR - innerR) / RING_COUNT;

  const rings = recentWeeks
    .map((_, i) => {
      const r = innerR + i * ringGap;
      return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${PALETTE.border}" stroke-opacity="0.5"/>`;
    })
    .join("");

  // Background ticks: one per day of the most recent weeks, length by contribution count.
  let maxCount = 1;
  for (const w of recentWeeks) for (const d of w.contributionDays) maxCount = Math.max(maxCount, d.contributionCount);

  const dayTicks = recentWeeks
    .map((week, ringIndex) => {
      const rBase = innerR + ringIndex * ringGap;
      return week.contributionDays
        .map((d, weekday) => {
          if (d.contributionCount === 0) return "";
          const angle = (weekday / 7) * Math.PI * 2 - Math.PI / 2;
          const len = (d.contributionCount / maxCount) * ringGap * 0.85;
          const x1 = cx + Math.cos(angle) * rBase;
          const y1 = cy + Math.sin(angle) * rBase;
          const x2 = cx + Math.cos(angle) * (rBase + len);
          const y2 = cy + Math.sin(angle) * (rBase + len);
          const t = ringIndex / RING_COUNT;
          return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${mixHex(PALETTE.green, PALETTE.blue, t)}" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>`;
        })
        .join("");
    })
    .join("");

  // Foreground: real commits placed by (recency ring, hour-of-day angle), the actual fingerprint.
  const cutoff = recentWeeks[0]?.contributionDays[0]?.date
    ? new Date(recentWeeks[0].contributionDays[0].date)
    : new Date(Date.now() - RING_COUNT * 7 * 24 * 60 * 60 * 1000);

  const commitTicks = commits
    .filter((c) => c.date >= cutoff)
    .map((c) => {
      const weeksAgo = Math.floor((Date.now() - c.date.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const ringIndex = Math.min(RING_COUNT - 1, Math.max(0, RING_COUNT - 1 - weeksAgo));
      const rBase = innerR + ringIndex * ringGap;
      const hour = c.date.getUTCHours() + c.date.getUTCMinutes() / 60;
      const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
      const len = 4 + weightFromOid(c.oid) * (ringGap * 0.7);
      const x1 = cx + Math.cos(angle) * rBase;
      const y1 = cy + Math.sin(angle) * rBase;
      const x2 = cx + Math.cos(angle) * (rBase + len);
      const y2 = cy + Math.sin(angle) * (rBase + len);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${hourColor(hour)}" stroke-width="1.6" stroke-linecap="round"/>`;
    })
    .join("");

  return svgFrame(
    "Commit Fingerprint — Radial Rings",
    `  <g>${rings}</g>\n  <g>${dayTicks}</g>\n  <g>${commitTicks}</g>`
  );
}

async function main() {
  const [commits, calendarWeeks] = await Promise.all([fetchCommits(), fetchContributionCalendar()]);

  if (commits.length === 0) {
    console.log("No commits found; skipping fingerprint generation.");
    return;
  }

  const constellation = renderConstellation(commits);
  fs.writeFileSync(path.join(OUT_DIR, "fingerprint-constellation.svg"), constellation, "utf8");

  const radialRings = renderRadialRings(commits, calendarWeeks);
  fs.writeFileSync(path.join(OUT_DIR, "fingerprint-radial-rings.svg"), radialRings, "utf8");

  console.log(`Wrote fingerprint SVGs from ${commits.length} commits and ${calendarWeeks.length} calendar weeks.`);
}

await main();
