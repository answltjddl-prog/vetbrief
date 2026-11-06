// POST /api/study  { source, id, translate } → abstract sentences + Korean translation + glossary
// Korean (KCI) papers come with their own Korean abstract, so only the glossary is generated.
import { send, checkAccess, readBody, claudeJSON, fail } from "./_lib.js";
import { studyPrompt } from "./_prompts.js";
import { paperText } from "./_text.js";

export function splitSentences(t) {
  return t.split(/(?<=[.;?!])\s+(?=[A-Z(가-힣])/).map(s => s.trim()).filter(s => s.length > 1);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!checkAccess(req, res)) return;
  try {
    const { source, id, translate } = await readBody(req);
    const p = await paperText(source, id, { wantFull: false });
    const en = p.abstract || p.text;
    const sentences = splitSentences(en).slice(0, 40);
    if (!translate) return send(res, 200, { title: p.meta.title, sentences, koAbstract: p.abstractKo || "" });
    const d = await claudeJSON(studyPrompt(p.meta.title, sentences), { maxTokens: 4000 });
    send(res, 200, { title: p.meta.title, sentences, ko: d.ko || [], glossary: d.glossary || [], koAbstract: p.abstractKo || "" });
  } catch (e) { fail(res, e); }
}
