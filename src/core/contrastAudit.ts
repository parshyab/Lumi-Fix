import { fingerprintForTarget } from "./fingerprints";
import { composite, contrastRatio, paintColor, solidPaint } from "./colorUtils";
import { makeFinding } from "./auditHelpers";
import type { Finding, SerializableColor, Settings } from "../shared/types";

function firstSolidPaint(node: BaseNode & Partial<{ fills: readonly Paint[] | PluginAPI["mixed"] }>): SerializableColor | undefined {
  if (!node.fills || node.fills === figma.mixed || !Array.isArray(node.fills)) return undefined;
  const paint = node.fills.map(solidPaint).find(Boolean);
  return paint ? paintColor(paint) : undefined;
}

function backgroundFor(node: TextNode): { color?: SerializableColor; ambiguous: boolean } {
  let parent = node.parent;
  while (parent && parent.type !== "PAGE" && parent.type !== "DOCUMENT") {
    if ("fills" in parent) {
      if (parent.fills === figma.mixed) return { ambiguous: true };
      if (Array.isArray(parent.fills)) {
        const hasUnsupported = parent.fills.some((paint) => paint.type !== "SOLID");
        const color = firstSolidPaint(parent as BaseNode & { fills: readonly Paint[] });
        if (color) return { color, ambiguous: hasUnsupported };
        if (hasUnsupported) return { ambiguous: true };
      }
    }
    parent = parent.parent;
  }
  return { ambiguous: false };
}

export function auditContrast(node: TextNode, settings: Settings): Finding | undefined {
  const foreground = firstSolidPaint(node);
  const background = backgroundFor(node);
  const target = { kind: "contrast" } as const;
  const fingerprint = fingerprintForTarget(node, target);
  const required = settings.contrastLevel === "AAA" ? 7 : 4.5;
  if (!foreground || !background.color || background.ambiguous) {
    return makeFinding({ nodeId: node.id, nodeName: node.name, nodeType: node.type, category: "colors", property: "Contrast", target, currentValue: null, currentDisplayValue: "Contrast unavailable", status: "manual-review", suggestions: [], canApply: false, reason: "Contrast could not be determined automatically.", fingerprint });
  }
  const ratio = contrastRatio(composite(foreground, background.color), background.color);
  const pass = ratio >= required;
  return makeFinding({ nodeId: node.id, nodeName: node.name, nodeType: node.type, category: "colors", property: "Contrast", target, currentValue: { foreground, background: background.color, ratio, required }, currentDisplayValue: `${ratio.toFixed(2)}:1 · ${pass ? "Pass" : "Fail"}`, status: pass ? "match" : "violation", suggestions: [], canApply: false, reason: pass ? undefined : `Requires at least ${required}:1 for ${settings.contrastLevel}.`, fingerprint });
}
