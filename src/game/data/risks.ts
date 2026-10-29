// Uptime risk definitions. {downtime} is replaced with the threatened uptime loss.

import type { RiskKind } from "../types";

export interface RiskDef {
  kind: RiskKind;
  title: string;
  message: string;
}

export const RISKS: readonly RiskDef[] = [
  {
    kind: "gpuMeltdown",
    title: "GPU cluster meltdown",
    message: "Your GPU cluster is overheating! {downtime}% uptime is about to go up in smoke.",
  },
  {
    kind: "ransomware",
    title: "Ransomware attack",
    message: "Ransomware is encrypting your inference servers! You could lose {downtime}% uptime.",
  },
  {
    kind: "trafficSurge",
    title: "Viral launch traffic surge",
    message: "Your launch went viral and the servers are buckling! {downtime}% uptime is at risk.",
  },
];

export function getRisk(kind: RiskKind): RiskDef {
  const risk = RISKS.find((r) => r.kind === kind);
  if (!risk) {
    throw new Error(`Unknown risk kind: ${kind}`);
  }
  return risk;
}
