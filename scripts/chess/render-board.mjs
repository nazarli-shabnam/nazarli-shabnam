import fs from "node:fs/promises";
import { BOARD_SVG_PATH, CHESS_DIR, parseFen } from "./lib.mjs";

const PIECE_GLYPH = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function renderChessboardSvg({ fen, lastMove }) {
  const pos = parseFen(fen);

  const cell = 64;
  const pad = 28;
  const board = 8 * cell;
  const w = board + pad * 2;
  const h = board + pad * 2 + 34;

  const light = "#EAECEF";
  const dark = "#3B4252";
  const frame = "#111827";
  const label = "#9CA3AF";
  const hl = "#F59E0B";
  const pieceLight = "#F9FAFB";
  const pieceDark = "#111827";

  const lm = lastMove && lastMove.from && lastMove.to ? { from: lastMove.from, to: lastMove.to } : null;
  const fromCoords = lm ? squareToCell(lm.from, cell, pad) : null;
  const toCoords = lm ? squareToCell(lm.to, cell, pad) : null;

  const squares = [];
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const x = pad + file * cell;
      const y = pad + (7 - rank) * cell;
      const isDark = (file + rank) % 2 === 1;
      squares.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="6" fill="${isDark ? dark : light}"/>`);
    }
  }

  const highlights = [];
  if (fromCoords) {
    highlights.push(
      `<rect x="${fromCoords.x + 3}" y="${fromCoords.y + 3}" width="${cell - 6}" height="${cell - 6}" rx="8" fill="none" stroke="${hl}" stroke-width="4" opacity="0.85"/>`,
    );
  }
  if (toCoords) {
    highlights.push(
      `<rect x="${toCoords.x + 3}" y="${toCoords.y + 3}" width="${cell - 6}" height="${cell - 6}" rx="8" fill="none" stroke="${hl}" stroke-width="4" opacity="0.85"/>`,
    );
  }

  const pieces = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const p = pos.board[rank][file];
      if (!p) continue;
      const glyph = PIECE_GLYPH[p];
      if (!glyph) continue;
      const x = pad + file * cell + cell / 2;
      const y = pad + (7 - rank) * cell + cell / 2 + 22;
      const fill = p === p.toUpperCase() ? pieceLight : pieceDark;
      pieces.push(
        `<text x="${x}" y="${y}" text-anchor="middle" font-size="52" fill="${fill}" font-family="Segoe UI Symbol, Apple Color Emoji, Noto Sans Symbols2, Noto Sans Symbols, ui-sans-serif, system-ui">${esc(
          glyph,
        )}</text>`,
      );
    }
  }

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const labels = [];
  for (let i = 0; i < 8; i++) {
    labels.push(
      `<text x="${pad + i * cell + cell / 2}" y="${pad + board + 22}" text-anchor="middle" font-size="14" fill="${label}" font-family="ui-sans-serif, system-ui, Segoe UI, Arial">${files[i]}</text>`,
    );
    labels.push(
      `<text x="${pad - 12}" y="${pad + (7 - i) * cell + cell / 2 + 5}" text-anchor="middle" font-size="14" fill="${label}" font-family="ui-sans-serif, system-ui, Segoe UI, Arial">${ranks[i]}</text>`,
    );
  }

  const footer = `Turn: ${pos.activeColor === "w" ? "White" : "Black"}${lm ? ` • Last: ${lm.from}->${lm.to}` : ""}`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
    <filter id="pieceShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0B1220"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg)"/>
  <rect x="${pad - 10}" y="${pad - 10}" width="${board + 20}" height="${board + 20}" rx="16" fill="${frame}" filter="url(#shadow)"/>

  ${squares.join("\n  ")}
  ${highlights.join("\n  ")}
  <g filter="url(#pieceShadow)">
  ${pieces.join("\n  ")}
  </g>
  ${labels.join("\n  ")}

  <text x="${w / 2}" y="${h - 10}" text-anchor="middle" font-size="14" fill="#D1D5DB" font-family="ui-sans-serif, system-ui, Segoe UI, Arial">${esc(
    footer,
  )}</text>
</svg>
`;

  await fs.mkdir(CHESS_DIR, { recursive: true });
  await fs.writeFile(BOARD_SVG_PATH, svg, "utf8");
}

function squareToCell(square, cell, pad) {
  // a1 -> file 0, rank 0
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return { x: pad + file * cell, y: pad + (7 - rank) * cell };
}

const fen = process.env.CHESS_FEN;
if (fen) {
  const lastMove = process.env.CHESS_LAST_MOVE ? JSON.parse(process.env.CHESS_LAST_MOVE) : null;
  await renderChessboardSvg({ fen, lastMove });
}

