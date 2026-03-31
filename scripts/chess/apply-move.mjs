import { nowIso, parseFen, squareToCoords, toFen, isWhitePiece, isBlackPiece } from "./lib.mjs";

function normalizePromo(promo, movingPiece) {
  if (!promo) return null;
  const p = promo.toLowerCase();
  if (!/^[qrbn]$/.test(p)) return null;
  return movingPiece === movingPiece.toUpperCase() ? p.toUpperCase() : p;
}

export function applyMoveToFen(fen, { from, to, promo }) {
  const pos = parseFen(fen);
  const { file: ff, rank: fr } = squareToCoords(from);
  const { file: tf, rank: tr } = squareToCoords(to);

  const moving = pos.board[fr][ff];
  if (!moving) {
    return { ok: false, reason: `No piece on ${from}.` };
  }

  const isWhiteTurn = pos.activeColor === "w";
  if (isWhiteTurn && !isWhitePiece(moving)) {
    return { ok: false, reason: `It’s White to move; ${from} is not a white piece.` };
  }
  if (!isWhiteTurn && !isBlackPiece(moving)) {
    return { ok: false, reason: `It’s Black to move; ${from} is not a black piece.` };
  }

  const target = pos.board[tr][tf];
  if (target) {
    if (isWhitePiece(moving) && isWhitePiece(target)) {
      return { ok: false, reason: `Illegal: can’t capture your own piece on ${to}.` };
    }
    if (isBlackPiece(moving) && isBlackPiece(target)) {
      return { ok: false, reason: `Illegal: can’t capture your own piece on ${to}.` };
    }
  }

  // Move piece (simple validation only; no check, no castling rules, no en passant).
  pos.board[fr][ff] = null;

  let placed = moving;
  const isPawn = moving.toLowerCase() === "p";
  const promotingRank = isWhitePiece(moving) ? 7 : 0;
  if (isPawn && tr === promotingRank) {
    placed = normalizePromo(promo, moving) ?? (isWhitePiece(moving) ? "Q" : "q");
  }

  pos.board[tr][tf] = placed;

  // Update move counters (approx)
  pos.halfmove = target || isPawn ? 0 : (Number.isFinite(pos.halfmove) ? pos.halfmove + 1 : 0);
  if (pos.activeColor === "b") pos.fullmove = (Number.isFinite(pos.fullmove) ? pos.fullmove + 1 : 1);
  pos.activeColor = pos.activeColor === "w" ? "b" : "w";

  // We intentionally clear castling/ep because we aren't tracking them.
  pos.castling = "-";
  pos.ep = "-";

  const nextFen = toFen(pos);
  return {
    ok: true,
    nextFen,
    meta: {
      from,
      to,
      promo: placed !== moving ? placed : null,
      captured: target || null,
      movedAt: nowIso(),
    },
  };
}

