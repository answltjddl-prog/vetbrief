// Extra literature sources beyond Europe PMC:
//  - OpenAlex (global, 470M+ works; topic field 34 = Veterinary) — needs a free OPENALEX_API_KEY
//  - KCI 한국학술지인용색인 (Korean journals, Korean abstracts) — needs KCI_API_KEY from open.kci.go.kr
import { stripTags } from "./_lib.js";

const OA = "https://api.openalex.org";
export const OA_VET_FIELD = "34"; // OpenAlex field "Veterinary"
// Korean veterinary journals (print|electronic ISSN). Add more here as needed.
export const KR_VET_ISSNS = [
  "2466-1384", "2466-1392", // 대한수의학회지 Korean Journal of Veterinary Research
  "1598-298X", "2384-0749", // 한국임상수의학회지 Journal of Veterinary Clinics
  "1229-845X", "1976-555X", // Journal of Veterinary Science
  "1738-6055", "2233-7660", // Laboratory Animal Research
];
export const OA_SPECIES = {
  dog: "dog OR canine", cat: "cat OR feline", horse: "horse OR equine", cattle: "cattle OR bovine OR dairy",
  pig: "pig OR swine OR porcine", bird: "poultry OR chicken OR avian", exotic: "rabbit OR ferret OR reptile OR exotic",
};
export const OA_CATS = {
  renal: "kidney OR renal OR urinary", cardio: "heart OR cardiac OR cardiomyopathy", derm: "dermatitis OR skin OR pruritus",
  endo: "diabetes OR thyroid OR adrenal", pain: "pain OR analgesia OR osteoarthritis", behav: "behavior OR anxiety OR welfare",
  gi: "gastrointestinal OR pancreatitis OR liver", onco: "tumor OR cancer OR lymphoma", infect: "infection OR antimicrobial OR vaccine",
};

