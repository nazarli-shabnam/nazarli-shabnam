import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const CHESS_DIR = path.join(REPO_ROOT, "chess");
export const STATE_PATH = path.join(CHESS_DIR, "state.json");
export const BOARD_SVG_PATH = path.join(CHESS_DIR, "chessboard.svg");

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJsonPretty(filePath, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, next, "utf8");
}

export function nowIso() {
  return new Date().toISOString();
}

export function squareToCoords(square) {
  // a1 -> (file 0, rank 0)
  if (!/^[a-h][1-8]$/.test(square)) throw new Error(`Invalid square: ${square}`);
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return { file, rank };
}

export function coordsToSquare(file, rank) {
  return String.fromCharCode("a".charCodeAt(0) + file) + String(rank + 1);
}

export function parseFen(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) throw new Error("FEN must include board and active color");
  const [boardPart, activeColor, castling = "-", ep = "-", halfmove = "0", fullmove = "1"] = parts;

  const rows = boardPart.split("/");
  if (rows.length !== 8) throw new Error("FEN board must have 8 ranks");

  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    const row = rows[r];
    let f = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        f += Number(ch);
      } else if (/[prnbqkPRNBQK]/.test(ch)) {
        if (f > 7) throw new Error("FEN rank overflow");
        board[7 - r][f] = ch;
        f++;
      } else {
        throw new Error(`Invalid FEN char: ${ch}`);
      }
    }
    if (f !== 8) throw new Error("FEN rank must sum to 8");
  }

  if (!/^[wb]$/.test(activeColor)) throw new Error("Active color must be w or b");

  return {
    board,
    activeColor,
    castling,
    ep,
    halfmove: Number(halfmove),
    fullmove: Number(fullmove),
  };
}

export function boardToFenBoard(board) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) {
        empty++;
      } else {
        if (empty) row += String(empty);
        empty = 0;
        row += p;
      }
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return rows.join("/");
}

export function toFen({ board, activeColor, castling, ep, halfmove, fullmove }) {
  return `${boardToFenBoard(board)} ${activeColor} ${castling || "-"} ${ep || "-"} ${halfmove ?? 0} ${fullmove ?? 1}`;
}

export function isWhitePiece(p) {
  return !!p && p === p.toUpperCase();
}

export function isBlackPiece(p) {
  return !!p && p === p.toLowerCase();
}

export function parseMoveFromText(text) {
  const t = String(text || "").trim();
  // supported:
  // - chess: e2e4
  // - chess: e2 to e4
  // - chess: move e2 to e4
  // - chess: e7e8=q
  const lower = t.toLowerCase();
  if (!lower.startsWith("chess:")) return null;
  const rest = lower.slice("chess:".length).trim();

  const compact = rest.match(/^([a-h][1-8])\s*([a-h][1-8])(?:\s*=\s*([qrbn]))?$/i);
  if (compact) {
    return { from: compact[1], to: compact[2], promo: compact[3] ?? null };
  }

  const verbose = rest.match(/^(?:move\s+)?([a-h][1-8])\s*(?:to|-|→)\s*([a-h][1-8])(?:\s*=\s*([qrbn]))?$/i);
  if (verbose) {
    return { from: verbose[1], to: verbose[2], promo: verbose[3] ?? null };
  }

  return null;
}

