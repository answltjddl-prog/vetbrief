# VetBrief — AI 수의학 논문 비서 (앱 버전)

폰(아이폰·안드로이드), 아이패드, 컴퓨터에서 모두 쓰는 **설치형 웹앱(PWA)** 입니다.
한 번 인터넷에 올려두면 각 기기에서 주소를 열고 "홈 화면에 추가 / 앱 설치"만 누르면 아이콘이 생기고 앱처럼 전체 화면으로 열립니다.

## 무엇이 들어 있나요

| 파일 | 역할 |
|---|---|
| `index.html` | 앱 화면 전체 (새 논문 피드, 검색, AI 임상 요약, 번역 학습, PDF 분석, 저장함, 요금제) |
| `manifest.webmanifest`, `sw.js`, `icons/` | 설치용 정보·아이콘, 오프라인 실행 |
| `api/feed.js` | **새 논문 피드 (해외/국내).** 최근 1·7·30일 새 논문을 최신순으로. 축종·분야 필터, 한국어 제목 포함. 코드 없이 열람 가능, 서버 앞단(CDN)에 10분 캐시 |
| `api/_sources.js` | OpenAlex·KCI 연결, 여러 DB 결과 합치기·중복 제거 |
| `api/_text.js` | 어느 DB에서 온 논문이든 전문/초록 텍스트 가져오기 |
| `api/search.js` | 한국어 검색어 → 영어 검색식으로 바꿔 **Europe PMC(PubMed 포함 4,500만 편 이상)** 실시간 검색 |
| `api/titles.js` | 결과 제목 한국어 번역 (빠르고 저렴한 Haiku 모델) |
| `api/summarize.js` | 오픈액세스 논문은 **전문**, 아니면 **초록**을 읽고 4항목 한국어 표 생성 (Sonnet 모델) |
| `api/study.js` | 초록 원문·번역 대조 + 용어 사전 |
| `api/analyze.js` | 사용자가 올린 PDF/붙여넣은 글 분석 |
| `api/health.js` | 서버 설정 확인 |
| `dev-server.mjs` | 내 컴퓨터에서 시험 실행용 |

Claude API 키는 **서버(Vercel)에만** 저장되고 사용자 기기로는 절대 내려가지 않습니다.

---

## 논문은 어디서 오나요 (해외 / 국내)

| 구분 | DB | 들어오는 것 | 필요한 키 |
|---|---|---|---|
| 해외 | Europe PMC | PubMed 전체, PMC 무료 전문, bioRxiv 등 프리프린트, Agricola(미국 농무부 농업·축산 DB) | 없음 |
| 해외 | OpenAlex | 4억 7천만 건 넘는 전 세계 학술 문헌 중 '수의학(Veterinary)' 분야 전체. PubMed에 없는 해외 학술지까지 | `OPENALEX_API_KEY` (무료) |
| 국내 | KCI 한국학술지인용색인 | 국내 학술지의 국문 논문, 국문·영문 초록 (수의·동물·축산 학술지만 골라서) | `KCI_API_KEY` (신청) |
| 국내 | OpenAlex | 한국 연구진이 쓴 수의학 논문(해외 학술지 포함) + 대한수의학회지·한국임상수의학회지·JVS·Laboratory Animal Research | `OPENALEX_API_KEY` |

- 여러 DB에 같은 논문이 있으면 DOI·PMID로 하나로 합칩니다. 카드 오른쪽 위 작은 표시(PubMed·OpenAlex·KCI 등)가 출처예요.
- 국내 학술지 목록(ISSN)은 `api/_sources.js` 의 `KR_VET_ISSNS`, 해외 수의학 학술지 목록은 `api/_lib.js` 의 `VET_JOURNALS` 에서 늘릴 수 있어요.
- **그래도 빠지는 것:** 유료 DB인 CAB Abstracts, DBpia 같은 유료 국내 DB에만 있는 논문, 학회 초록집, 교과서. 그리고 유료 논문은 초록까지만 AI가 읽어요.

## 0단계. 무료 논문 DB 키 받기 (10분, 강력 권장)

