// POST /api/summarize  { source: "MED" | "PMC" | "PPR" | "AGR" | "OA" | "KCI", id }
// Reads open-access full text when available, otherwise the abstract, and returns the 4-item clinical table.
import { send, checkAccess, readBody, claudeJSON, fail } from "./_lib.js";
import { paperPrompt } from "./_prompts.js";
import { paperText } from "./_text.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!checkAccess(req, res)) return;
  try {
    const { source, id } = await readBody(req);
    if (!source || !id) return send(res, 400, { error: "bad_request", message: "source와 id가 필요해요" });
    const p = await paperText(source, id);
    const summary = await claudeJSON(paperPrompt(p.meta, p.text, p.basis), { maxTokens: 3000 });
    send(res, 200, { basis: p.basis, meta: p.meta, summary });
  } catch (e) { fail(res, e); }
}
