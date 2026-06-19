import { InstaCarousel } from "./InstaCarousel";

/**
 * /insta — 인스타 캐러셀 스튜디오 (독립 실행형, 로그인 없음).
 *
 * 클라이언트 전용 도구 — 입력값은 브라우저 밖으로 나가지 않는다.
 * 검색 색인 비노출(noindex). 외부 공개가 필요하면 배포 단계에서
 * (예: Vercel 비밀번호 보호) 접근을 제한하세요.
 */
export const metadata = {
  robots: { index: false, follow: false },
};

export default function InstaPage() {
  return <InstaCarousel />;
}
