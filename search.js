// GET /api/search?scope=global|kr&q=고양이 만성신부전&cat=renal&sp=cat&years=5&sort=rel&cursor=*
//   global (해외): Europe PMC (PubMed·PMC·preprints·Agricola) + OpenAlex Veterinary, merged
//   kr (국내):    KCI (Korean journals, if KCI_API_KEY is set) + OpenAlex Korean-institution Veterinary works
import { send, checkAccess, epmc, claude, vetFilter, CAT_TERMS, SPECIES, mapRecord, speciesOf, fail } from "./_lib.js";
import { koToEnglish } from "./_dict.js";
import { oaWorks, OA_VET_FIELD, OA_SPECIES, OA_CATS, kciSearch, kciEnabled, mergeLists, encCursor, decCursor } from "./_sources.js";

const qCache = new Map();
// Korean phrase → { epmc: boolean query for Europe PMC, simple: few English keywords for OpenAlex }
async function toQuery(q) {
  const plain = q.trim();
  if (!plain) return { epmc: "", simple: "" };
  if (!/[^\x00-\x7F]/.test(plain)) return { epmc: plain, simple: plain.replace(/\b(AND|OR|NOT)\b|[()"]/g, " ").replace(/\s+/g, " ").trim() };
  if (qCache.has(plain)) return qCache.get(plain);
  if (!process.env.ANTHROPIC_API_KEY) return koToEnglish(plain); // no AI key: dictionary translation
  let out;
  try { out = await claude(
`Convert this Korean veterinary search phrase into two English search strings and output JSON only:
{"epmc": "...", "simple": "..."}
epmc rules (Europe PMC boolean query):
- English medical terms; expand Korean brand names to generic names too (아포퀠 → oclacitinib, 리브렐라 → bedinvetmab, 베트메딘 → pimobendan, 센벨고 → velagliflozin, 넥스가드 → afoxolaner).
- Group synonyms with OR in parentheses and quote multi-word phrases, e.g. ("chronic kidney disease" OR CKD). Join concepts with AND.
- Include species words only if the phrase names a species (고양이 → (cat OR cats OR feline)).
- 용량/부작용 → add (dose OR dosage) / (adverse OR safety) only if asked. Ignore 최신/논문. Under 240 characters.
simple rules: 2-6 plain English keywords, no operators or quotes (e.g. "feline chronic kidney disease").

Phrase: ${plain}`, { fast: true, maxTokens: 300 }); } catch { return koToEnglish(plain); }
  let r;
  try { const a = out.indexOf("{"), b = out.lastIndexOf("}"); r = JSON.parse(out.slice(a, b + 1)); } catch { r = { epmc: plain, simple: plain }; }
  r = { epmc: String(r.epmc || plain).slice(0, 300), simple: String(r.simple || r.epmc || plain).replace(/\b(AND|OR|NOT)\b|[()"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) };
  if (qCache.size > 500) qCache.clear();
  qCache.set(plain, r);
  return r;
}
const safe = p => p.catch(e => { console.error("source failed:", e.message); return null; });

export default async function handler(req, res) {
  if (!checkAccess(req, res)) return;
  try {
    const u = new URL(req.url, "http://x");
    const scope = u.searchParams.get("scope") === "kr" ? "kr" : "global";
    const q = (u.searchParams.get("q") || "").slice(0, 200);
    const cat = CAT_TERMS[u.searchParams.get("cat")] ? u.searchParams.get("cat") : "all";
    const sp = SPECIES[u.searchParams.get("sp")] ? u.searchParams.get("sp") : "all";
    const years = ["2", "5", "1"].includes(u.searchParams.get("years")) ? +u.searchParams.get("years") : null;
    const sort = u.searchParams.get("sort") === "new" ? "new" : "rel";
    const cur = decCursor(u.searchParams.get("cursor"));
    const first = !u.searchParams.get("cursor") || u.searchParams.get("cursor") === "*";

    const tq = await toQuery(q);
    const y = new Date().getFullYear();
    const oaFilters = [`topics.field.id:${OA_VET_FIELD}`];
    if (years) oaFilters.push(`from_publication_date:${y - years}-01-01`);
    const oaText = [tq.simple, OA_SPECIES[sp] && `(${OA_SPECIES[sp]})`, OA_CATS[cat] && `(${OA_CATS[cat]})`].filter(Boolean).join(" AND ");
    const oaSort = sort === "new" || !oaText ? "publication_date:desc" : undefined;
    const calls = {};

    if (scope === "global") {
      const parts = [];
      if (tq.epmc) parts.push(`(${tq.epmc})`);
      if (cat !== "all") parts.push(CAT_TERMS[cat]);
      parts.push(vetFilter(sp));
      if (years) parts.push(`PUB_YEAR:[${y - years} TO ${y}]`);
      parts.push("(SRC:MED OR SRC:PMC OR SRC:PPR OR SRC:AGR)");
      if (first || cur.e) calls.e = safe(epmc("/search", { query: parts.join(" AND "), format: "json", resultType: "core", pageSize: 20, cursorMark: cur.e || "*", sort: sort === "new" ? "P_PDATE_D desc" : undefined }));
      if (first || cur.o) calls.o = safe(oaWorks({ filters: oaFilters, search: oaText, sort: oaSort, cursor: cur.o || "*", perPage: 20 }));
    } else {
      if (first || cur.o) calls.o = safe(oaWorks({ filters: [...oaFilters, "authorships.institutions.country_code:KR"], search: oaText, sort: oaSort, cursor: cur.o || "*", perPage: 20 }));
      if (kciEnabled() && q && (first || cur.k)) calls.k = safe(kciSearch(q, { page: cur.k || 1, yearsBack: years }));
    }
    const keys = Object.keys(calls);
    const got = Object.fromEntries((await Promise.all(Object.values(calls))).map((v, i) => [keys[i], v]));
    if (keys.length && !keys.some(k => got[k])) throw Object.assign(new Error("논문 DB에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요."), { status: 502 });

    const lists = [], next = {};
    let total = 0;
    if (got.k) { got.k.results.forEach(r => r.species = speciesOf(r.title + " " + (r.ko || ""))); lists.push(got.k.results); total += got.k.total; if (got.k.results.length) next.k = (cur.k || 1) + 1; }
    if (got.e) { lists.push((got.e.resultList?.result || []).map(mapRecord)); total = Math.max(total, got.e.hitCount || 0); if (got.e.nextCursorMark && got.e.nextCursorMark !== (cur.e || "*") && got.e.resultList?.result?.length) next.e = got.e.nextCursorMark; }
    if (got.o) {
      got.o.results.forEach(r => { r.species = speciesOf(r.title); if (scope === "kr") r.kr = true; });
      lists.push(got.o.results); total = scope === "global" && got.e ? Math.round(Math.max(total, got.o.total) * 1.1) : total + got.o.total;
      if (got.o.next && got.o.results.length) next.o = got.o.next;
    }
    send(res, 200, {
      scope, query: tq.epmc, total, estimated: lists.length > 1, kci: kciEnabled(),
      next: Object.keys(next).length ? encCursor(next) : null,
      results: mergeLists(lists, { byDate: sort === "new" }),
    });
  } catch (e) { fail(res, e); }
}
