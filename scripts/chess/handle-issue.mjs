import fs from "node:fs/promises";
import { applyMoveToFen } from "./apply-move.mjs";
import { parseMoveFromText, readJson, writeJsonPretty, STATE_PATH, nowIso } from "./lib.mjs";
import { renderChessboardSvg } from "./render-board.mjs";

async function main() {
  const issueTitle = process.env.ISSUE_TITLE || "";
  const issueBody = process.env.ISSUE_BODY || "";
  const issueNumber = process.env.ISSUE_NUMBER || "";

  const move =
    parseMoveFromText(issueTitle) ||
    parseMoveFromText(issueBody) ||
    parseMoveFromText(`${issueTitle}\n${issueBody}`);

  if (!move) {
    await writeResult({
      ok: false,
      shouldAct: false,
      message: "No chess command found. Use an issue title like `chess: e2e4`.",
      issueNumber,
    });
    return;
  }

  const state = await readJson(STATE_PATH);
  const currentFen = state.fen;

  const applied = applyMoveToFen(currentFen, move);
  if (!applied.ok) {
    await writeResult({
      ok: false,
      shouldAct: true,
      message: `Move rejected: ${applied.reason}`,
      issueNumber,
      move,
      fen: currentFen,
    });
    return;
  }

  const nextState = {
    ...state,
    fen: applied.nextFen,
    lastMove: { from: move.from, to: move.to, promo: move.promo ?? null },
    updatedAt: nowIso(),
    history: [
      ...(Array.isArray(state.history) ? state.history : []),
      {
        from: move.from,
        to: move.to,
        promo: move.promo ?? null,
        issueNumber: issueNumber ? Number(issueNumber) : null,
        at: nowIso(),
        san: applied.meta?.san ?? null,
      },
    ],
  };

  await writeJsonPretty(STATE_PATH, nextState);
  await renderChessboardSvg({ fen: nextState.fen, lastMove: nextState.lastMove });

  await writeResult({
    ok: true,
    shouldAct: true,
    message: `Move accepted: ${applied.meta?.san ? `${applied.meta.san} (${move.from}->${move.to})` : `${move.from}->${move.to}`}`,
    issueNumber,
    move,
    fen: nextState.fen,
  });
}

async function writeResult(obj) {
  const file = process.env.RESULT_PATH || "chess-result.json";
  await fs.writeFile(file, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

await main();

