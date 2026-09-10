import type { FindingTarget } from "../shared/types";

function normalize(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value;
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function fingerprintParts(parts: unknown[]): string {
  return stableSerialize(parts);
}

export function fingerprintForTarget(node: SceneNode, target: FindingTarget): string {
  if (target.kind === "paint") {
    const paints = (node as unknown as Record<string, unknown>)[target.field] as readonly Paint[] | undefined;
    const paint = Array.isArray(paints) ? paints[target.paintIndex] : undefined;
    return fingerprintParts([node.id, target, paint]);
  }
  if (target.kind === "dimension") {
    const value = (node as unknown as Record<string, unknown>)[target.field];
    return fingerprintParts([node.id, target, value]);
  }
  if (target.kind === "text-style" && node.type === "TEXT") {
    const range = target.range;
    const segments = node.getStyledTextSegments(["fontName", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textStyleId", "boundVariables"]);
    const scoped = range ? segments.filter((segment) => segment.start < range.end && segment.end > range.start) : segments;
    return fingerprintParts([node.id, target, node.characters, scoped]);
  }
  if (target.kind === "component" && node.type === "INSTANCE") {
    return fingerprintParts([node.id, target, node.name]);
  }
  return fingerprintParts([node.id, target]);
}
