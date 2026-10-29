import type { Metadata } from "next";
import { AiWars } from "@/components/AiWars";

export const metadata: Metadata = { title: "AI WARS! Classic" };

export default function ClassicPage() {
  return <AiWars />;
}
