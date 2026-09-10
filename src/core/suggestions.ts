import { getTokenRule, isPrimitiveToken } from "../config/lumi";
import { colorDistance } from "./colorUtils";
import type { SerializableColor, Suggestion, TokenRegistryEntry } from "../shared/types";

export type SuggestionContext = {
  role?: string;
  resolvedType: string;
  value?: SerializableColor | number;
  property?: string;
  showPrimitiveTokens: boolean;
  currentVariableKey?: string;
};

function normalizedWords(value: string): string[] {
  return value.toLowerCase().split(/[\s/_.-]+/).filter(Boolean);
}

function semanticScore(token: TokenRegistryEntry, context: SuggestionContext): number {
  const rule = getTokenRule(token.name);
  const words = normalizedWords(token.name);
  let score = rule?.role === context.role ? 1 : 0;
  const roleWords = context.role ? normalizedWords(context.role) : [];
  if (roleWords.some((word) => words.includes(word))) score = Math.max(score, 0.72);
  if (context.property && normalizedWords(context.property).some((word) => words.includes(word))) score = Math.max(score, 0.62);
  return score;
}

function typeScore(token: TokenRegistryEntry, context: SuggestionContext): number {
  return token.resolvedType === context.resolvedType ? 1 : 0;
}

function scopeScore(token: TokenRegistryEntry, context: SuggestionContext): number {
  const role = context.role ?? "";
  const scope = token.scope ?? [];
  if (!scope.length) return 0.8;
  if (role === "text" && scope.some((value) => value.toLowerCase().includes("text"))) return 1;
  if (role === "icon" && scope.some((value) => value.toLowerCase().includes("stroke") || value.toLowerCase().includes("fill"))) return 1;
  return 0.65;
}

function valueScore(token: TokenRegistryEntry, context: SuggestionContext): number {
  if (!context.value || typeof context.value === "number" || typeof token.value !== "object" || !token.value || !("r" in token.value)) return 0.5;
  return Math.max(0, 1 - colorDistance(context.value, token.value as SerializableColor));
}

function previewValue(token: TokenRegistryEntry): Suggestion["previewValue"] {
  return typeof token.value === "number" || (typeof token.value === "object" && token.value !== null && "r" in token.value) ? token.value as number | SerializableColor : undefined;
}

function confidence(score: number): Suggestion["confidence"] {
  if (score >= 0.78) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

export function rankSuggestions(tokens: TokenRegistryEntry[], context: SuggestionContext, limit = 5): Suggestion[] {
  return tokens
    .filter((token) => token.resolvedType === context.resolvedType && (context.showPrimitiveTokens || !isPrimitiveToken(token.name, token.collectionName)))
    .filter((token) => token.key !== context.currentVariableKey)
    .map((token) => {
      const semantic = semanticScore(token, context);
      const compatible = typeScore(token, context);
      const scope = scopeScore(token, context);
      const similarity = valueScore(token, context);
      const usage = Math.min(1, token.boundCount / 10);
      const score = Math.round((semantic * 0.3 + compatible * 0.25 + scope * 0.2 + similarity * 0.15 + usage * 0.1) * 100);
      const exact = typeof context.value === "object" && context.value !== null && "r" in context.value && token.value && typeof token.value === "object" && "r" in token.value && colorDistance(context.value as SerializableColor, token.value as SerializableColor) < 0.01;
      return {
        id: `suggestion:${token.key ?? token.id ?? token.name}`,
        tokenName: token.name,
        tokenKey: token.key,
        tokenId: token.id,
        source: token.source === "local" ? "local" : "lumi-library",
        resolvedType: token.resolvedType,
        score,
        confidence: confidence(score),
        matchType: exact ? "exact" : semantic >= 0.7 ? "semantic" : "nearby",
        rationale: exact ? "Exact live value match" : semantic >= 0.7 ? "Semantic role and type match" : "Closest compatible live token",
        canApply: Boolean(token.id || token.key),
        previewValue: previewValue(token),
      } satisfies Suggestion;
    })
    .sort((a, b) => b.score - a.score || a.tokenName.localeCompare(b.tokenName))
    .slice(0, limit);
}

export function inferColorRole(nodeType: string, property: string, nodeName: string): string {
  const lower = `${property} ${nodeName}`.toLowerCase();
  if (property.toLowerCase().includes("stroke")) return "border";
  if (nodeType === "TEXT" || lower.includes("text") || lower.includes("label")) return "text";
  if (lower.includes("icon") || nodeType === "VECTOR" || nodeType === "BOOLEAN_OPERATION" || nodeType === "STAR" || nodeType === "POLYGON" || nodeType === "LINE" || nodeType === "ELLIPSE") return "icon";
  if (lower.includes("tag") || lower.includes("badge") || lower.includes("chip")) return "tag";
  return "background";
}

export function inferDimensionRole(field: string): string {
  if (field.toLowerCase().includes("spacing") || field === "itemSpacing" || field === "counterAxisSpacing") return "spacing";
  if (field.toLowerCase().includes("padding")) return "padding";
  return "radius";
}
