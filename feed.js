// GET /api/feed?scope=global|kr&days=7&cat=all&sp=all&cursor=*
// Newest veterinary papers by date.
//   global (해외): Europe PMC (PubMed·PMC·preprints·Agricola) + OpenAlex field "Veterinary", merged and de-duplicated
//   kr (국내):    OpenAlex works by Korean institutions in Veterinary + Korean veterinary journals (by ISSN)
// No access code: cached at the CDN for 10 minutes so all users share the same few upstream calls.
import { sendCached, epmc, vetFilter, CAT_TERMS, SPECIES, mapRecord, speciesOf, translateTitles, fail } from "./_lib.js";
import { oaWorks, OA_VET_FIELD, OA_SPECIES, OA_CATS, KR_VET_ISSNS, mergeLists, encCursor, decCursor } from "./_sources.js";

const ymd = d => d.toISOString().slice(0, 10);
const kstToday = () => new Date(Date.now() + 9 * 3600e3);

async function epmcNewest(params) {
  try { return await epmc("/search", { ...params, sort: "FIRST_PDATE_D desc" }); }
  catch { return await epmc("/search", { ...params, sort: "P_PDATE_D desc" }); }
}
const safe = p => p.catch(e => { console.error("source failed:", e.message); return null; });
const oaSearch = (sp, cat) => [OA_SPECIES[sp], OA_CATS[cat]].filter(Boolean).map(s => `(${s})`).join(" AND ");

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, "http://x");
    const scope = u.searchParams.get("scope") === "kr" ? "kr" : "global";
    const days = [1, 7, 30].includes(+u.searchParams.get("days")) ? +u.searchParams.get("days") : 7;
    const cat = CAT_TERMS[u.searchParams.get("cat")] ? u.searchParams.get("cat") : "all";
    const sp = SPECIES[u.searchParams.get("sp")] ? u.searchParams.get("sp") : "all";
    const cur = decCursor(u.searchParams.get("cursor"));
    const first = !u.searchParams.get("cursor") || u.searchParams.get("cursor") === "*";

    const today = kstToday(), t = ymd(today);
    const from = ymd(new Date(today.getTime() - (days - 1) * 86400e3));
    const dateF = [`from_publication_date:${from}`, `to_publication_date:${t}`];
    const search = oaSearch(sp, cat);
    const calls = {};

    if (scope === "global") {
      const parts = [vetFilter(sp)];
      if (cat !== "all") parts.push(CAT_TERMS[cat]);
      parts.push("(SRC:MED OR SRC:PMC OR SRC:PPR OR SRC:AGR)");
      const base = parts.join(" AND ");
      if (first || cur.e) calls.e = safe(epmcNewest({ query: `${base} AND FIRST_PDATE:[${from} TO ${t}]`, format: "json", resultType: "core", pageSize: 25, cursorMark: cur.e || "*" }));
      if (first) calls.eToday = safe(epmc("/search", { query: `${base} AND FIRST_PDATE:[${t} TO ${t}]`, format: "json", resultType: "idlist", pageSize: 1 }));
      if (first || cur.o) calls.o = safe(oaWorks({ filters: [`topics.field.id:${OA_VET_FIELD}`, ...dateF], search, sort: search ? undefined : "publication_date:desc", cursor: cur.o || "*" }));
    } else {
      if (first || cur.o) calls.o = safe(oaWorks({ filters: [`topics.field.id:${OA_VET_FIELD}`, "authorships.institutions.country_code:KR", ...dateF], search, sort: search ? undefined : "publication_date:desc", cursor: cur.o || "*" }));
      if (first || cur.j) calls.j = safe(oaWorks({ filters: [`primary_location.source.issn:${KR_VET_ISSNS.join("|")}`, ...dateF], search, sort: search ? undefined : "publication_date:desc", cursor: cur.j || "*" }));
      if (first) calls.oToday = safe(oaWorks({ filters: [`topics.field.id:${OA_VET_FIELD}`, "authorships.institutions.country_code:KR", `from_publication_date:${t}`, `to_publication_date:${t}`], perPage: 1 }));
    }
    const keys = Object.keys(calls);
    const got = Object.fromEntries((await Promise.all(Object.values(calls))).map((v, i) => [keys[i], v]));
    if (!keys.some(k => got[k])) throw Object.assign(new Error("논문 DB에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요."), { status: 502 });

    const lists = [];
    const next = {};
    let total = 0, todayN = null;
    if (got.e) { lists.push((got.e.resultList?.result || []).map(mapRecord)); total = Math.max(total, got.e.hitCount || 0); if (got.e.nextCursorMark && got.e.nextCursorMark !== (cur.e || "*") && got.e.resultList?.result?.length) next.e = got.e.nextCursorMark; }
    for (const k of ["o", "j"]) if (got[k]) {
      got[k].results.forEach(r => { r.species = speciesOf(r.title); if (scope === "kr") r.kr = true; });
      lists.push(got[k].results); total = Math.max(total, got[k].total);
      if (got[k].next && got[k].results.length) next[k] = got[k].next;
    }
    if (scope === "global" && got.e && got.o) total = Math.round(Math.max(got.e.hitCount || 0, got.o.total) * 1.1); // union estimate
    if (scope === "kr" && got.o && got.j) total = got.o.total + Math.round(got.j.total * 0.3);
    if (got.eToday) todayN = got.eToday.hitCount || 0;
    if (got.oToday) todayN = got.oToday.total;

    const results = mergeLists(lists, { byDate: true });
    const needKo = results.filter(r => !r.ko);
    const ko = await translateTitles(needKo.map(r => r.title));
    needKo.forEach((r, i) => { if (ko[i]) r.ko = ko[i]; });

    sendCached(res, {
      scope, days, total, today: todayN, estimated: Object.keys(got).filter(k => got[k] && !k.endsWith("Today")).length > 1,
      next: Object.keys(next).length ? encCursor(next) : null, updated: new Date().toISOString(),
      sources: { europepmc: !!got.e, openalex: !!(got.o || got.j) }, results,
    }, 600);
  } catch (e) { fail(res, e); }
}
