import type { Inventory } from "./inventory";
import { resolveToken } from "./inventory";
import { fingerprintForTarget } from "./fingerprints";
import type { ApplyFailure, ApplyResult, Finding, Suggestion } from "../shared/types";

const loadedFonts = new Set<string>();

function selectedSuggestion(finding: Finding, suggestionId?: string): Suggestion | undefined {
  return finding.suggestions.find((suggestion) => suggestion.id === suggestionId) ?? finding.suggestions[0];
}

async function resolveStyle(suggestion: Suggestion): Promise<TextStyle | null> {
  if (!suggestion.id.startsWith("style:")) return null;
  const styleId = suggestion.id.slice("style:".length);
  return figma.getStyleByIdAsync(styleId) as Promise<TextStyle | null>;
}

async function applyFinding(finding: Finding, suggestionId: string | undefined, inventory: Inventory): Promise<void> {
  const node = await figma.getNodeByIdAsync(finding.nodeId);
  if (!node || node.type === "DOCUMENT" || node.type === "PAGE") throw new Error("Layer no longer exists.");
  if (node.type !== finding.nodeType) throw new Error("Layer type changed.");
  if (fingerprintForTarget(node as SceneNode, finding.target) !== finding.fingerprint) throw new Error("The layer changed since the scan. Re-run the check.");
  const suggestion = selectedSuggestion(finding, suggestionId);
  if (!suggestion?.canApply) throw new Error(suggestion?.unavailableReason ?? "No safe fix is available.");
  if (finding.target.kind === "paint") {
    const target = finding.target;
    const variable = await resolveToken(inventory.tokenByKey.get(suggestion.tokenKey ?? "") ?? { name: suggestion.tokenName, key: suggestion.tokenKey, source: suggestion.source === "style" ? "local" : suggestion.source, resolvedType: suggestion.resolvedType, collectionName: "", imported: false, boundCount: 0, semantic: true, primitive: false });
    if (!variable || variable.resolvedType !== "COLOR") throw new Error("The selected token could not be resolved as a color variable.");
    if (node.type === "TEXT" && target.range) {
      const range = target.range;
      const rangeNode = node as TextNode;
      const setRangeBoundVariable = (rangeNode as unknown as { setRangeBoundVariable?: (start: number, end: number, field: string, variable: Variable) => void }).setRangeBoundVariable;
      if (!setRangeBoundVariable) throw new Error("This Figma version cannot bind a text range color variable.");
      setRangeBoundVariable.call(rangeNode, range.start, range.end, "fills", variable);
    } else {
      const paints = (node as unknown as Record<string, readonly Paint[]>)[target.field];
      if (!paints || !paints[target.paintIndex]) throw new Error("Paint no longer exists.");
      const currentPaint = paints[target.paintIndex];
      if (currentPaint.type !== "SOLID") throw new Error("Only solid paints can be bound automatically.");
      const nextPaints = paints.map((paint, index) => index === target.paintIndex && paint.type === "SOLID" ? figma.variables.setBoundVariableForPaint(paint, "color", variable) : paint);
      (node as unknown as Record<string, readonly Paint[]>)[target.field] = nextPaints;
    }
    return;
  }
  if (finding.target.kind === "dimension") {
    const variable = await resolveToken(inventory.tokenByKey.get(suggestion.tokenKey ?? "") ?? { name: suggestion.tokenName, key: suggestion.tokenKey, source: suggestion.source === "style" ? "local" : suggestion.source, resolvedType: suggestion.resolvedType, collectionName: "", imported: false, boundCount: 0, semantic: true, primitive: false });
    if (!variable || variable.resolvedType !== "FLOAT") throw new Error("The selected token could not be resolved as a numeric variable.");
    const setBoundVariable = (node as unknown as { setBoundVariable?: (field: string, variable: Variable) => void }).setBoundVariable;
    if (!setBoundVariable) throw new Error("This Figma version cannot bind numeric properties.");
    setBoundVariable.call(node, finding.target.field, variable);
    return;
  }
  if (finding.target.kind === "text-style") {
    if (node.type !== "TEXT") throw new Error("Layer is no longer a text node.");
    if (node.hasMissingFont) throw new Error("The text node has a missing font.");
    const style = await resolveStyle(suggestion);
    if (!style) throw new Error("The selected text style could not be resolved.");
    const fontKey = `${style.fontName.family}:${style.fontName.style}`;
    if (!loadedFonts.has(fontKey)) {
      await figma.loadFontAsync(style.fontName);
      loadedFonts.add(fontKey);
    }
    if (finding.target.range) await node.setRangeTextStyleIdAsync(finding.target.range.start, finding.target.range.end, style.id);
    else await node.setTextStyleIdAsync(style.id);
    return;
  }
  throw new Error("This finding requires manual review.");
}

export async function applyFindings(findings: Finding[], suggestionIds: Record<string, string | undefined>, inventory: Inventory): Promise<ApplyResult> {
  let applied = 0;
  let skipped = 0;
  const failures: ApplyFailure[] = [];
  for (const finding of findings) {
    if (!finding.canApply || finding.status === "match" || finding.status === "unsupported" || finding.status === "manual-review") {
      skipped += 1;
      continue;
    }
    try {
      await applyFinding(finding, suggestionIds[finding.id], inventory);
      applied += 1;
    } catch (error) {
      failures.push({ findingId: finding.id, nodeId: finding.nodeId, nodeName: finding.nodeName, reason: error instanceof Error ? error.message : "Unknown apply error" });
    }
  }
  if (applied > 0) figma.commitUndo();
  return { applied, skipped, failures, refreshed: false };
}
