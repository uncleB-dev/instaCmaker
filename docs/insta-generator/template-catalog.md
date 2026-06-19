# template-catalog.md — `/insta` 캐러셀 JSON 스키마 (정본)

> 이 문서는 `app/insta/InstaCarousel.tsx`의 `TEMPLATE_LIST`(21종 `TemplateDef`)에서 **그대로 추출한** 스키마입니다.
> 생성하는 JSON은 이 카탈로그와 **100% 일치**해야 합니다. 추측 금지. 여기 없는 키/템플릿은 쓰지 마세요.

---

## 1. JSON 구성 포맷

`/insta` 스튜디오의 **📥 구성 불러오기** 입력에 붙여넣는 JSON은 다음 형태입니다.

```jsonc
{
  "handle": "@핸들",          // (선택) 모든 슬라이드 푸터에 표시. 생략 시 @unclebstudio
  "slides": [                 // (필수) 1장 이상. 위→아래 = 캐러셀 1장→마지막장 순서
    {
      "template": "<id>",     // (필수) 아래 21종 id 중 하나
      "fields": {             // (선택) 그 템플릿의 스칼라 필드. key:value(문자열)
        "키": "값"
      },
      "arrays": {             // (선택) 그 템플릿의 배열 필드
        "배열키": [
          { "항목키": "값" }  // 항목 개수는 [min, max] 이내
        ]
      }
    }
  ]
}
```

- `fields`/`arrays`는 **둘 다 선택**입니다. 생략하면 해당 템플릿의 **기본 문구(defaults)** 가 그대로 쓰입니다. 채우면 그 키만 덮어쓰고, 안 채운 키는 기본값 유지.
- 즉 `{"template":"mockup"}` 처럼 `fields` 없이도 유효합니다(기본 문구 사용).

---

## 2. 검증 규칙 (import 동작과 동일)

스튜디오의 불러오기 로직은 다음과 같이 동작합니다. 어기면 깨지거나 무시됩니다.

1. **JSON.parse 가능해야 함.** 따옴표/콤마/괄호가 올바른 유효 JSON일 것.
2. **`slides`는 비어있지 않은 배열**이어야 함. 없거나 비면 "slides 배열이 필요해요" 에러.
3. **`template`은 반드시 아래 21종 id 중 하나.** 하나라도 모르는 id가 있으면 **전체 불러오기 중단**("알 수 없는 템플릿: …"). → id 철자 정확히.
4. **알 수 없는 키는 조용히 무시됩니다.** 그 템플릿에 정의된 `fields` 키·`arrays` 키·항목 필드 키만 반영됩니다. → 없는 키에 의미를 담지 말 것(반영 안 됨).
5. **배열 길이는 자동으로 `[min, max]`로 클램프**됩니다. `max` 초과분은 잘리고, `min` 미만이면 빈 항목으로 채워집니다(빈 칸이 그려짐). → **개수는 직접 min~max 안으로 맞출 것.**
6. **모든 값은 문자열로 강제**됩니다. 숫자도 `"5분"`, `"0원"`, `"01"`처럼 문자열로 적으세요.
7. **줄바꿈은 `\n`** (multiline 필드). JSON 문자열 안의 `\n`이 실제 줄바꿈으로 렌더됩니다.
8. **문자열 안의 따옴표는 `\"`로 이스케이프**해야 유효 JSON입니다. (예: `"\"말로만\" 설명"`)
9. **이미지는 JSON에 넣지 않습니다.** 배경 사진·삽입 이미지는 불러온 뒤 스튜디오에서 직접 업로드합니다. (`showcase`/`mockup`은 이미지로 채우는 자리)
10. `handle`이 문자열이고 비어있지 않으면 핸들도 교체됩니다. 보통 `@unclebstudio`.

### 필드 종류(kind)
- `line` — 한 줄 텍스트(줄바꿈 비권장).
- `multiline` — 여러 줄. `\n`으로 줄을 나눔.
- `emoji` — 이모지 한 개(예: `"📱"`). 비워도 됨.

---

## 3. 21개 템플릿 전체 스키마 표

