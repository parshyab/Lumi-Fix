import assert from "node:assert/strict";
import test from "node:test";
import { isPrimitiveToken, isPreferredTextStyle, getTokenRule } from "../src/config/lumi";
import { colorDistance, colorToDisplay, contrastRatio } from "../src/core/colorUtils";
import { inferColorRole, inferDimensionRole, rankSuggestions } from "../src/core/suggestions";
import { fingerprintParts } from "../src/core/fingerprints";
import { MAX_SCAN_LAYERS } from "../src/core/scanner";
import type { TokenRegistryEntry } from "../src/shared/types";

const color = (r: number, g: number, b: number) => ({ r, g, b, a: 1 });

function token(input: Partial<TokenRegistryEntry> & Pick<TokenRegistryEntry, "name" | "resolvedType">): TokenRegistryEntry {
  return { source: "local", collectionName: "Semantic", imported: true, boundCount: 0, semantic: true, primitive: false, ...input };
}

test("formats exact colors and detects near colors", () => {
  assert.equal(colorToDisplay(color(1, 0.5, 0)), "#FF8000");
  assert.equal(colorDistance(color(0.2, 0.3, 0.4), color(0.2, 0.3, 0.4)), 0);
  assert.ok(colorDistance(color(0.2, 0.3, 0.4), color(0.21, 0.3, 0.4)) < 0.03);
});

test("computes a WCAG contrast ratio", () => {
  assert.ok(Math.abs(contrastRatio(color(0, 0, 0), color(1, 1, 1)) - 21) < 0.01);
});

const tokens = [
  token({ name: "color/text/default", key: "text-default", resolvedType: "COLOR", value: color(0.2, 0.2, 0.2) }),
  token({ name: "color/icon/default", key: "icon-default", resolvedType: "COLOR", value: color(0.2, 0.2, 0.2) }),
  token({ name: "spacing/gap/md", key: "gap-md", resolvedType: "FLOAT", value: 12 }),
  token({ name: "color/slate/800", key: "primitive", resolvedType: "COLOR", primitive: true, semantic: false }),
];

test("infers semantic roles from node context", () => {
  assert.equal(inferColorRole("TEXT", "Fill", "Product title"), "text");
  assert.equal(inferColorRole("VECTOR", "Fill", "Cart icon"), "icon");
  assert.equal(inferColorRole("FRAME", "Stroke", "Card"), "border");
});

test("filters by resolved type and ranks the matching semantic token first", () => {
  const suggestions = rankSuggestions(tokens, { role: "text", resolvedType: "COLOR", value: color(0.2, 0.2, 0.2), showPrimitiveTokens: false });
  assert.equal(suggestions[0]?.tokenName, "color/text/default");
  assert.ok(suggestions.every((suggestion) => suggestion.resolvedType === "COLOR"));
  assert.equal(suggestions.some((suggestion) => suggestion.tokenName === "color/slate/800"), false);
});

test("maps spacing and corner radius names to their configured roles", () => {
  assert.equal(inferDimensionRole("itemSpacing"), "spacing");
  assert.equal(inferDimensionRole("paddingLeft"), "padding");
  assert.equal(getTokenRule("corner radius/medium")?.role, "radius");
});

test("hides primitive tokens and prefers the canonical duplicate line height", () => {
  assert.equal(isPrimitiveToken("color/slate/800"), true);
  assert.equal(isPrimitiveToken("color/text/default"), false);
  assert.equal(isPreferredTextStyle("Label/Supporting Emphasized", 20), true);
  assert.equal(isPreferredTextStyle("Label/Supporting Emphasized", 18), false);
});

test("creates deterministic fingerprints and enforces the scan ceiling", () => {
  assert.equal(fingerprintParts([{ b: 2, a: 1 }]), fingerprintParts([{ a: 1, b: 2 }]));
  assert.equal(MAX_SCAN_LAYERS, 25_000);
});
