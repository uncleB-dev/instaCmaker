"use client";

/**
 * instaCmaker — 뭉이(moongi) 캔버스 스튜디오
 * ------------------------------------------------------------
 * 캔바/미리캔버스식 "요소(레이어) 기반" 인스타 캐러셀 편집기. (클라이언트 전용 · 백엔드 없음)
 *
 * - 슬라이드 = 배경(색/이미지) + elements[](텍스트·이미지·도형), 배열 순서 = z-order.
 * - 모든 요소: 드래그 이동 / 모서리 리사이즈 / 선택·삭제·복제 / 레이어 순서.
 * - 좌표계: 1080×1350 고정 px. 미리보기는 transform scale 축소만, 캡처는 원본 1080 노드.
 * - 캡처: 화면 밖 captureStage 에서 editable=false 로 렌더 → html-to-image(toBlob) → PNG/ZIP.
 *   (편집 핸들/선택 테두리는 editable=true 에서만, 캡처본엔 미포함)
 * - 저장: localStorage 자동 저장 + JSON 내보내기/불러오기. 템플릿도 동일 모델로 저장.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { toBlob } from "html-to-image";
import JSZip from "jszip";
import { compressImage } from "@/lib/image-compress";
import styles from "./insta.module.css";

/* ============================================================
   상수 · 좌표계
   ============================================================ */
const SLIDE_W = 1080;
const SLIDE_H = 1350;

const EDIT_W = 540; // 편집 캔버스 표시 폭(px) → scale = EDIT_W/SLIDE_W

const MIN_W = 40;
const MIN_H = 24;
const FONT_MIN = 10;
const FONT_MAX = 320;

const STORAGE_PROJECT = "instacmaker:project:v2";
const STORAGE_TEMPLATES = "instacmaker:templates:v2";

/** 뭉이 팔레트 (빠른 색 선택) */
const PALETTE = [
  "#EDE6D4", // cream
  "#F5F1E6", // paper
  "#FFFFFF",
  "#1B1B22", // navy/ink
  "#15151A", // dark box
  "#E8553A", // coral
  "#F4C84A", // yellow(형광펜)
  "#8A8577", // mud gray
];

/** 폰트 — CDN(app/layout.tsx). stack 문자열을 fontFamily 로 그대로 사용 */
const FONTS: { id: string; label: string; stack: string }[] = [
  {
    id: "sans",
    label: "프리텐다드 (산세리프)",
    stack:
      '"Pretendard Variable", Pretendard, system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif',
  },
  { id: "serif", label: "노토 세리프 (세리프)", stack: '"Noto Serif KR", serif' },
  {
    id: "display",
    label: "플레이페어 (이탤릭 세리프)",
    stack: '"Playfair Display", "Noto Serif KR", serif',
  },
  { id: "mono", label: "JetBrains Mono (코드)", stack: '"JetBrains Mono", ui-monospace, monospace' },
  { id: "hand", label: "개구 (손글씨)", stack: '"Gaegu", cursive' },
];
const FONT_SANS = FONTS[0].stack;
const FONT_MONO = FONTS[3].stack;

/* ============================================================
   타입 — 요소(레이어) 모델
   ============================================================ */
type ElKind = "text" | "image" | "shape";
type ShapeKind = "rect" | "roundRect" | "ellipse" | "line";
type Align = "left" | "center" | "right";

type BaseEl = {
  id: string;
  kind: ElKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  locked?: boolean;
};

type TextEl = BaseEl & {
  kind: "text";
  text: string;
  fontFamily: string;
  size: number;
  weight: number;
  italic?: boolean;
  underline?: boolean;
  color: string;
  align: Align;
  lineHeight: number;
  letterSpacing: number;
  highlight?: string; // 형광펜 배경색 (없으면 미적용)
  shadow?: boolean;
};

type ImageEl = BaseEl & {
  kind: "image";
  url: string;
  fit: "cover" | "contain";
  radius: number;
};

type ShapeEl = BaseEl & {
  kind: "shape";
  shape: ShapeKind;
  fill?: string;
  strokeColor?: string;
  strokeWidth?: number;
  radius: number;
};

type AnyEl = TextEl | ImageEl | ShapeEl;

type Background = { color?: string; image?: { url: string; fit: "cover" | "contain"; dim: number; blur?: number } };

type Slide = { id: string; background: Background; elements: AnyEl[] };

type Project = { name: string; slides: Slide[] };

type Template = { id: string; name: string; slide: Slide };

/* ============================================================
   id 생성 (SSR 안전: 클라이언트에서만 추가 생성)
   ============================================================ */
let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

/* ============================================================
   유틸
   ============================================================ */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

async function uploadToDataUrl(file: File): Promise<string> {
  const compressed = await compressImage(file);
  return fileToDataUrl(compressed);
}

/** data URL 이미지의 자연 비율(h/w) */
function imageRatio(url: string): Promise<number> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im.naturalHeight && im.naturalWidth ? im.naturalHeight / im.naturalWidth : 1);
    im.onerror = () => resolve(1);
    im.src = url;
  });
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 폴백 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-10000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

const CAPTURE_OPTS = {
  width: SLIDE_W,
  height: SLIDE_H,
  pixelRatio: 1,
  cacheBust: true,
  backgroundColor: undefined,
} as const;

