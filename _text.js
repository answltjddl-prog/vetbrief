// Get the readable text of one paper from whichever source it came from.
import { getArticle, getFullText, abstractText, stripTags, citation } from "./_lib.js";
import { oaWork, oaAbstract, mapOA, kciDetail, kciEnabled } from "./_sources.js";

const nf = msg => Object.assign(new Error(msg), { status: 422, code: "no_text" });

export async function paperText(source, id, { wantFull = true } = {}) {
  source = String(source || "").toUpperCase();
  if (source === "OA") {
    const w = await oaWork(id);
    const m = mapOA(w);
    const meta = { title: m.title, authors: m.authors, journal: m.journal, ref: m.ref };
    if (wantFull && m.pmcid) { const full = await getFullText(m.pmcid); if (full) return { meta, basis: "fulltext", text: full, abstract: oaAbstract(w.abstract_inverted_index) }; }
    let abs = oaAbstract(w.abstract_inverted_index);
    if (!abs && m.pmid) { try { abs = abstractText(await getArticle("MED", m.pmid)); } catch {} }
    if (!abs) throw nf("이 논문은 공개된 초록이 없어요. 원문 링크에서 PDF를 받아 ‘내 PDF’에 올려주세요.");
    return { meta, basis: "abstract", text: abs, abstract: abs };
  }
  if (source === "KCI") {
    if (!kciEnabled()) throw nf("국내 논문 상세를 보려면 서버에 KCI 인증키가 필요해요.");
    const d = await kciDetail(id);
    const meta = { title: d.meta.ko || d.meta.title, authors: d.meta.authors, journal: d.meta.journal, ref: d.meta.ref };
    const text = [d.abstractKo && `[국문 초록] ${d.abstractKo}`, d.abstractEn && `[Abstract] ${d.abstractEn}`, d.keywords.length && `[키워드] ${d.keywords.join(", ")}`].filter(Boolean).join("\n\n");
    if (!text) throw nf("이 논문은 KCI에 초록이 없어요. 원문 링크에서 PDF를 받아 ‘내 PDF’에 올려주세요.");
    return { meta, basis: "abstract", text, abstract: d.abstractEn || d.abstractKo, abstractKo: d.abstractKo };
  }
  const a = await getArticle(source, id);
  const c = citation(a);
  const meta = { title: stripTags(a.title), authors: a.authorString || "", journal: c.journal, ref: c.ref };
  const abs = abstractText(a);
  if (wantFull && a.pmcid && (a.isOpenAccess === "Y" || a.inEPMC === "Y")) {
    const full = await getFullText(a.pmcid);
    if (full) return { meta, basis: "fulltext", text: full, abstract: abs };
  }
  if (!abs || abs.length < 80) throw nf("이 논문은 초록이 공개되어 있지 않아요. PDF가 있다면 ‘내 PDF’에 올려주세요.");
  return { meta, basis: "abstract", text: abs, abstract: abs };
}
