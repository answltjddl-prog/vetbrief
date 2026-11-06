// POST /api/titles  { titles: [...] } → Korean titles for the result list (fast model, cheap)
import { send, checkAccess, readBody, claudeJSON, fail } from "./_lib.js";
import { titlesPrompt } from "./_prompts.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 200, { ko: [] }); // no AI key: keep English titles
  if (!checkAccess(req, res)) return;
  try {
    const { titles } = await readBody(req);
    const list = (Array.isArray(titles) ? titles : []).slice(0, 25).map(t => String(t).slice(0, 300));
    if (!list.length) return send(res, 200, { ko: [] });
    const d = await claudeJSON(titlesPrompt(list), { fast: true, maxTokens: 2500 });
    send(res, 200, { ko: Array.isArray(d.ko) ? d.ko : [] });
  } catch (e) { fail(res, e); }
}
