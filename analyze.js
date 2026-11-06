// POST /api/analyze  { text }  → clinical table for a pasted abstract or text pulled from the user's PDF
import { send, checkAccess, readBody, claudeJSON, fail } from "./_lib.js";
import { docPrompt } from "./_prompts.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!checkAccess(req, res)) return;
  try {
    const { text } = await readBody(req);
    const t = String(text || "").slice(0, 90000);
    if (t.length < 200) return send(res, 400, { error: "too_short", message: "초록이나 본문을 200자 이상 넣어주세요." });
    const summary = await claudeJSON(docPrompt(t), { maxTokens: 3000 });
    send(res, 200, { basis: "upload", summary });
  } catch (e) { fail(res, e); }
}