async function ensureImagesDecoded(node: HTMLElement) {
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      try {
        if (typeof img.decode === "function") await img.decode();
        else if (!img.complete)
          await new Promise<void>((res) => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          });
      } catch {
        /* 디코드 실패는 캡처를 막지 않는다 */
      }
    }),
  );
}

/* ============================================================
   요소 팩토리
   ============================================================ */
function newText(partial?: Partial<TextEl>): TextEl {
  return {
    id: uid("t"),
    kind: "text",
    x: 120,
    y: 220,
    w: 840,
    h: 0,
    text: "텍스트를 입력하세요",
    fontFamily: FONT_SANS,
    size: 72,
    weight: 800,
    italic: false,
    underline: false,
    color: "#1B1B22",
    align: "left",
    lineHeight: 1.18,
    letterSpacing: 0,
    shadow: false,
    ...partial,
  };
}

function newShape(shape: ShapeKind): ShapeEl {
  const base: ShapeEl = {
    id: uid("s"),
    kind: "shape",
    x: 360,
    y: 540,
    w: 360,
    h: 240,
    shape,
    fill: "#15151A",
    radius: shape === "roundRect" ? 36 : 0,
  };
  if (shape === "line") return { ...base, x: 120, y: 540, w: 840, h: 8, fill: "#1B1B22" };
  if (shape === "ellipse") return { ...base, w: 280, h: 280 };
  return base;
}

function newImage(url: string, w: number, h: number): ImageEl {
  return { id: uid("i"), kind: "image", x: Math.round((SLIDE_W - w) / 2), y: 360, w, h, url, fit: "cover", radius: 0 };
}

function cloneEl<T extends AnyEl>(el: T): T {
  return { ...el, id: uid(el.kind[0]) };
}

function cloneSlide(slide: Slide, freshId = true): Slide {
  return {
    id: freshId ? uid("sl") : slide.id,
    background: { ...slide.background, image: slide.background.image ? { ...slide.background.image } : undefined },
    elements: slide.elements.map((e) => ({ ...e })),
  };
}

function emptySlide(): Slide {
  return { id: uid("sl"), background: { color: "#EDE6D4" }, elements: [] };
}

/** 처음 보여줄 데모 슬라이드 (뭉이 톤) */
function makeDefaultProject(): Project {
  const slide: Slide = {
    id: uid("sl"),
    background: { color: "#EDE6D4" },
    elements: [
      newText({
        x: 96,
        y: 110,
        w: 700,
        text: "A DIARY · EP.01",
        size: 30,
        weight: 800,
        color: "#E8553A",
        letterSpacing: 4,
      }),
      newText({
        x: 96,
        y: 360,
        w: 900,
        text: "여기에\n헤드라인을 적어요.",
        size: 110,
        weight: 900,
        color: "#1B1B22",
        lineHeight: 1.08,
      }),
      newText({
        x: 96,
        y: 760,
        w: 880,
        text: "본문 텍스트입니다. 좌측 도구로 텍스트·이미지·도형을 추가하고 자유롭게 배치하세요.",
        size: 36,
        weight: 500,
        color: "#5A554A",
        lineHeight: 1.45,
      }),
      { ...newShape("roundRect"), x: 96, y: 1140, w: 888, h: 120, fill: "#15151A", radius: 28 },
      newText({
        x: 96,
        y: 1175,
        w: 888,
        text: "@moongi_adventures",
        size: 44,
        weight: 800,
        color: "#FFFFFF",
        align: "center",
      }),
    ],
  };
  return { name: "새 캐러셀", slides: [slide] };
}

/* ============================================================
   localStorage 직렬화 (가벼운 검증)
   ============================================================ */
function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_PROJECT);
    if (!raw) return null;
    const p = JSON.parse(raw) as Project;
    if (!p || !Array.isArray(p.slides) || p.slides.length === 0) return null;
    return p;
  } catch {
    return null;
  }
}
function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(STORAGE_TEMPLATES);
    if (!raw) return [];
    const t = JSON.parse(raw) as Template[];
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

/* ============================================================
   메인 컴포넌트
   ============================================================ */
