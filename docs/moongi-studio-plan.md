# instaCmaker 리디자인 계획 — 뭉이(moongi) 캔버스 스튜디오

> 작성: 2026-06-19. 구글 드라이브 `내 드라이브/instagram/뭉이` 폴더 **125개 전수 분석** 기반 설계 정본.
> 목표: 고정 21템플릿 도구 → **캔바/미리캔버스식 요소(레이어) 기반 자유 편집 + 템플릿 저장** 도구로 전환.

---

## 0. 확정된 방향 (사용자 결정)

1. **구글 드라이브 연동**: 앱에 라이브 연동 안 함. **분석가(Claude)가 폴더를 분석**해 뭉이 스타일 템플릿을 만들고, 대표 에셋(캐릭터·반짝이 등)을 앱에 **기본 에셋으로 번들**. 앱은 지금처럼 완전 오프라인(이미지 직접 업로드).
2. **저장 위치**: 브라우저 **localStorage 자동 저장** + **JSON 내보내기/불러오기**(백업·이동). 백엔드 없음.
3. **템플릿 범위**: **뭉이(moongi_adventures) 스타일만** 정본으로 제작. (폴더에 섞인 elice 형광펜형·beucheo 카드형은 템플릿화 제외 — 단, 형광펜/카드 같은 컴포넌트 기능 자체는 범용으로 제공.)

---

## 1. 요구사항 분해

| 영역 | 요구 | 구현 포인트 |
|------|------|-------------|
| 템플릿 정리 | 기존 21종 전부 삭제 | `TEMPLATE_LIST` + 각 `*Render` + 스키마 자동폼 제거 |
| 템플릿 저장 | 직접 만들어 저장·재사용 | 템플릿 = 저장된 슬라이드(배경+요소셋), localStorage + JSON |
| 자유도 | 캔바/미리캔버스급 | 슬라이드를 요소(레이어) 배열로, 모든 요소 드래그/리사이즈/회전/삭제 |
| 배경이미지 | 추가·교체·삭제 | 배경 = 단색 또는 이미지(fit/어둡게/흐리게) |
| 첨부이미지 | 추가·이동·리사이즈·삭제 | Image 요소(라운드/맞춤/캡션) |
| 텍스트 박스 | 폰트·색·크기·위치·굵기·정렬 + 형광펜·밑줄·이탤릭 | Text 요소(아래 속성표) |
| 라운드 박스 도형 | 추가·수정·삭제 | Shape 요소(사각/라운드/원/선, 채움·테두리·반경) |

---

## 2. 콘텐츠 전수 분석 결과 (뭉이 폴더 125개)

- **구성**: 캐러셀 이미지 **113장 = 게시물 13개(P01~P13)** + 릴스 동영상 12개(mp4, 캐러셀 도구 범위 밖).
- **브랜드 3종 혼재**(모두 "AI 활용/수익화" 교육형): 🟠 moongi_adventures(주력 ~9), 🟣 BCLife/@beucheo.ai(P01), 🟡 elice/yeardream(P03).
- **게시물 주제**: P01 AI 오케스트레이션 · P02 AI 수익화 다이어리 · P03 AI 부트캠프 모집 · P04 이직 실패담→빌더 · P05 클로드 프롬프트 11팁 · P06 노션 프롬프트 54+ · P07 AI 영상(Omni) · P08 NotebookLM 공부법 · P09 AI 수익화 방향 · P10 클로드코드 입문 · P11 GPT 이미지 프롬프트 · P12 Claude Fable 5 가이드 · P13 AI 디자인 치트키.

### 2.1 뭉이 디자인 시스템 (정본)
- **배경**: 크림/베이지(≈`#EDE6D4`), 보조 화이트·다크네이비.
- **컬러**: 네이비/먹색 헤드라인 + **코랄 강조(≈`#E8553A`)** + 노란 형광펜 + 다크박스.
- **타이포(혼합)**:
  - 키커: 레터스페이스 영문 대문자(코랄) — `A CONFESSION`, `PROMPT 01 · VOICE CARD`
  - 메타/페이지: `— A DIARY · EP.03`(좌상) · `01 — 09`(우상)
  - 세리프 이탤릭 강조: `Once upon a time —`, `thinking level.`
  - 헤비 한글 디스플레이 헤드라인 + 코랄 강조어 + 빨간 밑줄
- **장식**: 거대 워터마크 숫자(배경), 반짝이 ✦, 점·구분선.

### 2.2 컴포넌트 어휘 (새 에디터가 그려야 할 것들)
배경(색/이미지) · 키커칩 · 헤드라인(강조어 분리) · **형광펜 텍스트** · 본문 · 세리프이탤릭 · **3D 캐릭터(뭉이) 이미지** · **말풍선** · 비교 카드 2분할 · 불릿/넘버 리스트 · **넘버 칩/필 행** · **다크 PROMPT(모노스페이스) 박스** · **CTA 다크박스/오렌지버튼/노란링크박스** · 통계·표 행 · **인용(blockquote) 박스** · 레드 배너 · 워터마크 숫자 · 이미지 카드(+캡션) · 푸터(핸들/스튜디오 + "— end of ep.xx —").

