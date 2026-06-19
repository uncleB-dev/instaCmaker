"use client";

/**
 * InstaCarousel — 관리자 전용. /make(무료 랜딩페이지 도구) 홍보용 인스타 캐러셀 스튜디오.
 *
 * 템플릿 기반 스튜디오:
 * - 슬라이드 템플릿 라이브러리(TEMPLATES, ~11종)에서 골라 캐러셀을 동적으로 구성한다.
 * - 캐러셀은 슬라이드(Slide)의 "정렬된 리스트" — 추가/삭제/순서이동/템플릿 교체/문구·이미지 편집/다운로드.
 * - 각 슬라이드(1080×1350, 4:5)는 자기 템플릿의 Render를 SlideFrame으로 감싸 렌더 → 미리보기 → PNG 다운로드.
 * - 슬라이드 베이스는 전부 CSS(그라데이션/단색)지만, 관리자는 슬라이드마다 템플릿과 무관하게
 *   (A) 배경 사진(풀블리드 cover + 어둡게/흐리게 오버레이)과
 *   (B) 자유 배치/크기 조절되는 삽입 이미지를 올릴 수 있다.
 * - 캡처: 각 .slide 노드를 자연 크기(1080×1350)로 html-to-image의 toBlob으로 캡처.
 *   미리보기는 .scaler 로 0.3148배 축소해 보여줄 뿐, 캡처 대상은 원본 .slide.
 *   배경/오버레이/삽입 이미지는 캡처에 포함되지만, 드래그 핸들은 미포함(editable=false).
 * - 전체는 JSZip으로 묶어 단일 ZIP 다운로드(insta-01.png… 슬라이드 순서대로).
 *
 * 퍼널: 슬라이드에 실제 /make URL은 절대 노출하지 않는다 — 팔로우+댓글 후 DM으로 링크 전달.
 */

import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { toBlob } from "html-to-image";
import JSZip from "jszip";
import { compressImage } from "@/lib/image-compress";
import styles from "./insta.module.css";

const DEFAULT_HANDLE = "@unclebstudio";

/** 슬라이드 좌표계 (px) — 캡처 대상과 동일 */
const SLIDE_W = 1080;
const SLIDE_H = 1350;

/** 삽입 이미지 크기 제약 (1080-space) */
const OV_MIN_W = 80;
const OV_MAX_W = SLIDE_W;

/** 자유 텍스트 박스 제약 (1080-space) */
const TB_MIN_W = 120;
const TB_MAX_W = SLIDE_W;
const TB_MIN_SIZE = 18;
const TB_MAX_SIZE = 240;

/** 배경 어둡게 기본/최대 */
const DEFAULT_DIM = 0.25;
const MAX_DIM = 0.7;
/** 배경 흐리게 최대(px, 1080 좌표계) */
const MAX_BLUR = 40;

/** 슬라이드별 이미지 상태 */
type SlideImg = {
  /** 배경 사진: data URL + 오버레이 darkness(0..0.7) + 흐리게 blur(px, 1080 좌표계) */
  bg?: { url: string; dim: number; blur?: number };
  /** 삽입 이미지: data URL, 좌상단 x/y + width(모두 1080×1350 좌표계). height는 자연비율로 auto */
  ov?: { url: string; x: number; y: number; w: number };
};

/**
 * 자유 배치 텍스트 박스 — 템플릿 레이아웃과 무관하게 슬라이드 위에 올리는 "텍스트 에셋".
 * 이미지 삽입(ov)과 같은 모델: 드래그로 이동, 모서리로 폭 조절, ✕로 삭제, 여러 개 추가.
 * 모든 좌표/크기는 1080×1350 좌표계. 높이는 내용에 따라 auto.
 */
type TextBox = {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  size: number; // font-size px (1080-space)
  color: string; // hex
  align: "left" | "center" | "right";
  weight: number; // 100..900
  shadow?: boolean; // 사진 위 가독성용 그림자
};

/* ============================================================
   템플릿 모델 — 스키마(필드/배열) + 기본 문구 + Render
   ------------------------------------------------------------
   디자인/레이아웃/색은 그대로 두고, "문자열의 출처"만 스키마로 옮긴다.
   각 슬라이드의 문구 편집 UI는 이 스키마(fields/arrays)에서 자동 생성된다.
   ============================================================ */
type FieldKind = "line" | "multiline" | "emoji";
type FieldDef = { key: string; label: string; kind: FieldKind };
type ArrayDef = {
  key: string;
  label: string;
  itemNoun: string;
  min: number;
  max: number;
  fields: FieldDef[];
};

/** 한 슬라이드의 문구 값. fields[key]=문자열, arrays[key]=항목(필드맵) 배열 */
type SlideText = {
  fields: Record<string, string>;
  arrays: Record<string, Record<string, string>[]>;
};

/** Render에 전달되는 props — 해결된 문구 + 핸들 */
type RenderProps = { text: SlideText; handle: string };

type TemplateDef = {
  id: string;
  name: string;
  category: "cover" | "body" | "cta";
  fields: FieldDef[];
  arrays?: ArrayDef[];
  defaults: SlideText;
  /** 다크 배경(footer/arrow 밝은색) 여부 */
  dark?: boolean;
  /** SlideFrame 에 입힐 추가 클래스(배경 그라데이션/단색 등) */
  frameClassName?: string;
  /** 마지막 슬라이드가 아니어도 다음 화살표를 숨길지(예: CTA) */
  hideArrow?: boolean;
  /** SlideFrame 내부 콘텐츠를 렌더 (footer/arrow 는 SlideView 가 담당) */
  Render: React.ComponentType<RenderProps>;
};

/** 캐러셀의 한 장 = 템플릿 인스턴스 + 문구 + 이미지 + 자유 텍스트 박스 */
type Slide = {
  id: string;
  templateId: string;
  text: SlideText;
  img: SlideImg;
  texts: TextBox[];
};

/* ============================================================
   문구 값 헬퍼 — 스키마 기준 안전 접근/패치 (불변)
   ============================================================ */
function field(text: SlideText, key: string): string {
  return text.fields[key] ?? "";
}
function items(text: SlideText, key: string): Record<string, string>[] {
  return text.arrays[key] ?? [];
}
function cloneText(t: SlideText): SlideText {
  return {
    fields: { ...t.fields },
    arrays: Object.fromEntries(
      Object.entries(t.arrays).map(([k, list]) => [
        k,
        list.map((it) => ({ ...it })),
      ]),
    ),
  };
}

/** 빈 배열 항목(스키마 필드 키를 빈 문자열로) */
function emptyItem(def: ArrayDef): Record<string, string> {
  return Object.fromEntries(def.fields.map((f) => [f.key, ""]));
}

/**
 * 템플릿 교체 시 문구 이주:
 * 새 템플릿의 defaults 를 기준으로, 같은 key 의 값(필드/배열)은 기존에서 가져오고 나머지는 기본값.
 */
function migrateText(prev: SlideText, next: TemplateDef): SlideText {
  const out = cloneText(next.defaults);
  for (const f of next.fields) {
    if (prev.fields[f.key] !== undefined) out.fields[f.key] = prev.fields[f.key];
  }
  for (const a of next.arrays ?? []) {
    const prevList = prev.arrays[a.key];
    if (!prevList) continue;
    // min/max 클램프하면서 같은 필드 키만 복사
    const clamped = prevList.slice(0, a.max).map((src) => {
      const it = emptyItem(a);
      for (const f of a.fields) if (src[f.key] !== undefined) it[f.key] = src[f.key];
      return it;
    });
    while (clamped.length < a.min) clamped.push(emptyItem(a));
    if (clamped.length) out.arrays[a.key] = clamped;
  }
  return out;
}

/** 파일명용 2자리 인덱스 (1 → "01") */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 슬라이드 ID 생성 — 모듈 카운터(SSR 안전: 클라이언트에서만 추가 생성) */
let slideSeq = 0;
function newSlideId(): string {
  slideSeq += 1;
  return `s${slideSeq}`;
}

/** 텍스트 박스 ID 생성 */
let textBoxSeq = 0;
function newTextBoxId(): string {
  textBoxSeq += 1;
  return `tb${textBoxSeq}`;
}

/** 새 텍스트 박스(가로 중앙, 슬라이드 다크면 흰색·아니면 진한 잉크) */
function newTextBox(dark?: boolean): TextBox {
  const w = 640;
  return {
    id: newTextBoxId(),
    text: "새 텍스트",
    x: Math.round((SLIDE_W - w) / 2),
    y: 560,
    w,
    size: 64,
    color: dark ? "#ffffff" : "#15171c",
    align: "center",
    weight: 800,
    shadow: false,
  };
}

/** 외부(JSON) 입력을 안전한 TextBox로 — 누락/이상값은 기본으로 보정, id 재발급 */
function sanitizeTextBox(raw: unknown, dark?: boolean): TextBox {
  const o = (raw ?? {}) as Record<string, unknown>;
  const base = newTextBox(dark);
  const num = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const align: TextBox["align"] =
    o.align === "left" || o.align === "right" || o.align === "center"
      ? o.align
      : base.align;
  const color =
    typeof o.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(o.color.trim())
      ? o.color.trim()
      : base.color;
  return {
    id: newTextBoxId(),
    text: o.text === undefined ? base.text : String(o.text),
    x: Math.round(clamp(num(o.x, base.x), -SLIDE_W, SLIDE_W)),
    y: Math.round(clamp(num(o.y, base.y), -SLIDE_H, SLIDE_H)),
    w: Math.round(clamp(num(o.w, base.w), TB_MIN_W, TB_MAX_W)),
    size: Math.round(clamp(num(o.size, base.size), TB_MIN_SIZE, TB_MAX_SIZE)),
    color,
    align,
    weight: Math.round(clamp(num(o.weight, base.weight), 100, 900)),
    shadow: Boolean(o.shadow),
  };
}

/** Blob을 파일로 즉시 다운로드 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 잠시 후 해제 (즉시 revoke하면 일부 브라우저에서 다운로드 취소될 수 있음)
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 텍스트를 클립보드로 복사 — Clipboard API 우선, 실패 시 execCommand 폴백 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 폴백으로 진행 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-10000px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** File → data URL */
function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * 업로드 이미지 → 압축 → data URL.
 * lib/image-compress 의 compressImage(File→File: 긴 변 2000px, WebP 0.85)를 재사용해
 * PNG 용량을 합리적으로 유지한다. data URL이라 same-origin → html-to-image가 그대로 임베드.
 */
async function uploadToDataUrl(file: File): Promise<string> {
  const compressed = await compressImage(file);
  return fileToDataUrl(compressed);
}

const CAPTURE_OPTS = {
  width: SLIDE_W,
  height: SLIDE_H,
  pixelRatio: 1,
  cacheBust: true,
  backgroundColor: undefined,
} as const;

/** 캡처 전: 노드 내 모든 <img> 디코드 완료 보장 */
async function ensureImagesDecoded(node: HTMLElement) {
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      try {
        if (typeof img.decode === "function") {
          await img.decode();
        } else if (!img.complete) {
          await new Promise<void>((res) => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          });
        }
      } catch {
        /* 디코드 실패는 캡처를 막지 않는다 */
      }
    }),
  );
}

/* ============================================================
   메인 컴포넌트
   ============================================================ */
