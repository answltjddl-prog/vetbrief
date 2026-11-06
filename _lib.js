// Shared helpers for the VetBrief API routes (Vercel Node functions).
// Files starting with "_" inside /api are not exposed as routes.

export const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const MODEL_SMART = process.env.CLAUDE_MODEL_SUMMARY || "claude-sonnet-5-5";
const MODEL_FAST = process.env.CLAUDE_MODEL_FAST || "claude-haiku-5-5";

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// Beta guard: if ACCESS_CODE is set, every AI route needs the same code in the
// x-access-code header. Stops strangers from spending your Claude credits.
export function checkAccess(req, res) {
  const code = process.env.ACCESS_CODE;
  if (!code) return true;
  const got = req.headers["x-access-code"] || "";
  if (got === code) return true;
  send(res, 401, { error: "access_code", message: "베타 접속 코드가 필요해요." });
  return false;
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

export function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/\s+/g, " ").trim();
}

// Abstract as plain text with section headings kept as "Background: ..."
export function abstractText(a) {
  return stripTags(String(a.abstractText || "").replace(/<(h\d|b|strong)>([^<]{1,40})<\/\1>\s*/gi, " $2: ").replace(/:\s*:/g, ":"));
}

export async function epmc(path, params) {
  const url = new URL(EPMC + path);
  if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  let r = await fetch(url, { headers: { "User-Agent": "VetBrief/1.0" } });
  // Long veterinary queries: retry through Europe PMC's POST search if the GET URL is refused.
  if (!r.ok && path === "/search" && (r.status === 414 || r.status === 400 || r.status === 431)) {
    r = await fetch(EPMC + "/searchPOST", {
      method: "POST", headers: { "User-Agent": "VetBrief/1.0", "Content-Type": "application/x-www-form-urlencoded" },
      body: url.searchParams.toString(),
    });
  }
  if (!r.ok) throw Object.assign(new Error("Europe PMC " + r.status), { status: 502 });
  return path.endsWith("fullTextXML") ? r.text() : r.json();
}

