import type { Finding, FindingTarget, Suggestion } from "../shared/types";

export function makeFinding(input: Omit<Finding, "id">): Finding {
  return { ...input, id: `finding:${input.nodeId}:${input.target.kind}:${input.property}:${input.range?.start ?? ""}` };
}

export function matchFinding(input: {
  node: SceneNode;
  category: Finding["category"];
  property: string;
  target: FindingTarget;
  currentValue: unknown;
  currentDisplayValue: string;
  fingerprint: string;
  currentVariableName?: string;
  currentStyleName?: string;
}): Finding {
  return makeFinding({
    nodeId: input.node.id,
    nodeName: input.node.name,
    nodeType: input.node.type,
    category: input.category,
    property: input.property,
    currentValue: input.currentValue,
    currentDisplayValue: input.currentDisplayValue,
    currentVariableName: input.currentVariableName,
    currentStyleName: input.currentStyleName,
    status: "match",
    suggestions: [],
    canApply: false,
    fingerprint: input.fingerprint,
    target: input.target,
  });
}

export function unsupportedFinding(input: {
  node: SceneNode;
  category: Finding["category"];
  property: string;
  target: FindingTarget;
  currentValue: unknown;
  currentDisplayValue: string;
  fingerprint: string;
  reason: string;
}): Finding {
  return makeFinding({
    nodeId: input.node.id,
    nodeName: input.node.name,
    nodeType: input.node.type,
    category: input.category,
    property: input.property,
    currentValue: input.currentValue,
    currentDisplayValue: input.currentDisplayValue,
    status: "unsupported",
    suggestions: [],
    canApply: false,
    reason: input.reason,
    fingerprint: input.fingerprint,
    target: input.target,
  });
}

export function violationFinding(input: {
  node: SceneNode;
  category: Finding["category"];
  property: string;
  target: FindingTarget;
  currentValue: unknown;
  currentDisplayValue: string;
  fingerprint: string;
  suggestions: Suggestion[];
  currentVariableName?: string;
  currentStyleName?: string;
  reason?: string;
  status?: Finding["status"];
}): Finding {
  return makeFinding({
    nodeId: input.node.id,
    nodeName: input.node.name,
    nodeType: input.node.type,
    category: input.category,
    property: input.property,
    currentValue: input.currentValue,
    currentDisplayValue: input.currentDisplayValue,
    currentVariableName: input.currentVariableName,
    currentStyleName: input.currentStyleName,
    status: input.status ?? "violation",
    suggestions: input.suggestions,
    canApply: input.suggestions.some((suggestion) => suggestion.canApply),
    reason: input.reason,
    fingerprint: input.fingerprint,
    target: input.target,
  });
}

export function isVisible(node: BaseNode, includeHidden: boolean): boolean {
  return includeHidden || !("visible" in node) || node.visible;
}
