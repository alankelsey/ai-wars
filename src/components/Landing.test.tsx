import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Landing } from "./Landing";
import { MOCKS } from "@/site/mocks";

describe("Landing", () => {
  it("has the title and intro", () => {
    render(<Landing />);
    expect(screen.getByRole("heading", { level: 1, name: "AI WARS!" })).toBeTruthy();
    expect(screen.getByText(
      "Prototype games about the AI chip gold rush. Pick a mock to play — each one tests a different idea.",
    )).toBeTruthy();
  });

  it("lists every mock with title, status, pitch and a play link", () => {
    render(<Landing />);
    const items = within(screen.getByRole("list", { name: "Mocks" })).getAllByRole("listitem");
    expect(items).toHaveLength(MOCKS.length);
    MOCKS.forEach((mock, i) => {
      const item = within(items[i]);
      expect(item.getByRole("heading", { level: 2, name: mock.title })).toBeTruthy();
      expect(item.getByText(mock.status)).toBeTruthy();
      expect(item.getByText(mock.pitch)).toBeTruthy();
      // Vitest doesn't load next.config (trailingSlash), so next/link may drop the slash here; the build keeps it.
      const href = item.getByRole("link", { name: `Play ${mock.title}` }).getAttribute("href") ?? "";
      expect(href.replace(/\/$/, "")).toBe(mock.href.replace(/\/$/, ""));
    });
  });
});

describe("MOCKS", () => {
  it("starts with the classic game at /classic/", () => {
    expect(MOCKS[0]).toMatchObject({ id: "classic", href: "/classic/" });
  });

  it("has unique ids and trailing-slash routes", () => {
    expect(new Set(MOCKS.map((m) => m.id)).size).toBe(MOCKS.length);
    for (const m of MOCKS) expect(m.href).toMatch(/^\/[a-z0-9-]+\/$/);
  });
});
