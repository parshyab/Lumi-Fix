import { fingerprintForTarget } from "./fingerprints";
import { colorToDisplay, paintColor, solidPaint } from "./colorUtils";
import { inferColorRole, rankSuggestions } from "./suggestions";
import { matchFinding, unsupportedFinding, violationFinding } from "./auditHelpers";
import { approvedLumiTokens } from "./inventory";
import type { Finding, Settings, Suggestion, TokenRegistryEntry } from "../shared/types";
import type { Inventory } from "./inventory";

function variableIdForPaint(paint: Paint): string | undefined {
  return paint.type === "SOLID" ? (paint as SolidPaint).boundVariables?.color?.id : undefined;
}

function tokenForPaint(paint: Paint, inventory: Inventory): TokenRegistryEntry | undefined {
  const variableId = variableIdForPaint(paint);
  return variableId ? inventory.tokenById.get(variableId) : undefined;
}

function suggestionsForPaint(node: SceneNode, property: string, paint: SolidPaint, inventory: Inventory, settings: Settings, currentVariableKey?: string): Suggestion[] {
  return rankSuggestions(approvedLumiTokens(inventory), {
    role: inferColorRole(node.type, property, node.name),
    resolvedType: "COLOR",
    value: paintColor(paint),
    property,
    showPrimitiveTokens: settings.showPrimitiveTokens,
    currentVariableKey,
  });
}

function auditPaintArray(node: SceneNode, field: "fills" | "strokes", paints: readonly Paint[] | PluginAPI["mixed"], inventory: Inventory, settings: Settings): Finding[] {
  if (paints === figma.mixed || !Array.isArray(paints)) return [];
  const findings: Finding[] = [];
  paints.forEach((paint, paintIndex) => {
    const target = { kind: "paint", field, paintIndex } as const;
    const fingerprint = fingerprintForTarget(node, target);
    const solid = solidPaint(paint);
    if (!solid) {
      findings.push(unsupportedFinding({
        node,
        category: "colors",
        property: field === "fills" ? "Fill" : "Stroke",
        target,
        currentValue: { type: paint.type },
        currentDisplayValue: `${paint.type.toLowerCase()} paint`,
        fingerprint,
        reason: "Only solid paints can be checked or safely bound automatically.",
      }));
      return;
    }
    const token = tokenForPaint(paint, inventory);
    if (token?.libraryName === "LUMI Design System" && token.source === "local") {
      token.boundCount += 1;
      findings.push(matchFinding({
        node,
        category: "colors",
        property: field === "fills" ? "Fill" : "Stroke",
        target,
        currentValue: paintColor(solid),
        currentDisplayValue: token.name,
        currentVariableName: token.name,
        fingerprint,
      }));
      return;
    }
    const suggestions = suggestionsForPaint(node, field === "fills" ? "Fill" : "Stroke", solid, inventory, settings, token?.key);
    findings.push(violationFinding({
      node,
      category: "colors",
      property: field === "fills" ? "Fill" : "Stroke",
      target,
      currentValue: paintColor(solid),
      currentDisplayValue: token ? token.name : colorToDisplay(paintColor(solid), "opacity" in node ? node.opacity : 1),
      currentVariableName: token?.name,
      fingerprint,
      suggestions,
      reason: token ? "This variable is not from the enabled LUMI Design System." : "Hardcoded solid paint.",
    }));
  });
  return findings;
}

function auditTextRanges(node: TextNode, inventory: Inventory, settings: Settings): Finding[] {
  const findings: Finding[] = [];
  const segments = node.getStyledTextSegments(["fills", "boundVariables"]);
  segments.forEach((segment) => {
    const paints = segment.fills;
    if (!Array.isArray(paints)) return;
    paints.forEach((paint, paintIndex) => {
      const target = { kind: "paint", field: "fills", paintIndex, range: { start: segment.start, end: segment.end } } as const;
      const fingerprint = fingerprintForTarget(node, target);
      const solid = solidPaint(paint);
      if (!solid) {
        findings.push(unsupportedFinding({
          node,
          category: "colors",
          property: "Text fill",
          target,
          currentValue: { type: paint.type },
          currentDisplayValue: `${paint.type.toLowerCase()} paint`,
          fingerprint,
          reason: "Only solid text paints can be checked automatically.",
        }));
        return;
      }
      const rangeBindings = segment.boundVariables as unknown as Record<string, unknown> | undefined;
      const fillsBinding = rangeBindings?.fills as { id?: string } | Array<{ id?: string }> | undefined;
      const boundId = Array.isArray(fillsBinding) ? fillsBinding[paintIndex]?.id : fillsBinding?.id;
      const token = boundId ? inventory.tokenById.get(boundId) : undefined;
      if (token?.libraryName === "LUMI Design System" && token.source === "local") {
        token.boundCount += 1;
        findings.push(matchFinding({ node, category: "colors", property: "Text fill", target, currentValue: paintColor(solid), currentDisplayValue: token.name, currentVariableName: token.name, fingerprint }));
      } else {
        findings.push(violationFinding({
          node,
          category: "colors",
          property: "Text fill",
          target,
          currentValue: paintColor(solid),
          currentDisplayValue: token?.name ?? colorToDisplay(paintColor(solid)),
          currentVariableName: token?.name,
          fingerprint,
          suggestions: suggestionsForPaint(node, "Text fill", solid, inventory, settings, token?.key),
          reason: token ? "This variable is not from the enabled LUMI Design System." : "Hardcoded text paint.",
        }));
      }
    });
  });
  return findings;
}

export function auditColors(node: SceneNode, inventory: Inventory, settings: Settings): Finding[] {
  const findings = [
    node.type === "TEXT" ? [] : auditPaintArray(node, "fills", "fills" in node ? node.fills : [], inventory, settings),
    auditPaintArray(node, "strokes", "strokes" in node ? node.strokes : [], inventory, settings),
  ].flat();
  if (node.type === "TEXT" && node.characters.length > 0) findings.push(...auditTextRanges(node, inventory, settings));
  return findings;
}
