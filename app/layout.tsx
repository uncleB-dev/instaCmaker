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
        {/* Pretendard (가변 폰트) — 슬라이드/관리 크롬 공용 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