export function InstaCarousel() {
  const [project, setProject] = useState<Project>(makeDefaultProject);
  const [currentId, setCurrentId] = useState<string>(() => project.slides[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [configText, setConfigText] = useState("");
  const [showJson, setShowJson] = useState(false);
  const hydrated = useRef(false);

  /* 마운트 시 localStorage 로드 (SSR 하이드레이션 안전: effect 에서) */
  useEffect(() => {
    const p = loadProject();
    if (p) {
      setProject(p);
      setCurrentId(p.slides[0].id);
    }
    setTemplates(loadTemplates());
    hydrated.current = true;
  }, []);

  /* 자동 저장 (하이드레이션 이후) */
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(STORAGE_PROJECT, JSON.stringify(project));
    } catch {
      /* 용량 초과 등은 무시 */
    }
  }, [project]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(STORAGE_TEMPLATES, JSON.stringify(templates));
    } catch {
      /* noop */
    }
  }, [templates]);

  const current = useMemo(
    () => project.slides.find((s) => s.id === currentId) ?? project.slides[0],
    [project, currentId],
  );
  const selected = useMemo(
    () => current.elements.find((e) => e.id === selectedId) ?? null,
    [current, selectedId],
  );

  /* ---------- 슬라이드 갱신 헬퍼 ---------- */
  const patchSlide = useCallback(
    (slideId: string, updater: (s: Slide) => Slide) => {
      setProject((prev) => ({
        ...prev,
        slides: prev.slides.map((s) => (s.id === slideId ? updater(s) : s)),
      }));
    },
    [],
  );

  const setBackground = useCallback(
    (patch: Partial<Background>) => {
      patchSlide(current.id, (s) => ({ ...s, background: { ...s.background, ...patch } }));
    },
    [current.id, patchSlide],
  );

  /* ---------- 요소 CRUD ---------- */
  const addElement = useCallback(
    (el: AnyEl) => {
      patchSlide(current.id, (s) => ({ ...s, elements: [...s.elements, el] }));
      setSelectedId(el.id);
    },
    [current.id, patchSlide],
  );

  const updateElement = useCallback(
    (id: string, patch: Partial<AnyEl>) => {
      patchSlide(current.id, (s) => ({
        ...s,
        elements: s.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as AnyEl) : e)),
      }));
    },
    [current.id, patchSlide],
  );

  const deleteElement = useCallback(
    (id: string) => {
      patchSlide(current.id, (s) => ({ ...s, elements: s.elements.filter((e) => e.id !== id) }));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [current.id, patchSlide],
  );

  const duplicateElement = useCallback(
    (id: string) => {
      let newId = "";
      patchSlide(current.id, (s) => {
        const src = s.elements.find((e) => e.id === id);
        if (!src) return s;
        const copy = cloneEl(src);
        copy.x = clamp(src.x + 32, -40, SLIDE_W - 40);
        copy.y = clamp(src.y + 32, -40, SLIDE_H - 40);
        newId = copy.id;
        return { ...s, elements: [...s.elements, copy] };
      });
      if (newId) setSelectedId(newId);
    },
    [current.id, patchSlide],
  );

  /** z-order 변경: "front" | "back" | "up" | "down" */
  const reorderElement = useCallback(
    (id: string, dir: "front" | "back" | "up" | "down") => {
      patchSlide(current.id, (s) => {
        const i = s.elements.findIndex((e) => e.id === id);
        if (i < 0) return s;
        const arr = s.elements.slice();
        const [el] = arr.splice(i, 1);
        if (dir === "front") arr.push(el);
        else if (dir === "back") arr.unshift(el);
        else if (dir === "up") arr.splice(Math.min(arr.length, i + 1), 0, el);
        else arr.splice(Math.max(0, i - 1), 0, el);
        return { ...s, elements: arr };
      });
    },
    [current.id, patchSlide],
  );

  /* ---------- 추가 액션 ---------- */
  const onAddText = useCallback(() => addElement(newText()), [addElement]);
  const onAddShape = useCallback((shape: ShapeKind) => addElement(newShape(shape)), [addElement]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const onPickImage = useCallback(() => fileInputRef.current?.click(), []);
  const onImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError("");
      try {
        const url = await uploadToDataUrl(file);
        const r = await imageRatio(url);
        const w = 560;
        addElement(newImage(url, w, Math.round(w * r)));
      } catch {
        setError("이미지를 불러오지 못했어요.");
      }
    },
    [addElement],
  );

  const bgInputRef = useRef<HTMLInputElement>(null);
  const onPickBgImage = useCallback(() => bgInputRef.current?.click(), []);
  const onBgFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const url = await uploadToDataUrl(file);
        setBackground({ image: { url, fit: "cover", dim: 0, blur: 0 } });
      } catch {
        setError("배경 이미지를 불러오지 못했어요.");
      }
    },
    [setBackground],
  );

  /* ---------- 슬라이드 관리 ---------- */
  const addSlide = useCallback(() => {
    const s = emptySlide();
    setProject((prev) => ({ ...prev, slides: [...prev.slides, s] }));
    setCurrentId(s.id);
    setSelectedId(null);
  }, []);

  const duplicateSlide = useCallback(
    (id: string) => {
      setProject((prev) => {
        const i = prev.slides.findIndex((s) => s.id === id);
        if (i < 0) return prev;
        const copy = cloneSlide(prev.slides[i]);
        const slides = prev.slides.slice();
        slides.splice(i + 1, 0, copy);
        return { ...prev, slides };
      });
    },
    [],
  );

  const deleteSlide = useCallback(
    (id: string) => {
      setProject((prev) => {
        if (prev.slides.length <= 1) return prev;
        const slides = prev.slides.filter((s) => s.id !== id);
        if (id === currentId) setCurrentId(slides[0].id);
        return { ...prev, slides };
      });
      setSelectedId(null);
    },
    [currentId],
  );

  const moveSlide = useCallback((id: string, dir: -1 | 1) => {
    setProject((prev) => {
      const i = prev.slides.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.slides.length) return prev;
      const slides = prev.slides.slice();
      [slides[i], slides[j]] = [slides[j], slides[i]];
      return { ...prev, slides };
    });
  }, []);

  /* ---------- 템플릿 ---------- */
  const saveTemplate = useCallback(() => {
    const name = window.prompt("템플릿 이름", `템플릿 ${templates.length + 1}`);
    if (name == null) return;
    const tpl: Template = { id: uid("tpl"), name: name.trim() || `템플릿 ${templates.length + 1}`, slide: cloneSlide(current, false) };
    setTemplates((prev) => [...prev, tpl]);
    setStatus(`템플릿 저장: ${tpl.name}`);
  }, [current, templates.length]);

  const applyTemplate = useCallback((tpl: Template) => {
    const s = cloneSlide(tpl.slide);
    setProject((prev) => ({ ...prev, slides: [...prev.slides, s] }));
    setCurrentId(s.id);
    setSelectedId(null);
    setStatus(`템플릿 적용(새 슬라이드): ${tpl.name}`);
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* ---------- 캡처 / 다운로드 ---------- */
  const slideRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const setRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) slideRefs.current.set(id, el);
      else slideRefs.current.delete(id);
    },
    [],
  );

  const captureNode = useCallback(async (node: HTMLDivElement): Promise<Blob> => {
    await ensureImagesDecoded(node);
    const blob = await toBlob(node, CAPTURE_OPTS);
    if (!blob) throw new Error("이미지 변환 실패 (빈 Blob)");
    return blob;
  }, []);

  const downloadOne = useCallback(
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

  const downloadZip = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("생성 중… (전체 ZIP)");
    try {
      await document.fonts.ready;
      const zip = new JSZip();
      for (let i = 0; i < project.slides.length; i++) {
        const node = slideRefs.current.get(project.slides[i].id);
        if (!node) throw new Error(`슬라이드 ${i + 1} 노드를 찾을 수 없어요.`);
        setStatus(`생성 중… (${pad2(i + 1)}/${project.slides.length})`);
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
  }, [busy, captureNode, project.slides]);

  /* ---------- JSON 내보내기 / 불러오기 ---------- */
  const exportJson = useCallback(async () => {
    const json = JSON.stringify({ version: 2, ...project }, null, 2);
    setConfigText(json);
    setShowJson(true);
    const ok = await copyTextToClipboard(json);
    setStatus(ok ? "구성을 복사했어요" : "아래 텍스트를 직접 복사해 주세요");
  }, [project]);

  const downloadJson = useCallback(() => {
    const json = JSON.stringify({ version: 2, ...project }, null, 2);
    downloadBlob(new Blob([json], { type: "application/json" }), `${project.name || "carousel"}.json`);
  }, [project]);

  const importJson = useCallback(
    (text: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setError("JSON 형식이 올바르지 않아요");
        return;
      }
      const p = parsed as Partial<Project>;
      if (!p || !Array.isArray(p.slides) || p.slides.length === 0) {
        setError("slides 배열이 필요해요");
        return;
      }
      if (!window.confirm("현재 구성을 덮어씁니다. 불러올까요?")) return;
      // id 재발급(충돌 방지) + 최소 보정
      const slides: Slide[] = p.slides.map((s) => ({
        id: uid("sl"),
        background: (s as Slide).background ?? { color: "#EDE6D4" },
        elements: Array.isArray((s as Slide).elements)
          ? (s as Slide).elements.map((e) => ({ ...e, id: uid("el") }) as AnyEl)
          : [],
      }));
      setProject({ name: (p as Project).name || "불러온 캐러셀", slides });
      setCurrentId(slides[0].id);
      setSelectedId(null);
      setError("");
      setStatus(`구성을 불러왔어요 (${slides.length}장)`);
    },
    [],
  );

  /* ---------- 키보드: 선택 요소 삭제 (입력 중엔 무시) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const t = document.activeElement?.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteElement(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteElement]);

  const slideIndex = project.slides.findIndex((s) => s.id === current.id);

  /* ============================================================
     렌더
     ============================================================ */
  return (
    <main className={styles.page}>
      {/* 상단 바 */}
      <header className={styles.topbar}>
        <div className={styles.brand}>instaCmaker</div>
        <input
          className={styles.nameInput}
          value={project.name}
          onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
          aria-label="프로젝트 이름"
        />
        <div className={styles.spacer} />
        <button type="button" className={styles.btn} onClick={() => downloadOne(current.id, slideIndex + 1)} disabled={busy}>
          이 장 PNG ↓
        </button>
        <button type="button" className={styles.btnPrimary} onClick={downloadZip} disabled={busy}>
          전체 ZIP ↓
        </button>
        <button type="button" className={styles.btn} onClick={exportJson}>JSON 내보내기</button>
        <button type="button" className={styles.btn} onClick={downloadJson}>JSON 파일</button>
        <button
          type="button"
          className={styles.btn}
          onClick={() => {
            setShowJson(true);
            setConfigText("");
          }}
        >
          JSON 불러오기
        </button>
      </header>

      {(status || error) && (
        <div className={`${styles.statusbar} ${error ? styles.statusErr : ""}`}>{error || status}</div>
      )}

      <div className={styles.body}>
        {/* 좌측: 슬라이드 목록 */}
        <aside className={styles.left}>
          <div className={styles.panelHead}>슬라이드</div>
          <div className={styles.slideList}>
            {project.slides.map((s, i) => (
              <div
                key={s.id}
                className={`${styles.slideThumb} ${s.id === current.id ? styles.slideThumbActive : ""}`}
                onClick={() => {
                  setCurrentId(s.id);
                  setSelectedId(null);
                }}
              >
                <div className={styles.slideThumbNo}>{i + 1}</div>
                <div className={styles.thumbBox}>
                  <div className={styles.thumbScaler}>
                    <SlideStage slide={s} editable={false} />
                  </div>
                </div>
                <div className={styles.thumbActions}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); moveSlide(s.id, -1); }} title="위로">↑</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); moveSlide(s.id, 1); }} title="아래로">↓</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); duplicateSlide(s.id); }} title="복제">⧉</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); deleteSlide(s.id); }} title="삭제" disabled={project.slides.length <= 1}>✕</button>
                </div>
              </div>
            ))}
            <button type="button" className={styles.addSlide} onClick={addSlide}>+ 슬라이드 추가</button>
          </div>

          <div className={styles.panelHead}>내 템플릿</div>
          <div className={styles.tplList}>
            <button type="button" className={styles.btnWide} onClick={saveTemplate}>현재 슬라이드를 템플릿으로 저장</button>
            {templates.length === 0 && <div className={styles.muted}>저장된 템플릿이 없어요.</div>}
            {templates.map((t) => (
              <div key={t.id} className={styles.tplRow}>
                <button type="button" className={styles.tplApply} onClick={() => applyTemplate(t)} title="새 슬라이드로 추가">{t.name}</button>
                <button type="button" className={styles.tplDel} onClick={() => deleteTemplate(t.id)} title="삭제">✕</button>
              </div>
            ))}
          </div>
        </aside>

        {/* 중앙: 편집 캔버스 */}
        <section className={styles.center}>
          <div className={styles.toolbar}>
            <button type="button" className={styles.tool} onClick={onAddText}>＋ 텍스트</button>
            <button type="button" className={styles.tool} onClick={() => onAddShape("rect")}>▭ 사각</button>
            <button type="button" className={styles.tool} onClick={() => onAddShape("roundRect")}>▢ 라운드</button>
            <button type="button" className={styles.tool} onClick={() => onAddShape("ellipse")}>◯ 원</button>
            <button type="button" className={styles.tool} onClick={() => onAddShape("line")}>― 선</button>
            <button type="button" className={styles.tool} onClick={onPickImage}>🖼 이미지</button>
            <span className={styles.toolSep} />
            <button type="button" className={styles.tool} onClick={onPickBgImage}>배경 이미지</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => { onImageFile(e.target.files?.[0]); e.target.value = ""; }}
            />
            <input
              ref={bgInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => { onBgFile(e.target.files?.[0]); e.target.value = ""; }}
            />
          </div>

          <div className={styles.canvasWrap}>
            <div className={styles.editStage} style={{ width: EDIT_W, height: EDIT_W * (SLIDE_H / SLIDE_W) }}>
              <div
                className={styles.stageScaler}
                style={{ transform: `scale(${EDIT_W / SLIDE_W})` }}
                onPointerDown={(e) => {
                  // 빈 캔버스 클릭 → 선택 해제
                  if (e.target === e.currentTarget) setSelectedId(null);
                }}
              >
                <SlideStage
                  slide={current}
                  editable
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onChangeElement={updateElement}
                  onBackgroundClick={() => setSelectedId(null)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* 우측: 속성 인스펙터 */}
        <aside className={styles.right}>
          {selected ? (
            <Inspector
              el={selected}
              onChange={(patch) => updateElement(selected.id, patch)}
              onDelete={() => deleteElement(selected.id)}
              onDuplicate={() => duplicateElement(selected.id)}
              onReorder={(dir) => reorderElement(selected.id, dir)}
              onReplaceImage={onPickImage}
            />
          ) : (
            <BackgroundInspector
              background={current.background}
              onChange={setBackground}
              onPickImage={onPickBgImage}
            />
          )}
        </aside>
      </div>

      {/* JSON 패널 */}
      {showJson && (
        <div className={styles.jsonPanel}>
          <div className={styles.jsonHead}>
            <span>구성 JSON (붙여넣어 불러오기 / 복사해서 백업)</span>
            <button type="button" onClick={() => setShowJson(false)}>닫기</button>
          </div>
          <textarea
            className={styles.jsonArea}
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            placeholder="여기에 구성 JSON을 붙여넣고 [불러오기]를 누르세요."
            spellCheck={false}
          />
          <div className={styles.jsonActions}>
            <button type="button" className={styles.btnPrimary} onClick={() => importJson(configText)}>불러오기</button>
          </div>
        </div>
      )}

      {/* 캡처 무대 — 화면 밖 1080×1350, editable=false (핸들 미포함) */}
      <div className={styles.captureStage} aria-hidden>
        {project.slides.map((s) => (
          <div key={s.id}>
            <SlideStage slide={s} editable={false} ref={setRef(s.id)} />
          </div>
        ))}
      </div>
    </main>
  );
}