> 표기: **scalar 필드** = `key`(kind) / **array** = `배열키`(min–max: 항목필드 `key`(kind) …)
> category: `cover`(커버) · `body`(본문) · `cta`(마무리). `dark`=다크 배경.

| id | 한글명 | cat | dark | scalar fields (key:kind) | arrays (key, min–max: item fields) |
|----|--------|-----|------|--------------------------|-------------------------------------|
| `cover` | 다크 훅 커버 | cover | ● | `chip`:line, `headline`:multiline, `sub`:multiline, `label1`:line, `label2`:line | — |
| `card3` | 카드 3종 | body | | `chip`:line, `heading`:multiline | `cards` (1–3: `emoji`:emoji, `title`:line, `desc`:line) |
| `features` | 기능·특징 4행 | body | | `chip`:line, `heading`:multiline | `rows` (1–4: `emoji`:emoji, `title`:line, `desc`:line) |
| `steps` | 단계 스텝 | body | | `chip`:line, `heading`:line, `note`:line | `steps` (3–5: `text`:line) |
| `mockup` | 결과 목업 | body | | `chip`:line, `heading`:multiline | — |
| `cta` | CTA 요약 | cta | ● | `eyebrow`:line, `headline`:multiline, `sub`:multiline, `button`:line | — |
| `checklist` | 체크리스트 | body | | `chip`:line, `heading`:multiline | `items` (3–6: `text`:line) |
| `qna` | Q&A | body | | `chip`:line, `heading`:multiline | `qa` (1–3: `q`:line, `a`:multiline) |
| `impact` | 한 줄 임팩트 | body | ● | `chip`:line(선택), `headline`:multiline, `sub`:line(선택) | — |
| `stats` | 숫자·통계 | body | | `chip`:line, `heading`:multiline | `stats` (1–3: `number`:line, `label`:line) |
| `showcase` | 결과물 쇼케이스 | body | | `chip`:line, `heading`:multiline, `caption`:line | — |
| `promptcard` | 프롬프트 복붙 카드 | body | | `badge`:line, `title`:line, `why`:multiline, `prompt`:multiline | — |
| `compare` | 비교(전·후 / A vs B) | body | | `chip`:line, `heading`:multiline, `leftTitle`:line, `leftBody`:multiline, `rightTitle`:line, `rightBody`:multiline | — |
| `define` | 개념 정의 | body | | `chip`:line, `term`:line, `definition`:multiline | `points` (0–4: `label`:line, `desc`:line) |
| `notice` | 안내·유의(밀집 불릿) | body | | `chip`:line, `heading`:multiline | `bullets` (3–8: `text`:line) |
| `toc` | 목차/커리큘럼 | body | | `chip`:line, `heading`:multiline(선택) | `chapters` (3–8: `no`:line, `title`:line, `page`:line) |
| `pkg` | 제공 구성/패키지 | body | | `chip`:line, `heading`:multiline | `items` (2–6: `name`:line, `qty`:line, `desc`:line) |
| `problem` | 핵심 문제·페인 후킹 | body | | `chip`:line(선택), `question`:multiline, `desc`:multiline, `twist`:line | — |
| `roletable` | 역할 분담 표 | body | | `chip`:line, `heading`:multiline | `roles` (2–5: `role`:line, `desc`:line) |
| `statcover` | 숫자·권위 훅 커버 | cover | ● | `stat`:line, `authority`:line, `title`:multiline | — |
| `howto` | 사용법·준비물 | body | | `prepTitle`:line, `stepsTitle`:line | `prep` (1–5: `text`:line), `steps` (2–6: `text`:line) |

> 주의 포인트:
> - `steps` 템플릿의 `heading`은 **line**(다른 본문은 대개 multiline). `note`로 하단 안내 한 줄.
> - `define`의 `points`는 **min 0** — 배열을 아예 안 넣어도 됨.
> - `toc`의 `heading`은 선택. `chapters`는 `no/title/page` 3필드.
> - `howto`만 배열이 **2개**(`prep` + `steps`). 각각 항목 필드는 `text` 하나.
> - 커버 계열 3종: `cover`(칩+헤드라인+서브+라벨2), `statcover`(숫자+권위+제목), 그리고 다크 본문 `impact`(한 줄 임팩트). 표지로 임팩트 줄 때 활용.

