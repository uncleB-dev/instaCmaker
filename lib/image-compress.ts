"use client";

/**
 * 업로드 전 클라이언트 이미지 압축 — 캡처 PNG 용량/메모리 절감.
 *
 * - 긴 변 최대 2000px 리사이즈
 * - WebP 품질 0.85 인코딩 (PNG 대비 통상 50~70% 절감)
 * - 안전 폴백: GIF(애니메이션)/비이미지는 원본 유지, 인코딩 실패 시 원본 유지,
 *   압축 결과가 원본보다 크면(이미 최적화된 JPEG 등) 원본 유지
 */

const MAX_DIM = 2000;
const WEBP_QUALITY = 0.85;
const COMPRESSIBLE = ["image/jpeg", "image/png", "image/webp"];

export async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.includes(file.type)) return file; // gif(애니메이션)·비이미지는 원본
  try {
    const bitmap = await createImageBitmap(file);
    const { width: w, height: h } = bitmap;
    if (w <= 0 || h <= 0) {
      bitmap.close();
      return file;
    }

    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    const dw = Math.max(1, Math.round(w * scale));
    const dh = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, dw, dh);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
    );
    // 인코딩 실패(미지원 브라우저는 png 등으로 떨어짐) 또는 원본이 더 작으면 원본 유지.
    // (단, 리사이즈가 일어난 경우엔 픽셀 수가 줄었으므로 결과를 사용)
    if (!blob || blob.type !== "image/webp") return file;
    if (scale >= 1 && blob.size >= file.size) return file;

    const name = file.name.replace(/\.[a-z0-9]+$/i, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file; // 어떤 실패든 업로드 자체는 막지 않는다
  }
}
