# 인스타 캐러셀 메이커 (instaCmaker)

템플릿으로 한국형 인스타그램 캐러셀을 구성하고 **1080×1350 PNG / ZIP**으로 내보내는
**클라이언트 전용** 스튜디오. `eyeshare` 레포의 `/insta` 도구를 독립 실행형으로 분리한 것.

- **AI 아님 · 백엔드 없음 · 네트워크 전송 없음** — 입력값/이미지는 브라우저 밖으로 나가지 않습니다.
- 슬라이드 = 템플릿 인스턴스. 추가/삭제/순서이동/템플릿 교체/문구·이미지 편집/다운로드.
- 배경 사진(어둡게·흐리게) + 자유 배치 **삽입 이미지** + 자유 배치 **텍스트 박스**(이동·크기·삭제·복제).
- 캡처는 `html-to-image`로 각 슬라이드를 1080×1350로, 전체는 `jszip`으로 ZIP 묶음.
- 구성 **JSON 불러오기/내보내기** — 대화(ChatGPT/Claude)에서 받은 구성 코드를 붙여넣어 한 번에 세팅.

## 빠른 시작

```bash
npm install
npm run dev      # http://localhost:3040  (루트는 /insta 로 이동)
```

빌드/배포:

```bash
npm run build
npm run start
```

Vercel에 올리면 바로 동작합니다(서버리스 의존성 없음). 외부 공개를 막으려면
배포 단계에서 **Vercel 비밀번호 보호** 등으로 접근을 제한하세요(앱은 `noindex`).

## 구조

```
app/
  layout.tsx          # 루트 레이아웃 (Pretendard CDN, noindex)
  globals.css         # 최소 리셋 + 폰트
  page.tsx            # "/" → "/insta" 리다이렉트
  insta/
    page.tsx          # 스튜디오 마운트 (로그인 없음)
    InstaCarousel.tsx # 스튜디오 본체(템플릿/편집/캡처/JSON) — 정본
    insta.module.css  # 관리 크롬(다크) + 슬라이드 디자인 시스템 (토큰 자체 포함)
lib/
  image-compress.ts   # 업로드 이미지 클라이언트 압축(WebP)
docs/
  insta-generator/    # 구성 JSON을 만들어주는 "생성기 세션"용 가이드
```

## 구성 JSON 생성기(선택)

`docs/insta-generator/` 는 별도 대화 세션(Claude/ChatGPT 프로젝트)에 넣어
**주제 → 캐러셀 구성 JSON**을 뽑게 하는 가이드입니다.

- `SYSTEM_PROMPT.md` — 세션 역할/출력 계약(붙여넣을 시스템 프롬프트).
- `template-catalog.md` — 유효 템플릿 스키마(이 JSON 포맷의 정본).
- `copywriting-skill.md` — 카피 전략·톤·길이 가이드.
- `README.md` — 사용법.

생성된 JSON을 스튜디오의 **📥 구성 불러오기 / 내보내기**에 붙여넣으면 캐러셀이 한 번에 세팅됩니다.

## 메모

- 슬라이드 좌표계는 1080×1350 고정. 미리보기는 축소(`scaler`)해 보여줄 뿐, 캡처 대상은 원본 노드.
- 디자인 토큰(다크 테마)은 `insta.module.css` 안 `.page` 에 자체 정의되어 별도 전역 CSS가 필요 없습니다.
- 폰트는 Pretendard를 CDN으로 로드합니다(`app/layout.tsx`). 오프라인/사내망이면 폰트를 self-host 하세요.
