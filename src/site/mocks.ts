// Mock definitions: prototype game metadata and routes for the landing page.
export type MockStatus = "live" | "testing" | "retired";

export interface MockDef {
  id: string;
  title: string;
  pitch: string; // one or two sentences
  status: MockStatus;
  href: string; // app route with trailing slash, e.g. "/classic/" (basePath is added by next/link)
}

export const MOCKS: readonly MockDef[] = [
  {
    id: "classic",
    title: "AI WARS! Classic",
    pitch: "Buy and sell AI chips across six cities in 30 days. Dodge outages, fines and missing pallets, then cash out before the IPO.",
    status: "testing",
    href: "/classic/",
  },
];