### 한국어 의도(기본 문구 1줄 요약)
- `cover`: 다크 배경 훅 커버 — 칩 + 굵은 헤드라인 + 서브 + 하단 라벨 2개.
- `card3`: 추천 대상/이유를 카드 3장으로 ("이런 분들께").
- `features`: 핵심 기능·특징을 이모지 행 4개로.
- `steps`: 사용 흐름을 번호 스텝 3~5개 + 안내 한 줄.
- `mockup`: 결과 화면을 CSS 폰 목업으로 보여주는 장(문구 최소).
- `cta`: 마무리 — "팔로우+댓글 → DM" + Save/Share. 화살표 없음.
- `checklist`: "이런 게 다 들어 있어요" 체크 항목 3~6.
- `qna`: 자주 묻는 질문 Q&A 1~3.
- `impact`: 한 줄 임팩트(다크). 한 문장으로 강하게.
- `stats`: 숫자 블록 1~3 ("5분 / 0원 / 13종").
- `showcase`: 실제 결과물 자리 — 이미지 삽입으로 채움.
- `promptcard`: monospace 코드 블록에 복붙용 프롬프트([변수] 포함).
- `compare`: Before vs After / A vs B 2열 대비.
- `define`: 용어 한 줄 정의 + 포인트(선택).
- `notice`: 유의사항 밀집 불릿 3~8.
- `toc`: 목차/커리큘럼(번호·제목·페이지).
- `pkg`: 제공 구성/패키지 목록(이름·수량·설명).
- `problem`: 페인 후킹 — 굵은 질문 + 설명 + 강조 한 줄("진짜 문제는…").
- `roletable`: 역할 분담 2열 표(역할/설명).
- `statcover`: 숫자·권위 훅 커버(다크) — 큰 숫자 + 권위 한 줄 + 제목.
- `howto`: 준비물 리스트 + 사용법 스텝.

---

## 4. 대표 템플릿 슬라이드 스니펫

### cover (다크 훅 커버)
```json
{
  "template": "cover",
  "fields": {
    "chip": "전화 상담하는 분 필독",
    "headline": "\"말로만\" 설명하는\n상담은\n이제 그만",
    "sub": "통화하면서 같은 화면을 함께 — EYEshare",
    "label1": "앱 설치 0",
    "label2": "링크 한 번이면 끝"
  }
}
```

### features (기능·특징 4행, rows 1–4)
```json
{
  "template": "features",
  "fields": {
    "chip": "EYEshare가 하는 일",
    "heading": "전화하면서,\n같은 화면을 실시간으로"
  },
  "arrays": {
    "rows": [
      { "emoji": "📱", "title": "앱 설치 없이 입장", "desc": "링크·QR·6자리 코드만" },
      { "emoji": "👆", "title": "짚어가며 설명", "desc": "펜·형광펜·포인터로 함께 표시" }
    ]
  }
}
```

### qna (Q&A, qa 1–3; 답변은 multiline)
```json
{
  "template": "qna",
  "fields": {
    "chip": "자주 묻는 질문",
    "heading": "이런 게\n궁금하시죠?"
  },
  "arrays": {
    "qa": [
      { "q": "고객도 앱을 깔아야 하나요?", "a": "아니요. 링크·QR·6자리 코드로\n바로 입장합니다." },
      { "q": "카메라가 켜지나요?", "a": "아니요. 화면만 공유하고\n카메라·마이크는 쓰지 않아요." }
    ]
  }
}
```

### promptcard (프롬프트 복붙 카드, monospace + [변수])
```json
{
  "template": "promptcard",
  "fields": {
    "badge": "SCRIPT 01",
    "title": "상담 오프닝 멘트",
    "why": "통화 시작에 바로 쓰는 안내 멘트",
    "prompt": "지금 제가 보내드린 [링크]를 눌러주세요.\n앱 설치 없이 바로 같은 화면이 열려요.\n제가 [자료] 보면서 짚어드릴게요."
  }
}
```

---

## 5. 골드 스탠더드 예시 — 브랜드 연결형(EYEshare) 6장 캐러셀

