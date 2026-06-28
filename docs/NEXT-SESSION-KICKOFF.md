# 다음 세션 킥오프 — unclebstudio.com/instaCmaker 하위경로 배포 + Supabase 연결

> 새 Claude Code 세션의 **첫 메시지로 이 파일 내용을 붙여넣으세요.**
> 그 세션에 `uncleB-dev/instaCmaker` 레포(필요 시 `unclebstudio.com` 메인 레포도)를 연결하세요.
> **모든 응답·커밋·문서는 한글로.**

---

## 너의 역할 / 목표

너는 **instaCmaker**(엉클비 캐러셀 스튜디오)의 개발을 이어받는다. 지금까지 동작하는
**클라이언트 전용** 캔버스 에디터가 완성돼 있다(아래 "현재 상태"). 이번 세션의 목표는 **2가지**:

1. **`unclebstudio.com/instaCmaker` 하위경로로 서비스** (현재는 `insta-cmaker.vercel.app/insta`)
2. **Supabase DB 연결** — localStorage 대신(또는 병행) 클라우드에 프로젝트/템플릿 저장·불러오기

---

## 현재 상태 (이미 완료된 것)

- **레포**: `uncleB-dev/instaCmaker`. 운영 브랜치 `main`(= Vercel 프로젝트 `insta-cmaker`, 운영 도메인 `insta-cmaker.vercel.app`). 작업 브랜치 `claude/sweet-fermat-w78pla`.
- **스택**: Next.js 14 App Router, React 18, TypeScript. 의존성: `html-to-image`, `jszip`. 서버리스 의존성 없음.
- **아키텍처**: 요소(레이어) 기반. `Slide = 배경(색/이미지) + elements[](text/image/shape)`, 좌표계 1080×1350, 배열 순서 = z-order.
- **편집**: 드래그/8방향 리사이즈/회전/더블클릭 텍스트 편집/스냅 가이드/레이어 순서/잠금/복제.
- **기본 템플릿 6종**(커버/본문+캐릭터/프롬프트/비교/리스트/CTA) + **엉클비 캐릭터 20종**(`public/assets/characters/uncleb-*.png`).
- **저장(현재)**: 브라우저 **localStorage**(`instacmaker:project:v2`, `instacmaker:templates:v2`) + **JSON 내보내기/불러오기**. **DB 없음.**
- **캡처**: 화면 밖 1080×1350 노드 → `html-to-image`(toBlob) → PNG, 전체 ZIP. 폰트는 `getFontEmbedCSS`로 1회 임베드 후 재사용. 폰트 `<link>`는 `crossOrigin="anonymous"`(CORS 임베드용).
- **브랜드**: 엉클비, `@uncleb_studio`, `unclebstudio.com`, 파랑 팔레트(paper `#EEF3FC`, ink `#17233E`, brand `#2F6BFF`, dark `#0F1F3D`, muted `#7686A6`, card `#DCE7FB`, highlight `#BBD5FF`). `noindex`.
- **생성기 지침**: `docs/insta-generator/`(SYSTEM_PROMPT·element-schema·copywriting·README) — 주제→요소 JSON. 포맷 정본 = `element-schema.md`.

### 파일 지도
```
app/layout.tsx                 # 폰트 CDN(crossOrigin)·noindex
app/page.tsx                   # "/" → "/insta" 리다이렉트
app/insta/page.tsx             # 스튜디오 마운트
app/insta/InstaCarousel.tsx    # 본체(~1850줄): 타입/상태/기본템플릿/편집/캡처/JSON/인스펙터 — 정본
app/insta/insta.module.css     # 다크 크롬 + 캔버스/요소 스타일
lib/image-compress.ts          # 업로드 WebP 압축
public/assets/characters/      # uncleb-*.png 20종
docs/insta-generator/          # 생성기 지침 4종
next.config.mjs                # 현재 비어 있음({}) — basePath 추가 지점
```

---

## 작업 1 — 하위경로 `unclebstudio.com/instaCmaker`

**먼저 호스팅 토폴로지를 사용자와 확정**할 것(아래 A/B). `unclebstudio.com`이 어떤 프로젝트/레포로 배포 중인지(Vercel 프로젝트명, 레포) 확인이 선행.

