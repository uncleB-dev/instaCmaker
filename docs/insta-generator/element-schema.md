# element-schema.md — instaCmaker 요소(레이어) JSON 스키마 (정본)

> instaCmaker 스튜디오의 **JSON 불러오기**에 붙여넣는 JSON 포맷 정본입니다.
> (구버전 `template-catalog.md`의 21종 template id 포맷은 **폐기**되었습니다. 더 이상 `template`/`fields`/`arrays`를 쓰지 않습니다.)
> 생성하는 JSON은 이 문서와 **100% 일치**해야 합니다. 추측 금지.

---

## 1. 최상위 포맷

```jsonc
{
  "name": "프로젝트명",        // (선택) 생략 가능
  "slides": [                  // (필수) 1장 이상. 배열 순서 = 캐러셀 1장 → 마지막장
    {
      "background": { "color": "#EDE6D4" },   // 슬라이드 배경(아래 §4)
      "elements": [ /* 요소 배열, §3 */ ]      // 배열 순서 = z-order(앞일수록 위)
    }
  ]
}
```

- `id`, `version`은 **넣지 않아도 됩니다**(불러올 때 자동 처리).
- `background` 생략 시 크림(`#EDE6D4`) 기본. `elements` 생략 시 빈 슬라이드.

---

## 2. 좌표계 (가장 중요)

- 모든 좌표·크기는 **1080 × 1350 px 고정 캔버스** 기준의 **숫자**입니다. (인스타 4:5)
- 요소는 `x`(좌), `y`(상), `w`(폭), `h`(높이)로 절대 배치. **0 ≤ x ≤ 1080, 0 ≤ y ≤ 1350** 안에 들어오게.
- **텍스트는 `h`를 무시**(높이 자동). 폭 `w` 안에서 자동 줄바꿈됩니다. 도형·이미지는 `w`·`h` 모두 사용.
- `elements` **배열 순서가 z-order**: 뒤쪽(인덱스 큰) 요소가 위에 그려집니다. (배경 워터마크 숫자는 맨 앞에, 카드 위 글자는 카드 뒤에 두기)
- 안전 여백: 콘텐츠는 보통 좌우 **96px** 안쪽, 푸터는 `y≈1262`.

> ⚠️ **값 타입**: `x,y,w,h,size,weight,lineHeight,letterSpacing,radius,strokeWidth,dim,blur,rotation` 는 **숫자**(따옴표 없이). `text,color,fontFamily,align,shape,fit,url` 는 **문자열**. (구버전의 "모든 값 문자열" 규칙은 폐기)

---

## 3. 요소(element) 종류 — 3가지

각 요소는 공통으로 `kind`, `x`, `y`, `w`, `h` 를 가집니다. (`rotation`·`locked`는 선택)

### 3-1. `text` — 텍스트
| 키 | 타입 | 설명 |
|----|------|------|
| `kind` | `"text"` | 필수 |
| `text` | string | 내용. 줄바꿈은 `\n` |
| `size` | number | 폰트 크기(px, 1080 기준). 헤드라인 90~140, 본문 32~40, 키커 26~30 |
| `weight` | number | 100~900 (헤비 헤드라인 900, 본문 500) |
| `color` | string | `#RRGGBB` |
| `align` | `"left"`/`"center"`/`"right"` | (선택, 기본 left) |
| `fontFamily` | string | (선택) 폰트 **id** — §5. 생략 시 산세리프(Pretendard) |
| `lineHeight` | number | (선택) 기본 1.18. 헤드라인 1.05~1.1 |
| `letterSpacing` | number | (선택) 키커는 2~4 권장 |
| `italic` | bool | (선택) |
| `underline` | bool | (선택) |
| `highlight` | string | (선택) 형광펜 배경 `#RRGGBB`(예 `#F4C84A`) |
| `shadow` | bool | (선택) 사진 위 가독성용 |

### 3-2. `shape` — 도형
| 키 | 타입 | 설명 |
|----|------|------|
| `kind` | `"shape"` | 필수 |
| `shape` | `"rect"`/`"roundRect"`/`"ellipse"`/`"line"` | 모양 |
| `fill` | string | (선택) 채움색 `#RRGGBB` |
| `radius` | number | (선택) `roundRect` 모서리 반경 |
| `strokeColor` | string | (선택) 테두리색 |
| `strokeWidth` | number | (선택) 테두리 두께 |