/* ============================================================
   SlideStage — 슬라이드 한 장(배경 + 요소). 미리보기/캡처 공용.
   editable=true 면 선택/드래그/리사이즈, false 면 정적(캡처용).
   ============================================================ */
const SlideStage = forwardRef<
  HTMLDivElement,
  {
    slide: Slide;
    editable: boolean;
    selectedId?: string | null;
    onSelect?: (id: string | null) => void;
    onChangeElement?: (id: string, patch: Partial<AnyEl>) => void;
    onBackgroundClick?: () => void;
  }
>(function SlideStage({ slide, editable, selectedId, onSelect, onChangeElement, onBackgroundClick }, ref) {
  const bg = slide.background;
  return (
    <div
      ref={ref}
      className={styles.slide}
      style={{ background: bg.color ?? "#EDE6D4" }}
      onPointerDown={(e) => {
        if (editable && e.target === e.currentTarget) onBackgroundClick?.();
      }}
    >
      {bg.image ? (
        <div
          className={styles.bgImage}
          style={{
            backgroundImage: `url(${bg.image.url})`,
            backgroundSize: bg.image.fit === "contain" ? "contain" : "cover",
            filter: bg.image.blur ? `blur(${bg.image.blur}px)` : undefined,
            transform: bg.image.blur ? "scale(1.08)" : undefined,
          }}
          aria-hidden
        />
      ) : null}
      {bg.image && bg.image.dim ? (
        <div className={styles.bgDim} style={{ background: `rgba(0,0,0,${bg.image.dim})` }} aria-hidden />
      ) : null}

      {slide.elements.map((el) => (
        <ElementBox
          key={el.id}
          el={el}
          editable={editable}
          selected={editable && el.id === selectedId}
          onSelect={onSelect}
          onChange={onChangeElement ? (patch) => onChangeElement(el.id, patch) : undefined}
        />
      ))}
    </div>
  );
});

