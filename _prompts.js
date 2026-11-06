export const SUMMARY_SPEC = `다음 JSON 하나만 출력하세요. 설명 문장이나 코드블록 표시는 쓰지 마세요.
{
 "one_line": "임상적으로 가장 중요한 결론 한 문장 (한국어, 60자 이내)",
 "design": "연구 설계 (예: 무작위 위약대조 다기관 RCT)",
 "n": "대상 수 (예: 360두). 없으면 '원문에 명시 없음'",
 "evidence": {"grade":"A|B|C|D","reason":"한 줄"},
 "species": {"value":"축종과 대상 질환/상태","detail":"포함·제외 기준 요약"},
 "drugs": [{"name":"영문 일반명 (한글명)","dose":"원문 그대로의 용량과 단위","route":"PO/SC/IV/외용 등","frequency":"q12h 등","duration":"기간","note":"시험군/대조군 등"}],
 "adverse": {"effects":["부작용과 빈도"],"contraindications":["금기·주의·제외 기준"]},
 "prognosis": {"value":"임상적 예후·효과 요약","numbers":["핵심 수치 (생존기간, 성공률, P값 등)"]},
 "quotes": [{"field":"용량|부작용|예후|대상","quote":"근거가 된 원문 영어 구절 (25단어 이내)"}],
 "missing": ["원문에 없어서 채우지 못한 항목"]
}
규칙:
- 반드시 제공된 텍스트에 있는 정보만 사용하세요. 기억이나 일반 지식으로 수치를 보태지 마세요.
- 텍스트에 없는 칸은 "원문에 명시 없음"이라고 쓰고 missing에 추가하세요.
- 용량·단위(mg/kg, mg/cat, q24h, PO 등)는 원문 표기를 바꾸지 말고 그대로 옮기세요. 단위 환산 금지.
- 약물이 아닌 중재(식이요법, 수술 등)도 drugs에 넣되 dose 칸에 내용을 쓰세요.
- evidence 등급: A=무작위 대조시험·체계적 고찰, B=전향적 비무작위·코호트, C=후향적·증례, D=의견·총설·실험실 연구.
- 한국 수의사가 차트에 바로 쓸 수 있게 간결한 한국어 의학 용어로 쓰세요.`;

export function paperPrompt(meta, text, basis) {
  return `당신은 한국 임상 수의사를 돕는 수의학 논문 요약 보조자입니다.
아래 논문 ${basis === "fulltext" ? "본문" : "초록"}만 근거로 4가지 실전 항목(대상 축종, 약물 및 투여 용량, 부작용 및 금기사항, 임상적 예후)을 정리하세요.
${basis === "abstract" ? "초록만 있으므로 본문에 있을 법한 세부 용량을 추측하지 마세요." : ""}

[논문]
제목: ${meta.title}
저자: ${meta.authors}
학술지: ${meta.journal} ${meta.ref}

[텍스트 시작]
${text}
[텍스트 끝]

${SUMMARY_SPEC}`;
}

export function docPrompt(text) {
  return `당신은 한국 임상 수의사를 돕는 수의학 논문 요약 보조자입니다.
아래는 사용자가 올린 논문(PDF 추출 또는 붙여넣기) 텍스트입니다. 이 텍스트만 근거로 4가지 실전 항목을 정리하세요.
JSON에 "title"(논문 영문 제목)과 "citation"(저자·학술지·연도) 키도 추가하세요. 모르면 빈 문자열.

[텍스트 시작]
${text}
[텍스트 끝]

${SUMMARY_SPEC}`;
}

export function studyPrompt(title, sentences) {
  return `수의대생 학습용으로 아래 영어 문장들을 자연스러운 한국어 의학 문체로 번역하세요. 문장 수와 순서를 그대로 유지하세요.
또 수의대생이 알아야 할 핵심 영어 용어 6~10개를 골라 용어 사전을 만드세요.
다음 JSON 하나만 출력하세요:
{"ko":["번역1","번역2", ...], "glossary":[{"term":"영어 용어","ko":"한국어","note":"한 줄 설명"}]}

논문 제목: ${title}
문장:
${sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}

export function titlesPrompt(titles) {
  return `다음 수의학 논문 제목들을 한국 수의사가 읽기 쉬운 자연스러운 한국어로 번역하세요. 약물명은 "영문(한글)" 대신 한글 표기만, 질환 약어는 유지(CKD, MMVD 등).
순서와 개수를 그대로 지켜 JSON 하나만 출력하세요: {"ko":["...", "..."]}

${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
}