### 3-3. `image` — 이미지
| 키 | 타입 | 설명 |
|----|------|------|
| `kind` | `"image"` | 필수 |
| `url` | string | 이미지 주소. **번들 캐릭터(§6)만 생성 JSON에 사용**(임의 URL은 빈 칸이 됨) |
| `fit` | `"cover"`/`"contain"` | 채움 방식 |
| `radius` | number | (선택) 모서리 둥글기 |

> 사진·스크린샷은 생성 JSON에 넣을 수 없습니다(데이터가 없으므로). → 에디터에서 직접 업로드하거나 배경 이미지로. 캐릭터는 번들 에셋(§6) URL을 쓰면 그대로 렌더됩니다.

---

## 4. 배경(background)

```jsonc
"background": { "color": "#EDE6D4" }                 // 단색 (뭉이 기본)
"background": { "color": "#15151A" }                 // 다크 슬라이드
"background": { "image": { "url": "...", "fit": "cover", "dim": 0.3, "blur": 0 } }  // 이미지(보조)
```
- 뭉이 톤은 **단색 크림이 기본**. 다크 슬라이드는 `#15151A`/`#1B1B22`.
- 명암: 라이트 배경엔 진한 글자(`#1B1B22`), 다크 배경엔 밝은 글자(`#FFFFFF`/`#F1ECDF`).

---

## 5. 폰트 id (fontFamily 값)

생략하면 기본 산세리프. 특별한 폰트가 필요할 때만 아래 **id** 문자열을 넣습니다.

| id | 용도 |
|----|------|
| `sans` | 기본 산세리프(Pretendard) — 거의 모든 텍스트 |
| `serif` | 세리프(Noto Serif KR) |
| `display` | 이탤릭 세리프(Playfair) — 영문 강조 라벨("Once upon a time —") |
| `mono` | 모노스페이스(JetBrains Mono) — 프롬프트/코드 박스 |
| `hand` | 손글씨(Gaegu) |

---

## 6. 뭉이 색 팔레트 · 번들 캐릭터

**팔레트**
| 이름 | 값 | 쓰임 |
|------|----|------|
| cream | `#EDE6D4` | 기본 배경 |
| paper | `#F5F1E6` | 밝은 배경 변형 |
| navy/ink | `#1B1B22` | 헤드라인·본문 |
| coral | `#E8553A` | 강조어·키커·포인트 |
| yellow | `#F4C84A` | 형광펜 |
| dark | `#15151A` | 다크 박스/배경 |
| mud | `#8A8577` | 푸터·서브 |
| card-gray | `#E3DBC8` | 라이트 카드 |
| watermark | `#E4DCC9` | 배경 거대 숫자 |

**번들 캐릭터(이미지 url 그대로 사용 가능)** — fit는 `contain`
| url | 무드 | 권장 w×h |
|-----|------|----------|
| `/assets/characters/moongi-think.png` | 생각/고민 | 320×546 |
| `/assets/characters/moongi-work.png` | 작업/노트북 | 360×556 |
| `/assets/characters/moongi-confident.png` | 자신감 | 330×553 |
| `/assets/characters/moongi-down.png` | 풀죽음 | 340×497 |
| `/assets/characters/moongi-present.png` | 소개/제시 | 350×568 |

빠른 장식: 텍스트 요소로 `✦`(반짝이, coral) / `→`(화살표)를 넣으면 됩니다.

---

## 7. 불러오기 검증 규칙 (어기면 깨지거나 무시됨)

1. **`JSON.parse` 가능해야 함** — 따옴표·콤마·괄호 유효. 끝 콤마 금지.
2. **`slides`는 비어있지 않은 배열**.
3. 숫자 자리(좌표·크기 등)는 **숫자**로(문자열 `"96"` 금지 → `96`).
4. `kind`는 `text`/`image`/`shape` 중 하나. 모르는 키는 조용히 무시됨.
5. 색은 `#RRGGBB`. `align`은 left/center/right. `shape`는 rect/roundRect/ellipse/line.
6. 줄바꿈은 문자열 안 `\n`. 문자열 안 따옴표는 `\"`.
7. 이미지 `url`은 번들 캐릭터(§6)만 실제로 보입니다.

---