/* ============================================================
   ElementBox — 요소 위치/드래그/리사이즈 래퍼 + 내용 렌더
   ============================================================ */
function ElementBox({
  el,
  editable,
  selected,
  onSelect,
  onChange,
}: {
  el: AnyEl;
  editable: boolean;
  selected: boolean;
  onSelect?: (id: string | null) => void;
  onChange?: (patch: Partial<AnyEl>) => void;
}) {
  const gesture = useRef<{
    mode: "move" | "resize";
    scale: number;
    startX: number;
    startY: number;
    ox: number;
    oy: number;
    ow: number;
    oh: number;
  } | null>(null);

  const isText = el.kind === "text";

  const measureScale = useCallback((node: HTMLElement | null): number => {
    const slide = node?.closest(`.${CSS.escape(styles.slide)}`) as HTMLElement | null;
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
        onChange({
          x: Math.round(clamp(g.ox + dx, -g.ow + 40, SLIDE_W - 40)),
          y: Math.round(clamp(g.oy + dy, -g.oh + 24, SLIDE_H - 24)),
        });
      } else if (isText) {
        onChange({ w: Math.round(clamp(g.ow + dx, MIN_W, SLIDE_W)) });
      } else {
        onChange({
          w: Math.round(clamp(g.ow + dx, MIN_W, SLIDE_W * 1.2)),
          h: Math.round(clamp(g.oh + dy, MIN_H, SLIDE_H * 1.2)),
        });
      }
    },
    [onChange, isText],
  );

  const endGesture = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    gesture.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const start = useCallback(
    (mode: "move" | "resize") => (e: ReactPointerEvent<HTMLElement>) => {
      if (!editable) return;
      if (mode === "resize") e.stopPropagation();
      e.preventDefault();
      onSelect?.(el.id);
      if (el.locked || !onChange) return;
      const node = e.currentTarget;
      const rect = node.closest(`.${CSS.escape(styles.elBox)}`)?.getBoundingClientRect();
      const scale = measureScale(node);
      gesture.current = {
        mode,
        scale,
        startX: e.clientX,
        startY: e.clientY,
        ox: el.x,
        oy: el.y,
        ow: el.w || (rect ? rect.width / scale : 200),
        oh: el.h || (rect ? rect.height / scale : 100),
      };
      try {
        node.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [editable, el, measureScale, onChange, onSelect],
  );

  const style: React.CSSProperties = {
    left: el.x,
    top: el.y,
    width: el.w,
    height: isText ? "auto" : el.h,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
  };

  if (!editable) {
    return (
      <div className={styles.elBox} style={style}>
        <ElementContent el={el} />
      </div>
    );
  }

  return (
    <div
      className={`${styles.elBox} ${styles.elEditable} ${selected ? styles.elSelected : ""} ${el.locked ? styles.elLocked : ""}`}
      style={style}
      onPointerDown={start("move")}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <ElementContent el={el} />
      {selected && !el.locked && (
        <span
          className={styles.handle}
          aria-hidden
          onPointerDown={start("resize")}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        />
      )}
    </div>
  );
}

/* ============================================================
   ElementContent — 요소 종류별 순수 렌더 (캡처/미리보기 동일)
   ============================================================ */
function ElementContent({ el }: { el: AnyEl }) {
  if (el.kind === "text") {
    const t = el;
    const textStyle: React.CSSProperties = {
      fontFamily: t.fontFamily,
      fontSize: t.size,
      fontWeight: t.weight,
      fontStyle: t.italic ? "italic" : "normal",
      textDecoration: t.underline ? "underline" : "none",
      color: t.color,
      textAlign: t.align,
      lineHeight: t.lineHeight,
      letterSpacing: t.letterSpacing,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      textShadow: t.shadow ? "0 2px 8px rgba(0,0,0,0.45)" : undefined,
      width: "100%",
    };
    if (t.highlight) {
      return (
        <div style={{ ...textStyle, textShadow: textStyle.textShadow }}>
          <span
            style={{
              background: t.highlight,
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
              padding: "0.04em 0.12em",
            }}
          >
            {t.text}
          </span>
        </div>
      );
    }
    return <div style={textStyle}>{t.text}</div>;
  }

  if (el.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={el.url}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: el.fit,
          borderRadius: el.radius,
          display: "block",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    );
  }

  // shape
  const s = el;
  const shapeStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    background: s.fill ?? "transparent",
    border: s.strokeColor && s.strokeWidth ? `${s.strokeWidth}px solid ${s.strokeColor}` : undefined,
    borderRadius: s.shape === "ellipse" ? "50%" : s.shape === "roundRect" ? s.radius : 0,
    boxSizing: "border-box",
  };
  return <div style={shapeStyle} />;
}

