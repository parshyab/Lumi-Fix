import { fingerprintForTarget } from "./fingerprints";
import { inferDimensionRole, rankSuggestions } from "./suggestions";
import { matchFinding, violationFinding } from "./auditHelpers";
import { approvedLumiTokens } from "./inventory";
import type { Finding, Settings } from "../shared/types";
import type { Inventory } from "./inventory";

const dimensionFields = ["itemSpacing", "counterAxisSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "cornerRadius", "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"] as const;

function displayValue(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2)} px`;
}

function valueForField(node: SceneNode, field: string): number | typeof figma.mixed | undefined {
  return field in node ? (node as unknown as Record<string, number | typeof figma.mixed | undefined>)[field] : undefined;
}

export function auditDimensions(node: SceneNode, inventory: Inventory, settings: Settings): Finding[] {
  const findings: Finding[] = [];
  const radiusValues = ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"].map((field) => valueForField(node, field));
  const independentRadii = radiusValues.some((value) => typeof value === "number") && new Set(radiusValues.filter((value): value is number => typeof value === "number")).size > 1;
  for (const field of dimensionFields) {
    const value = valueForField(node, field);
    if (typeof value !== "number" || value === 0) continue;
    if (field === "cornerRadius" && independentRadii) continue;
    const target = { kind: "dimension", field } as const;
    const fingerprint = fingerprintForTarget(node, target);
    const bound = node.boundVariables?.[field as keyof typeof node.boundVariables] as unknown;
    const token = bound && typeof bound === "object" && "id" in bound ? inventory.tokenById.get((bound as { id: string }).id) : undefined;
    const role = inferDimensionRole(field);
    if (token?.libraryName === "LUMI Design System" && token.source === "local") {
      token.boundCount += 1;
      findings.push(matchFinding({ node, category: "dimensions", property: field, target, currentValue: value, currentDisplayValue: token.name, currentVariableName: token.name, fingerprint }));
    } else {
      findings.push(violationFinding({
        node,
        category: "dimensions",
        property: field,
        target,
        currentValue: value,
        currentDisplayValue: displayValue(value),
        currentVariableName: token?.name,
        fingerprint,
        suggestions: rankSuggestions(approvedLumiTokens(inventory), { role, resolvedType: "FLOAT", value, property: field, showPrimitiveTokens: settings.showPrimitiveTokens, currentVariableKey: token?.key }),
        reason: token ? "This variable is not from the enabled LUMI Design System." : "Hardcoded numeric value.",
      }));
    }
  }
  return findings;
}