export function InstaCarousel() {
  const [handle, setHandle] = useState(DEFAULT_HANDLE);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  // 구성 불러오기/내보내기용 JSON 텍스트(붙여넣기 영역)
  const [configText, setConfigText] = useState<string>("");

  // 동적 슬라이드 리스트. 초기값은 현재 6장 캐러셀과 동일.
  const [slides, setSlides] = useState<Slide[]>(makeDefaultCarousel);

  const handleLabel = useMemo(() => {
    const h = handle.trim();
    return h.length ? h : DEFAULT_HANDLE;
  }, [handle]);

  /** 슬라이드 id 의 이미지 상태를 부분 갱신 */
  const setSlideImg = useCallback((id: string, patch: Partial<SlideImg>) => {
    setSlides((prev) =>
      prev.map((s) => (s.id === id ? { ...s, img: { ...s.img, ...patch } } : s)),
    );
  }, []);

  /** 슬라이드 id 의 문구를 갱신(불변 업데이트) */
  const updateSlideText = useCallback(
    (id: string, updater: (t: SlideText) => SlideText) => {
      setSlides((prev) =>
        prev.map((s) => (s.id === id ? { ...s, text: updater(s.text) } : s)),
      );
    },
    [],
  );

  /** 한 슬라이드의 문구를 템플릿 기본값으로 초기화 */
  const resetSlideText = useCallback((id: string) => {
    setSlides((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, text: cloneText(TEMPLATES[s.templateId].defaults) }
          : s,
      ),
    );
  }, []);

  /** 템플릿 교체 — 같은 key 문구는 유지, 나머지는 새 템플릿 기본값 */
  const swapTemplate = useCallback((id: string, templateId: string) => {
    setSlides((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = TEMPLATES[templateId];
        if (!next) return s;
        return { ...s, templateId, text: migrateText(s.text, next) };
      }),
    );
  }, []);

  /** 슬라이드 추가 — 선택한 템플릿의 기본값으로 맨 뒤에 */
  const addSlide = useCallback((templateId: string) => {
    const tpl = TEMPLATES[templateId];
    if (!tpl) return;
    setSlides((prev) => [
      ...prev,
      {
        id: newSlideId(),
        templateId,
        text: cloneText(tpl.defaults),
        img: {},
        texts: [],
      },
    ]);
  }, []);

  /** 슬라이드 삭제 — 마지막 한 장은 삭제 금지 */
  const deleteSlide = useCallback((id: string) => {
    setSlides((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  }, []);

  /** 슬라이드 순서 이동 (dir: -1 위로 / +1 아래로) */
  const moveSlide = useCallback((id: string, dir: -1 | 1) => {
    setSlides((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  /** 자유 텍스트 박스 추가 — 슬라이드 다크 여부에 맞춰 기본 색 설정 */
  const addTextBox = useCallback((slideId: string) => {
    setSlides((prev) =>
      prev.map((s) =>
        s.id === slideId
          ? { ...s, texts: [...s.texts, newTextBox(TEMPLATES[s.templateId]?.dark)] }
          : s,
      ),
    );
  }, []);

  /** 텍스트 박스 부분 갱신(이동/리사이즈/스타일/내용) */
  const updateTextBox = useCallback(
    (slideId: string, boxId: string, patch: Partial<TextBox>) => {
      setSlides((prev) =>
        prev.map((s) =>
          s.id === slideId
            ? {
                ...s,
                texts: s.texts.map((b) =>
                  b.id === boxId ? { ...b, ...patch } : b,
                ),
              }
            : s,
        ),
      );
    },
    [],
  );

  /** 텍스트 박스 삭제 */
  const deleteTextBox = useCallback((slideId: string, boxId: string) => {
    setSlides((prev) =>
      prev.map((s) =>
        s.id === slideId
          ? { ...s, texts: s.texts.filter((b) => b.id !== boxId) }
          : s,
      ),
    );
  }, []);

  /** 텍스트 박스 복제(같은 에셋 추가) — 살짝 비껴 배치 */
  const duplicateTextBox = useCallback((slideId: string, boxId: string) => {
    setSlides((prev) =>
      prev.map((s) => {
        if (s.id !== slideId) return s;
        const src = s.texts.find((b) => b.id === boxId);
        if (!src) return s;
        const copy: TextBox = {
          ...src,
          id: newTextBoxId(),
          x: Math.round(clamp(src.x + 40, 0, SLIDE_W - 60)),
          y: Math.round(clamp(src.y + 40, 0, SLIDE_H - 60)),
        };
        return { ...s, texts: [...s.texts, copy] };
      }),
    );
  }, []);

  // 각 슬라이드 .slide 노드 ref (캡처 대상) — id 로 매핑.
  const slideRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const setRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) slideRefs.current.set(id, el);
      else slideRefs.current.delete(id);
    },
    [],
  );

  /** 단일 슬라이드 노드를 PNG Blob으로 */
  const captureNode = useCallback(async (node: HTMLDivElement): Promise<Blob> => {
    await ensureImagesDecoded(node);
    const blob = await toBlob(node, CAPTURE_OPTS);
    if (!blob) throw new Error("이미지 변환 실패 (빈 Blob)");
    return blob;
  }, []);

  /** 한 장 다운로드 */
  const handleDownloadOne = useCallback(
    async (id: string, position: number) => {
      const node = slideRefs.current.get(id);
      if (!node || busy) return;
      setBusy(true);
      setError("");
      setStatus(`생성 중… (${pad2(position)})`);
      try {
        await document.fonts.ready;
        const blob = await captureNode(node);
        downloadBlob(blob, `insta-${pad2(position)}.png`);
        setStatus(`완료: insta-${pad2(position)}.png`);
      } catch (e) {
        console.error("[insta] single capture failed", e);
        setError("이미지 생성에 실패했어요. 다시 시도해 주세요.");
        setStatus("");
      } finally {
        setBusy(false);
      }
    },
    [busy, captureNode],
  );

  /** 전체 PNG → 단일 ZIP (현재 슬라이드 순서대로 insta-01.png…) */
  const handleDownloadZip = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("생성 중… (전체 ZIP)");
    try {
      await document.fonts.ready;
      const zip = new JSZip();
      for (let i = 0; i < slides.length; i++) {
        const node = slideRefs.current.get(slides[i].id);
        if (!node) throw new Error(`슬라이드 ${i + 1} 노드를 찾을 수 없어요.`);
        setStatus(`생성 중… (${pad2(i + 1)}/${slides.length})`);
        const blob = await captureNode(node);
        zip.file(`insta-${pad2(i + 1)}.png`, blob);
      }
      setStatus("압축 중…");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, "make-insta-carousel.zip");
      setStatus("완료: make-insta-carousel.zip");
    } catch (e) {
      console.error("[insta] zip capture failed", e);
      setError("ZIP 생성에 실패했어요. 다시 시도해 주세요.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, [busy, captureNode, slides]);

  /**
   * 구성 불러오기 — 붙여넣은 JSON으로 캐러셀 전체를 한 번에 구성.
   * 잘못된 입력은 절대 throw하지 않고 친절한 한국어 메시지만 보여준다.
   */
  const importConfig = useCallback(
    (jsonText: string) => {
      // 1) JSON 파싱
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        console.error("[insta] config JSON parse failed", e);
        setStatus("");
        setError("JSON 형식이 올바르지 않아요");
        return;
      }

      const root = (parsed ?? {}) as {
        handle?: unknown;
        slides?: unknown;
      };

      // 2) slides 검증 (비어있지 않은 배열)
      if (!Array.isArray(root.slides) || root.slides.length === 0) {
        setStatus("");
        setError("slides 배열이 필요해요");
        return;
      }
      const rawSlides = root.slides as Array<Record<string, unknown>>;

      // 3) 미지의 템플릿 id 수집 → 있으면 중단(아무것도 만들지 않음)
      const unknown: string[] = [];
      for (const entry of rawSlides) {
        const tid = String((entry ?? {}).template ?? "");
        if (!TEMPLATES[tid] && !unknown.includes(tid)) unknown.push(tid);
      }
      if (unknown.length) {
        setStatus("");
        setError(`알 수 없는 템플릿: ${unknown.join(", ")}`);
        return;
      }

      // 4) 각 엔트리 → Slide (omit된 필드는 defaults 유지, 알 수 없는 키 무시)
      const built: Slide[] = rawSlides.map((entry) => {
        const e = (entry ?? {}) as {
          template?: unknown;
          fields?: unknown;
          arrays?: unknown;
          texts?: unknown;
        };
        const templateId = String(e.template ?? "");
        const tpl = TEMPLATES[templateId];
        const text = cloneText(tpl.defaults);

        // 스칼라 필드: 알려진 키만, 문자열로 강제
        const inFields = (e.fields ?? {}) as Record<string, unknown>;
        for (const def of tpl.fields) {
          const v = inFields[def.key];
          if (v !== undefined) text.fields[def.key] = String(v);
        }

        // 배열: 알려진 array key만, 각 항목은 해당 필드 키만 유지(누락→""), 문자열 강제,
        // 길이를 [min,max]로 클램프(초과는 자르고, 미만은 emptyItem으로 채움)
        const inArrays = (e.arrays ?? {}) as Record<string, unknown>;
        for (const aDef of tpl.arrays ?? []) {
          const provided = inArrays[aDef.key];
          if (!Array.isArray(provided)) continue;
          const mapped = provided.map((rawItem) => {
            const src = (rawItem ?? {}) as Record<string, unknown>;
            const it = emptyItem(aDef);
            for (const f of aDef.fields) {
              const fv = src[f.key];
              it[f.key] = fv === undefined ? "" : String(fv);
            }
            return it;
          });
          const clamped = mapped.slice(0, aDef.max);
          while (clamped.length < aDef.min) clamped.push(emptyItem(aDef));
          text.arrays[aDef.key] = clamped;
        }

        // 자유 텍스트 박스(선택): 있으면 보정해서 싣고, 없으면 빈 배열
        const texts: TextBox[] = Array.isArray(e.texts)
          ? e.texts.map((raw) => sanitizeTextBox(raw, tpl.dark))
          : [];

        return { id: newSlideId(), templateId, text, img: {}, texts };
      });

      // 5) 확인 후 교체
      if (!window.confirm("현재 구성을 덮어씁니다. 불러올까요?")) return;
      setSlides(built);
      if (typeof root.handle === "string" && root.handle.trim().length) {
        setHandle(root.handle);
      }
      setError("");
      setStatus(`구성을 불러왔어요 (${built.length}장)`);
    },
    [],
  );

  /**
   * 구성 내보내기 — 현재 캐러셀을 JSON으로 클립보드 복사(이미지/내부 id는 제외).
   */
  const exportConfig = useCallback(async () => {
    const config = {
      handle: handleLabel,
      slides: slides.map((s) => ({
        template: s.templateId,
        fields: { ...s.text.fields },
        arrays: { ...s.text.arrays },
        // 자유 텍스트 박스는 있을 때만(내부 id 제외) — 수동 배치 보존용
        ...(s.texts.length
          ? {
              texts: s.texts.map((b) => ({
                text: b.text,
                x: b.x,
                y: b.y,
                w: b.w,
                size: b.size,
                color: b.color,
                align: b.align,
                weight: b.weight,
                ...(b.shadow ? { shadow: true } : {}),
              })),
            }
          : {}),
      })),
    };
    const json = JSON.stringify(config, null, 2);
    setConfigText(json);
    const ok = await copyTextToClipboard(json);
    if (ok) {
      setError("");
      setStatus("현재 구성을 복사했어요");
    } else {
      setStatus("");
      setError("복사에 실패했어요. 아래 텍스트를 직접 복사해 주세요.");
    }
  }, [handleLabel, slides]);

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        {/* 헤더 */}
        <header className={styles.header}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>
              인스타 캐러셀 스튜디오 — /make 홍보
              <span className={styles.adminBadge}>ADMIN</span>
            </h1>
            <p className={styles.note}>
              관리자 전용 · 템플릿으로 캐러셀 구성 · 팔로우+댓글 → DM 퍼널
            </p>
          </div>
        </header>

        {/* 컨트롤 */}
        <section className={styles.controls} aria-label="캐러셀 설정">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="insta-handle">
              핸들
            </label>
            <input
              id="insta-handle"
              className={styles.input}
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder={DEFAULT_HANDLE}
              spellCheck={false}
              autoComplete="off"
              aria-describedby="insta-handle-hint"
            />
          </div>

          <div className={styles.spacer} />

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleDownloadZip}
              disabled={busy}
            >
              <span aria-hidden>📦</span> 전체 PNG 다운로드 (ZIP)
            </button>
            <div
              className={`${styles.status}${error ? ` ${styles.statusError}` : ""}`}
              role="status"
              aria-live="polite"
            >
              {error || status}
            </div>
          </div>

          {/* 구성 불러오기 / 내보내기 — 기본 접힘 */}
          <details className={styles.configPanel}>
            <summary className={styles.configSummary}>
              📥 구성 불러오기 / 내보내기
            </summary>
            <div className={styles.configBody}>
              <label className={styles.label} htmlFor="insta-config">
                구성 JSON
              </label>
              <textarea
                id="insta-config"
                className={`${styles.input} ${styles.configTextarea}`}
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
                rows={6}
                spellCheck={false}
                autoComplete="off"
                placeholder={
                  '{ "handle": "@unclebstudio", "slides": [ { "template": "cover", "fields": { "headline": "..." } } ] }'
                }
                aria-describedby="insta-config-hint"
              />
              <div className={styles.configActions}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => importConfig(configText)}
                  disabled={busy}
                >
                  <span aria-hidden>📥</span> 불러오기
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => void exportConfig()}
                  disabled={busy}
                >
                  <span aria-hidden>📋</span> 현재 구성 복사
                </button>
              </div>
              <p id="insta-config-hint" className={styles.configHint}>
                ChatGPT/대화에서 받은 구성 코드를 붙여넣고 &lsquo;불러오기&rsquo;를
                누르세요. 이미지는 불러온 뒤 직접 올리면 돼요.
              </p>
            </div>
          </details>
        </section>

        <p id="insta-handle-hint" className={styles.hint}>
          핸들을 바꾸면 모든 슬라이드 하단 푸터({handleLabel})가 실시간으로
          바뀝니다. 슬라이드마다 템플릿을 바꾸고, 배경 사진과 삽입 이미지를 올릴 수
          있어요. 슬라이드에 실제 /make 주소는 노출하지 않습니다 — 링크는 팔로우+댓글
          후 DM으로 전달.
        </p>

        {/* 미리보기 그리드 (축소판) + 슬라이드별 편집 */}
        <section className={styles.grid} aria-label="슬라이드 미리보기">
          {slides.map((slide, i) => {
            const tpl = TEMPLATES[slide.templateId];
            const isLast = i === slides.length - 1;
            const onImgChange = (patch: Partial<SlideImg>) =>
              setSlideImg(slide.id, patch);
            return (
              <div className={styles.cell} key={slide.id}>
                <div className={styles.cellHead}>
                  <span className={styles.cellLabel}>
                    S{i + 1} · {tpl.name}
                  </span>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => handleDownloadOne(slide.id, i + 1)}
                    disabled={busy}
                    aria-label={`S${i + 1} ${tpl.name} PNG 다운로드`}
                  >
                    이 장 ↓
                  </button>
                </div>
                <div className={styles.previewBox}>
                  <div className={styles.scaler}>
                    <SlideView
                      slide={slide}
                      handle={handleLabel}
                      isLast={isLast}
                      editable
                      onImgChange={onImgChange}
                      onTextBoxChange={(boxId, patch) =>
                        updateTextBox(slide.id, boxId, patch)
                      }
                      onTextBoxDelete={(boxId) => deleteTextBox(slide.id, boxId)}
                    />
                  </div>
                </div>

                {/* 슬라이드 관리 + 이미지 + 문구 편집 컨트롤 */}
                <SlideEditor
                  slide={slide}
                  position={i}
                  total={slides.length}
                  disabled={busy}
                  setError={setError}
                  onImgChange={onImgChange}
                  onSwapTemplate={(tid) => swapTemplate(slide.id, tid)}
                  onMove={(dir) => moveSlide(slide.id, dir)}
                  onDelete={() => deleteSlide(slide.id)}
                  onTextChange={(updater) => updateSlideText(slide.id, updater)}
                  onResetText={() => resetSlideText(slide.id)}
                  onAddTextBox={() => addTextBox(slide.id)}
                  onTextBoxChange={(boxId, patch) =>
                    updateTextBox(slide.id, boxId, patch)
                  }
                  onDeleteTextBox={(boxId) => deleteTextBox(slide.id, boxId)}
                  onDuplicateTextBox={(boxId) => duplicateTextBox(slide.id, boxId)}
                />
              </div>
            );
          })}

          {/* 슬라이드 추가 */}
          <AddSlidePanel disabled={busy} onAdd={addSlide} />
        </section>
      </div>

      {/* 캡처 무대 — 화면 밖에서 실제 1080×1350으로 렌더(캡처 대상 ref). editable=false → 핸들 미포함 */}
      <div className={styles.captureStage} aria-hidden>
        {slides.map((slide, i) => (
          <div key={slide.id}>
            <SlideView
              slide={slide}
              handle={handleLabel}
              isLast={i === slides.length - 1}
              editable={false}
              ref={setRef(slide.id)}
            />
          </div>
        ))}
      </div>
    </main>
  );
}