> ⚠️ 이건 스키마가 어떻게 채워지는지 보여주는 **예시**(브랜드 연결형)입니다.
> **기본 콘텐츠는 브랜드 연결 없이** 만드세요 — 연결은 "연결: ○○○" 요청이 있을 때만 (SYSTEM_PROMPT·copywriting-skill 참고).
> 아래 JSON은 그대로 `/insta`에 붙여넣어 동작하는 **검증된 완성본**입니다.
> 흐름: `cover`(훅) → `problem`(페인) → `features`(기능) → `card3`(이유) → `howto`(사용법) → `cta`(마무리).
> 모든 `template`·필드·배열 키는 위 스키마와 일치하고, 배열 개수도 범위 내(features rows=4 ≤ 4, card3 cards=3 ≤ 3, howto prep=2 / steps=3)입니다.

```json
{
  "handle": "@unclebstudio",
  "slides": [
    {
      "template": "cover",
      "fields": {
        "chip": "전화 상담하는 분 필독",
        "headline": "\"말로만\" 설명하는\n상담은\n이제 그만",
        "sub": "통화하면서 같은 화면을 함께 — EYEshare",
        "label1": "앱 설치 0",
        "label2": "링크 한 번이면 끝"
      }
    },
    {
      "template": "problem",
      "fields": {
        "chip": "이런 적, 없으세요?",
        "question": "\"그 표, 지금 보고 계세요?\"\n전화로는 이 말만 반복…",
        "desc": "설계안·비교표를 말로만 설명하니 고객은 절반도 이해 못 하고, \"생각해볼게요\"로 끝나기 일쑤. 화면을 같이 못 보는 게 진짜 문제예요.",
        "twist": "잘 파는 분들은 '같이 보면서' 설명합니다."
      }
    },
    {
      "template": "features",
      "fields": {
        "chip": "EYEshare가 하는 일",
        "heading": "전화하면서,\n같은 화면을 실시간으로"
      },
      "arrays": {
        "rows": [
          { "emoji": "📱", "title": "앱 설치 없이 입장", "desc": "링크·QR·6자리 코드만. 고령 고객도 한 번에" },
          { "emoji": "👆", "title": "짚어가며 설명", "desc": "펜·형광펜·포인터로 중요한 곳을 같이 표시" },
          { "emoji": "🎙️", "title": "상담 녹음", "desc": "불완전판매 예방·설명의무 증빙 (기기에만 저장)" },
          { "emoji": "📎", "title": "끝나면 자료 전달", "desc": "표시한 그대로 합쳐서 다운로드해 전달" }
        ]
      }
    },
    {
      "template": "card3",
      "fields": {
        "chip": "왜 설계사들이 쓸까",
        "heading": "'설명'이 아니라\n'함께 보기'"
      },
      "arrays": {
        "cards": [
          { "emoji": "🤝", "title": "이해도가 올라요", "desc": "같은 화면을 보며 짚으니 고객이 바로 이해" },
          { "emoji": "🛡️", "title": "분쟁을 줄여요", "desc": "녹음·표시 자료로 설명의무 증빙 확보" },
          { "emoji": "📈", "title": "상담이 매끄러워요", "desc": "자료를 넘기며 흐름 끊김 없이 진행" }
        ]
      }
    },
    {
      "template": "howto",
      "fields": {
        "prepTitle": "준비물",
        "stepsTitle": "이렇게 씁니다"
      },
      "arrays": {
        "prep": [
          { "text": "설계사: 노트북·PC" },
          { "text": "고객: 스마트폰 (앱 설치 X)" }
        ],
        "steps": [
          { "text": "상담 중 링크(QR·코드)를 고객에게 전송" },
          { "text": "고객이 클릭 → 1초 만에 같은 화면 입장" },
          { "text": "자료 넘기고 짚으며 설명 → 끝나면 자료 전달" }
        ]
      }
    },
    {
      "template": "cta",
      "fields": {
        "eyebrow": "Summary",
        "headline": "지금 무료로\n써보세요",
        "sub": "팔로우 + 댓글에 '화면' 남겨주시면\n무료 체험 링크를 DM으로 보내드려요",
        "button": "팔로우 + 댓글 '화면' → DM"
      }
    }
  ]
}
```