1. **OpenAlex** — https://openalex.org 가입 → https://openalex.org/settings/api 에서 키 복사. 2026년 2월부터 키가 필요해졌고, 키 하나에 매일 무료 사용량이 있어요. 피드는 10분 캐시라 보통 무료 범위 안에서 충분해요.
2. **KCI** — https://open.kci.go.kr 에서 Open API 이용 신청 → 승인되면 인증키 발급. 키가 없으면 '국내' 탭은 OpenAlex(한국 연구진 논문)만 보여줘요.

## Claude 키 없이 먼저 올려도 돼요

`ANTHROPIC_API_KEY` 를 비워두면 **새 논문 피드, 한국어 검색(내장 용어 사전으로 영어 변환), 저장함, 원문 링크, 초록 원문 보기**는 그대로 되고, AI 요약·번역·PDF 분석 버튼은 "준비 중"으로 표시돼요. 제목은 영어로 보여요(국문 논문은 국문 그대로). 키를 나중에 Vercel 환경변수에 추가하고 다시 배포하면 AI 기능이 바로 켜집니다.

## 1단계. Claude API 키 만들기 (5분, 나중에 해도 됨)

1. https://console.anthropic.com 가입 → 결제 수단 등록 (사용한 만큼 과금)
2. **API Keys → Create Key** → `sk-ant-...` 로 시작하는 키 복사 (다시 볼 수 없으니 메모)
3. 콘솔 **Limits** 에서 월 사용 한도를 정해두면 요금 폭탄을 막을 수 있어요

## 2단계. 인터넷에 올리기 — Vercel (무료 플랜으로 시작 가능, 10분)

**방법 A. GitHub 경유 (추천: 나중에 수정이 쉬움)**
1. https://github.com 가입 → **New repository** → 이름 `vetbrief` → Create
2. 저장소 화면에서 **uploading an existing file** → 이 폴더 안의 파일·폴더를 전부 끌어다 놓기 → Commit
3. https://vercel.com 에 GitHub 계정으로 가입 → **Add New → Project** → `vetbrief` 선택 → **Import**
4. **Environment Variables** 에 아래를 추가 → **Deploy**
   - `ANTHROPIC_API_KEY` = 1단계에서 받은 키
   - `OPENALEX_API_KEY` = 0단계 OpenAlex 키
   - `KCI_API_KEY` = 0단계 KCI 키 (승인 전이면 나중에 추가해도 돼요)
   - `ACCESS_CODE` = 베타 테스터에게 알려줄 코드 (예: `vet2026`)
5. 1분 뒤 `https://vetbrief-xxxx.vercel.app` 같은 주소가 생깁니다. 끝!

**방법 B. 명령어 한 줄 (Node.js가 설치된 컴퓨터)**
```bash
cd vetbrief-app
npx vercel            # 질문에 엔터만 누르면 됨
npx vercel env add ANTHROPIC_API_KEY
npx vercel env add OPENALEX_API_KEY
npx vercel env add KCI_API_KEY
npx vercel env add ACCESS_CODE
npx vercel --prod
```

> `ACCESS_CODE` 를 꼭 넣어두세요. 비워두면 주소를 아는 누구나 AI를 써서 내 API 비용이 나갑니다.
> 원하는 주소(예: vetbrief.kr)는 Vercel **Settings → Domains** 에서 연결합니다.

## 3단계. 각 기기에 설치

| 기기 | 방법 |
|---|---|
| **아이폰 / 아이패드** | **Safari**로 주소 열기 → 공유 버튼(⬆︎) → **홈 화면에 추가** |
| **안드로이드** | Chrome·삼성 인터넷으로 열기 → 메뉴 ⋮ → **앱 설치** (또는 아래 뜨는 설치 배너) |
| **Windows / Mac (Chrome·Edge)** | 주소창 오른쪽 설치 아이콘 → **설치** |
| **Mac Safari** | 메뉴 **파일 → Dock에 추가** |

앱 안의 **내 정보 → VetBrief 설치하기** 버튼을 누르면 기기에 맞는 안내가 나옵니다.