/* ============================================================
   SlideView — 슬라이드 한 장의 공통 렌더(미리보기/캡처 공용).
   템플릿의 Render(콘텐츠)를 SlideFrame으로 감싸고 Footer/NextArrow를 얹는다.
   화살표는 "마지막이 아니고 템플릿이 hideArrow가 아닐 때"만.
   ============================================================ */
const SlideView = forwardRef<
  HTMLDivElement,
  {
    slide: Slide;
    handle: string;
    isLast: boolean;
    editable: boolean;
    onImgChange?: (patch: Partial<SlideImg>) => void;
    onTextBoxChange?: (boxId: string, patch: Partial<TextBox>) => void;
    onTextBoxDelete?: (boxId: string) => void;
  }
>(function SlideView(
  { slide, handle, isLast, editable, onImgChange, onTextBoxChange, onTextBoxDelete },
  ref,
) {
  const tpl = TEMPLATES[slide.templateId];
  const Render = tpl.Render;
  const showArrow = !isLast && !tpl.hideArrow;
  return (
    <SlideFrame
      ref={ref}
      img={slide.img}
      texts={slide.texts}
      editable={editable}
      onChange={onImgChange}
      onTextBoxChange={onTextBoxChange}
      onTextBoxDelete={onTextBoxDelete}
      dark={tpl.dark}
      className={tpl.frameClassName ? styles[tpl.frameClassName] : undefined}
    >
      <Render text={slide.text} handle={handle} />
      <Footer handle={handle} dark={tpl.dark} />
      {showArrow ? <NextArrow dark={tpl.dark} /> : null}
    </SlideFrame>
  );
});

/* ============================================================
   슬라이드 추가 패널 — 템플릿을 카테고리별로 그룹화해 고르기
   ============================================================ */
const CATEGORY_LABEL: Record<TemplateDef["category"], string> = {
  cover: "커버",
  body: "본문",
  cta: "CTA",
};
const CATEGORY_ORDER: TemplateDef["category"][] = ["cover", "body", "cta"];