- **A안 (권장: 레포 분리 유지 + 리라이트)**
  - instaCmaker는 지금처럼 독립 Vercel 프로젝트로 두고, **메인(unclebstudio.com) 프로젝트에 rewrite** 추가:
    `/instaCmaker/:path*` → instaCmaker 배포로 프록시.
  - instaCmaker `next.config.mjs`에 **`basePath: '/instaCmaker'`**(+ 필요 시 `assetPrefix`) 설정.
  - ⚠️ **함정**: 코드의 절대경로 `/assets/characters/...`(캐릭터 url)와 그 외 `/`로 시작하는 정적 경로는 **basePath가 자동 적용되지 않는다.** `basePath`를 런타임에서 읽어 prefix 하거나, `next/image`/`process.env.NEXT_PUBLIC_BASE_PATH`로 처리해야 함. (캐릭터 이미지·생성기 JSON의 캐릭터 url 둘 다 영향)
  - 루트 `/` → `/insta` 리다이렉트, 진입 라우트 정리(basePath 하에서 진입점 결정).
- **B안 (모노레포 통합)**
  - instaCmaker를 unclebstudio 레포에 **`app/instaCmaker` 라우트로 이식**(app/insta → app/instaCmaker, lib, public/assets, deps 병합). 단일 배포·가장 깔끔한 URL, 통합 작업량↑.

**산출물**: 선택한 방식으로 `unclebstudio.com/instaCmaker` 접속 시 스튜디오가 뜨고, 캐릭터/폰트/다운로드가 정상.

---

## 작업 2 — Supabase DB 연결

**먼저 사용자와 결정**할 것:
- **인증 모델**: (a) Supabase Auth(매직링크/구글) + RLS로 소유자별 — 권장, (b) 단일 워크스페이스 + 패스프레이즈, (c) 익명 + 디바이스 키.
- **이미지 처리**: 현재 업로드 이미지는 base64 data URL로 프로젝트 JSON 안에 들어감 → DB 행이 비대해짐.
  → **Supabase Storage로 이미지 분리(권장)**하고 url만 저장. (단, 캡처 시 교차출처 이미지 CORS 필요 — Storage 버킷 CORS/공개 설정 점검. 또는 캡처 단순화를 위해 data URL 유지하되 용량 주의.)

**스키마(예시)**
```sql
-- projects: 요소 JSON(Project)을 jsonb 로
create table projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users,        -- 인증 모델에 맞게
  name text not null,
  data jsonb not null,                     -- { name, slides:[...] } (element-schema 정본)
  updated_at timestamptz default now()
);
create table templates (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users,
  name text not null,
  slide jsonb not null
);
-- RLS: owner = auth.uid() 만 read/write
```

**구현 포인트**
- 클라이언트 SDK `@supabase/supabase-js`. env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`(Vercel 환경변수에 추가).
- **요소 JSON 모델을 그대로 유지**(`element-schema.md`) → 생성기 출력·localStorage·DB가 동일 포맷이라 상호호환.
- UI: 좌측/상단에 "내 프로젝트(클라우드)" 목록 — 저장/불러오기/이름변경/삭제. 기존 localStorage는 오프라인 캐시 또는 게스트용으로 유지 가능.
- 마이그레이션: 현재 localStorage 프로젝트를 "클라우드로 올리기" 1회 버튼 제공하면 친절.
- 이 세션에 **Supabase MCP**가 붙어 있으면 프로젝트 생성·마이그레이션·타입 생성에 활용 가능.

---

## 작업 규칙 · 함정 (반드시 보존)

- **응답·커밋·문서 한글.**
- 좌표계 **1080×1350 고정**. 편집 핸들/점선/스냅선은 미리보기에서만, **캡처본(`editable=false`)엔 미포함** — 이 분기 깨지 말 것.
- **SWC 빌드 함정**: 템플릿 리터럴 안 이스케이프 백틱 금지. **항상 `npm run build`로 게이트**(tsc만 믿지 말 것).
- 폰트는 CDN + `crossOrigin`. 하위경로/오프라인 이전 시 self-host 검토(특히 한글 세리프 용량).
- 데이터 모델/JSON 포맷은 `element-schema.md`와 100% 일치 유지(생성기 호환).
- 작업 브랜치에서 개발 → `main` 머지 시 운영 배포(현 구조). 새 호스팅 토폴로지 정하면 그에 맞게.

## 검증
```bash
npm install
npm run build   # "✓ Compiled successfully"
npm run dev     # http://localhost:3040
```

---

## 이번 세션에서 먼저 할 일(순서 제안)
1. `unclebstudio.com` 호스팅/레포 현황 파악 → **A/B안 + 인증 모델 + 이미지 저장 방식**을 사용자와 확정.
2. 하위경로(basePath/rewrite 또는 모노레포 이식) 적용 → 빌드·배포 검증.
3. Supabase 스키마·RLS·SDK 연동 → "내 프로젝트" 클라우드 저장/불러오기 → localStorage 마이그레이션.
4. 캡처(폰트·이미지 CORS) 회귀 점검 → PNG/ZIP 정상 확인.