## 8. 레이아웃 프리셋 6종 (이 뼈대를 복사해 문구·색만 교체)

> ⭐ **권장 작업법**: 빈 좌표에서 새로 짜지 말고, 아래 프리셋 슬라이드를 골라 **`text`만 교체**(필요 시 색·강조만 조정)하세요. 좌표/크기는 검증된 값이라 그대로 두면 안정적입니다. 페이지 인디케이터(`01 — 06`)와 에피소드 번호만 장수에 맞게 바꾸면 됩니다.

### (A) 커버
```json
{
  "background": { "color": "#EDE6D4" },
  "elements": [
    { "kind": "text", "x": 540, "y": 280, "w": 520, "text": "01", "size": 420, "weight": 900, "color": "#E4DCC9" },
    { "kind": "text", "x": 96, "y": 110, "w": 600, "text": "A DIARY · EP.01", "size": 28, "weight": 800, "color": "#E8553A", "letterSpacing": 4 },
    { "kind": "text", "x": 480, "y": 110, "w": 504, "text": "01 — 06", "size": 28, "weight": 600, "color": "#8A8577", "align": "right", "letterSpacing": 2 },
    { "kind": "text", "x": 96, "y": 430, "w": 920, "text": "오늘부터,", "size": 130, "weight": 900, "color": "#1B1B22", "lineHeight": 1.05 },
    { "kind": "text", "x": 96, "y": 580, "w": 920, "text": "진짜 시작.", "size": 130, "weight": 900, "color": "#E8553A", "lineHeight": 1.05 },
    { "kind": "text", "x": 96, "y": 820, "w": 880, "text": "한 문장 서브카피를 여기에.", "size": 38, "weight": 500, "color": "#5A554A" },
    { "kind": "text", "x": 96, "y": 1262, "w": 520, "text": "@moongi_adventures", "size": 30, "weight": 700, "color": "#8A8577" },
    { "kind": "text", "x": 564, "y": 1262, "w": 420, "text": "moongi studio", "size": 30, "weight": 400, "color": "#8A8577", "align": "right" }
  ]
}
```

### (B) 본문 + 캐릭터
```json
{
  "background": { "color": "#EDE6D4" },
  "elements": [
    { "kind": "text", "x": 540, "y": 300, "w": 520, "text": "02", "size": 420, "weight": 900, "color": "#E4DCC9" },
    { "kind": "text", "x": 96, "y": 110, "w": 600, "text": "HOW I STARTED", "size": 28, "weight": 800, "color": "#E8553A", "letterSpacing": 4 },
    { "kind": "text", "x": 480, "y": 110, "w": 504, "text": "02 — 06", "size": 28, "weight": 600, "color": "#8A8577", "align": "right", "letterSpacing": 2 },
    { "kind": "text", "x": 96, "y": 360, "w": 640, "text": "굵은 헤드라인", "size": 116, "weight": 900, "color": "#1B1B22", "lineHeight": 1.06 },
    { "kind": "text", "x": 96, "y": 488, "w": 640, "text": "강조 한 줄.", "size": 116, "weight": 900, "color": "#E8553A", "lineHeight": 1.06 },
    { "kind": "text", "x": 96, "y": 700, "w": 600, "text": "본문 2~3문장.\n줄바꿈으로 의미 단위를 끊어요.\n읽기 좋게.", "size": 36, "weight": 500, "color": "#5A554A", "lineHeight": 1.5 },
    { "kind": "image", "x": 700, "y": 560, "w": 320, "h": 546, "url": "/assets/characters/moongi-think.png", "fit": "contain" },
    { "kind": "text", "x": 96, "y": 1130, "w": 500, "text": "swipe to read →", "size": 28, "weight": 600, "italic": true, "color": "#E8553A" },
    { "kind": "text", "x": 96, "y": 1262, "w": 520, "text": "@moongi_adventures", "size": 30, "weight": 700, "color": "#8A8577" },
    { "kind": "text", "x": 564, "y": 1262, "w": 420, "text": "moongi studio", "size": 30, "weight": 400, "color": "#8A8577", "align": "right" }
  ]
}
```