/* ============================================================
   Inspector — 선택 요소 속성 패널
   ============================================================ */
function Inspector({
  el,
  onChange,
  onDelete,
  onDuplicate,
  onReorder,
  onReplaceImage,
}: {
  el: AnyEl;
  onChange: (patch: Partial<AnyEl>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReorder: (dir: "front" | "back" | "up" | "down") => void;
  onReplaceImage: () => void;
}) {
  return (
    <div className={styles.inspector}>
      <div className={styles.panelHead}>
        {el.kind === "text" ? "텍스트" : el.kind === "image" ? "이미지" : "도형"} 속성
      </div>

      {/* 공통: 레이어 / 액션 */}
      <div className={styles.row}>
        <button type="button" className={styles.miniBtn} onClick={() => onReorder("front")}>맨 앞</button>
        <button type="button" className={styles.miniBtn} onClick={() => onReorder("up")}>앞으로</button>
        <button type="button" className={styles.miniBtn} onClick={() => onReorder("down")}>뒤로</button>
        <button type="button" className={styles.miniBtn} onClick={() => onReorder("back")}>맨 뒤</button>
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.miniBtn} onClick={onDuplicate}>복제</button>
        <button type="button" className={styles.miniBtn} onClick={() => onChange({ locked: !el.locked })}>
          {el.locked ? "잠금 해제" : "잠금"}
        </button>
        <button type="button" className={styles.miniBtnDanger} onClick={onDelete}>삭제</button>
      </div>

      {/* 위치/크기 */}
      <div className={styles.fieldGrid}>
        <NumField label="X" value={el.x} onChange={(v) => onChange({ x: v })} />
        <NumField label="Y" value={el.y} onChange={(v) => onChange({ y: v })} />
        <NumField label="W" value={el.w} onChange={(v) => onChange({ w: Math.max(MIN_W, v) })} />
        {el.kind !== "text" && (
          <NumField label="H" value={el.h} onChange={(v) => onChange({ h: Math.max(MIN_H, v) })} />
        )}
        <NumField label="회전" value={el.rotation ?? 0} onChange={(v) => onChange({ rotation: v })} />
      </div>

      {el.kind === "text" && <TextInspector el={el} onChange={onChange} />}
      {el.kind === "image" && <ImageInspector el={el} onChange={onChange} onReplace={onReplaceImage} />}
      {el.kind === "shape" && <ShapeInspector el={el} onChange={onChange} />}
    </div>
  );
}