function AddSlidePanel({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (templateId: string) => void;
}) {
  const grouped = useMemo(() => {
    const all = Object.values(TEMPLATES);
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      list: all.filter((t) => t.category === cat),
    })).filter((g) => g.list.length > 0);
  }, []);

  return (
    <div className={styles.addPanel}>
      <span className={styles.addPanelTitle}>+ 슬라이드 추가</span>
      <p className={styles.addPanelHelp}>템플릿을 고르면 맨 뒤에 추가돼요.</p>
      {grouped.map((g) => (
        <div className={styles.addGroup} key={g.cat}>
          <span className={styles.addGroupLabel}>{CATEGORY_LABEL[g.cat]}</span>
          <div className={styles.addBtnRow}>
            {g.list.map((t) => (
              <button
                key={t.id}
                type="button"
                className={styles.addTplBtn}
                onClick={() => onAdd(t.id)}
                disabled={disabled}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   슬라이드 편집 컨트롤
   — 템플릿 교체 / 순서 이동 / 삭제 / 배경 사진 / 삽입 이미지 / 문구 편집(스키마 자동생성)
   ============================================================ */
function SlideEditor({
  slide,
  position,
  total,
  disabled,
  setError,
  onImgChange,
  onSwapTemplate,
  onMove,
  onDelete,
  onTextChange,
  onResetText,
  onAddTextBox,
  onTextBoxChange,
  onDeleteTextBox,
  onDuplicateTextBox,
}: {
  slide: Slide;
  position: number;
  total: number;
  disabled: boolean;
  setError: (msg: string) => void;
  onImgChange: (patch: Partial<SlideImg>) => void;
  onSwapTemplate: (templateId: string) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onTextChange: (updater: (t: SlideText) => SlideText) => void;
  onResetText: () => void;
  onAddTextBox: () => void;
  onTextBoxChange: (boxId: string, patch: Partial<TextBox>) => void;
  onDeleteTextBox: (boxId: string) => void;
  onDuplicateTextBox: (boxId: string) => void;
}) {
  const { img } = slide;
  const tpl = TEMPLATES[slide.templateId];
  const bgInputId = `insta-bg-${slide.id}`;
  const ovInputId = `insta-ov-${slide.id}`;

  const handleBgFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const url = await uploadToDataUrl(file);
        onImgChange({ bg: { url, dim: img.bg?.dim ?? DEFAULT_DIM } });
      } catch (e) {
        console.error("[insta] bg upload failed", e);
        setError("배경 이미지를 불러오지 못했어요.");
      }
    },
    [img.bg?.dim, onImgChange, setError],
  );

  const handleOvFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const url = await uploadToDataUrl(file);
        // 기본 위치: 가로 중앙(w=460), y=400.
        const w = 460;
        onImgChange({ ov: { url, x: Math.round((SLIDE_W - w) / 2), y: 400, w } });
      } catch (e) {
        console.error("[insta] overlay upload failed", e);
        setError("삽입 이미지를 불러오지 못했어요.");
      }
    },
    [onImgChange, setError],
  );

  return (
    <div className={styles.editor}>
      {/* 슬라이드 관리: 템플릿 교체 + 순서/삭제 */}
      <div className={styles.editGroup}>
        <span className={styles.editGroupLabel}>슬라이드</span>
        <div className={styles.editRow}>
          <label className={styles.rangeLabel} htmlFor={`${slide.id}-tpl`}>
            템플릿
          </label>
          <select
            id={`${slide.id}-tpl`}
            className={styles.select}
            value={slide.templateId}
            disabled={disabled}
            onChange={(e) => onSwapTemplate(e.target.value)}
          >
            {CATEGORY_ORDER.map((cat) => {
              const list = Object.values(TEMPLATES).filter(
                (t) => t.category === cat,
              );
              if (!list.length) return null;
              return (
                <optgroup key={cat} label={CATEGORY_LABEL[cat]}>
                  {list.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div className={styles.editRow}>
          <button
            type="button"
            className={styles.editBtnGhost}
            onClick={() => onMove(-1)}
            disabled={disabled || position === 0}
            aria-label="슬라이드 위로"
          >
            ↑ 위로
          </button>
          <button
            type="button"
            className={styles.editBtnGhost}
            onClick={() => onMove(1)}
            disabled={disabled || position === total - 1}
            aria-label="슬라이드 아래로"
          >
            ↓ 아래로
          </button>
          <button
            type="button"
            className={styles.editBtnDanger}
            onClick={onDelete}
            disabled={disabled || total <= 1}
            aria-label="슬라이드 삭제"
          >
            삭제
          </button>
        </div>
      </div>

      {/* 배경 사진 */}
      <div className={styles.editGroup}>
        <span className={styles.editGroupLabel}>배경 사진</span>
        <div className={styles.editRow}>
          <label className={styles.fileBtn} htmlFor={bgInputId}>
            사진 올리기
          </label>
          <input
            id={bgInputId}
            className={styles.visuallyHidden}
            type="file"
            accept="image/*"
            disabled={disabled}
            onChange={(e) => {
              void handleBgFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {img.bg ? (
            <button
              type="button"
              className={styles.editBtnGhost}
              onClick={() => onImgChange({ bg: undefined })}
              disabled={disabled}
            >
              배경 제거
            </button>
          ) : null}
        </div>
        {img.bg ? (
          <>
            <div className={styles.editRow}>
              <label className={styles.rangeLabel} htmlFor={`${bgInputId}-dim`}>
                어둡게
              </label>
              <input
                id={`${bgInputId}-dim`}
                className={styles.range}
                type="range"
                min={0}
                max={70}
                step={1}
                value={Math.round((img.bg.dim ?? DEFAULT_DIM) * 100)}
                disabled={disabled}
                onChange={(e) =>
                  onImgChange({
                    bg: {
                      ...img.bg!,
                      dim: Math.min(MAX_DIM, Number(e.target.value) / 100),
                    },
                  })
                }
              />
            </div>
            <div className={styles.editRow}>
              <label className={styles.rangeLabel} htmlFor={`${bgInputId}-blur`}>
                흐리게
              </label>
              <input
                id={`${bgInputId}-blur`}
                className={styles.range}
                type="range"
                min={0}
                max={MAX_BLUR}
                step={1}
                value={img.bg.blur ?? 0}
                disabled={disabled}
                onChange={(e) =>
                  onImgChange({
                    bg: {
                      ...img.bg!,
                      blur: Math.min(MAX_BLUR, Number(e.target.value)),
                    },
                  })
                }
              />
            </div>
          </>
        ) : null}
      </div>

      {/* 이미지 삽입 */}
      <div className={styles.editGroup}>
        <span className={styles.editGroupLabel}>이미지 삽입</span>
        <div className={styles.editRow}>
          <label className={styles.fileBtn} htmlFor={ovInputId}>
            이미지 올리기
          </label>
          <input
            id={ovInputId}
            className={styles.visuallyHidden}
            type="file"
            accept="image/*"
            disabled={disabled}
            onChange={(e) => {
              void handleOvFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {img.ov ? (
            <button
              type="button"
              className={styles.editBtnGhost}
              onClick={() => onImgChange({ ov: undefined })}
              disabled={disabled}
            >
              이미지 제거
            </button>
          ) : null}
        </div>
        {img.ov ? (
          <p className={styles.editHelp}>
            이미지를 드래그해 옮기고, 오른쪽 아래 모서리로 크기 조절
          </p>
        ) : null}
      </div>

      {/* 텍스트 박스 — 자유 배치(이동/크기/삭제/복제), 여러 개 추가 */}
      <div className={styles.editGroup}>
        <span className={styles.editGroupLabel}>텍스트 박스</span>
        <div className={styles.editRow}>
          <button
            type="button"
            className={styles.itemAddBtn}
            onClick={onAddTextBox}
            disabled={disabled}
          >
            + 텍스트 박스 추가
          </button>
        </div>
        {slide.texts.length ? (
          <p className={styles.editHelp}>
            박스를 드래그해 이동, 오른쪽 아래 모서리로 폭 조절, ✕로 삭제
          </p>
        ) : null}
        {slide.texts.map((b, i) => (
          <TextBoxControls
            key={b.id}
            index={i}
            box={b}
            disabled={disabled}
            onChange={(patch) => onTextBoxChange(b.id, patch)}
            onDuplicate={() => onDuplicateTextBox(b.id)}
            onDelete={() => onDeleteTextBox(b.id)}
          />
        ))}
      </div>

      {/* 문구 편집 — 스키마에서 자동 생성, 기본 접힘 */}
      <details className={styles.textEdit}>
        <summary className={styles.textEditSummary}>✏️ 문구 편집</summary>
        <div className={styles.textEditBody}>
          <SchemaTextFields
            slideId={slide.id}
            tpl={tpl}
            text={slide.text}
            disabled={disabled}
            onTextChange={onTextChange}
          />
          <button
            type="button"
            className={styles.editBtnGhost}
            onClick={onResetText}
            disabled={disabled}
          >
            이 슬라이드 문구 초기화
          </button>
        </div>
      </details>
    </div>
  );
}

/* ============================================================
   텍스트 박스 편집 컨트롤 — 내용/크기/색/정렬/굵기/그림자 + 복제/삭제
   ============================================================ */
function TextBoxControls({
  index,
  box,
  disabled,
  onChange,
  onDuplicate,
  onDelete,
}: {
  index: number;
  box: TextBox;
  disabled: boolean;
  onChange: (patch: Partial<TextBox>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const idp = `insta-tb-${box.id}`;
  return (
    <div className={styles.tbItem}>
      <div className={styles.tbItemHead}>
        <span className={styles.tbItemTitle}>텍스트 {index + 1}</span>
        <div className={styles.tbItemActions}>
          <button
            type="button"
            className={styles.editBtnGhost}
            onClick={onDuplicate}
            disabled={disabled}
          >
            복제
          </button>
          <button
            type="button"
            className={styles.editBtnDanger}
            onClick={onDelete}
            disabled={disabled}
          >
            삭제
          </button>
        </div>
      </div>

      <div className={styles.textField}>
        <label className={styles.textFieldLabel} htmlFor={`${idp}-text`}>
          내용 <span className={styles.textFieldHint}>줄바꿈 = Enter</span>
        </label>
        <textarea
          id={`${idp}-text`}
          className={styles.textArea}
          value={box.text}
          disabled={disabled}
          rows={2}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </div>

      <div className={styles.editRow}>
        <label className={styles.rangeLabel} htmlFor={`${idp}-size`}>
          크기
        </label>
        <input
          id={`${idp}-size`}
          className={styles.range}
          type="range"
          min={TB_MIN_SIZE}
          max={TB_MAX_SIZE}
          step={1}
          value={box.size}
          disabled={disabled}
          onChange={(e) => onChange({ size: Number(e.target.value) })}
        />
      </div>

      <div className={styles.editRow}>
        <label className={styles.rangeLabel} htmlFor={`${idp}-color`}>
          색
        </label>
        <input
          id={`${idp}-color`}
          className={styles.tbColor}
          type="color"
          value={normalizeHex(box.color)}
          disabled={disabled}
          onChange={(e) => onChange({ color: e.target.value })}
          aria-label="텍스트 색"
        />
        <select
          className={styles.select}
          value={box.align}
          disabled={disabled}
          onChange={(e) => onChange({ align: e.target.value as TextBox["align"] })}
          aria-label="정렬"
        >
          <option value="left">왼쪽</option>
          <option value="center">가운데</option>
          <option value="right">오른쪽</option>
        </select>
        <select
          className={styles.select}
          value={String(box.weight)}
          disabled={disabled}
          onChange={(e) => onChange({ weight: Number(e.target.value) })}
          aria-label="굵기"
        >
          <option value="400">보통</option>
          <option value="600">중간</option>
          <option value="700">굵게</option>
          <option value="800">진하게</option>
          <option value="900">최대</option>
        </select>
      </div>

      <label className={styles.tbCheckRow}>
        <input
          type="checkbox"
          checked={Boolean(box.shadow)}
          disabled={disabled}
          onChange={(e) => onChange({ shadow: e.target.checked })}
        />
        <span>그림자 (사진 위 가독성)</span>
      </label>
    </div>
  );
}

/** color input(#rrggbb 필요)용으로 3/6/8자리 hex를 6자리로 정규화 */
function normalizeHex(hex: string): string {
  const h = (hex || "").trim();
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(h);
  if (m3) {
    const [r, g, b] = m3[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const m8 = /^#([0-9a-fA-F]{6})[0-9a-fA-F]{2}$/.exec(h);
  if (m8) return `#${m8[1]}`.toLowerCase();
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(h);
  if (m6) return h.toLowerCase();
  return "#000000";
}

/* ============================================================
   스키마 기반 문구 편집 — 템플릿의 fields/arrays 로부터 입력 UI 자동 생성
   ============================================================ */
function FieldInput({
  id,
  def,
  value,
  disabled,
  onChange,
}: {
  id: string;
  def: FieldDef;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  if (def.kind === "multiline") {
    return (
      <MultilineField
        id={id}
        label={def.label}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }
  if (def.kind === "emoji") {
    return (
      <EmojiField
        id={id}
        label={def.label}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }
  return (
    <TextField
      id={id}
      label={def.label}
      value={value}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

function SchemaTextFields({
  slideId,
  tpl,
  text,
  disabled,
  onTextChange,
}: {
  slideId: string;
  tpl: TemplateDef;
  text: SlideText;
  disabled: boolean;
  onTextChange: (updater: (t: SlideText) => SlideText) => void;
}) {
  const p = `insta-txt-${slideId}`;

  const setFieldVal = useCallback(
    (key: string, v: string) =>
      onTextChange((t) => ({ ...t, fields: { ...t.fields, [key]: v } })),
    [onTextChange],
  );

  const setItemField = useCallback(
    (arrKey: string, idx: number, fieldKey: string, v: string) =>
      onTextChange((t) => {
        const list = (t.arrays[arrKey] ?? []).map((it, i) =>
          i === idx ? { ...it, [fieldKey]: v } : it,
        );
        return { ...t, arrays: { ...t.arrays, [arrKey]: list } };
      }),
    [onTextChange],
  );

  const addItem = useCallback(
    (def: ArrayDef) =>
      onTextChange((t) => {
        const list = t.arrays[def.key] ?? [];
        if (list.length >= def.max) return t;
        return {
          ...t,
          arrays: { ...t.arrays, [def.key]: [...list, emptyItem(def)] },
        };
      }),
    [onTextChange],
  );

  const removeItem = useCallback(
    (def: ArrayDef, idx: number) =>
      onTextChange((t) => {
        const list = t.arrays[def.key] ?? [];
        if (list.length <= def.min) return t;
        return {
          ...t,
          arrays: {
            ...t.arrays,
            [def.key]: list.filter((_, i) => i !== idx),
          },
        };
      }),
    [onTextChange],
  );

  return (
    <>
      {tpl.fields.map((def) => (
        <FieldInput
          key={def.key}
          id={`${p}-${def.key}`}
          def={def}
          value={field(text, def.key)}
          disabled={disabled}
          onChange={(v) => setFieldVal(def.key, v)}
        />
      ))}

      {(tpl.arrays ?? []).map((def) => {
        const list = items(text, def.key);
        return (
          <div className={styles.arrayGroup} key={def.key}>
            <span className={styles.arrayGroupLabel}>{def.label}</span>
            {list.map((it, idx) => (
              <fieldset className={styles.textSubgroup} key={idx}>
                <legend className={styles.textSubgroupLabel}>
                  {def.itemNoun} {idx + 1}
                  {list.length > def.min ? (
                    <button
                      type="button"
                      className={styles.itemRemoveBtn}
                      onClick={() => removeItem(def, idx)}
                      disabled={disabled}
                      aria-label={`${def.itemNoun} ${idx + 1} 삭제`}
                    >
                      ✕
                    </button>
                  ) : null}
                </legend>
                {def.fields.map((f) => (
                  <FieldInput
                    key={f.key}
                    id={`${p}-${def.key}-${idx}-${f.key}`}
                    def={f}
                    value={it[f.key] ?? ""}
                    disabled={disabled}
                    onChange={(v) => setItemField(def.key, idx, f.key, v)}
                  />
                ))}
              </fieldset>
            ))}
            {list.length < def.max ? (
              <button
                type="button"
                className={styles.itemAddBtn}
                onClick={() => addItem(def)}
                disabled={disabled}
              >
                + {def.itemNoun} 추가
              </button>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/* ============================================================
   문구 편집 필드 — 입력 부품(텍스트/멀티라인/이모지)
   ============================================================ */
function TextField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className={styles.textField}>
      <label className={styles.textFieldLabel} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.textInput}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}

function EmojiField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className={styles.textField}>
      <label className={styles.textFieldLabel} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`${styles.textInput} ${styles.emojiInput}`}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        aria-label={label}
      />
    </div>
  );
}

function MultilineField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className={styles.textField}>
      <label className={styles.textFieldLabel} htmlFor={id}>
        {label} <span className={styles.textFieldHint}>줄바꿈 = Enter</span>
      </label>
      <textarea
        id={id}
        className={styles.textArea}
        value={value}
        disabled={disabled}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/* ============================================================
   SlideFrame — 모든 슬라이드 공통 래퍼.
   .slide 컨테이너 + ref + 이미지 레이어(배경/오버레이/삽입)를 소유.
   z0 배경사진 · z1 오버레이 · z2 콘텐츠(children) · z3 삽입 이미지
   ============================================================ */
const SlideFrame = forwardRef<
  HTMLDivElement,
  {
    img: SlideImg;
    texts?: TextBox[];
    editable: boolean;
    onChange?: (patch: Partial<SlideImg>) => void;
    onTextBoxChange?: (boxId: string, patch: Partial<TextBox>) => void;
    onTextBoxDelete?: (boxId: string) => void;
    dark?: boolean;
    className?: string;
    children: React.ReactNode;
  }
>(function SlideFrame(
  {
    img,
    texts,
    editable,
    onChange,
    onTextBoxChange,
    onTextBoxDelete,
    className,
    children,
  },
  ref,
) {
  return (
    <div ref={ref} className={`${styles.slide}${className ? ` ${className}` : ""}`}>
      {/* z0 배경 사진 (cover) */}
      {img.bg ? (
        <div
          className={styles.bgLayer}
          style={{
            backgroundImage: `url(${img.bg.url})`,
            filter: img.bg.blur ? `blur(${img.bg.blur}px)` : undefined,
            transform: img.bg.blur ? "scale(1.1)" : undefined,
          }}
          aria-hidden
        />
      ) : null}
      {/* z1 어둡게 오버레이 */}
      {img.bg ? (
        <div
          className={styles.bgOverlay}
          style={{ background: `rgba(0,0,0,${img.bg.dim})` }}
          aria-hidden
        />
      ) : null}
      {/* z2 콘텐츠 */}
      <div className={styles.slideContent}>{children}</div>
      {/* z3 삽입 이미지 */}
      {img.ov ? (
        <InsertedImage img={img} editable={editable} onChange={onChange} />
      ) : null}
      {/* z4 자유 텍스트 박스 */}
      {(texts ?? []).map((b) => (
        <TextBoxView
          key={b.id}
          box={b}
          editable={editable}
          onChange={
            onTextBoxChange ? (patch) => onTextBoxChange(b.id, patch) : undefined
          }
          onDelete={onTextBoxDelete ? () => onTextBoxDelete(b.id) : undefined}
        />
      ))}
    </div>
  );
});

/* ============================================================
   삽입 이미지 — editable이면 드래그/리사이즈, 아니면 정적 렌더(캡처용)
   ============================================================ */
function InsertedImage({
  img,
  editable,
  onChange,
}: {
  img: SlideImg;
  editable: boolean;
  onChange?: (patch: Partial<SlideImg>) => void;
}) {
  const ov = img.ov!;
  // 드래그/리사이즈 제스처 상태 (ref라 리렌더 없이 추적)
  const gesture = useRef<{
    mode: "move" | "resize";
    scale: number; // 슬라이드 렌더폭 / 1080
    startX: number; // pointer screen x
    startY: number;
    origX: number;
    origY: number;
    origW: number;
  } | null>(null);

  /** 현재 .slide 의 실제 렌더 스케일 측정 (미리보기 축소 반영, 하드코딩 금지) */
  const measureScale = useCallback((el: HTMLElement | null): number => {
    const slide = el?.closest(`.${CSS.escape(styles.slide)}`) as HTMLElement | null;
    const w = slide?.getBoundingClientRect().width ?? SLIDE_W;
    return w > 0 ? w / SLIDE_W : 1;
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || !onChange) return;
      const dxScreen = e.clientX - g.startX;
      const dyScreen = e.clientY - g.startY;
      // 화면 이동량 → 1080-space (실제 스케일로 나눔)
      const dx = dxScreen / g.scale;
      const dy = dyScreen / g.scale;
      if (g.mode === "move") {
        // 이미지가 대체로 캔버스 안에 남도록 클램프 (좌상단 기준)
        const x = clamp(g.origX + dx, -g.origW * 0.5, SLIDE_W - g.origW * 0.5);
        const y = clamp(g.origY + dy, -SLIDE_H * 0.5, SLIDE_H - 80);
        onChange({ ov: { ...ov, x: Math.round(x), y: Math.round(y) } });
      } else {
        const w = clamp(g.origW + dx, OV_MIN_W, OV_MAX_W);
        onChange({ ov: { ...ov, w: Math.round(w) } });
      }
    },
    [onChange, ov],
  );

  const endGesture = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    gesture.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const startMove = useCallback(
    (e: ReactPointerEvent<HTMLImageElement>) => {
      if (!editable || !onChange) return;
      e.preventDefault();
      gesture.current = {
        mode: "move",
        scale: measureScale(e.currentTarget),
        startX: e.clientX,
        startY: e.clientY,
        origX: ov.x,
        origY: ov.y,
        origW: ov.w,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [editable, measureScale, onChange, ov.w, ov.x, ov.y],
  );

  const startResize = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (!editable || !onChange) return;
      e.preventDefault();
      e.stopPropagation();
      gesture.current = {
        mode: "resize",
        scale: measureScale(e.currentTarget),
        startX: e.clientX,
        startY: e.clientY,
        origX: ov.x,
        origY: ov.y,
        origW: ov.w,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [editable, measureScale, onChange, ov.w, ov.x, ov.y],
  );

  const style: React.CSSProperties = {
    left: ov.x,
    top: ov.y,
    width: ov.w,
    height: "auto",
  };

  if (!editable) {
    // 캡처용: 핸들/포인터 핸들러 없음 — 깔끔한 출력
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={styles.insertedImg}
        src={ov.url}
        alt=""
        style={style}
        draggable={false}
      />
    );
  }

  return (
    <div className={styles.insertedWrap} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`${styles.insertedImg} ${styles.insertedImgEditable}`}
        src={ov.url}
        alt="삽입한 이미지"
        draggable={false}
        onPointerDown={startMove}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      />
      <span
        className={styles.resizeHandle}
        aria-hidden
        onPointerDown={startResize}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      />
    </div>
  );
}

/* ============================================================
   자유 텍스트 박스 — editable이면 드래그(이동)/모서리(폭)/✕(삭제),
   아니면 정적 렌더(캡처용). 이미지 삽입과 동일한 제스처 모델.
   높이는 내용에 따라 auto, 폭만 조절.
   ============================================================ */
function TextBoxView({
  box,
  editable,
  onChange,
  onDelete,
}: {
  box: TextBox;
  editable: boolean;
  onChange?: (patch: Partial<TextBox>) => void;
  onDelete?: () => void;
}) {
  const gesture = useRef<{
    mode: "move" | "resize";
    scale: number; // 슬라이드 렌더폭 / 1080
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
  } | null>(null);

  const measureScale = useCallback((el: HTMLElement | null): number => {
    const slide = el?.closest(`.${CSS.escape(styles.slide)}`) as HTMLElement | null;
    const w = slide?.getBoundingClientRect().width ?? SLIDE_W;
    return w > 0 ? w / SLIDE_W : 1;
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || !onChange) return;
      const dx = (e.clientX - g.startX) / g.scale;
      const dy = (e.clientY - g.startY) / g.scale;
      if (g.mode === "move") {
        const x = clamp(g.origX + dx, -g.origW * 0.5, SLIDE_W - g.origW * 0.5);
        const y = clamp(g.origY + dy, -SLIDE_H * 0.5, SLIDE_H - 80);
        onChange({ x: Math.round(x), y: Math.round(y) });
      } else {
        const w = clamp(g.origW + dx, TB_MIN_W, TB_MAX_W);
        onChange({ w: Math.round(w) });
      }
    },
    [onChange],
  );

  const endGesture = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    gesture.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const startMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!editable || !onChange) return;
      e.preventDefault();
      gesture.current = {
        mode: "move",
        scale: measureScale(e.currentTarget),
        startX: e.clientX,
        startY: e.clientY,
        origX: box.x,
        origY: box.y,
        origW: box.w,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [editable, measureScale, onChange, box.x, box.y, box.w],
  );

  const startResize = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (!editable || !onChange) return;
      e.preventDefault();
      e.stopPropagation();
      gesture.current = {
        mode: "resize",
        scale: measureScale(e.currentTarget),
        startX: e.clientX,
        startY: e.clientY,
        origX: box.x,
        origY: box.y,
        origW: box.w,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [editable, measureScale, onChange, box.x, box.y, box.w],
  );

  const wrapStyle: React.CSSProperties = { left: box.x, top: box.y, width: box.w };
  const textStyle: React.CSSProperties = {
    margin: 0,
    fontSize: box.size,
    lineHeight: 1.25,
    color: box.color,
    fontWeight: box.weight,
    textAlign: box.align,
    whiteSpace: "pre-wrap",
    wordBreak: "keep-all",
    overflowWrap: "anywhere",
    textShadow: box.shadow ? "0 2px 16px rgba(0,0,0,0.55)" : undefined,
  };

  if (!editable) {
    return (
      <div className={styles.textBox} style={wrapStyle}>
        <p style={textStyle}>{box.text}</p>
      </div>
    );
  }

  return (
    <div
      className={`${styles.textBox} ${styles.textBoxEditable}`}
      style={wrapStyle}
      onPointerDown={startMove}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <p style={textStyle}>{box.text || "텍스트"}</p>
      {onDelete ? (
        <button
          type="button"
          className={styles.textBoxDelete}
          onClick={onDelete}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="텍스트 박스 삭제"
        >
          ✕
        </button>
      ) : null}
      <span
        className={styles.textBoxResize}
        aria-hidden
        onPointerDown={startResize}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      />
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* ============================================================
   공통 슬라이드 부품
   ============================================================ */
function Footer({ handle, dark }: { handle: string; dark?: boolean }) {
  return (
    <div className={`${styles.footer}${dark ? ` ${styles.footerDark}` : ""}`}>
      엉클비스튜디오 · {handle}
    </div>
  );
}

function NextArrow({ dark }: { dark?: boolean }) {
  return (
    <div
      className={`${styles.arrow}${dark ? ` ${styles.arrowDark}` : ""}`}
      aria-hidden
    >
      →
    </div>
  );
}

/** 칩 + 제목(섹션 헤더) — 본문 템플릿 공통 머리 */
function SectionHead({
  chip,
  heading,
}: {
  chip: string;
  heading: string;
}) {
  return (
    <div className={styles.head}>
      {chip ? <span className={styles.chip}>{chip}</span> : null}
      <h2 className={`${styles.headline} ${styles.headlineSection}`}>{heading}</h2>
    </div>
  );
}

function Card({
  emoji,
  title,
  desc,
  highlight,
}: {
  emoji: string;
  title: string;
  desc: string;
  highlight?: boolean;
}) {
  return (
    <div className={`${styles.card}${highlight ? ` ${styles.cardHi}` : ""}`}>
      <span className={styles.cardEmoji} aria-hidden>
        {emoji}
      </span>
      <div className={styles.cardBody}>
        <span className={styles.cardTitle}>{title}</span>
        <span className={styles.cardDesc}>{desc}</span>
      </div>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className={styles.step}>
      <span className={styles.stepNum}>{n}</span>
      <span className={styles.stepText}>{text}</span>
    </div>
  );
}

/* ============================================================
   템플릿 라이브러리 (TEMPLATES)
   — 기존 6종(cover/card3/features/steps/cta/mockup)은 디자인/클래스 그대로,
     +5종(checklist/qna/impact/stats/showcase) 추가.
   각 Render는 SlideFrame 내부 콘텐츠만 렌더(Footer/Arrow 는 SlideView).
   ============================================================ */

/* ---- 1) COVER (다크 훅 커버) ---- */
function CoverRender({ text }: RenderProps) {
  return (
    <>
      <div className={styles.coverTop}>
        <span className={`${styles.chip} ${styles.chipDark}`}>
          {field(text, "chip")}
        </span>
        <h2 className={`${styles.headline} ${styles.headlineCover}`}>
          {field(text, "headline")}
        </h2>
        <p className={`${styles.sub} ${styles.subCover}`}>{field(text, "sub")}</p>
      </div>
      <div className={styles.coverGrow} />
      <div className={styles.labelBars}>
        <span className={styles.labelBar}>{field(text, "label1")}</span>
        <span className={styles.labelBar}>{field(text, "label2")}</span>
      </div>
    </>
  );
}

/* ---- 2) CARD3 (카드 3종) / 3) FEATURES (기능 4행) 공용 렌더 ---- */
function CardListRender({
  text,
  arrKey,
  tight,
  highlightLast,
}: RenderProps & { arrKey: string; tight?: boolean; highlightLast?: boolean }) {
  const list = items(text, arrKey);
  return (
    <>
      <SectionHead chip={field(text, "chip")} heading={field(text, "heading")} />
      <div
        className={`${styles.stack}${tight ? ` ${styles.stackTight}` : ""}`}
      >
        {list.map((it, idx) => (
          <Card
            key={idx}
            emoji={it.emoji ?? ""}
            title={it.title ?? ""}
            desc={it.desc ?? ""}
            highlight={highlightLast ? idx === list.length - 1 : false}
          />
        ))}
      </div>
    </>
  );
}

/* ---- 4) STEPS (단계 스텝) ---- */
function StepsRender({ text }: RenderProps) {
  const list = items(text, "steps");
  return (
    <>
      <SectionHead chip={field(text, "chip")} heading={field(text, "heading")} />
      <div className={styles.stack}>
        {list.map((it, idx) => (
          <Step key={idx} n={idx + 1} text={it.text ?? ""} />
        ))}
      </div>
      <p className={styles.note2}>{field(text, "note")}</p>
    </>
  );
}

/* ---- 5) CTA (요약/팔로우+댓글→DM) ---- */
function CtaRender({ text }: RenderProps) {
  return (
    <div className={styles.ctaCol}>
      <span className={`${styles.chip} ${styles.chipDark} ${styles.chipCenter}`}>
        {field(text, "eyebrow")}
      </span>
      <h2 className={`${styles.headline} ${styles.headlineCta}`}>
        {field(text, "headline")}
      </h2>
      <p className={`${styles.sub} ${styles.subCta}`}>{field(text, "sub")}</p>
      <span className={styles.pillBtn}>{field(text, "button")}</span>
      <div className={styles.saveShare}>
        <div className={styles.ss}>
          <span className={styles.ssIcon} aria-hidden>
            💾
          </span>
          <span className={styles.ssLabel}>Save</span>
        </div>
        <div className={styles.ss}>
          <span className={styles.ssIcon} aria-hidden>
            ✈️
          </span>
          <span className={styles.ssLabel}>Share</span>
        </div>
      </div>
    </div>
  );
}

/* ---- 6) MOCKUP (결과 목업, CSS 폰) ---- */
function MockupRender({ text }: RenderProps) {
  return (
    <>
      <SectionHead chip={field(text, "chip")} heading={field(text, "heading")} />
      <div className={styles.mockWrap}>
        <div className={styles.phone} aria-hidden>
          <div className={styles.phoneScreen}>
            <div className={styles.phoneHero}>
              <div className={styles.phoneBarLg} />
              <div className={styles.phoneBarSm} />
              <div className={styles.phoneCta} />
            </div>
            <div className={styles.phoneBody}>
              <div className={styles.phoneCard}>
                <div className={styles.phoneCardBar} />
                <div className={`${styles.phoneCardBar} ${styles.short}`} />
              </div>
              <div className={styles.phoneCard}>
                <div className={styles.phoneCardBar} />
                <div className={`${styles.phoneCardBar} ${styles.short}`} />
              </div>
              <div className={styles.phoneCard}>
                <div className={styles.phoneCardBar} />
                <div className={`${styles.phoneCardBar} ${styles.short}`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---- 7) CHECKLIST (체크리스트 / 이런 분들께) ---- */
function ChecklistRender({ text }: RenderProps) {
  const list = items(text, "items");
  return (
    <>
      <SectionHead chip={field(text, "chip")} heading={field(text, "heading")} />
      <div className={styles.stack}>
        {list.map((it, idx) => (
          <div className={styles.checkRow} key={idx}>
            <span className={styles.checkBadge} aria-hidden>
              ✓
            </span>
            <span className={styles.checkText}>{it.text ?? ""}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---- 8) QNA (Q&A) ---- */
function QnaRender({ text }: RenderProps) {
  const list = items(text, "qa");
  return (
    <>
      <SectionHead chip={field(text, "chip")} heading={field(text, "heading")} />
      <div className={styles.stack}>
        {list.map((it, idx) => (
          <div className={styles.qaBlock} key={idx}>
            <div className={styles.qaQ}>
              <span className={styles.qaBadge} aria-hidden>
                Q
              </span>
              <span className={styles.qaQuestion}>{it.q ?? ""}</span>
            </div>
            <p className={styles.qaAnswer}>{it.a ?? ""}</p>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---- 9) IMPACT (한 줄 임팩트) ---- */
function ImpactRender({ text }: RenderProps) {
  const chip = field(text, "chip");
  const sub = field(text, "sub");
  return (
    <div className={styles.impactCol}>
      {chip ? (
        <span className={`${styles.chip} ${styles.chipDark} ${styles.chipCenter}`}>
          {chip}
        </span>
      ) : null}
      <h2 className={styles.impactHeadline}>{field(text, "headline")}</h2>
      {sub ? <p className={styles.impactSub}>{sub}</p> : null}
    </div>
  );
}

/* ---- 10) STATS (숫자·통계 3블록) ---- */
function StatsRender({ text }: RenderProps) {
  const list = items(text, "stats");
  return (
    <>
      <SectionHead chip={field(text, "chip")} heading={field(text, "heading")} />
      <div className={styles.statStack}>
        {list.map((it, idx) => (
          <div className={styles.statBlock} key={idx}>
            <span className={styles.statNumber}>{it.number ?? ""}</span>
            <span className={styles.statLabel}>{it.label ?? ""}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---- 11) SHOWCASE (결과물 쇼케이스 — 이미지 삽입으로 채움) ---- */
function ShowcaseRender({ text }: RenderProps) {
  const caption = field(text, "caption");
  return (
    <>
      <SectionHead chip={field(text, "chip")} heading={field(text, "heading")} />
      <div className={styles.showcaseFrame} aria-hidden>
        <span className={styles.showcaseHint}>이미지 삽입으로 채우세요</span>
      </div>
      {caption ? <p className={styles.showcaseCaption}>{caption}</p> : null}
    </>
  );
}

/* ---- 12) PROMPTCARD (프롬프트 복붙 카드) — 모노스페이스 코드 블록 ---- */
function PromptCardRender({ text }: RenderProps) {
  const badge = field(text, "badge");
  const why = field(text, "why");
  return (
    <>
      <div className={styles.promptHead}>
        {badge ? <span className={styles.promptBadge}>{badge}</span> : null}
        <h2 className={`${styles.headline} ${styles.headlineSection}`}>
          {field(text, "title")}
        </h2>
        {why ? <p className={styles.promptWhy}>{why}</p> : null}
      </div>
      <div className={styles.codeBlock}>
        <span className={styles.codeDots} aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <pre className={styles.codeText}>{field(text, "prompt")}</pre>
      </div>
      <p className={styles.codeHint}>📋 복사해서 [ ] 부분만 바꿔 쓰세요</p>
    </>
  );
}

/* ---- 13) COMPARE (비교 — 전/후 · A vs B) ---- */
function CompareRender({ text }: RenderProps) {
  return (
    <>
      <SectionHead chip={field(text, "chip")} heading={field(text, "heading")} />
      <div className={styles.compareWrap}>
        <div className={`${styles.compareCol} ${styles.compareLeft}`}>
          <span className={styles.compareTitle}>{field(text, "leftTitle")}</span>
          <p className={styles.compareBody}>{field(text, "leftBody")}</p>
        </div>
        <span className={styles.compareVs} aria-hidden>
          VS
        </span>
        <div className={`${styles.compareCol} ${styles.compareRight}`}>
          <span className={styles.compareTitle}>{field(text, "rightTitle")}</span>
          <p className={styles.compareBody}>{field(text, "rightBody")}</p>
        </div>
      </div>
    </>
  );
}

/* ---- 14) DEFINE (개념 정의) ---- */
function DefineRender({ text }: RenderProps) {
  const list = items(text, "points");
  return (
    <>
      {field(text, "chip") ? (
        <span className={styles.chip}>{field(text, "chip")}</span>
      ) : null}
      <div className={styles.defineBox}>
        <span className={styles.defineTerm}>{field(text, "term")}</span>
        <p className={styles.defineDef}>{field(text, "definition")}</p>
      </div>
      {list.length ? (
        <div className={styles.definePoints}>
          {list.map((it, idx) => (
            <div className={styles.definePoint} key={idx}>
              <span className={styles.definePointLabel}>{it.label ?? ""}</span>
              <span className={styles.definePointDesc}>{it.desc ?? ""}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

/* ---- 15) NOTICE (안내·유의 — 밀집 불릿) ---- */
function NoticeRender({ text }: RenderProps) {
  const list = items(text, "bullets");
  return (
    <>
      <SectionHead chip={field(text, "chip")} heading={field(text, "heading")} />
      <ul className={styles.bulletList}>
        {list.map((it, idx) => (
          <li className={styles.bulletItem} key={idx}>
            <span className={styles.bulletDot} aria-hidden>
              •
            </span>
            <span className={styles.bulletText}>{it.text ?? ""}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---- 16) TOC (목차/커리큘럼) ---- */
function TocRender({ text }: RenderProps) {
  const list = items(text, "chapters");
  const heading = field(text, "heading");
  return (
    <>
      <div className={styles.head}>
        {field(text, "chip") ? (
          <span className={styles.chip}>{field(text, "chip")}</span>
        ) : null}
        {heading ? (
          <h2 className={`${styles.headline} ${styles.headlineSection}`}>
            {heading}
          </h2>
        ) : null}
      </div>
      <div className={styles.tocList}>
        {list.map((it, idx) => (
          <div className={styles.tocRow} key={idx}>
            <span className={styles.tocNo}>{it.no ?? ""}</span>
            <span className={styles.tocTitle}>{it.title ?? ""}</span>
            <span className={styles.tocDots} aria-hidden />
            <span className={styles.tocPage}>{it.page ?? ""}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---- 17) PKG (제공 구성/패키지) ---- */
function PkgRender({ text }: RenderProps) {
  const list = items(text, "items");
  return (
    <>
      <SectionHead chip={field(text, "chip")} heading={field(text, "heading")} />
      <div className={styles.stack}>
        {list.map((it, idx) => (
          <div className={styles.pkgRow} key={idx}>
            <div className={styles.pkgMain}>
              <span className={styles.pkgName}>{it.name ?? ""}</span>
              {it.qty ? (
                <span className={styles.pkgQty}>{it.qty}</span>
              ) : null}
            </div>
            <span className={styles.pkgDesc}>{it.desc ?? ""}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---- 18) PROBLEM (핵심 문제·페인 후킹) ---- */
function ProblemRender({ text }: RenderProps) {
  const chip = field(text, "chip");
  const desc = field(text, "desc");
  const twist = field(text, "twist");
  return (
    <div className={styles.problemCol}>
      {chip ? (
        <span className={styles.chip}>{chip}</span>
      ) : null}
      <h2 className={styles.problemQ}>{field(text, "question")}</h2>
      {desc ? <p className={styles.problemDesc}>{desc}</p> : null}
      {twist ? <p className={styles.problemTwist}>{twist}</p> : null}
    </div>
  );
}

/* ---- 19) ROLETABLE (역할 분담 표) ---- */
function RoleTableRender({ text }: RenderProps) {
  const list = items(text, "roles");
  return (
    <>
      <SectionHead chip={field(text, "chip")} heading={field(text, "heading")} />
      <div className={styles.roleTable}>
        <div className={`${styles.roleRow} ${styles.roleHead}`}>
          <span className={styles.roleCellRole}>역할</span>
          <span className={styles.roleCellDesc}>설명</span>
        </div>
        {list.map((it, idx) => (
          <div className={styles.roleRow} key={idx}>
            <span className={styles.roleCellRole}>{it.role ?? ""}</span>
            <span className={styles.roleCellDesc}>{it.desc ?? ""}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---- 20) STATCOVER (숫자·권위 훅 커버, 다크) ---- */
function StatCoverRender({ text }: RenderProps) {
  const authority = field(text, "authority");
  const title = field(text, "title");
  return (
    <div className={styles.statCoverCol}>
      {authority ? (
        <span className={`${styles.chip} ${styles.chipDark} ${styles.chipCenter}`}>
          {authority}
        </span>
      ) : null}
      <span className={styles.statCoverStat}>{field(text, "stat")}</span>
      {title ? <h2 className={styles.statCoverTitle}>{title}</h2> : null}
    </div>
  );
}

/* ---- 21) HOWTO (사용법·준비물) — 준비물 list + 사용법 steps ---- */
function HowToRender({ text }: RenderProps) {
  const prep = items(text, "prep");
  const steps = items(text, "steps");
  return (
    <>
      <div className={styles.howtoSection}>
        <span className={styles.howtoLabel}>{field(text, "prepTitle")}</span>
        <div className={styles.howtoPrep}>
          {prep.map((it, idx) => (
            <div className={styles.howtoPrepItem} key={idx}>
              <span className={styles.howtoCheck} aria-hidden>
                ✓
              </span>
              <span className={styles.howtoPrepText}>{it.text ?? ""}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.howtoSection}>
        <span className={styles.howtoLabel}>{field(text, "stepsTitle")}</span>
        <div className={styles.howtoSteps}>
          {steps.map((it, idx) => (
            <div className={styles.step} key={idx}>
              <span className={styles.stepNum}>{idx + 1}</span>
              <span className={styles.stepText}>{it.text ?? ""}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** 본문 머리(칩+제목) 공통 필드 */
const HEAD_FIELDS: FieldDef[] = [
  { key: "chip", label: "칩", kind: "line" },
  { key: "heading", label: "제목", kind: "multiline" },
];

const TEMPLATE_LIST: TemplateDef[] = [
  /* 1 */
  {
    id: "cover",
    name: "다크 훅 커버",
    category: "cover",
    dark: true,
    frameClassName: "slideCover",
    fields: [
      { key: "chip", label: "칩", kind: "line" },
      { key: "headline", label: "헤드라인", kind: "multiline" },
      { key: "sub", label: "서브", kind: "multiline" },
      { key: "label1", label: "라벨 1", kind: "line" },
      { key: "label2", label: "라벨 2", kind: "line" },
    ],
    defaults: {
      fields: {
        chip: "무료 AI 도구 · 디지털 명함",
        headline: "클릭되는\n나만의 명함,\nAI로 5분 무료",
        sub: "인스타 프로필·DM에 바로 거는\n내 소개 페이지 🎁",
        label1: "종이 명함은 그만",
        label2: "링크 하나로 끝",
      },
      arrays: {},
    },
    Render: CoverRender,
  },
  /* 2 */
  {
    id: "card3",
    name: "카드 3종",
    category: "body",
    fields: HEAD_FIELDS,
    arrays: [
      {
        key: "cards",
        label: "카드",
        itemNoun: "카드",
        min: 1,
        max: 3,
        fields: [
          { key: "emoji", label: "이모지", kind: "emoji" },
          { key: "title", label: "제목", kind: "line" },
          { key: "desc", label: "설명", kind: "line" },
        ],
      },
    ],
    defaults: {
      fields: { chip: "이런 분들께", heading: "이런 분들께\n강력 추천합니다!" },
      arrays: {
        cards: [
          {
            emoji: "🛡️",
            title: "보험·금융 설계사",
            desc: "인스타 프로필에 걸 내 소개 페이지가 필요할 때",
          },
          {
            emoji: "💪",
            title: "헬스·PT·뷰티 원장님",
            desc: "후기·전후로 신뢰를 보여주고 싶을 때",
          },
          {
            emoji: "🏠",
            title: "공인중개사·강사·1인 사업자",
            desc: "외주 없이 직접 5분 만에 만들고 싶을 때",
          },
        ],
      },
    },
    Render: (props) => (
      <CardListRender {...props} arrKey="cards" highlightLast />
    ),
  },
  /* 3 */
  {
    id: "features",
    name: "기능·특징 4행",
    category: "body",
    fields: HEAD_FIELDS,
    arrays: [
      {
        key: "rows",
        label: "행",
        itemNoun: "행",
        min: 1,
        max: 4,
        fields: [
          { key: "emoji", label: "이모지", kind: "emoji" },
          { key: "title", label: "제목", kind: "line" },
          { key: "desc", label: "설명", kind: "line" },
        ],
      },
    ],
    defaults: {
      fields: { chip: "왜 이 도구?", heading: "그냥 만드는 게\n아닙니다" },
      arrays: {
        rows: [
          {
            emoji: "🎯",
            title: "업종 맞춤 13종",
            desc: "보험·부동산·헬스·뷰티·교육… 추천 섹션 자동",
          },
          {
            emoji: "🎨",
            title: "디자인 자유",
            desc: "색·폰트 직접 선택, 모바일/PC 선택",
          },
          {
            emoji: "✍️",
            title: "후기·FAQ 없어도 OK",
            desc: "AI가 예시로 채워줘요 (나중에 교체)",
          },
          {
            emoji: "🖼️",
            title: "사진 없어도 완성",
            desc: "깔끔한 그래픽으로 채워줘요",
          },
        ],
      },
    },
    Render: (props) => <CardListRender {...props} arrKey="rows" tight />,
  },
  /* 4 */
  {
    id: "steps",
    name: "단계 스텝",
    category: "body",
    fields: [
      { key: "chip", label: "칩", kind: "line" },
      { key: "heading", label: "제목", kind: "line" },
      { key: "note", label: "안내 문구", kind: "line" },
    ],
    arrays: [
      {
        key: "steps",
        label: "스텝",
        itemNoun: "스텝",
        min: 3,
        max: 5,
        fields: [{ key: "text", label: "내용", kind: "line" }],
      },
    ],
    defaults: {
      fields: {
        chip: "사용법 간단 설명",
        heading: "사용법",
        note: "* 어려운 거 하나도 없어요 — 따라만 하면 끝.",
      },
      arrays: {
        steps: [
          { text: "질문 5단계에 답하기" },
          { text: "완성된 프롬프트 복사하기" },
          { text: "제미나이(Gemini) Canvas에 붙여넣기" },
          { text: "Vercel로 무료 배포 → 내 주소(URL) 받기" },
        ],
      },
    },
    Render: StepsRender,
  },
  /* 5 */
  {
    id: "cta",
    name: "CTA 요약",
    category: "cta",
    dark: true,
    frameClassName: "slideCta",
    hideArrow: true,
    fields: [
      { key: "eyebrow", label: "아이브로우", kind: "line" },
      { key: "headline", label: "헤드라인", kind: "multiline" },
      { key: "sub", label: "서브", kind: "multiline" },
      { key: "button", label: "버튼", kind: "line" },
    ],
    defaults: {
      fields: {
        eyebrow: "Summary",
        headline: "지금 무료로\n내 랜딩페이지 만들기!",
        sub: "팔로우 + 댓글 달아주시면\n만드는 링크를 DM으로 보내드려요!",
        button: "팔로우 + 댓글 → DM으로 링크 받기",
      },
      arrays: {},
    },
    Render: CtaRender,
  },
  /* 6 */
  {
    id: "mockup",
    name: "결과 목업",
    category: "body",
    fields: HEAD_FIELDS,
    defaults: {
      fields: { chip: "이렇게 나와요", heading: "내 페이지,\n이렇게 완성돼요" },
      arrays: {},
    },
    Render: MockupRender,
  },
  /* 7 */
  {
    id: "checklist",
    name: "체크리스트",
    category: "body",
    fields: HEAD_FIELDS,
    arrays: [
      {
        key: "items",
        label: "항목",
        itemNoun: "항목",
        min: 3,
        max: 6,
        fields: [{ key: "text", label: "내용", kind: "line" }],
      },
    ],
    defaults: {
      fields: { chip: "체크리스트", heading: "이런 게\n다 들어 있어요" },
      arrays: {
        items: [
          { text: "업종 맞춤 추천 섹션" },
          { text: "후기·FAQ 예시 자동 채움" },
          { text: "색·폰트 자유 선택" },
          { text: "모바일·PC 모두 대응" },
        ],
      },
    },
    Render: ChecklistRender,
  },
  /* 8 */
  {
    id: "qna",
    name: "Q&A",
    category: "body",
    fields: HEAD_FIELDS,
    arrays: [
      {
        key: "qa",
        label: "질문·답변",
        itemNoun: "Q&A",
        min: 1,
        max: 3,
        fields: [
          { key: "q", label: "질문", kind: "line" },
          { key: "a", label: "답변", kind: "multiline" },
        ],
      },
    ],
    defaults: {
      fields: { chip: "자주 묻는 질문", heading: "이런 게\n궁금하시죠?" },
      arrays: {
        qa: [
          {
            q: "코딩 몰라도 되나요?",
            a: "네! 질문에 답만 하면 AI가 다 만들어줘요.",
          },
          {
            q: "정말 무료인가요?",
            a: "도구도, 배포(Vercel)도 무료예요.",
          },
        ],
      },
    },
    Render: QnaRender,
  },
  /* 9 */
  {
    id: "impact",
    name: "한 줄 임팩트",
    category: "body",
    dark: true,
    frameClassName: "slideImpact",
    fields: [
      { key: "chip", label: "칩 (선택)", kind: "line" },
      { key: "headline", label: "헤드라인", kind: "multiline" },
      { key: "sub", label: "서브 (선택)", kind: "line" },
    ],
    defaults: {
      fields: {
        chip: "",
        headline: "명함 한 장이\n매출이 됩니다",
        sub: "프로필 링크 하나로 충분해요",
      },
      arrays: {},
    },
    Render: ImpactRender,
  },
  /* 10 */
  {
    id: "stats",
    name: "숫자·통계",
    category: "body",
    fields: HEAD_FIELDS,
    arrays: [
      {
        key: "stats",
        label: "숫자",
        itemNoun: "블록",
        min: 1,
        max: 3,
        fields: [
          { key: "number", label: "숫자", kind: "line" },
          { key: "label", label: "설명", kind: "line" },
        ],
      },
    ],
    defaults: {
      fields: { chip: "숫자로 보면", heading: "이만큼\n간단해요" },
      arrays: {
        stats: [
          { number: "5분", label: "완성까지 걸리는 시간" },
          { number: "0원", label: "도구·배포 비용" },
          { number: "13종", label: "업종 맞춤 템플릿" },
        ],
      },
    },
    Render: StatsRender,
  },
  /* 11 */
  {
    id: "showcase",
    name: "결과물 쇼케이스",
    category: "body",
    fields: [
      { key: "chip", label: "칩", kind: "line" },
      { key: "heading", label: "제목", kind: "multiline" },
      { key: "caption", label: "캡션", kind: "line" },
    ],
    defaults: {
      fields: {
        chip: "실제 결과물",
        heading: "이렇게\n만들어졌어요",
        caption: "* 이미지 삽입으로 실제 화면을 채워보세요",
      },
      arrays: {},
    },
    Render: ShowcaseRender,
  },
  /* 12 */
  {
    id: "promptcard",
    name: "프롬프트 복붙 카드",
    category: "body",
    fields: [
      { key: "badge", label: "뱃지", kind: "line" },
      { key: "title", label: "제목", kind: "line" },
      { key: "why", label: "용도 설명", kind: "multiline" },
      { key: "prompt", label: "프롬프트", kind: "multiline" },
    ],
    defaults: {
      fields: {
        badge: "PROMPT 01",
        title: "썸네일용 이미지 만들기",
        why: "유튜브·블로그 썸네일을 1장으로 뽑을 때",
        prompt:
          "[주제]를 다루는 유튜브 썸네일 이미지를 만들어줘.\n타깃은 [타깃]이고, 분위기는 [느낌] 톤.\n중앙에 굵은 한글 카피 \"[카피]\"를 크게 넣고,\n배경은 [색상] 계열, 9:16 세로 비율로.",
      },
      arrays: {},
    },
    Render: PromptCardRender,
  },
  /* 13 */
  {
    id: "compare",
    name: "비교(전·후 / A vs B)",
    category: "body",
    fields: [
      { key: "chip", label: "칩", kind: "line" },
      { key: "heading", label: "제목", kind: "multiline" },
      { key: "leftTitle", label: "왼쪽 제목", kind: "line" },
      { key: "leftBody", label: "왼쪽 내용", kind: "multiline" },
      { key: "rightTitle", label: "오른쪽 제목", kind: "line" },
      { key: "rightBody", label: "오른쪽 내용", kind: "multiline" },
    ],
    defaults: {
      fields: {
        chip: "이렇게 달라져요",
        heading: "막 쓴 프롬프트 vs\n잘 쓴 프롬프트",
        leftTitle: "Before",
        leftBody: "\"썸네일 만들어줘\"\n→ 매번 다른 결과,\n   원하는 그림이 안 나옴",
        rightTitle: "After",
        rightBody: "역할·타깃·톤·비율까지\n→ 한 번에 원하는\n   결과물 완성",
      },
      arrays: {},
    },
    Render: CompareRender,
  },
  /* 14 */
  {
    id: "define",
    name: "개념 정의",
    category: "body",
    fields: [
      { key: "chip", label: "칩", kind: "line" },
      { key: "term", label: "용어", kind: "line" },
      { key: "definition", label: "정의", kind: "multiline" },
    ],
    arrays: [
      {
        key: "points",
        label: "포인트",
        itemNoun: "포인트",
        min: 0,
        max: 4,
        fields: [
          { key: "label", label: "라벨", kind: "line" },
          { key: "desc", label: "설명", kind: "line" },
        ],
      },
    ],
    defaults: {
      fields: {
        chip: "한 줄 정의",
        term: "프롬프트",
        definition: "AI에게 원하는 결과를 얻기 위해\n건네는 \"요청 문장\".",
      },
      arrays: {
        points: [
          { label: "역할", desc: "AI에게 어떤 전문가가 될지 알려주기" },
          { label: "맥락", desc: "타깃·목적·상황을 함께 적기" },
          { label: "형식", desc: "원하는 출력 형태·길이 지정" },
        ],
      },
    },
    Render: DefineRender,
  },
  /* 15 */
  {
    id: "notice",
    name: "안내·유의(밀집 불릿)",
    category: "body",
    fields: HEAD_FIELDS,
    arrays: [
      {
        key: "bullets",
        label: "항목",
        itemNoun: "항목",
        min: 3,
        max: 8,
        fields: [{ key: "text", label: "내용", kind: "line" }],
      },
    ],
    defaults: {
      fields: { chip: "꼭 확인하세요", heading: "쓰기 전\n유의사항" },
      arrays: {
        bullets: [
          { text: "[ ] 안의 내용은 본인 상황에 맞게 꼭 바꿔주세요" },
          { text: "결과가 아쉬우면 같은 프롬프트를 한 번 더 돌려보세요" },
          { text: "한글 카피는 짧을수록 또렷하게 나옵니다" },
          { text: "비율(9:16, 1:1 등)을 명시하면 잘림이 줄어요" },
          { text: "저작권 있는 인물·로고는 요청에 넣지 마세요" },
        ],
      },
    },
    Render: NoticeRender,
  },
  /* 16 */
  {
    id: "toc",
    name: "목차/커리큘럼",
    category: "body",
    fields: [
      { key: "chip", label: "칩", kind: "line" },
      { key: "heading", label: "제목 (선택)", kind: "multiline" },
    ],
    arrays: [
      {
        key: "chapters",
        label: "챕터",
        itemNoun: "챕터",
        min: 3,
        max: 8,
        fields: [
          { key: "no", label: "번호", kind: "line" },
          { key: "title", label: "제목", kind: "line" },
          { key: "page", label: "페이지", kind: "line" },
        ],
      },
    ],
    defaults: {
      fields: { chip: "목차", heading: "오늘 다룰\n내용" },
      arrays: {
        chapters: [
          { no: "01", title: "프롬프트가 뭔가요", page: "P.2" },
          { no: "02", title: "좋은 프롬프트 4요소", page: "P.4" },
          { no: "03", title: "바로 쓰는 복붙 템플릿", page: "P.7" },
          { no: "04", title: "결과 다듬는 법", page: "P.10" },
        ],
      },
    },
    Render: TocRender,
  },
  /* 17 */
  {
    id: "pkg",
    name: "제공 구성/패키지",
    category: "body",
    fields: HEAD_FIELDS,
    arrays: [
      {
        key: "items",
        label: "구성품",
        itemNoun: "구성품",
        min: 2,
        max: 6,
        fields: [
          { key: "name", label: "이름", kind: "line" },
          { key: "qty", label: "수량 뱃지", kind: "line" },
          { key: "desc", label: "설명", kind: "line" },
        ],
      },
    ],
    defaults: {
      fields: { chip: "이런 게 들어 있어요", heading: "제공 구성" },
      arrays: {
        items: [
          { name: "복붙 프롬프트 템플릿", qty: "30종", desc: "용도별 바로 쓰는 문장" },
          { name: "상황별 변수 가이드", qty: "PDF", desc: "[ ] 칸 채우는 예시 모음" },
          { name: "결과 보정 체크리스트", qty: "1장", desc: "아쉬울 때 손보는 순서" },
        ],
      },
    },
    Render: PkgRender,
  },
  /* 18 */
  {
    id: "problem",
    name: "핵심 문제·페인 후킹",
    category: "body",
    fields: [
      { key: "chip", label: "칩 (선택)", kind: "line" },
      { key: "question", label: "질문", kind: "multiline" },
      { key: "desc", label: "설명", kind: "multiline" },
      { key: "twist", label: "강조 한 줄", kind: "line" },
    ],
    defaults: {
      fields: {
        chip: "혹시 당신도?",
        question: "매번 \"AI한테\n뭐라고 쓰지?\"\n고민하나요?",
        desc: "같은 도구를 써도 결과가 천차만별인 건\n프롬프트 차이 때문이에요.",
        twist: "고수는 \"공식\"으로 씁니다",
      },
      arrays: {},
    },
    Render: ProblemRender,
  },
  /* 19 */
  {
    id: "roletable",
    name: "역할 분담 표",
    category: "body",
    fields: HEAD_FIELDS,
    arrays: [
      {
        key: "roles",
        label: "행",
        itemNoun: "행",
        min: 2,
        max: 5,
        fields: [
          { key: "role", label: "역할", kind: "line" },
          { key: "desc", label: "설명", kind: "line" },
        ],
      },
    ],
    defaults: {
      fields: { chip: "역할을 나눠요", heading: "누가 뭘\n맡나요" },
      arrays: {
        roles: [
          { role: "나", desc: "주제·타깃·톤을 정한다" },
          { role: "프롬프트", desc: "요청을 또렷하게 전달한다" },
          { role: "AI", desc: "초안을 빠르게 만들어준다" },
          { role: "다시 나", desc: "골라서 다듬고 발행한다" },
        ],
      },
    },
    Render: RoleTableRender,
  },
  /* 20 */
  {
    id: "statcover",
    name: "숫자·권위 훅 커버",
    category: "cover",
    dark: true,
    frameClassName: "slideImpact",
    fields: [
      { key: "stat", label: "숫자/금액", kind: "line" },
      { key: "authority", label: "권위 한 줄", kind: "line" },
      { key: "title", label: "제목", kind: "multiline" },
    ],
    defaults: {
      fields: {
        stat: "30개",
        authority: "현직 마케터가 매일 쓰는",
        title: "복붙하면\n끝나는 프롬프트",
      },
      arrays: {},
    },
    Render: StatCoverRender,
  },
  /* 21 */
  {
    id: "howto",
    name: "사용법·준비물",
    category: "body",
    fields: [
      { key: "prepTitle", label: "준비물 제목", kind: "line" },
      { key: "stepsTitle", label: "사용법 제목", kind: "line" },
    ],
    arrays: [
      {
        key: "prep",
        label: "준비물",
        itemNoun: "준비물",
        min: 1,
        max: 5,
        fields: [{ key: "text", label: "내용", kind: "line" }],
      },
      {
        key: "steps",
        label: "사용법",
        itemNoun: "스텝",
        min: 2,
        max: 6,
        fields: [{ key: "text", label: "내용", kind: "line" }],
      },
    ],
    defaults: {
      fields: { prepTitle: "준비물", stepsTitle: "사용법" },
      arrays: {
        prep: [
          { text: "AI 챗봇 (ChatGPT·제미나이 등)" },
          { text: "복붙 프롬프트 템플릿" },
        ],
        steps: [
          { text: "원하는 프롬프트를 복사한다" },
          { text: "[ ] 부분을 내 상황으로 바꾼다" },
          { text: "챗봇에 붙여넣고 보낸다" },
          { text: "결과를 골라 다듬어 쓴다" },
        ],
      },
    },
    Render: HowToRender,
  },
];

/** id → 템플릿 (조회용) */
const TEMPLATES: Record<string, TemplateDef> = Object.fromEntries(
  TEMPLATE_LIST.map((t) => [t.id, t]),
);

/** 기본 캐러셀 — 오늘의 6장(템플릿 인스턴스). 열면 기존과 동일하게 보인다. */
const DEFAULT_CAROUSEL_TEMPLATE_IDS = [
  "cover",
  "card3",
  "features",
  "steps",
  "mockup",
  "cta",
];

function makeDefaultCarousel(): Slide[] {
  return DEFAULT_CAROUSEL_TEMPLATE_IDS.map((tid) => ({
    id: newSlideId(),
    templateId: tid,
    text: cloneText(TEMPLATES[tid].defaults),
    img: {},
    texts: [],
  }));
}