---

## 내 컴퓨터에서 먼저 시험해 보기 (선택)

```bash
cd vetbrief-app
cp .env.example .env      # .env 파일을 열어 키와 코드 입력
node dev-server.mjs       # Node.js 20 이상 필요
# 브라우저에서 http://localhost:3000
```

## 새 논문 피드는 어떻게 '실시간'인가요

- 서버가 Europe PMC(PubMed·PMC·bioRxiv 등 포함)에 "최근 N일 안에 처음 공개된 수의학 논문"을 물어봅니다. 결과는 10분 동안 캐시돼 모든 사용자가 같은 결과를 공유하므로 사용자가 늘어도 비용이 거의 늘지 않아요.
- 앱을 켜두면 5분마다 확인해서 새 논문이 생기면 위쪽에 **"↑ 새 논문 N편 보기"** 버튼이 뜹니다.
- 관심 주제(예: 고양이 만성신부전)를 등록하면 그 주제의 최근 1년 새 논문을 바로 볼 수 있어요. 검색 결과 화면의 **"＋ 관심 주제로 등록"** 으로도 추가돼요.
- 수의학 학술지 목록은 `api/_lib.js` 의 `VET_JOURNALS` 에 있어요. 한국 학술지 등 더 넣고 싶은 곳이 있으면 이름을 추가하면 됩니다.
- PubMed 색인 특성상 학술지에 실린 뒤 DB에 올라오기까지 하루~며칠 차이가 날 수 있어요.

## 비용 감 잡기

- 새 논문 피드: 10분마다 조건별로 한 번만 제목 번역(Haiku) → 사용자 수와 거의 무관하게 아주 적은 비용
- 검색 1회: Haiku로 검색어 변환 + 제목 번역 → 아주 적은 비용
- AI 임상 요약 1회: Sonnet이 초록(짧음) 또는 전문(길면 수만 자)을 읽음 → 전문 요약이 가장 비쌈
- 정확한 단가는 https://claude.com/pricing 를 확인하고, 콘솔 **Usage** 에서 실제 사용량을 보며 요금제 횟수를 정하세요.

## 지금 버전의 한계와 다음 단계

| 지금 (베타) | 정식 출시 전에 필요한 것 |
|---|---|
| 사용 횟수·요금제·저장함이 **각 기기 안에만** 저장됨 (폰과 PC가 따로 셈, 지우면 초기화) | 로그인(카카오/구글/애플) + DB(예: Supabase)로 계정별 저장·횟수 관리 |
| 요금제 버튼은 결제 없이 바로 전환 | 결제 연동: 웹은 토스페이먼츠·포트원, 앱스토어 앱은 인앱결제(RevenueCat 등) |
| 접속 코드로만 남용 방지 | 계정별 서버 측 사용량 제한 |
| 앱이 열려 있을 때만 새 논문 알림 | 앱을 닫아도 오는 푸시 알림: 웹 푸시(아이폰은 홈 화면에 설치한 앱에서 지원) + 주기 실행 작업(Vercel Cron) + 구독 정보 DB |
| 웹앱(PWA) 설치 | 앱스토어 등록을 원하면 **PWABuilder**(pwabuilder.com)나 **Capacitor**로 같은 코드를 감싸 Google Play·App Store에 제출 (애플 개발자 계정 연 $99, 구글 1회 $25) |

## 안전·법적 메모

- 화면마다 "AI 요약은 보조 도구, 최종 판단은 수의사" 문구와 **원문 근거 문장**을 보여줍니다. 이 원칙은 유지하세요.
- 논문 **전문 저작권**은 논문마다 다릅니다(CC-BY, CC-BY-NC 등). 앱은 요약을 그때그때 만들기만 하고 전문을 저장·재배포하지 않습니다. 요약을 서버에 모아 다른 사용자에게 공유하는 기능을 만들 때는 라이선스를 확인하세요.
- 사용자가 올린 PDF는 글자 추출을 기기 안에서 하고, 추출한 글자만 Claude API로 보냅니다. 개인정보 처리방침에 이 내용을 적어두세요.
