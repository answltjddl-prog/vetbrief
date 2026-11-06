// Korean → English veterinary term dictionary.
// Used to build search queries when no Claude API key is configured (and as a cheap fallback).
const DICT = [
  [["고양이", "냥이", "묘"], ["cat", "cats", "feline"]],
  [["강아지", "개", "견", "반려견", "말티즈", "푸들", "포메라니안", "비숑", "시츄", "시추", "리트리버", "닥스훈트", "진돗개"], ["dog", "dogs", "canine"]],
  [["말", "경주마"], ["horse", "horses", "equine"]],
  [["소", "젖소", "한우", "송아지"], ["cattle", "bovine", "cow", "calves"]],
  [["돼지", "자돈", "양돈"], ["pig", "swine", "porcine"]],
  [["닭", "가금", "육계", "산란계"], ["chicken", "poultry", "broiler"]],
  [["토끼"], ["rabbit"]], [["페럿"], ["ferret"]], [["파충류"], ["reptile"]], [["앵무새", "조류"], ["parrot", "avian"]],
  [["만성신부전", "만성신장병", "신부전", "신장병", "콩팥", "신장"], ["\"chronic kidney disease\"", "CKD", "renal"]],
  [["급성신손상", "급성신부전"], ["\"acute kidney injury\""]],
  [["단백뇨"], ["proteinuria"]], [["요로결석", "결석"], ["urolithiasis"]], [["방광염"], ["cystitis"]],
  [["심부전"], ["\"heart failure\""]], [["이첨판", "판막", "mmvd"], ["\"mitral valve disease\"", "MMVD"]],
  [["심근증", "비대성심근증"], ["cardiomyopathy"]], [["부정맥"], ["arrhythmia"]], [["심장사상충"], ["heartworm", "Dirofilaria"]],
  [["아토피", "아토피피부염"], ["\"atopic dermatitis\""]], [["피부염", "피부"], ["dermatitis", "skin"]], [["가려움", "소양감"], ["pruritus"]],
  [["외이염", "귀"], ["otitis"]], [["농피증"], ["pyoderma"]],
  [["당뇨", "당뇨병"], ["diabetes"]], [["갑상선기능항진증", "갑상선항진"], ["hyperthyroidism"]], [["갑상선기능저하증"], ["hypothyroidism"]],
  [["쿠싱", "부신피질기능항진증"], ["hyperadrenocorticism", "Cushing"]], [["애디슨"], ["hypoadrenocorticism", "Addison"]],
  [["췌장염"], ["pancreatitis"]], [["산통", "배앓이"], ["colic"]], [["소화기"], ["gastrointestinal"]], [["구토"], ["vomiting"]], [["설사"], ["diarrhea", "diarrhoea"]], [["장염"], ["enteropathy", "enteritis"]],
  [["간", "간질환"], ["liver", "hepatic"]], [["림프종"], ["lymphoma"]], [["비만세포종"], ["\"mast cell tumor\""]], [["종양", "암"], ["tumor", "cancer", "neoplasia"]],
  [["항암", "화학요법"], ["chemotherapy"]], [["관절염", "골관절염"], ["osteoarthritis"]], [["슬개골", "슬개골탈구"], ["\"patellar luxation\""]],
  [["십자인대"], ["\"cranial cruciate ligament\""]], [["디스크", "추간판"], ["\"intervertebral disc\""]], [["통증", "진통"], ["pain", "analgesia"]],
  [["마취"], ["anesthesia", "anaesthesia"]], [["진정"], ["sedation"]], [["스트레스", "불안", "공포"], ["stress", "anxiety", "fear"]],
  [["발작", "간질", "뇌전증"], ["seizure", "epilepsy"]], [["백신", "예방접종"], ["vaccine", "vaccination"]],
  [["항생제", "항균제"], ["antimicrobial", "antibiotic"]], [["내성"], ["resistance"]], [["기생충", "구충"], ["parasite", "anthelmintic"]],
  [["파보", "파보바이러스"], ["parvovirus"]], [["디스템퍼"], ["distemper"]], [["복막염", "fip"], ["\"feline infectious peritonitis\"", "FIP"]],
  [["유방염"], ["mastitis"]], [["asf", "아프리카돼지열병"], ["\"African swine fever\""]], [["구제역"], ["\"foot-and-mouth disease\""]],
  [["조류인플루엔자", "ai"], ["\"avian influenza\""]], [["sfts", "중증열성혈소판감소증후군"], ["SFTS"]],
  [["피모벤단", "베트메딘"], ["pimobendan"]], [["텔미사르탄", "세민트라"], ["telmisartan"]], [["베나제프릴"], ["benazepril"]],
  [["아포퀠", "오클라시티닙"], ["oclacitinib"]], [["사이토포인트", "로키베트맙"], ["lokivetmab"]], [["사이클로스포린", "아토피카"], ["ciclosporin", "cyclosporine"]],
  [["리브렐라", "베딘베트맙"], ["bedinvetmab"]], [["솔렌시아", "프루네베트맙"], ["frunevetmab"]], [["멜록시캄", "메타캄"], ["meloxicam"]],
  [["가바펜틴"], ["gabapentin"]], [["트라조돈"], ["trazodone"]], [["미르타자핀", "미라타즈"], ["mirtazapine"]],
  [["벨라글리플로진", "센벨고"], ["velagliflozin"]], [["벡사글리플로진"], ["bexagliflozin"]], [["인슐린"], ["insulin"]],
  [["메티마졸", "펠리마졸"], ["methimazole"]], [["트릴로스탄", "베토릴"], ["trilostane"]], [["퓨자플라딥", "파노퀠"], ["fuzapladib"]],
  [["넥스가드", "아폭솔라너"], ["afoxolaner"]], [["브라벡토", "플루랄라너"], ["fluralaner"]], [["프레드니솔론", "스테로이드"], ["prednisolone", "glucocorticoid"]],
  [["용량", "투여량"], ["dose", "dosage"]], [["부작용", "이상반응", "독성"], ["adverse", "safety", "toxicity"]],
  [["치료"], ["treatment", "therapy"]], [["진단"], ["diagnosis"]], [["예후"], ["prognosis", "survival"]],
];
const SKIP = new Set(["논문", "최신", "연구", "관련", "에서", "의", "및", "효과"]);

export function koToEnglish(q) {
  const tokens = q.trim().split(/[\s,·/]+/).filter(Boolean);
  const groups = [], simple = [];
  for (const tk of tokens) {
    const t = tk.toLowerCase();
    if (SKIP.has(t)) continue;
    if (!/[^\x00-\x7F]/.test(t)) { groups.push([tk]); simple.push(tk); continue; }
    const base = t.replace(/(에서|에게|으로|에|의|은|는|이|가|을|를|와|과|도)$/, "");
    const hit = k => k.length === 1 ? (t === k || base === k) : (t === k || base === k || t.startsWith(k) || t.includes(k));
    let terms = null;
    for (const [keys, en] of DICT) if (keys.some(hit)) { terms = en; break; }
    if (terms) { groups.push(terms); simple.push(terms[0].replace(/"/g, "")); }
  }
  if (!groups.length) return { epmc: q, simple: q };
  return {
    epmc: groups.map(g => (g.length > 1 ? `(${g.join(" OR ")})` : g[0])).join(" AND "),
    simple: simple.join(" "),
  };
}
