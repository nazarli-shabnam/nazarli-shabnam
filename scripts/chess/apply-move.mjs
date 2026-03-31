import { nowIso } from "./lib.mjs";
import { Chess } from "chess.js";

export function applyMoveToFen(fen, { from, to, promo }) {
  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    return { ok: false, reason: "Internal error: invalid current position (FEN)." };
  }

  const needsPromotion = promo ? String(promo).trim().toLowerCase() : undefined;
  let move;
  try {
    move = chess.move({
      from,
      to,
      promotion: needsPromotion,
    });
  } catch {
    move = null;
  }

  if (!move) {
    return { ok: false, reason: "Illegal move (strict rules enforced)." };
  }

  return {
    ok: true,
    nextFen: chess.fen(),
    meta: {
      from,
      to,
      promotion: move.promotion ?? null,
      captured: move.captured ?? null,
      movedAt: nowIso(),
      san: move.san ?? null,
    },
  };
}