### (C) 프롬프트 카드
```json
{
  "background": { "color": "#EDE6D4" },
  "elements": [
    { "kind": "text", "x": 96, "y": 110, "w": 600, "text": "PROMPT 01 · VOICE CARD", "size": 28, "weight": 800, "color": "#E8553A", "letterSpacing": 4 },
    { "kind": "text", "x": 480, "y": 110, "w": 504, "text": "03 — 06", "size": 28, "weight": 600, "color": "#8A8577", "align": "right", "letterSpacing": 2 },
    { "kind": "text", "x": 96, "y": 300, "w": 880, "text": "프롬프트\n카드 한 장으로.", "size": 96, "weight": 900, "color": "#1B1B22", "lineHeight": 1.08 },
    { "kind": "shape", "x": 96, "y": 660, "w": 888, "h": 420, "shape": "roundRect", "fill": "#15151A", "radius": 28 },
    { "kind": "text", "x": 140, "y": 700, "w": 800, "text": "PROMPT", "size": 22, "weight": 700, "color": "#E8553A", "letterSpacing": 3 },
    { "kind": "text", "x": 140, "y": 748, "w": 800, "text": "여기에 복붙용 프롬프트를 적어요.\n[변수]는 대괄호로.\n여러 줄 가능.", "size": 27, "weight": 400, "color": "#E7E3D8", "lineHeight": 1.5, "fontFamily": "mono" },
    { "kind": "text", "x": 96, "y": 1262, "w": 520, "text": "@moongi_adventures", "size": 30, "weight": 700, "color": "#8A8577" },
    { "kind": "text", "x": 564, "y": 1262, "w": 420, "text": "moongi studio", "size": 30, "weight": 400, "color": "#8A8577", "align": "right" }
  ]
}
```

### (D) 비교 (전·후)
```json
{
  "background": { "color": "#EDE6D4" },
  "elements": [
    { "kind": "text", "x": 96, "y": 110, "w": 600, "text": "THE DIFFERENCE", "size": 28, "weight": 800, "color": "#E8553A", "letterSpacing": 4 },
    { "kind": "text", "x": 480, "y": 110, "w": 504, "text": "04 — 06", "size": 28, "weight": 600, "color": "#8A8577", "align": "right", "letterSpacing": 2 },
    { "kind": "text", "x": 96, "y": 230, "w": 880, "text": "이렇게\n달라졌어.", "size": 96, "weight": 900, "color": "#1B1B22", "lineHeight": 1.08 },
    { "kind": "shape", "x": 96, "y": 560, "w": 420, "h": 540, "shape": "roundRect", "fill": "#E3DBC8", "radius": 28 },
    { "kind": "text", "x": 140, "y": 600, "w": 340, "text": "기존 방식", "size": 40, "weight": 800, "color": "#1B1B22" },
    { "kind": "text", "x": 140, "y": 680, "w": 340, "text": "기존 상황을\n2~3줄로.", "size": 30, "weight": 500, "color": "#5A554A", "lineHeight": 1.45 },
    { "kind": "shape", "x": 564, "y": 560, "w": 420, "h": 540, "shape": "roundRect", "fill": "#15151A", "radius": 28 },
    { "kind": "text", "x": 608, "y": 600, "w": 340, "text": "지금", "size": 40, "weight": 800, "color": "#E8553A" },
    { "kind": "text", "x": 608, "y": 680, "w": 340, "text": "달라진 점을\n2~3줄로.", "size": 30, "weight": 500, "color": "#F1ECDF", "lineHeight": 1.45 },
    { "kind": "text", "x": 96, "y": 1262, "w": 520, "text": "@moongi_adventures", "size": 30, "weight": 700, "color": "#8A8577" },
    { "kind": "text", "x": 564, "y": 1262, "w": 420, "text": "moongi studio", "size": 30, "weight": 400, "color": "#8A8577", "align": "right" }
  ]
}
```

