import { approvedComponents } from "../config/lumi";
import { fingerprintForTarget } from "./fingerprints";
import { matchFinding, violationFinding } from "./auditHelpers";
import type { Finding, Settings, Suggestion } from "../shared/types";
import type { Inventory } from "./inventory";

function approvedSuggestion(name: string, key: string): Suggestion {
  return {
    id: `component:${key}`,
    tokenName: name,
    tokenKey: key,
    source: "style",
    resolvedType: "COMPONENT",
    score: 0,
    confidence: "low",
    matchType: "manual",
    rationale: "Replace manually with the approved LUMI component",
    canApply: false,
  };
}

export async function auditComponent(node: InstanceNode, _inventory: Inventory, _settings: Settings): Promise<Finding | undefined> {
  const target = { kind: "component" } as const;
  const fingerprint = fingerprintForTarget(node, target);
  const main = await node.getMainComponentAsync().catch(() => null);
  const componentKey = main?.key;
  if (!main || !componentKey) {
    return violationFinding({
      node,
      category: "components",
      property: "Component source",
      target,
      currentValue: null,
      currentDisplayValue: "Missing main component",
      fingerprint,
      suggestions: [],
      reason: "This instance's main component could not be verified.",
      status: "manual-review",
    });
  }
  const approved = approvedComponents.find((component) => component.key === componentKey);
  if (approved) {
    return matchFinding({ node, category: "components", property: "Component source", target, currentValue: { key: componentKey, name: main.name }, currentDisplayValue: approved.name, fingerprint });
  }
  const detached = Boolean((node as unknown as { detachedInfo?: unknown }).detachedInfo) || !main.remote;
  return violationFinding({
    node,
    category: "components",
    property: "Component source",
    target,
    currentValue: { key: componentKey, name: main.name, remote: main.remote },
    currentDisplayValue: detached ? "Detached / unapproved component" : main.name,
    fingerprint,
    suggestions: main.remote ? [approvedSuggestion("Approved LUMI component", componentKey)] : [],
    reason: detached ? "Detached from a library component. Replace manually with the approved LUMI component." : "This component source is not in the configured LUMI allowlist.",
    status: "manual-review",
  });
}
