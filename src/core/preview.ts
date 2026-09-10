import { resolveToken, type Inventory } from "./inventory";
import { fingerprintForTarget } from "./fingerprints";
import type { Finding, Suggestion } from "../shared/types";

type Restore = () => void | Promise<void>;

let restore: Restore | undefined;
let activeFingerprint: string | undefined;

function suggestionFor(finding: Finding, suggestionId: string): Suggestion | undefined {
  return finding.suggestions.find((suggestion) => suggestion.id === suggestionId);
}

export async function clearPreview(): Promise<void> {
  try { await restore?.(); } finally { restore = undefined; activeFingerprint = undefined; }
}

export async function previewSuggestion(finding: Finding, suggestionId: string, inventory: Inventory): Promise<boolean> {
  await clearPreview();
  const suggestion = suggestionFor(finding, suggestionId);
  if (!suggestion || (!suggestion.tokenId && !suggestion.tokenKey) || !suggestion.canApply) return false;
  const node = await figma.getNodeByIdAsync(finding.nodeId);
  if (!node || node.type === "DOCUMENT" || node.type === "PAGE" || node.type !== finding.nodeType) return false;
  if (fingerprintForTarget(node as SceneNode, finding.target) !== finding.fingerprint) return false;
  const registryEntry = suggestion.tokenId
    ? inventory.tokenById.get(suggestion.tokenId)
    : suggestion.tokenKey
      ? inventory.tokenByKey.get(suggestion.tokenKey)
      : undefined;
  const variable = await resolveToken(registryEntry ?? { name: suggestion.tokenName, id: suggestion.tokenId, key: suggestion.tokenKey, source: suggestion.source === "lumi-library" ? "lumi-library" : "local", resolvedType: suggestion.resolvedType, collectionName: "", imported: Boolean(suggestion.tokenId), boundCount: 0, semantic: true, primitive: false });
  if (!variable) return false;
  if (finding.target.kind === "paint") {
    const target = finding.target;
    if (node.type === "TEXT" && target.range) {
      const setRangeBoundVariable = (node as unknown as { setRangeBoundVariable?: (start: number, end: number, field: string, variable: Variable | null) => void }).setRangeBoundVariable;
      const textNode = node as TextNode;
      if (!setRangeBoundVariable) return false;
      const beforeFills = textNode.getRangeFills(target.range.start, target.range.end);
      if (beforeFills === figma.mixed) return false;
      setRangeBoundVariable.call(textNode, target.range.start, target.range.end, "fills", variable);
      restore = () => {
        setRangeBoundVariable.call(textNode, target.range!.start, target.range!.end, "fills", null);
        textNode.setRangeFills(target.range!.start, target.range!.end, beforeFills);
      };
      activeFingerprint = fingerprintForTarget(node as SceneNode, finding.target);
      return true;
    }
    const paints = (node as unknown as Record<string, readonly Paint[]>)[target.field];
    const paint = paints?.[target.paintIndex];
    if (!paint) return false;
    if (paint.type !== "SOLID") return false;
    const before = paint;
    const next = figma.variables.setBoundVariableForPaint(before, "color", variable);
    (node as unknown as Record<string, readonly Paint[]>)[target.field] = paints.map((item, index) => index === target.paintIndex ? next : item);
    restore = () => { (node as unknown as Record<string, readonly Paint[]>)[target.field] = paints; };
  } else if (finding.target.kind === "dimension") {
    const field = finding.target.field;
    const before = (node as unknown as Record<string, unknown>)[field];
    const beforeBinding = node.boundVariables?.[field as keyof typeof node.boundVariables] as unknown;
    const setBoundVariable = (node as unknown as { setBoundVariable?: (field: string, variable: Variable | null) => void }).setBoundVariable;
    if (!setBoundVariable) return false;
    setBoundVariable.call(node, field, variable);
    restore = async () => {
      setBoundVariable.call(node, field, null);
      if (beforeBinding && typeof beforeBinding === "object" && "id" in beforeBinding) {
        const originalVariable = await figma.variables.getVariableByIdAsync((beforeBinding as { id: string }).id);
        if (originalVariable) setBoundVariable.call(node, field, originalVariable);
      } else {
        (node as unknown as Record<string, unknown>)[field] = before;
      }
    };
  } else {
    return false;
  }
  activeFingerprint = fingerprintForTarget(node as SceneNode, finding.target);
  return true;
}

export function getPreviewFingerprint(): string | undefined {
  return activeFingerprint;
}