### (E) 리스트 (체크)
```json
{
  "background": { "color": "#EDE6D4" },
  "elements": [
    { "kind": "text", "x": 96, "y": 110, "w": 600, "text": "WHAT YOU GET", "size": 28, "weight": 800, "color": "#E8553A", "letterSpacing": 4 },
    { "kind": "text", "x": 480, "y": 110, "w": 504, "text": "05 — 06", "size": 28, "weight": 600, "color": "#8A8577", "align": "right", "letterSpacing": 2 },
    { "kind": "text", "x": 96, "y": 250, "w": 880, "text": "이게 다\n들어있어.", "size": 96, "weight": 900, "color": "#1B1B22", "lineHeight": 1.08 },
    { "kind": "shape", "x": 96, "y": 568, "w": 22, "h": 22, "shape": "ellipse", "fill": "#E8553A" },
    { "kind": "text", "x": 150, "y": 560, "w": 800, "text": "01  첫 번째 항목", "size": 44, "weight": 700, "color": "#1B1B22" },
    { "kind": "shape", "x": 96, "y": 718, "w": 22, "h": 22, "shape": "ellipse", "fill": "#E8553A" },
    { "kind": "text", "x": 150, "y": 710, "w": 800, "text": "02  두 번째 항목", "size": 44, "weight": 700, "color": "#1B1B22" },
    { "kind": "shape", "x": 96, "y": 868, "w": 22, "h": 22, "shape": "ellipse", "fill": "#E8553A" },
    { "kind": "text", "x": 150, "y": 860, "w": 800, "text": "03  세 번째 항목", "size": 44, "weight": 700, "color": "#1B1B22" },
    { "kind": "shape", "x": 96, "y": 1018, "w": 22, "h": 22, "shape": "ellipse", "fill": "#E8553A" },
    { "kind": "text", "x": 150, "y": 1010, "w": 800, "text": "04  네 번째 항목", "size": 44, "weight": 700, "color": "#1B1B22" },
    { "kind": "text", "x": 96, "y": 1262, "w": 520, "text": "@moongi_adventures", "size": 30, "weight": 700, "color": "#8A8577" },
    { "kind": "text", "x": 564, "y": 1262, "w": 420, "text": "moongi studio", "size": 30, "weight": 400, "color": "#8A8577", "align": "right" }
  ]
}
```

### (F) 엔딩 CTA
```json
{
  "background": { "color": "#EDE6D4" },
  "elements": [
    { "kind": "text", "x": 96, "y": 110, "w": 600, "text": "BUILD WITH ME", "size": 28, "weight": 800, "color": "#E8553A", "letterSpacing": 4 },
    { "kind": "text", "x": 480, "y": 110, "w": 504, "text": "06 — 06", "size": 28, "weight": 600, "color": "#8A8577", "align": "right", "letterSpacing": 2 },
    { "kind": "text", "x": 96, "y": 360, "w": 760, "text": "같이,", "size": 130, "weight": 900, "color": "#1B1B22", "lineHeight": 1.04 },
    { "kind": "text", "x": 96, "y": 500, "w": 760, "text": "가볼래?", "size": 130, "weight": 900, "color": "#E8553A", "lineHeight": 1.04 },
    { "kind": "text", "x": 760, "y": 470, "w": 200, "text": "✦", "size": 110, "weight": 900, "color": "#E8553A" },
    { "kind": "shape", "x": 96, "y": 780, "w": 888, "h": 150, "shape": "roundRect", "fill": "#15151A", "radius": 75 },
    { "kind": "text", "x": 96, "y": 822, "w": 888, "text": "@moongi_adventures", "size": 48, "weight": 800, "color": "#FFFFFF", "align": "center" },
    { "kind": "text", "x": 96, "y": 985, "w": 888, "text": "— end of ep.06 —", "size": 30, "weight": 500, "italic": true, "color": "#8A8577", "align": "center" },
    { "kind": "text", "x": 96, "y": 1262, "w": 520, "text": "@moongi_adventures", "size": 30, "weight": 700, "color": "#8A8577" },
    { "kind": "text", "x": 564, "y": 1262, "w": 420, "text": "moongi studio", "size": 30, "weight": 400, "color": "#8A8577", "align": "right" }
  ]
}
```

> 위 6개 슬라이드 객체를 원하는 순서로 `"slides": [ … ]` 안에 콤마로 이어 넣으면 완성된 캐러셀 JSON이 됩니다. 표준 흐름: **(A) 커버 → (B/C/D/E) 본문 2~4장 → (F) 엔딩 CTA.**

---

## 9. 최소 동작 예시

```json
{
  "name": "예시 캐러셀",
  "slides": [
    {
      "background": { "color": "#EDE6D4" },
      "elements": [
        { "kind": "text", "x": 96, "y": 430, "w": 920, "text": "한 장짜리\n예시.", "size": 130, "weight": 900, "color": "#1B1B22", "lineHeight": 1.05 }
      ]
    }
  ]
}
```
