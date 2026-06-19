import { redirect } from "next/navigation";

/** 루트는 스튜디오(/insta)로 보낸다. */
export default function Home() {
  redirect("/insta");
}
