import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "인스타 캐러셀 메이커",
  description:
    "템플릿으로 인스타 캐러셀을 구성하고 1080×1350 PNG로 내보내는 클라이언트 전용 스튜디오.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard (가변 폰트) — 기본 산세리프 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        {/* 캔버스 폰트 — 세리프 / 이탤릭 세리프 / 모노 / 손글씨 (Google Fonts) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;900&family=Playfair+Display:ital,wght@0,600;0,800;1,600;1,800&family=JetBrains+Mono:wght@400;700&family=Gaegu:wght@400;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
