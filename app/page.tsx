import { redirect } from "next/navigation";

// The root path is not a landing page — Hoshi's home is the marketplace.
// Send every visitor straight there (the old devnet POC demo lived here).
export default function Home() {
  redirect("/marketplace");
}