function TextInspector({ el, onChange }: { el: TextEl; onChange: (p: Partial<TextEl>) => void }) {
  return (
    <>
      <label className={styles.fieldLabel}>내용</label>
      <textarea
        className={styles.textArea}
        value={el.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={3}
      />

      <label className={styles.fieldLabel}>폰트</label>
      <select className={styles.select} value={el.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })}>
        {FONTS.map((f) => (
          <option key={f.id} value={f.stack}>{f.label}</option>
        ))}
      </select>

      <div className={styles.fieldGrid}>
        <NumField label="크기" value={el.size} onChange={(v) => onChange({ size: clamp(v, FONT_MIN, FONT_MAX) })} />
        <NumField label="굵기" value={el.weight} step={100} onChange={(v) => onChange({ weight: clamp(v, 100, 900) })} />
        <NumField label="행간" value={el.lineHeight} step={0.05} onChange={(v) => onChange({ lineHeight: clamp(v, 0.8, 3) })} />
        <NumField label="자간" value={el.letterSpacing} step={0.5} onChange={(v) => onChange({ letterSpacing: v })} />
      </div>

      <div className={styles.row}>
        {(["left", "center", "right"] as Align[]).map((a) => (
          <button
            key={a}
            type="button"
            className={`${styles.miniBtn} ${el.align === a ? styles.miniBtnOn : ""}`}
            onClick={() => onChange({ align: a })}
          >
            {a === "left" ? "좌" : a === "center" ? "중" : "우"}
          </button>
        ))}
        <button type="button" className={`${styles.miniBtn} ${el.italic ? styles.miniBtnOn : ""}`} onClick={() => onChange({ italic: !el.italic })}>이탤릭</button>
        <button type="button" className={`${styles.miniBtn} ${el.underline ? styles.miniBtnOn : ""}`} onClick={() => onChange({ underline: !el.underline })}>밑줄</button>
        <button type="button" className={`${styles.miniBtn} ${el.shadow ? styles.miniBtnOn : ""}`} onClick={() => onChange({ shadow: !el.shadow })}>그림자</button>
      </div>

      <ColorField label="글자색" value={el.color} onChange={(v) => onChange({ color: v })} />

      <div className={styles.row}>
        <button
          type="button"
          className={`${styles.miniBtn} ${el.highlight ? styles.miniBtnOn : ""}`}
          onClick={() => onChange({ highlight: el.highlight ? undefined : "#F4C84A" })}
        >
          형광펜
        </button>
        {el.highlight && (
          <ColorField label="" value={el.highlight} onChange={(v) => onChange({ highlight: v })} inline />
        )}
      </div>
    </>
  );
}

