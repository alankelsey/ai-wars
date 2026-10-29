// Root layout: HTML wrapper and metadata for AI WARS!.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI WARS!",
  description: "Trade AI chips across the world before your IPO.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