export async function openalex(path, params = {}) {
  const url = new URL(OA + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  if (process.env.OPENALEX_API_KEY) url.searchParams.set("api_key", process.env.OPENALEX_API_KEY);
  const r = await fetch(url, { headers: { "User-Agent": "VetBrief/1.0" } });
  if (!r.ok) throw Object.assign(new Error("OpenAlex " + r.status), { status: 502 });
  return r.json();
}

export function oaAbstract(inv) {
  if (!inv) return "";
  const words = [];
  for (const [w, pos] of Object.entries(inv)) for (const i of pos) words[i] = w;
  return words.filter(Boolean).join(" ");
}

const isKo = s => /[가-힣]/.test(s || "");
export function mapOA(w) {
  const src = w.primary_location?.source || {};
  const pmid = (w.ids?.pmid || "").replace(/\D/g, "");
  const pmcid = (w.ids?.pmcid || "").split("/").pop() || "";
  const doi = (w.doi || "").replace(/^https?:\/\/doi\.org\//, "");
  const title = stripTags(w.title || w.display_name || "");
  const authors = (w.authorships || []).slice(0, 6).map(a => a.author?.display_name).filter(Boolean);
  const kr = (w.authorships || []).some(a => (a.countries || []).includes("KR") || (a.institutions || []).some(i => i.country_code === "KR"));
  return {
    key: `OA:${String(w.id).split("/").pop()}`, source: "OA", id: String(w.id).split("/").pop(), pmid, pmcid, doi,
    title, ko: isKo(title) ? title : undefined, authors: authors.join(", ") + ((w.authorships || []).length > 6 ? " 외" : ""),
    journal: src.display_name || "", ref: [w.publication_year, w.biblio?.volume && `;${w.biblio.volume}`, w.biblio?.issue && `(${w.biblio.issue})`].filter(Boolean).join(""),
    year: w.publication_year || null, date: w.publication_date || "", design: w.type === "review" ? "총설" : w.type === "preprint" ? "프리프린트" : "",
    oa: !!w.open_access?.is_oa, cited: w.cited_by_count || 0, kr, via: "OpenAlex",
    url: doi ? `https://doi.org/${doi}` : (w.primary_location?.landing_page_url || `https://openalex.org/${String(w.id).split("/").pop()}`),
  };
}
const OA_SELECT = "id,doi,title,display_name,publication_date,publication_year,authorships,primary_location,open_access,ids,cited_by_count,type,biblio";

// One page of OpenAlex works. filters: array of "field:value"; search: text (may be empty).
export async function oaWorks({ filters = [], search = "", sort, cursor = "*", perPage = 25 }) {
  const j = await openalex("/works", { filter: filters.join(","), search: search || undefined, sort, cursor, per_page: perPage, select: OA_SELECT });
  return { total: j.meta?.count || 0, next: j.meta?.next_cursor || null, results: (j.results || []).map(mapOA) };
}
export async function oaWork(id) {
  return openalex(`/works/${encodeURIComponent(id)}`);
}

// ---------- KCI ----------
const KCI = "https://open.kci.go.kr/po/openapi/openApiSearch.kci";
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? clean(m[1]) : ""; };
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<${name}(\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g"))].map(m => ({ attr: m[1] || "", text: clean(m[2]) }));
const clean = s => stripTags(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
const VET_JOURNAL_RE = /수의|veterinar|동물|animal|임상수의|가축|축산|lab(oratory)? animal/i;

export const kciEnabled = () => !!process.env.KCI_API_KEY;
async function kciGet(params) {
  const url = new URL(KCI);
  url.searchParams.set("key", process.env.KCI_API_KEY);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (VetBrief)" } });
  if (!r.ok) throw Object.assign(new Error("KCI " + r.status), { status: 502 });
  return r.text();
}
function mapKCI(rec) {
  const id = (rec.match(/article-id="([^"]+)"/) || [])[1] || "";
  const titles = tags(rec, "article-title");
  const orig = titles.find(t => /original/.test(t.attr))?.text || titles[0]?.text || "";
  const eng = titles.find(t => /english|foreign/.test(t.attr))?.text || "";
  const authors = tags(rec, "author").map(a => a.text.replace(/\(.*\)$/, "").trim()).filter(Boolean);
  const y = tag(rec, "pub-year"), m = tag(rec, "pub-mon");
  const doi = tag(rec, "doi");
  return {
    key: `KCI:${id}`, source: "KCI", id, pmid: "", pmcid: "", doi,
    title: eng || orig, ko: isKo(orig) ? orig : undefined, authors: authors.slice(0, 6).join(", ") + (authors.length > 6 ? " 외" : ""),
    journal: tag(rec, "journal-name"), ref: [y, tag(rec, "volume") && `;${tag(rec, "volume")}`].filter(Boolean).join(""),
    year: Number(y) || null, date: y ? `${y}-${(m || "01").padStart(2, "0")}-01` : "", design: "", oa: true, cited: 0, kr: true, via: "KCI",
    url: tag(rec, "url") || `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${id}`,
  };
}
// Search KCI by title words, keep veterinary/animal journals only.
export async function kciSearch(q, { page = 1, yearsBack } = {}) {
  if (!kciEnabled() || !q) return { total: 0, results: [] };
  const now = new Date();
  const params = { apiCode: "articleSearch", title: q, page, displayCount: 100, sortNm: "pubiYr", sortDir: "desc" };
  if (yearsBack) params.dateFrom = `${now.getFullYear() - yearsBack}01`;
  let xml = await kciGet(params);
  let recs = [...xml.matchAll(/<record>([\s\S]*?)<\/record>/g)].map(m => m[1]);
  if (!recs.length && q.includes(" ")) { // fall back to the first word
    xml = await kciGet({ ...params, title: q.split(/\s+/)[0] });
    recs = [...xml.matchAll(/<record>([\s\S]*?)<\/record>/g)].map(m => m[1]);
  }
  const all = recs.map(mapKCI);
  const vet = all.filter(r => VET_JOURNAL_RE.test(r.journal));
  return { total: vet.length, results: vet };
}
export async function kciDetail(id) {
  const xml = await kciGet({ apiCode: "articleDetail", id });
  const rec = (xml.match(/<record>([\s\S]*?)<\/record>/) || [])[1] || xml;
  const meta = mapKCI(rec);
  const abs = tags(rec, "abstract");
  const ko = abs.find(a => /original/.test(a.attr))?.text || "";
  const en = abs.find(a => /english|foreign/.test(a.attr))?.text || "";
  const kw = tags(rec, "keyword").map(k => k.text);
  return { meta, abstractKo: ko, abstractEn: en, keywords: kw };
}

// ---------- merging ----------
const normDoi = d => (d || "").toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
export function mergeLists(lists, { byDate = false } = {}) {
  const seen = new Map(), out = [];
  const keyOf = r => (r.doi && "doi:" + normDoi(r.doi)) || (r.pmid && "pmid:" + r.pmid) || "t:" + (r.title || "").toLowerCase().replace(/\W+/g, "").slice(0, 80);
  // interleave so the first page shows both sources
  const max = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) {
    const r = l[i]; if (!r) continue;
    const k = keyOf(r);
    if (seen.has(k)) { const prev = seen.get(k); prev.oa = prev.oa || r.oa; prev.kr = prev.kr || r.kr; if (!prev.ko && r.ko) prev.ko = r.ko; continue; }
    seen.set(k, r); out.push(r);
  }
  if (byDate) out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return out;
}
export const encCursor = o => Buffer.from(JSON.stringify(o)).toString("base64url");
export const decCursor = s => { try { return s && s !== "*" ? JSON.parse(Buffer.from(s, "base64url").toString()) : {}; } catch { return {}; } };
