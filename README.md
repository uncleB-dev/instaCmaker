# instaCmaker — 엉클비 캐러셀 스튜디오

캔바/미리캔버스식 **요소(레이어) 기반** 인스타그램 캐러셀 편집기.
주제 → (생성기로) 요소 JSON → 스튜디오에서 자유 편집 → **1080×1350 PNG / ZIP** 내보내기.

- **클라이언트 전용 · 백엔드/DB 없음 · 로그인 없음** — 입력·이미지는 브라우저 밖으로 나가지 않음.
- 슬라이드 = `배경(색/이미지) + elements[]`(텍스트·이미지·도형), 배열 순서 = z-order.
- 모든 요소: 드래그 이동 / 8방향 리사이즈 / 회전 / 더블클릭 텍스트 편집 / 삭제·복제·잠금 / 레이어 순서 / 스냅 가이드.
- **저장**: 브라우저 localStorage 자동 저장 + JSON 내보내기/불러오기(백업·이동). *(DB 아님)*
- **캡처**: 화면 밖 1080×1350 노드를 `html-to-image`로, 전체는 `jszip`으로 ZIP. 폰트는 `getFontEmbedCSS`로 임베드.
- **브랜드**: 엉클비 · 핸들 `@uncleb_studio` · 사이트 `unclebstudio.com` · 파랑 팔레트.

## 빠른 시작

```bash
npm install
npm run dev      # http://localhost:3040  (루트 / → /insta)
npm run build    # 배포 전 게이트: "✓ Compiled successfully" 확인
```

## 배포(현재)

- Vercel 프로젝트 `insta-cmaker`, 운영 브랜치 `main` → **insta-cmaker.vercel.app/insta**
- 앱은 `noindex`. 외부 비공개가 필요하면 Vercel Deployment Protection.
- *다음 단계 계획(하위도메인 + Supabase)은 `docs/NEXT-SESSION-KICKOFF.md` 참고.*

## 구조

```
app/
  layout.tsx              # 루트 레이아웃 (폰트 CDN+crossOrigin, noindex)
  page.tsx                # "/" → "/insta" 리다이렉트
  insta/
    page.tsx              # 스튜디오 마운트
    InstaCarousel.tsx     # 본체(~1850줄): 타입·상태·기본템플릿·편집·캡처·JSON·인스펙터 — 정본
    insta.module.css      # 다크 관리 크롬 + 캔버스/요소 스타일
lib/image-compress.ts     # 업로드 이미지 WebP 압축
public/assets/characters/  # 엉클비 캐릭터 컷아웃 20종(uncleb-*.png)
docs/insta-generator/      # 구성 JSON 생성기(Claude/ChatGPT 프로젝트)용 가이드 4종
docs/NEXT-SESSION-KICKOFF.md  # 다음 작업(하위도메인 배포 + Supabase) 인수인계
```

## 데이터 모델 (요소 JSON)

```ts
Project = { name, slides: Slide[] }
Slide   = { background:{color?|image?}, elements: Element[] }   // 순서 = z-order
Element = Text | Image | Shape   // 공통 x,y,w,h,rotation?,locked? (1080×1350 좌표계)
```
포맷 정본·프리셋·폰트·팔레트·캐릭터 url = **`docs/insta-generator/element-schema.md`**.

## 구성 JSON 생성기 (별도 대화 프로젝트)

`docs/insta-generator/` 를 Claude/ChatGPT 프로젝트에 넣어 **주제 → 요소 JSON**을 뽑습니다.
- `SYSTEM_PROMPT.md`(커스텀 인스트럭션) · `element-schema.md`(스키마 정본) · `copywriting-skill.md`(전략·톤) · `README.md`(사용법).
- 출력 JSON을 스튜디오 상단 **JSON 불러오기**에 붙여넣으면 캐러셀이 한 번에 세팅.

## 메모 / 함정

- 좌표계 **1080×1350 고정**. 미리보기는 `scaler`로 축소만, 캡처 대상은 원본 노드.
- 편집 핸들·점선·스냅선은 미리보기(`editable=true`)에서만, **캡처본엔 미포함** — 이 분기 보존.
- **SWC 빌드 함정**: 템플릿 리터럴 안 이스케이프 백틱 금지. 항상 `npm run build`로 게이트.
- 폰트는 CDN + `crossOrigin`(html-to-image 임베드용). 오프라인/하위도메인 이전 시 self-host 검토.
- 작업 브랜치 `claude/sweet-fermat-w78pla`, 운영 = `main`(머지 시 배포).