export async function claude(prompt, { fast = false, maxTokens = 4000, system } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw Object.assign(new Error("ANTHROPIC_API_KEY is not set"), { status: 500, code: "no_key" });
  const body = {
    model: fast ? MODEL_FAST : MODEL_SMART,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (system) body.system = system;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const code = r.status === 429 || r.status === 529 ? "rate_limited" : "ai_error";
    throw Object.assign(new Error(data?.error?.message || "Claude API " + r.status), { status: r.status === 429 ? 429 : 502, code });
  }
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

export function parseJSON(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw Object.assign(new Error("AI returned no JSON"), { status: 502, code: "ai_error" });
  return JSON.parse(text.slice(a, b + 1));
}

export async function claudeJSON(prompt, opts) {
  let last;
  for (let i = 0; i < 2; i++) {
    try { return parseJSON(await claude(prompt, opts)); }
    catch (e) { last = e; if (e.code === "rate_limited" || e.code === "no_key") break; }
  }
  throw last;
}

export function fail(res, e) {
  console.error(e);
  send(res, e.status || 500, { error: e.code || "server_error", message: e.message });
}

// Get one article's metadata (with abstract) by source + id, e.g. MED / 27678080
export async function getArticle(source, id) {
  const q = `EXT_ID:${String(id).replace(/[^A-Za-z0-9]/g, "")} AND SRC:${String(source).replace(/[^A-Za-z]/g, "")}`;
  const j = await epmc("/search", { query: q, resultType: "core", format: "json", pageSize: 1 });
  const a = j?.resultList?.result?.[0];
  if (!a) throw Object.assign(new Error("논문을 찾지 못했어요"), { status: 404, code: "not_found" });
  return a;
}

// Open-access full text as plain text, keeping body and tables but dropping references.
export async function getFullText(pmcid) {
  try {
    let xml = await epmc(`/${pmcid}/fullTextXML`);
    xml = xml.replace(/<ref-list[\s\S]*?<\/ref-list>/g, " ")
             .replace(/<back>[\s\S]*?<\/back>/g, " ")
             .replace(/<xref[^>]*>[\s\S]*?<\/xref>/g, "")
             .replace(/<\/(p|title|tr|caption|sec)>/g, "$&\n");
    const text = stripTags(xml.replace(/\n/g, " ¶ ")).replace(/ ¶ /g, "\n");
    return text.length > 1500 ? text.slice(0, 90000) : null;
  } catch { return null; }
}

export function citation(a) {
  const j = a.journalInfo || {};
  const journal = j.journal?.isoabbreviation || j.journal?.title || a.journalTitle || "";
  const vol = [j.volume && `${j.volume}`, j.issue && `(${j.issue})`].filter(Boolean).join("");
  return {
    journal,
    ref: [a.pubYear || j.yearOfPublication, vol && `;${vol}`, a.pageInfo && `:${a.pageInfo}`].filter(Boolean).join(""),
  };
}

// ---------- Veterinary scope (shared by feed + search) ----------
export const VET_JOURNALS = [
  "Journal of veterinary internal medicine", "Journal of feline medicine and surgery", "Journal of small animal practice",
  "Veterinary record", "Journal of the American Veterinary Medical Association", "American journal of veterinary research",
  "Veterinary dermatology", "Veterinary surgery", "Veterinary radiology & ultrasound", "Veterinary anaesthesia and analgesia",
  "Veterinary and comparative oncology", "Frontiers in veterinary science", "BMC veterinary research", "Veterinary sciences",
  "Journal of veterinary science", "Veterinary journal", "Veterinary clinics of North America. Small animal practice",
  "Journal of veterinary cardiology", "Journal of veterinary emergency and critical care", "Equine veterinary journal",
  "Preventive veterinary medicine", "Veterinary microbiology", "Veterinary parasitology",
  "Journal of veterinary pharmacology and therapeutics", "Topics in companion animal medicine", "Veterinary ophthalmology",
  "Journal of the American Animal Hospital Association", "Open veterinary journal", "Veterinary medicine and science",
  "Journal of veterinary diagnostic investigation", "Canadian veterinary journal", "Australian veterinary journal",
  "Veterinary quarterly", "Journal of veterinary dentistry", "Veterinary pathology", "Veterinary immunology and immunopathology",
  "Research in veterinary science", "Journal of veterinary medical science", "Veterinary research", "Journal of dairy science",
  "Poultry science", "Avian diseases", "Journal of avian medicine and surgery", "Journal of zoo and wildlife medicine",
  "Veterinary clinical pathology", "Journal of veterinary behavior", "Irish veterinary journal", "Acta veterinaria Scandinavica",
  "Veterinary world", "Tierarztliche Praxis", "Schweizer Archiv fur Tierheilkunde", "Journal of equine veterinary science",
];
export const SPECIES = {
  dog:   { ko: "개",        re: /\b(dogs?|canines?|puppy|puppies|beagles?)\b/i, terms: "(dog OR dogs OR canine OR puppy OR puppies)" },
  cat:   { ko: "고양이",    re: /\b(cats?|feline|kittens?)\b/i,                 terms: "(cat OR cats OR feline OR kitten OR kittens)" },
  horse: { ko: "말",        re: /\b(horses?|equine|foals?|ponies|pony|mares?)\b/i, terms: "(horse OR horses OR equine OR foal OR foals OR pony)" },
  cattle:{ ko: "소·반추",   re: /\b(cattle|bovine|cows?|calf|calves|dairy|heifers?|sheep|ovine|goats?|caprine|ruminants?)\b/i, terms: "(cattle OR bovine OR cow OR cows OR calves OR dairy OR sheep OR ovine OR goat OR goats OR caprine OR ruminant)" },
  pig:   { ko: "돼지",      re: /\b(pigs?|swine|porcine|piglets?|sows?)\b/i,     terms: "(pig OR pigs OR swine OR porcine OR piglet OR piglets OR sow)" },
  bird:  { ko: "가금·조류", re: /\b(chickens?|poultry|broilers?|layers?|avian|birds?|ducks?|parrots?|psittacine)\b/i, terms: "(chicken OR chickens OR poultry OR broiler OR broilers OR avian OR bird OR birds OR duck OR parrot OR psittacine)" },
  exotic:{ ko: "특수동물",  re: /\b(rabbits?|ferrets?|guinea pigs?|hamsters?|reptiles?|tortoises?|turtles?|snakes?|lizards?|zoo|wildlife|exotic)\b/i, terms: '(rabbit OR rabbits OR ferret OR ferrets OR "guinea pig" OR hamster OR reptile OR reptiles OR tortoise OR turtle OR snake OR lizard OR zoo OR wildlife OR exotic)' },
};
const ANIMAL_TITLE_TERMS = "(canine OR feline OR equine OR bovine OR porcine OR ovine OR caprine OR veterinary OR dogs OR cats OR horses OR cattle OR calves OR piglets OR poultry OR broilers)";

const VET_MESH = '(Dogs OR Cats OR Horses OR Cattle OR Swine OR Sheep OR Goats OR Poultry OR Chickens OR Rabbits OR "Veterinary Medicine" OR "Dog Diseases" OR "Cat Diseases" OR "Cattle Diseases" OR "Swine Diseases" OR "Poultry Diseases" OR "Horse Diseases")';
export function vetFilter(sp = "all") {
  const journals = VET_JOURNALS.map(j => `JOURNAL:"${j}"`).join(" OR ");
  const broad = `((${journals}) OR TITLE:${ANIMAL_TITLE_TERMS} OR KW:${VET_MESH})`;
  const s = SPECIES[sp];
  if (!s) return broad;
  return `(${broad} AND (TITLE:${s.terms} OR ABSTRACT:${s.terms}))`;
}
export const CAT_TERMS = {
  renal: '(kidney OR renal OR urinary OR "urinary tract")',
  cardio: '(heart OR cardiac OR cardiomyopathy OR "mitral valve" OR arrhythmia)',
  derm: '(dermatitis OR skin OR pruritus OR otitis OR allergy)',
  endo: '(diabetes OR thyroid OR adrenal OR hyperadrenocorticism OR endocrine)',
  pain: '(pain OR analgesia OR osteoarthritis OR anesthesia OR anaesthesia OR orthopedic OR orthopaedic)',
  behav: '(behavior OR behaviour OR anxiety OR stress OR sedation OR fear OR welfare)',
  gi: '(gastrointestinal OR pancreatitis OR enteropathy OR hepatic OR liver OR diarrhea OR diarrhoea)',
  onco: '(lymphoma OR tumor OR tumour OR neoplasia OR cancer OR chemotherapy OR carcinoma OR sarcoma)',
  infect: '(infection OR antimicrobial OR antibiotic OR parasite OR virus OR vaccine OR bacterial)',
};

const PUB_TYPES = [
  [/systematic review/i, "체계적 고찰"], [/meta-analysis/i, "메타분석"],
  [/randomized controlled trial/i, "RCT"], [/clinical trial/i, "임상시험"],
  [/case reports?/i, "증례보고"], [/^review/i, "총설"], [/comparative study/i, "비교연구"],
  [/observational study/i, "관찰연구"], [/guideline/i, "가이드라인"], [/preprint/i, "프리프린트"],
];
export const speciesOf = t => Object.entries(SPECIES).filter(([, s]) => s.re.test(t || "")).map(([k]) => k);
export function mapRecord(a) {
  const c = citation(a);
  const types = a.pubTypeList?.pubType || [];
  let design = "";
  for (const [re, ko] of PUB_TYPES) if (types.some(t => re.test(t))) { design = ko; break; }
  if (!design && a.source === "PPR") design = "프리프린트";
  const title = stripTags(a.title);
  const species = speciesOf(title);
  return {
    key: `${a.source}:${a.id}`, source: a.source, id: a.id, pmid: a.pmid || "", pmcid: a.pmcid || "", doi: a.doi || "",
    title, authors: a.authorString || "", journal: c.journal || a.bookOrReportDetails?.publisher || "", ref: c.ref,
    year: Number(a.pubYear) || null, date: a.firstPublicationDate || "", design, species,
    oa: a.isOpenAccess === "Y" || !!a.pmcid, cited: a.citedByCount || 0, kr: false,
    via: { MED: "PubMed", PMC: "PMC", PPR: "프리프린트", AGR: "Agricola" }[a.source] || a.source,
    url: a.doi ? `https://doi.org/${a.doi}` : a.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/` : `https://europepmc.org/article/${a.source}/${a.id}`,
  };
}

// Korean titles with the fast model. Never throws: on failure returns [] so lists still render.
export async function translateTitles(titles) {
  if (!process.env.ANTHROPIC_API_KEY || !titles.length) return [];
  try {
    const { titlesPrompt } = await import("./_prompts.js");
    const d = await claudeJSON(titlesPrompt(titles), { fast: true, maxTokens: 4000 });
    return Array.isArray(d.ko) ? d.ko : [];
  } catch { return []; }
}

export function sendCached(res, body, seconds = 600) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", `public, max-age=60, s-maxage=${seconds}, stale-while-revalidate=${seconds * 3}`);
  res.end(JSON.stringify(body));
}