function ImageInspector({ el, onChange, onReplace }: { el: ImageEl; onChange: (p: Partial<ImageEl>) => void; onReplace: () => void }) {
  return (
    <>
      <div className={styles.row}>
        <button type="button" className={styles.miniBtn} onClick={onReplace}>이미지 교체</button>
        <button
          type="button"
          className={`${styles.miniBtn} ${el.fit === "cover" ? styles.miniBtnOn : ""}`}
          onClick={() => onChange({ fit: "cover" })}
        >
          꽉 채움
        </button>
        <button
          type="button"
          className={`${styles.miniBtn} ${el.fit === "contain" ? styles.miniBtnOn : ""}`}
          onClick={() => onChange({ fit: "contain" })}
        >
          맞춤
        </button>
      </div>
      <NumField label="모서리 둥글기" value={el.radius} onChange={(v) => onChange({ radius: Math.max(0, v) })} />
    </>
  );
}

function ShapeInspector({ el, onChange }: { el: ShapeEl; onChange: (p: Partial<ShapeEl>) => void }) {
  return (
    <>
      <label className={styles.fieldLabel}>모양</label>
      <select className={styles.select} value={el.shape} onChange={(e) => onChange({ shape: e.target.value as ShapeKind })}>
        <option value="rect">사각형</option>
        <option value="roundRect">라운드 사각형</option>
        <option value="ellipse">원/타원</option>
        <option value="line">선</option>
      </select>
      <ColorField label="채움색" value={el.fill ?? "#15151A"} onChange={(v) => onChange({ fill: v })} />
      {el.shape === "roundRect" && (
        <NumField label="모서리 둥글기" value={el.radius} onChange={(v) => onChange({ radius: Math.max(0, v) })} />
      )}
      <div className={styles.fieldGrid}>
        <ColorField label="테두리색" value={el.strokeColor ?? "#1B1B22"} onChange={(v) => onChange({ strokeColor: v })} />
        <NumField label="테두리 두께" value={el.strokeWidth ?? 0} onChange={(v) => onChange({ strokeWidth: Math.max(0, v) })} />
      </div>
    </>
  );
}

/* ============================================================
   BackgroundInspector — 선택 없을 때(슬라이드 배경)
   ============================================================ */
function BackgroundInspector({
  background,
  onChange,
  onPickImage,
}: {
  background: Background;
  onChange: (p: Partial<Background>) => void;
  onPickImage: () => void;
}) {
  return (
    <div className={styles.inspector}>
      <div className={styles.panelHead}>슬라이드 배경</div>
      <div className={styles.muted}>요소를 선택하면 그 요소 속성이 보여요.</div>

      <label className={styles.fieldLabel}>배경색</label>
      <ColorField label="" value={background.color ?? "#EDE6D4"} onChange={(v) => onChange({ color: v })} inline />
      <div className={styles.swatches}>
        {PALETTE.map((c) => (
          <button key={c} type="button" className={styles.swatch} style={{ background: c }} onClick={() => onChange({ color: c })} aria-label={c} />
        ))}
      </div>

      <label className={styles.fieldLabel}>배경 이미지</label>
      <div className={styles.row}>
        <button type="button" className={styles.miniBtn} onClick={onPickImage}>이미지 선택</button>
        {background.image && (
          <button type="button" className={styles.miniBtnDanger} onClick={() => onChange({ image: undefined })}>제거</button>
        )}
      </div>
      {background.image && (
        <>
          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.miniBtn} ${background.image.fit === "cover" ? styles.miniBtnOn : ""}`}
              onClick={() => onChange({ image: { ...background.image!, fit: "cover" } })}
            >
              꽉 채움
            </button>
            <button
              type="button"
              className={`${styles.miniBtn} ${background.image.fit === "contain" ? styles.miniBtnOn : ""}`}
              onClick={() => onChange({ image: { ...background.image!, fit: "contain" } })}
            >
              맞춤
            </button>
          </div>
          <RangeField label="어둡게" value={background.image.dim} min={0} max={0.8} step={0.05} onChange={(v) => onChange({ image: { ...background.image!, dim: v } })} />
          <RangeField label="흐리게" value={background.image.blur ?? 0} min={0} max={40} step={1} onChange={(v) => onChange({ image: { ...background.image!, blur: v } })} />
        </>
      )}
    </div>
  );
}

/* ============================================================
   작은 입력 컴포넌트
   ============================================================ */
function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className={styles.numField}>
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}

function ColorField({ label, value, onChange, inline }: { label: string; value: string; onChange: (v: string) => void; inline?: boolean }) {
  return (
    <label className={inline ? styles.colorInline : styles.colorField}>
      {label && <span>{label}</span>}
      <span className={styles.colorRow}>
        <input type="color" value={normalizeHex(value)} onChange={(e) => onChange(e.target.value)} />
        <input className={styles.hexInput} type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}

function RangeField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className={styles.rangeField}>
      <span>{label} <b>{value}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

function normalizeHex(hex: string): string {
  const h = (hex || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h;
  if (/^#[0-9a-fA-F]{3}$/.test(h)) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return "#000000";
}

// FONT_MONO 는 향후 코드 박스 프리셋에서 사용 (현재 폰트 목록에 포함)
void FONT_MONO;