> 핵심: 위 컴포넌트는 모두 **텍스트·이미지·도형 3요소의 조합**으로 표현 가능 → 요소 모델이면 전부 커버.

---

## 3. 아키텍처 — "템플릿 Render" → "요소(레이어) 캔버스"

```ts
type Project = { handle: string; slides: Slide[] };

type Slide = {
  id: string;
  background: { color?: string; image?: { url: string; fit: "cover"|"contain"; dim: number; blur?: number } };
  elements: Element[]; // 배열 순서 = z-order (앞이 위)
};

type Base = { id: string; x: number; y: number; w: number; h: number; rotation?: number; locked?: boolean }; // 1080×1350 좌표계

type TextElement  = Base & { kind: "text"; text: string; fontFamily: string; size: number; weight: number;
                             italic?: boolean; underline?: boolean; color: string; align: "left"|"center"|"right";
                             lineHeight?: number; letterSpacing?: number; highlight?: { color: string }; shadow?: boolean };
type ImageElement = Base & { kind: "image"; url: string; fit: "cover"|"contain"; radius?: number };
type ShapeElement = Base & { kind: "shape"; shape: "rect"|"roundRect"|"ellipse"|"line";
                             fill?: string; stroke?: { color: string; width: number }; radius?: number };
type Element = TextElement | ImageElement | ShapeElement;

type Template = { id: string; name: string; thumbnail?: string; slide: Slide }; // 텍스트는 자리표시자
```

- **좌표계**: 기존과 동일 **1080×1350 고정 px**. 미리보기는 `.scaler` 축소만, 캡처는 원본 노드.
- **캡처**: `html-to-image`(toBlob) 유지. 편집 핸들/점선은 `editable=true`에서만 렌더, **캡처본(`editable=false`)엔 제외** — 이 분기 보존.
- **저장**: localStorage(자동) + JSON(수동 백업/이동). 템플릿·프로젝트 동일 포맷.

---

## 4. 단계별 로드맵

1. **요소 모델 + 렌더 + 캡처 패리티**
   - `Slide`/`Element` 타입, 배경·텍스트·이미지·도형 렌더러, 1080 캡처 노드. PNG/ZIP 다운로드 유지.
2. **캔바식 편집 인터랙션**
   - 선택/드래그 이동/모서리 리사이즈/회전, 스냅·정렬 가이드, 다중선택(후순위), 요소별 속성 패널, 툴바(텍스트·도형·이미지·배경·레이어순서·복제·삭제·잠금).
3. **템플릿 저장/적용**
   - localStorage 저장, 템플릿 갤러리, 새 슬라이드에 적용, JSON 내보내기/불러오기(신규 포맷).
4. **뭉이 스타터 템플릿 + 폰트 + 에셋**
   - 분석 기반 템플릿(커버/다이어리 본문/프롬프트카드/CTA/엔딩 등) 제작.
   - 폰트: 헤비 한글(Pretendard Black/ExtraBold), 세리프 이탤릭(영문 강조), 모노스페이스(코드) — CDN.
   - 에셋: 뭉이 캐릭터 컷아웃(배경제거)·반짝이·말풍선 등 기본 제공.
5. **정리·문서·폴리시**
   - 기존 21템플릿/Render 전면 제거, `docs` 포맷 갱신(요소 JSON 정본), QA(`npm run build` 게이트).

---

## 5. 폰트 / 에셋 계획

- **폰트(픽커 제공)**: Pretendard(기본·헤비), 세리프 이탤릭 1종, 모노스페이스 1종. 전부 CDN(`app/layout.tsx`). 오프라인 배포 시 self-host 옵션.
- **에셋 번들**: 뭉이 캐릭터 포즈 컷아웃(여러 컷), ✦ 반짝이, 말풍선 SVG, 페이지인디케이터/푸터 프리셋. (드라이브 원본에서 추출, 라이선스는 사용자 본인 콘텐츠.)

---

## 6. 함정 / 주의 (작업 규칙)

- 응답·커밋·문서 **한글**.
- 좌표계 **1080×1350 고정**. 새 요소/템플릿도 이 좌표계.
- **SWC 빌드 함정**: 템플릿 리터럴 안 이스케이프 백틱 금지 → 일반 따옴표. 항상 `npm run build`로 게이트.
- 편집 핸들·점선은 미리보기 전용, **캡처본 제외** 분기 유지.
- 콘텐츠 독립: 본문에 특정 브랜드/URL 강제 삽입 금지(에셋·핸들은 사용자 입력).
- 작업 브랜치: `claude/sweet-fermat-w78pla` (푸시 시 Vercel 자동 재배포).
