import type { ResolvedType } from "../shared/types";

export type SemanticRole =
  | "text"
  | "icon"
  | "border"
  | "background"
  | "tag"
  | "spacing"
  | "padding"
  | "radius"
  | "typography";

export type TokenRule = {
  pattern: string;
  role: SemanticRole;
  resolvedType: ResolvedType;
  aliases: string[];
  preferred: boolean;
};

export type ApprovedComponent = {
  key: string;
  name: string;
  category?: string;
  platform?: "web" | "ios" | "android" | "shared";
};

export const LUMI_LIBRARY_NAME = "LUMI Design System";
export const LUMI_LIBRARY_KEY =
  "lk-dd433aa804b38bc402dd034a9086ed01c11a0c0de7de84554d8ad2019ee171c6ef68bd2140a8a8b3f0b04c4f9ec44555d419fc5bb5218d44b14367f1882ebe43";

export const primitivePatterns = ["primitive", "raw", "base", "size/", "spacing/primitive/", "color/pink/", "color/slate/"];

const colorRules: Array<[string, string[]]> = [
  ["color/text/default", ["text", "default"]],
  ["color/text/brand", ["text", "brand"]],
  ["color/text/subtle", ["text", "subtle"]],
  ["color/text/error", ["text", "error"]],
  ["color/text/success", ["text", "success"]],
  ["color/text/link", ["text", "link"]],
  ["color/text/placeholder", ["text", "placeholder"]],
  ["color/text/on solid bg", ["text", "on solid bg"]],
  ["color/text/on subtle bg", ["text", "on subtle bg"]],
  ["color/text/brand accent", ["text", "brand", "accent"]],
  ["color/text/disabled/default", ["text", "disabled", "default"]],
  ["color/text/disabled/secondary", ["text", "disabled", "secondary"]],
  ["color/icon/default", ["icon", "default"]],
  ["color/icon/brand", ["icon", "brand"]],
  ["color/icon/subtle", ["icon", "subtle"]],
  ["color/icon/error", ["icon", "error"]],
  ["color/border/subtle", ["border", "subtle"]],
  ["color/border/error", ["border", "error"]],
  ["color/bg/surface/dim", ["background", "surface", "dim"]],
  ["color/tag/brand/text/solid/default", ["tag", "brand", "solid", "default"]],
  ["color/tag/brand/text/solid/hovered", ["tag", "brand", "solid", "hovered"]],
];

const spacingRules: Array<[string, SemanticRole]> = [
  ["spacing/gap/xxs", "spacing"],
  ["spacing/gap/xs", "spacing"],
  ["spacing/gap/sm", "spacing"],
  ["spacing/gap/md", "spacing"],
  ["spacing/gap/lg", "spacing"],
  ["spacing/gap/xl", "spacing"],
  ["spacing/gap/xxl", "spacing"],
  ["spacing/gap/3xl", "spacing"],
  ["spacing/padding/xs", "padding"],
  ["spacing/padding/sm", "padding"],
  ["spacing/padding/md", "padding"],
  ["spacing/padding/lg", "padding"],
  ["spacing/padding/xl", "padding"],
  ["spacing/padding/3xl", "padding"],
];

const radiusNames = ["hairline", "xsmall", "small", "medium", "large", "xl", "xxl", "xxxl", "xxxxl", "xxxxxl", "brand", "rounded"];

export const canonicalTextStyleNames = [
  "Heading/Modal",
  "Heading/Modal Emphasized",
  "Heading/Section",
  "Heading/Section Emphasized",
  "Heading/Subsection",
  "Heading/Subsection Emphasized",
  "Title/Body",
  "Body/Default",
  "Body/Strong",
  "Body/Supporting",
  "Body/Callout",
  "Label/Default",
  "Label/Supporting",
  "Label/Supporting Emphasized",
  "Label/Caption",
  "Label/Caption Soft",
  "Label/Tiny",
  "Label/Tiny Soft",
  "Label/ALL CAPS",
];

export const preferredTextStyleLineHeights: Record<string, number> = {
  "Label/Supporting Emphasized": 20,
};

export const tokenRules: TokenRule[] = [
  ...colorRules.map(([pattern, aliases]) => ({ pattern, role: aliases[0] as SemanticRole, resolvedType: "COLOR" as const, aliases, preferred: true })),
  ...spacingRules.map(([pattern, role]) => ({ pattern, role, resolvedType: "FLOAT" as const, aliases: pattern.split("/"), preferred: true })),
  ...radiusNames.map((name) => ({
    pattern: `corner radius/${name}`,
    role: "radius" as const,
    resolvedType: "FLOAT" as const,
    aliases: ["corner", "radius", name],
    preferred: true,
  })),
];

export const approvedComponents: ApprovedComponent[] = [];

export function isPrimitiveToken(name: string, collectionName = ""): boolean {
  const value = `${collectionName}/${name}`.toLowerCase();
  return primitivePatterns.some((pattern) => value.includes(pattern.toLowerCase()));
}

export function getTokenRule(name: string): TokenRule | undefined {
  const normalized = name.toLowerCase();
  return tokenRules.find((rule) => normalized === rule.pattern.toLowerCase()) ??
    tokenRules.find((rule) => normalized.startsWith(rule.pattern.toLowerCase()));
}

export function isCanonicalTextStyle(name: string): boolean {
  return canonicalTextStyleNames.includes(name);
}

export function isPreferredTextStyle(name: string, lineHeight?: number): boolean {
  const preferredLineHeight = preferredTextStyleLineHeights[name];
  return preferredLineHeight === undefined || lineHeight === undefined || Math.abs(preferredLineHeight - lineHeight) < 0.01;
}
