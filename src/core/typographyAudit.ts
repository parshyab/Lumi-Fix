import { isCanonicalTextStyle, isPreferredTextStyle } from "../config/lumi";
import { fingerprintForTarget } from "./fingerprints";
import { matchFinding, unsupportedFinding, violationFinding } from "./auditHelpers";
import type { Finding, Settings, Suggestion, TextStyleRecord } from "../shared/types";
import type { Inventory } from "./inventory";

function lineHeightValue(value: LineHeight): number | undefined {
  return value.unit === "PIXELS" ? value.value : undefined;
}

type TypographySegment = {
  start: number;
  end: number;
  fontName: FontName;
  fontSize: number;
  fontWeight?: number;
  lineHeight: LineHeight;
  letterSpacing: LetterSpacing;
  textCase: TextCase;
  textDecoration: TextDecoration;
  textStyleId: string | typeof figma.mixed;
};

function typographySegments(node: TextNode): TypographySegment[] {
  return node.getStyledTextSegments(["fontName", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textStyleId", "boundVariables"] as never) as unknown as TypographySegment[];
}

function styleMatches(node: TextNode, style: TextStyleRecord, range?: { start: number; end: number }): boolean {
  const segment = typographySegments(node).find((item) => !range || (item.start < range.end && item.end > range.start));
  if (!segment) return false;
  const fontName = segment.fontName;
  const lineHeight = lineHeightValue(segment.lineHeight);
  const letterSpacing = `${segment.letterSpacing.value}${segment.letterSpacing.unit}`;
  return fontName.family === style.fontFamily && fontName.style === style.fontStyle && Math.abs(segment.fontSize - style.fontSize) < 0.01 && (style.lineHeight === "AUTO" || lineHeight === Number.parseFloat(style.lineHeight)) && style.letterSpacing === letterSpacing && style.textCase === segment.textCase && style.textDecoration === segment.textDecoration;
}

function styleSuggestions(styles: TextStyleRecord[], node: TextNode, range?: { start: number; end: number }): Suggestion[] {
  return styles.filter((style) => isCanonicalTextStyle(style.name) && style.isCanonical && styleMatches(node, style, range)).map((style) => ({
    id: `style:${style.id}`,
    tokenName: style.name,
    tokenKey: style.key,
    source: "style",
    resolvedType: "TEXT_STYLE",
    score: 94,
    confidence: "high",
    matchType: "exact",
    rationale: "Complete typography properties match the live LUMI text style",
    canApply: true,
  }));
}

function nearestStyleSuggestions(styles: TextStyleRecord[], node: TextNode, range?: { start: number; end: number }): Suggestion[] {
  const segment = typographySegments(node).find((item) => !range || (item.start < range.end && item.end > range.start));
  if (!segment) return [];
  return styles.filter((style) => style.isCanonical).map((style) => {
    let score = 0;
    if (style.fontFamily === segment.fontName.family) score += 35;
    if (style.fontStyle === segment.fontName.style) score += 20;
    score += Math.max(0, 25 - Math.abs(style.fontSize - segment.fontSize));
    const styleLineHeight = Number.parseFloat(style.lineHeight);
    const currentLineHeight = lineHeightValue(segment.lineHeight);
    if (currentLineHeight !== undefined && Number.isFinite(styleLineHeight)) score += Math.max(0, 20 - Math.abs(styleLineHeight - currentLineHeight));
    return {
      id: `style:${style.id}`,
      tokenName: style.name,
      tokenKey: style.key,
      source: "style" as const,
      resolvedType: "TEXT_STYLE",
      score: Math.round(score),
      confidence: score >= 75 ? "high" as const : score >= 52 ? "medium" as const : "low" as const,
      matchType: "semantic" as const,
      rationale: style.isLegacyDuplicate ? "Legacy duplicate; the canonical line-height variant is preferred" : "Closest live LUMI typography style",
      canApply: true,
    } satisfies Suggestion;
  }).sort((a, b) => b.score - a.score).slice(0, 4);
}

export function auditTypography(node: TextNode, inventory: Inventory, _settings: Settings): Finding[] {
  if (!node.characters.length) return [];
  const segments = typographySegments(node);
  const findings: Finding[] = [];
  for (const segment of segments) {
    const range = segments.length > 1 ? { start: segment.start, end: segment.end } : undefined;
    const target = { kind: "text-style", ...(range ? { range } : {}) } as const;
    const fingerprint = fingerprintForTarget(node, target);
    const localStyle = segment.textStyleId && segment.textStyleId !== (figma.mixed as unknown as string) ? inventory.textStyles.find((style) => style.id === segment.textStyleId) : undefined;
    const canonical = localStyle && isCanonicalTextStyle(localStyle.name) && localStyle.isCanonical && isPreferredTextStyle(localStyle.name, lineHeightValue(segment.lineHeight));
    if (canonical) {
      findings.push(matchFinding({ node, category: "typography", property: "Typography", target, currentValue: { fontSize: segment.fontSize, fontName: segment.fontName }, currentDisplayValue: localStyle.name, currentStyleName: localStyle.name, fingerprint }));
      continue;
    }
    const suggestions = styleSuggestions(inventory.textStyles, node, range).length ? styleSuggestions(inventory.textStyles, node, range) : nearestStyleSuggestions(inventory.textStyles, node, range);
    if (node.hasMissingFont) {
      findings.push(unsupportedFinding({ node, category: "typography", property: "Typography", target, currentValue: { fontSize: segment.fontSize, fontName: segment.fontName }, currentDisplayValue: localStyle?.name ?? "Manual typography", fingerprint, reason: "The text node uses a missing font. Resolve the font before applying a typography style." }));
    } else {
      findings.push(violationFinding({ node, category: "typography", property: "Typography", target, currentValue: { fontSize: segment.fontSize, fontName: segment.fontName, lineHeight: segment.lineHeight }, currentDisplayValue: localStyle?.name ?? "Hardcoded typography", currentStyleName: localStyle?.name, fingerprint, suggestions, reason: localStyle ? "This text style is not a preferred canonical LUMI style." : "Manually assembled typography." }));
    }
  }
  return findings;
}
