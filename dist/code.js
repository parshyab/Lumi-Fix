"use strict";
(() => {
  // src/shared/types.ts
  var DEFAULT_SETTINGS = {
    target: "selection",
    includeHidden: false,
    inspectNestedInstanceInternals: false,
    showPrimitiveTokens: false,
    checkColors: true,
    checkDimensions: true,
    checkTypography: true,
    checkComponents: true,
    checkContrast: false,
    contrastLevel: "AA",
    showRowCounts: true,
    ignoredNodeNamePatterns: []
  };

  // src/config/settings.ts
  var STORAGE_KEY = "lumi-lens.settings.v1";
  async function loadSettings() {
    const saved = await figma.clientStorage.getAsync(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...saved && typeof saved === "object" ? saved : {} };
  }
  async function saveSettings(settings2) {
    await figma.clientStorage.setAsync(STORAGE_KEY, settings2);
  }

  // src/config/lumi.ts
  var LUMI_LIBRARY_NAME = "LUMI Design System";
  var primitivePatterns = ["primitive", "raw", "base", "size/", "spacing/primitive/", "color/pink/", "color/slate/"];
  var colorRules = [
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
    ["color/tag/brand/text/solid/hovered", ["tag", "brand", "solid", "hovered"]]
  ];
  var spacingRules = [
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
    ["spacing/padding/3xl", "padding"]
  ];
  var radiusNames = ["hairline", "xsmall", "small", "medium", "large", "xl", "xxl", "xxxl", "xxxxl", "xxxxxl", "brand", "rounded"];
  var canonicalTextStyleNames = [
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
    "Label/ALL CAPS"
  ];
  var preferredTextStyleLineHeights = {
    "Label/Supporting Emphasized": 20
  };
  var tokenRules = [
    ...colorRules.map(([pattern, aliases]) => ({ pattern, role: aliases[0], resolvedType: "COLOR", aliases, preferred: true })),
    ...spacingRules.map(([pattern, role]) => ({ pattern, role, resolvedType: "FLOAT", aliases: pattern.split("/"), preferred: true })),
    ...radiusNames.map((name) => ({
      pattern: `corner radius/${name}`,
      role: "radius",
      resolvedType: "FLOAT",
      aliases: ["corner", "radius", name],
      preferred: true
    }))
  ];
  var approvedComponents = [];
  function isPrimitiveToken(name, collectionName = "") {
    const value = `${collectionName}/${name}`.toLowerCase();
    return primitivePatterns.some((pattern) => value.includes(pattern.toLowerCase()));
  }
  function getTokenRule(name) {
    const normalized = name.toLowerCase();
    return tokenRules.find((rule) => normalized === rule.pattern.toLowerCase()) ?? tokenRules.find((rule) => normalized.startsWith(rule.pattern.toLowerCase()));
  }
  function isCanonicalTextStyle(name) {
    return canonicalTextStyleNames.includes(name);
  }
  function isPreferredTextStyle(name, lineHeight) {
    const preferredLineHeight = preferredTextStyleLineHeights[name];
    return preferredLineHeight === void 0 || lineHeight === void 0 || Math.abs(preferredLineHeight - lineHeight) < 0.01;
  }

  // src/core/inventory.ts
  var cachedInventory;
  function resolvedType(value) {
    return typeof value === "string" && ["COLOR", "FLOAT", "STRING", "BOOLEAN"].includes(value) ? value : "OTHER";
  }
  function lineHeightLabel(lineHeight) {
    if (lineHeight.unit === "AUTO") return "AUTO";
    return `${lineHeight.value}${lineHeight.unit}`;
  }
  function letterSpacingLabel(letterSpacing) {
    return `${letterSpacing.value}${letterSpacing.unit}`;
  }
  function numericLineHeight(style) {
    return style.lineHeight.unit === "PIXELS" ? style.lineHeight.value : void 0;
  }
  function valueFromVariable(variable) {
    const mode = Object.keys(variable.valuesByMode)[0];
    const value = mode ? variable.valuesByMode[mode] : void 0;
    if (value && typeof value === "object" && "r" in value && "g" in value && "b" in value) {
      const color = value;
      return { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 };
    }
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : void 0;
  }
  function isLumiName(name) {
    return name.toLowerCase().includes("lumi");
  }
  function isLumiLibraryName(name) {
    return name.trim().toLowerCase() === LUMI_LIBRARY_NAME.toLowerCase();
  }
  async function discoverLocalTokens() {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collectionNames = new Map(collections.map((collection) => [collection.id, collection.name]));
    const variables = await figma.variables.getLocalVariablesAsync();
    const tokens = [];
    const byId = /* @__PURE__ */ new Map();
    const byKey = /* @__PURE__ */ new Map();
    for (const variable of variables) {
      const collectionName = collectionNames.get(variable.variableCollectionId) ?? "";
      const entry = {
        id: variable.id,
        key: variable.key,
        name: variable.name,
        source: "local",
        resolvedType: resolvedType(variable.resolvedType),
        collectionName,
        libraryName: isLumiName(collectionName) || variable.remote && Boolean(getTokenRule(variable.name)) ? LUMI_LIBRARY_NAME : void 0,
        remote: variable.remote,
        scope: variable.scopes,
        imported: true,
        boundCount: 0,
        semantic: Boolean(getTokenRule(variable.name)) || !isPrimitiveToken(variable.name, collectionName),
        primitive: isPrimitiveToken(variable.name, collectionName),
        value: valueFromVariable(variable)
      };
      tokens.push(entry);
      byId.set(variable.id, entry);
      byKey.set(variable.key, entry);
    }
    return { tokens, byId, byKey };
  }
  async function discoverLibraryTokens() {
    let availableCollections;
    try {
      availableCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    } catch (error) {
      return { tokens: [], available: false, error: error instanceof Error ? error.message : "Figma could not read enabled libraries." };
    }
    const lumiCollections = availableCollections.filter((collection) => isLumiLibraryName(collection.libraryName));
    const tokens = [];
    const errors = [];
    const results = await Promise.all(lumiCollections.map(async (collection) => {
      try {
        return await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collection.key);
      } catch (error) {
        errors.push(error instanceof Error ? `${collection.name}: ${error.message}` : `${collection.name}: unable to read variables`);
        return [];
      }
    }));
    results.forEach((variables, index) => {
      const collection = lumiCollections[index];
      for (const variable of variables) {
        const key = variable.key ?? variable.variableKey;
        if (!key) continue;
        const collectionName = variable.collectionName ?? collection.name;
        tokens.push({
          key,
          name: variable.name,
          source: "lumi-library",
          resolvedType: resolvedType(variable.resolvedType),
          collectionName,
          libraryName: LUMI_LIBRARY_NAME,
          scope: variable.scopes,
          imported: false,
          boundCount: 0,
          semantic: Boolean(getTokenRule(variable.name)) || !isPrimitiveToken(variable.name, collectionName),
          primitive: isPrimitiveToken(variable.name, collectionName)
        });
      }
    });
    return { tokens, available: lumiCollections.length > 0, error: errors.length ? errors.join("; ") : void 0 };
  }
  async function discoverTextStyles() {
    const styles = await figma.getLocalTextStylesAsync();
    const byName = /* @__PURE__ */ new Map();
    for (const style of styles) {
      if (!isCanonicalTextStyle(style.name)) continue;
      const group = byName.get(style.name) ?? [];
      group.push(style);
      byName.set(style.name, group);
    }
    return styles.filter((style) => isCanonicalTextStyle(style.name)).map((style) => {
      const duplicate = (byName.get(style.name) ?? []).length > 1;
      const canonical = isPreferredTextStyle(style.name, numericLineHeight(style));
      return {
        id: style.id,
        key: style.key,
        name: style.name,
        fontFamily: style.fontName.family,
        fontStyle: style.fontName.style,
        fontSize: style.fontSize,
        lineHeight: lineHeightLabel(style.lineHeight),
        letterSpacing: letterSpacingLabel(style.letterSpacing),
        textCase: style.textCase,
        textDecoration: style.textDecoration,
        paragraphSpacing: style.paragraphSpacing,
        paragraphIndent: style.paragraphIndent,
        isCanonical: canonical,
        isLegacyDuplicate: duplicate && !canonical
      };
    });
  }
  async function discoverInventory(force = false) {
    if (cachedInventory && !force) return cachedInventory;
    const [local, library, textStyles] = await Promise.all([
      discoverLocalTokens().catch(() => ({ tokens: [], byId: /* @__PURE__ */ new Map(), byKey: /* @__PURE__ */ new Map() })),
      discoverLibraryTokens(),
      discoverTextStyles().catch(() => [])
    ]);
    const lumiKeys = new Set(library.tokens.map((token) => token.key).filter((key) => Boolean(key)));
    for (const token of local.tokens) {
      if (token.key && lumiKeys.has(token.key)) token.libraryName = LUMI_LIBRARY_NAME;
    }
    const tokens = [...local.tokens, ...library.tokens.filter((libraryToken) => !local.byKey.has(libraryToken.key ?? ""))];
    const libraryImportedCount = local.tokens.filter((token) => token.libraryName === LUMI_LIBRARY_NAME && token.imported).length;
    const enabled = library.available || libraryImportedCount > 0;
    const semanticTokenCount = tokens.filter((token) => !token.primitive).length;
    const message = library.error ? `Could not read the enabled LUMI library. Reload the plugin and verify your Figma library access. (${library.error})` : enabled ? void 0 : `${LUMI_LIBRARY_NAME} is not enabled in this file. Enable the LUMI library in Figma Libraries, then reload.`;
    const libraryStatus = {
      name: LUMI_LIBRARY_NAME,
      available: library.available,
      enabled,
      tokenCount: semanticTokenCount,
      importedTokenCount: libraryImportedCount,
      message
    };
    const tokenById = new Map(local.byId);
    const tokenByKey = new Map(local.byKey);
    for (const token of library.tokens) {
      if (token.key) tokenByKey.set(token.key, token);
    }
    cachedInventory = { tokens, tokenById, tokenByKey, textStyles, libraryStatus };
    return cachedInventory;
  }
  function invalidateInventory() {
    cachedInventory = void 0;
  }
  function approvedLumiTokens(inventory2) {
    return inventory2.tokens.filter((token) => token.source === "lumi-library" || token.libraryName === LUMI_LIBRARY_NAME);
  }
  async function resolveToken(entry) {
    if (entry.id) {
      const local = await figma.variables.getVariableByIdAsync(entry.id);
      if (local) return local;
    }
    if (entry.key) {
      try {
        return await figma.variables.importVariableByKeyAsync(entry.key);
      } catch {
        return null;
      }
    }
    return null;
  }

  // src/core/fingerprints.ts
  function normalize(value) {
    if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 1e3) / 1e3 : value;
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]));
    }
    return value;
  }
  function stableSerialize(value) {
    return JSON.stringify(normalize(value));
  }
  function fingerprintParts(parts) {
    return stableSerialize(parts);
  }
  function fingerprintForTarget(node, target) {
    if (target.kind === "paint") {
      const paints = node[target.field];
      const paint = Array.isArray(paints) ? paints[target.paintIndex] : void 0;
      return fingerprintParts([node.id, target, paint]);
    }
    if (target.kind === "dimension") {
      const value = node[target.field];
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

  // src/core/applyFix.ts
  var loadedFonts = /* @__PURE__ */ new Set();
  function selectedSuggestion(finding, suggestionId) {
    return finding.suggestions.find((suggestion) => suggestion.id === suggestionId) ?? finding.suggestions[0];
  }
  async function resolveStyle(suggestion) {
    if (!suggestion.id.startsWith("style:")) return null;
    const styleId = suggestion.id.slice("style:".length);
    return figma.getStyleByIdAsync(styleId);
  }
  async function applyFinding(finding, suggestionId, inventory2) {
    const node = await figma.getNodeByIdAsync(finding.nodeId);
    if (!node || node.type === "DOCUMENT" || node.type === "PAGE") throw new Error("Layer no longer exists.");
    if (node.type !== finding.nodeType) throw new Error("Layer type changed.");
    if (fingerprintForTarget(node, finding.target) !== finding.fingerprint) throw new Error("The layer changed since the scan. Re-run the check.");
    const suggestion = selectedSuggestion(finding, suggestionId);
    if (!suggestion?.canApply) throw new Error(suggestion?.unavailableReason ?? "No safe fix is available.");
    if (finding.target.kind === "paint") {
      const target = finding.target;
      const variable = await resolveToken(inventory2.tokenByKey.get(suggestion.tokenKey ?? "") ?? { name: suggestion.tokenName, key: suggestion.tokenKey, source: suggestion.source === "style" ? "local" : suggestion.source, resolvedType: suggestion.resolvedType, collectionName: "", imported: false, boundCount: 0, semantic: true, primitive: false });
      if (!variable || variable.resolvedType !== "COLOR") throw new Error("The selected token could not be resolved as a color variable.");
      if (node.type === "TEXT" && target.range) {
        const range = target.range;
        const rangeNode = node;
        const setRangeBoundVariable = rangeNode.setRangeBoundVariable;
        if (!setRangeBoundVariable) throw new Error("This Figma version cannot bind a text range color variable.");
        setRangeBoundVariable.call(rangeNode, range.start, range.end, "fills", variable);
      } else {
        const paints = node[target.field];
        if (!paints || !paints[target.paintIndex]) throw new Error("Paint no longer exists.");
        const currentPaint = paints[target.paintIndex];
        if (currentPaint.type !== "SOLID") throw new Error("Only solid paints can be bound automatically.");
        const nextPaints = paints.map((paint, index) => index === target.paintIndex && paint.type === "SOLID" ? figma.variables.setBoundVariableForPaint(paint, "color", variable) : paint);
        node[target.field] = nextPaints;
      }
      return;
    }
    if (finding.target.kind === "dimension") {
      const variable = await resolveToken(inventory2.tokenByKey.get(suggestion.tokenKey ?? "") ?? { name: suggestion.tokenName, key: suggestion.tokenKey, source: suggestion.source === "style" ? "local" : suggestion.source, resolvedType: suggestion.resolvedType, collectionName: "", imported: false, boundCount: 0, semantic: true, primitive: false });
      if (!variable || variable.resolvedType !== "FLOAT") throw new Error("The selected token could not be resolved as a numeric variable.");
      const setBoundVariable = node.setBoundVariable;
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
  async function applyFindings(findings, suggestionIds, inventory2) {
    let applied = 0;
    let skipped = 0;
    const failures = [];
    for (const finding of findings) {
      if (!finding.canApply || finding.status === "match" || finding.status === "unsupported" || finding.status === "manual-review") {
        skipped += 1;
        continue;
      }
      try {
        await applyFinding(finding, suggestionIds[finding.id], inventory2);
        applied += 1;
      } catch (error) {
        failures.push({ findingId: finding.id, nodeId: finding.nodeId, nodeName: finding.nodeName, reason: error instanceof Error ? error.message : "Unknown apply error" });
      }
    }
    if (applied > 0) figma.commitUndo();
    return { applied, skipped, failures, refreshed: false };
  }

  // src/core/preview.ts
  var restore;
  var activeFingerprint;
  function suggestionFor(finding, suggestionId) {
    return finding.suggestions.find((suggestion) => suggestion.id === suggestionId);
  }
  async function clearPreview() {
    try {
      await restore?.();
    } finally {
      restore = void 0;
      activeFingerprint = void 0;
    }
  }
  async function previewSuggestion(finding, suggestionId, inventory2) {
    await clearPreview();
    const suggestion = suggestionFor(finding, suggestionId);
    if (!suggestion || !suggestion.tokenId && !suggestion.tokenKey || !suggestion.canApply) return false;
    const node = await figma.getNodeByIdAsync(finding.nodeId);
    if (!node || node.type === "DOCUMENT" || node.type === "PAGE" || node.type !== finding.nodeType) return false;
    if (fingerprintForTarget(node, finding.target) !== finding.fingerprint) return false;
    const registryEntry = suggestion.tokenId ? inventory2.tokenById.get(suggestion.tokenId) : suggestion.tokenKey ? inventory2.tokenByKey.get(suggestion.tokenKey) : void 0;
    const variable = await resolveToken(registryEntry ?? { name: suggestion.tokenName, id: suggestion.tokenId, key: suggestion.tokenKey, source: suggestion.source === "lumi-library" ? "lumi-library" : "local", resolvedType: suggestion.resolvedType, collectionName: "", imported: Boolean(suggestion.tokenId), boundCount: 0, semantic: true, primitive: false });
    if (!variable) return false;
    if (finding.target.kind === "paint") {
      const target = finding.target;
      if (node.type === "TEXT" && target.range) {
        const setRangeBoundVariable = node.setRangeBoundVariable;
        const textNode = node;
        if (!setRangeBoundVariable) return false;
        const beforeFills = textNode.getRangeFills(target.range.start, target.range.end);
        if (beforeFills === figma.mixed) return false;
        setRangeBoundVariable.call(textNode, target.range.start, target.range.end, "fills", variable);
        restore = () => {
          setRangeBoundVariable.call(textNode, target.range.start, target.range.end, "fills", null);
          textNode.setRangeFills(target.range.start, target.range.end, beforeFills);
        };
        activeFingerprint = fingerprintForTarget(node, finding.target);
        return true;
      }
      const paints = node[target.field];
      const paint = paints?.[target.paintIndex];
      if (!paint) return false;
      if (paint.type !== "SOLID") return false;
      const before = paint;
      const next = figma.variables.setBoundVariableForPaint(before, "color", variable);
      node[target.field] = paints.map((item, index) => index === target.paintIndex ? next : item);
      restore = () => {
        node[target.field] = paints;
      };
    } else if (finding.target.kind === "dimension") {
      const field = finding.target.field;
      const before = node[field];
      const beforeBinding = node.boundVariables?.[field];
      const setBoundVariable = node.setBoundVariable;
      if (!setBoundVariable) return false;
      setBoundVariable.call(node, field, variable);
      restore = async () => {
        setBoundVariable.call(node, field, null);
        if (beforeBinding && typeof beforeBinding === "object" && "id" in beforeBinding) {
          const originalVariable = await figma.variables.getVariableByIdAsync(beforeBinding.id);
          if (originalVariable) setBoundVariable.call(node, field, originalVariable);
        } else {
          node[field] = before;
        }
      };
    } else {
      return false;
    }
    activeFingerprint = fingerprintForTarget(node, finding.target);
    return true;
  }

  // src/core/colorUtils.ts
  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }
  function colorToDisplay(color, opacity = 1) {
    const channels = [color.r, color.g, color.b].map((channel) => Math.round(clamp(channel) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
    const alpha = clamp((color.a ?? 1) * opacity);
    return alpha < 0.995 ? `#${channels}${Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase()}` : `#${channels}`;
  }
  function paintColor(paint) {
    return { r: paint.color.r, g: paint.color.g, b: paint.color.b, a: paint.opacity ?? 1 };
  }
  function colorDistance(a, b) {
    const redMean = (a.r + b.r) / 2;
    const r = (a.r - b.r) * (2 + redMean);
    const g = (a.g - b.g) * 4;
    const blue = (a.b - b.b) * (2 + 1 - redMean);
    const alpha = Math.abs((a.a ?? 1) - (b.a ?? 1)) * 2;
    return Math.sqrt(r * r + g * g + blue * blue + alpha * alpha) / 3;
  }
  function relativeLuminance(color) {
    const linear = [color.r, color.g, color.b].map((channel) => {
      const value = clamp(channel);
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  }
  function contrastRatio(foreground, background) {
    const foregroundLum = relativeLuminance(foreground);
    const backgroundLum = relativeLuminance(background);
    return (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05);
  }
  function composite(foreground, background) {
    const alpha = clamp(foreground.a ?? 1);
    const baseAlpha = clamp(background.a ?? 1);
    const outputAlpha = alpha + baseAlpha * (1 - alpha);
    if (outputAlpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (foreground.r * alpha + background.r * baseAlpha * (1 - alpha)) / outputAlpha,
      g: (foreground.g * alpha + background.g * baseAlpha * (1 - alpha)) / outputAlpha,
      b: (foreground.b * alpha + background.b * baseAlpha * (1 - alpha)) / outputAlpha,
      a: outputAlpha
    };
  }
  function solidPaint(paint) {
    return paint && paint.type === "SOLID" ? paint : void 0;
  }

  // src/core/suggestions.ts
  function normalizedWords(value) {
    return value.toLowerCase().split(/[\s/_.-]+/).filter(Boolean);
  }
  function semanticScore(token, context) {
    const rule = getTokenRule(token.name);
    const words = normalizedWords(token.name);
    let score = rule?.role === context.role ? 1 : 0;
    const roleWords = context.role ? normalizedWords(context.role) : [];
    if (roleWords.some((word) => words.includes(word))) score = Math.max(score, 0.72);
    if (context.property && normalizedWords(context.property).some((word) => words.includes(word))) score = Math.max(score, 0.62);
    return score;
  }
  function typeScore(token, context) {
    return token.resolvedType === context.resolvedType ? 1 : 0;
  }
  function scopeScore(token, context) {
    const role = context.role ?? "";
    const scope = token.scope ?? [];
    if (!scope.length) return 0.8;
    if (role === "text" && scope.some((value) => value.toLowerCase().includes("text"))) return 1;
    if (role === "icon" && scope.some((value) => value.toLowerCase().includes("stroke") || value.toLowerCase().includes("fill"))) return 1;
    return 0.65;
  }
  function valueScore(token, context) {
    if (!context.value || typeof context.value === "number" || typeof token.value !== "object" || !token.value || !("r" in token.value)) return 0.5;
    return Math.max(0, 1 - colorDistance(context.value, token.value));
  }
  function previewValue(token) {
    return typeof token.value === "number" || typeof token.value === "object" && token.value !== null && "r" in token.value ? token.value : void 0;
  }
  function confidence(score) {
    if (score >= 0.78) return "high";
    if (score >= 0.55) return "medium";
    return "low";
  }
  function rankSuggestions(tokens, context, limit = 5) {
    return tokens.filter((token) => token.resolvedType === context.resolvedType && (context.showPrimitiveTokens || !isPrimitiveToken(token.name, token.collectionName))).filter((token) => token.key !== context.currentVariableKey).map((token) => {
      const semantic = semanticScore(token, context);
      const compatible = typeScore(token, context);
      const scope = scopeScore(token, context);
      const similarity = valueScore(token, context);
      const usage = Math.min(1, token.boundCount / 10);
      const score = Math.round((semantic * 0.3 + compatible * 0.25 + scope * 0.2 + similarity * 0.15 + usage * 0.1) * 100);
      const exact = typeof context.value === "object" && context.value !== null && "r" in context.value && token.value && typeof token.value === "object" && "r" in token.value && colorDistance(context.value, token.value) < 0.01;
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
        previewValue: previewValue(token)
      };
    }).sort((a, b) => b.score - a.score || a.tokenName.localeCompare(b.tokenName)).slice(0, limit);
  }
  function inferColorRole(nodeType, property, nodeName) {
    const lower = `${property} ${nodeName}`.toLowerCase();
    if (property.toLowerCase().includes("stroke")) return "border";
    if (nodeType === "TEXT" || lower.includes("text") || lower.includes("label")) return "text";
    if (lower.includes("icon") || nodeType === "VECTOR" || nodeType === "BOOLEAN_OPERATION" || nodeType === "STAR" || nodeType === "POLYGON" || nodeType === "LINE" || nodeType === "ELLIPSE") return "icon";
    if (lower.includes("tag") || lower.includes("badge") || lower.includes("chip")) return "tag";
    return "background";
  }
  function inferDimensionRole(field) {
    if (field.toLowerCase().includes("spacing") || field === "itemSpacing" || field === "counterAxisSpacing") return "spacing";
    if (field.toLowerCase().includes("padding")) return "padding";
    return "radius";
  }

  // src/core/auditHelpers.ts
  function makeFinding(input) {
    return { ...input, id: `finding:${input.nodeId}:${input.target.kind}:${input.property}:${input.range?.start ?? ""}` };
  }
  function matchFinding(input) {
    return makeFinding({
      nodeId: input.node.id,
      nodeName: input.node.name,
      nodeType: input.node.type,
      category: input.category,
      property: input.property,
      currentValue: input.currentValue,
      currentDisplayValue: input.currentDisplayValue,
      currentVariableName: input.currentVariableName,
      currentStyleName: input.currentStyleName,
      status: "match",
      suggestions: [],
      canApply: false,
      fingerprint: input.fingerprint,
      target: input.target
    });
  }
  function unsupportedFinding(input) {
    return makeFinding({
      nodeId: input.node.id,
      nodeName: input.node.name,
      nodeType: input.node.type,
      category: input.category,
      property: input.property,
      currentValue: input.currentValue,
      currentDisplayValue: input.currentDisplayValue,
      status: "unsupported",
      suggestions: [],
      canApply: false,
      reason: input.reason,
      fingerprint: input.fingerprint,
      target: input.target
    });
  }
  function violationFinding(input) {
    return makeFinding({
      nodeId: input.node.id,
      nodeName: input.node.name,
      nodeType: input.node.type,
      category: input.category,
      property: input.property,
      currentValue: input.currentValue,
      currentDisplayValue: input.currentDisplayValue,
      currentVariableName: input.currentVariableName,
      currentStyleName: input.currentStyleName,
      status: input.status ?? "violation",
      suggestions: input.suggestions,
      canApply: input.suggestions.some((suggestion) => suggestion.canApply),
      reason: input.reason,
      fingerprint: input.fingerprint,
      target: input.target
    });
  }
  function isVisible(node, includeHidden) {
    return includeHidden || !("visible" in node) || node.visible;
  }

  // src/core/colorAudit.ts
  function variableIdForPaint(paint) {
    return paint.type === "SOLID" ? paint.boundVariables?.color?.id : void 0;
  }
  function tokenForPaint(paint, inventory2) {
    const variableId = variableIdForPaint(paint);
    return variableId ? inventory2.tokenById.get(variableId) : void 0;
  }
  function suggestionsForPaint(node, property, paint, inventory2, settings2, currentVariableKey) {
    return rankSuggestions(approvedLumiTokens(inventory2), {
      role: inferColorRole(node.type, property, node.name),
      resolvedType: "COLOR",
      value: paintColor(paint),
      property,
      showPrimitiveTokens: settings2.showPrimitiveTokens,
      currentVariableKey
    });
  }
  function auditPaintArray(node, field, paints, inventory2, settings2) {
    if (paints === figma.mixed || !Array.isArray(paints)) return [];
    const findings = [];
    paints.forEach((paint, paintIndex) => {
      const target = { kind: "paint", field, paintIndex };
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
          reason: "Only solid paints can be checked or safely bound automatically."
        }));
        return;
      }
      const token = tokenForPaint(paint, inventory2);
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
          fingerprint
        }));
        return;
      }
      const suggestions = suggestionsForPaint(node, field === "fills" ? "Fill" : "Stroke", solid, inventory2, settings2, token?.key);
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
        reason: token ? "This variable is not from the enabled LUMI Design System." : "Hardcoded solid paint."
      }));
    });
    return findings;
  }
  function auditTextRanges(node, inventory2, settings2) {
    const findings = [];
    const segments = node.getStyledTextSegments(["fills", "boundVariables"]);
    segments.forEach((segment) => {
      const paints = segment.fills;
      if (!Array.isArray(paints)) return;
      paints.forEach((paint, paintIndex) => {
        const target = { kind: "paint", field: "fills", paintIndex, range: { start: segment.start, end: segment.end } };
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
            reason: "Only solid text paints can be checked automatically."
          }));
          return;
        }
        const rangeBindings = segment.boundVariables;
        const fillsBinding = rangeBindings?.fills;
        const boundId = Array.isArray(fillsBinding) ? fillsBinding[paintIndex]?.id : fillsBinding?.id;
        const token = boundId ? inventory2.tokenById.get(boundId) : void 0;
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
            suggestions: suggestionsForPaint(node, "Text fill", solid, inventory2, settings2, token?.key),
            reason: token ? "This variable is not from the enabled LUMI Design System." : "Hardcoded text paint."
          }));
        }
      });
    });
    return findings;
  }
  function auditColors(node, inventory2, settings2) {
    const findings = [
      node.type === "TEXT" ? [] : auditPaintArray(node, "fills", "fills" in node ? node.fills : [], inventory2, settings2),
      auditPaintArray(node, "strokes", "strokes" in node ? node.strokes : [], inventory2, settings2)
    ].flat();
    if (node.type === "TEXT" && node.characters.length > 0) findings.push(...auditTextRanges(node, inventory2, settings2));
    return findings;
  }

  // src/core/dimensionAudit.ts
  var dimensionFields = ["itemSpacing", "counterAxisSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "cornerRadius", "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
  function displayValue(value) {
    return `${Number.isInteger(value) ? value : value.toFixed(2)} px`;
  }
  function valueForField(node, field) {
    return field in node ? node[field] : void 0;
  }
  function auditDimensions(node, inventory2, settings2) {
    const findings = [];
    const radiusValues = ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"].map((field) => valueForField(node, field));
    const independentRadii = radiusValues.some((value) => typeof value === "number") && new Set(radiusValues.filter((value) => typeof value === "number")).size > 1;
    for (const field of dimensionFields) {
      const value = valueForField(node, field);
      if (typeof value !== "number" || value === 0) continue;
      if (field === "cornerRadius" && independentRadii) continue;
      const target = { kind: "dimension", field };
      const fingerprint = fingerprintForTarget(node, target);
      const bound = node.boundVariables?.[field];
      const token = bound && typeof bound === "object" && "id" in bound ? inventory2.tokenById.get(bound.id) : void 0;
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
          suggestions: rankSuggestions(approvedLumiTokens(inventory2), { role, resolvedType: "FLOAT", value, property: field, showPrimitiveTokens: settings2.showPrimitiveTokens, currentVariableKey: token?.key }),
          reason: token ? "This variable is not from the enabled LUMI Design System." : "Hardcoded numeric value."
        }));
      }
    }
    return findings;
  }

  // src/core/typographyAudit.ts
  function lineHeightValue(value) {
    return value.unit === "PIXELS" ? value.value : void 0;
  }
  function typographySegments(node) {
    return node.getStyledTextSegments(["fontName", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textStyleId", "boundVariables"]);
  }
  function styleMatches(node, style, range) {
    const segment = typographySegments(node).find((item) => !range || item.start < range.end && item.end > range.start);
    if (!segment) return false;
    const fontName = segment.fontName;
    const lineHeight = lineHeightValue(segment.lineHeight);
    const letterSpacing = `${segment.letterSpacing.value}${segment.letterSpacing.unit}`;
    return fontName.family === style.fontFamily && fontName.style === style.fontStyle && Math.abs(segment.fontSize - style.fontSize) < 0.01 && (style.lineHeight === "AUTO" || lineHeight === Number.parseFloat(style.lineHeight)) && style.letterSpacing === letterSpacing && style.textCase === segment.textCase && style.textDecoration === segment.textDecoration;
  }
  function styleSuggestions(styles, node, range) {
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
      canApply: true
    }));
  }
  function nearestStyleSuggestions(styles, node, range) {
    const segment = typographySegments(node).find((item) => !range || item.start < range.end && item.end > range.start);
    if (!segment) return [];
    return styles.filter((style) => style.isCanonical).map((style) => {
      let score = 0;
      if (style.fontFamily === segment.fontName.family) score += 35;
      if (style.fontStyle === segment.fontName.style) score += 20;
      score += Math.max(0, 25 - Math.abs(style.fontSize - segment.fontSize));
      const styleLineHeight = Number.parseFloat(style.lineHeight);
      const currentLineHeight = lineHeightValue(segment.lineHeight);
      if (currentLineHeight !== void 0 && Number.isFinite(styleLineHeight)) score += Math.max(0, 20 - Math.abs(styleLineHeight - currentLineHeight));
      return {
        id: `style:${style.id}`,
        tokenName: style.name,
        tokenKey: style.key,
        source: "style",
        resolvedType: "TEXT_STYLE",
        score: Math.round(score),
        confidence: score >= 75 ? "high" : score >= 52 ? "medium" : "low",
        matchType: "semantic",
        rationale: style.isLegacyDuplicate ? "Legacy duplicate; the canonical line-height variant is preferred" : "Closest live LUMI typography style",
        canApply: true
      };
    }).sort((a, b) => b.score - a.score).slice(0, 4);
  }
  function auditTypography(node, inventory2, _settings) {
    if (!node.characters.length) return [];
    const segments = typographySegments(node);
    const findings = [];
    for (const segment of segments) {
      const range = segments.length > 1 ? { start: segment.start, end: segment.end } : void 0;
      const target = { kind: "text-style", ...range ? { range } : {} };
      const fingerprint = fingerprintForTarget(node, target);
      const localStyle = segment.textStyleId && segment.textStyleId !== figma.mixed ? inventory2.textStyles.find((style) => style.id === segment.textStyleId) : void 0;
      const canonical = localStyle && isCanonicalTextStyle(localStyle.name) && localStyle.isCanonical && isPreferredTextStyle(localStyle.name, lineHeightValue(segment.lineHeight));
      if (canonical) {
        findings.push(matchFinding({ node, category: "typography", property: "Typography", target, currentValue: { fontSize: segment.fontSize, fontName: segment.fontName }, currentDisplayValue: localStyle.name, currentStyleName: localStyle.name, fingerprint }));
        continue;
      }
      const suggestions = styleSuggestions(inventory2.textStyles, node, range).length ? styleSuggestions(inventory2.textStyles, node, range) : nearestStyleSuggestions(inventory2.textStyles, node, range);
      if (node.hasMissingFont) {
        findings.push(unsupportedFinding({ node, category: "typography", property: "Typography", target, currentValue: { fontSize: segment.fontSize, fontName: segment.fontName }, currentDisplayValue: localStyle?.name ?? "Manual typography", fingerprint, reason: "The text node uses a missing font. Resolve the font before applying a typography style." }));
      } else {
        findings.push(violationFinding({ node, category: "typography", property: "Typography", target, currentValue: { fontSize: segment.fontSize, fontName: segment.fontName, lineHeight: segment.lineHeight }, currentDisplayValue: localStyle?.name ?? "Hardcoded typography", currentStyleName: localStyle?.name, fingerprint, suggestions, reason: localStyle ? "This text style is not a preferred canonical LUMI style." : "Manually assembled typography." }));
      }
    }
    return findings;
  }

  // src/core/componentAudit.ts
  function approvedSuggestion(name, key) {
    return {
      id: `component:${key}`,
      tokenName: name,
      tokenKey: key,
      source: "style",
      resolvedType: "COMPONENT",
      score: 0,
      confidence: "low",
      matchType: "manual",
      rationale: "Replace manually with the approved LUMI component",
      canApply: false
    };
  }
  async function auditComponent(node, _inventory, _settings) {
    const target = { kind: "component" };
    const fingerprint = fingerprintForTarget(node, target);
    const main = await node.getMainComponentAsync().catch(() => null);
    const componentKey = main?.key;
    if (!main || !componentKey) {
      return violationFinding({
        node,
        category: "components",
        property: "Component source",
        target,
        currentValue: null,
        currentDisplayValue: "Missing main component",
        fingerprint,
        suggestions: [],
        reason: "This instance's main component could not be verified.",
        status: "manual-review"
      });
    }
    const approved = approvedComponents.find((component) => component.key === componentKey);
    if (approved) {
      return matchFinding({ node, category: "components", property: "Component source", target, currentValue: { key: componentKey, name: main.name }, currentDisplayValue: approved.name, fingerprint });
    }
    const detached = Boolean(node.detachedInfo) || !main.remote;
    return violationFinding({
      node,
      category: "components",
      property: "Component source",
      target,
      currentValue: { key: componentKey, name: main.name, remote: main.remote },
      currentDisplayValue: detached ? "Detached / unapproved component" : main.name,
      fingerprint,
      suggestions: main.remote ? [approvedSuggestion("Approved LUMI component", componentKey)] : [],
      reason: detached ? "Detached from a library component. Replace manually with the approved LUMI component." : "This component source is not in the configured LUMI allowlist.",
      status: "manual-review"
    });
  }

  // src/core/contrastAudit.ts
  function firstSolidPaint(node) {
    if (!node.fills || node.fills === figma.mixed || !Array.isArray(node.fills)) return void 0;
    const paint = node.fills.map(solidPaint).find(Boolean);
    return paint ? paintColor(paint) : void 0;
  }
  function backgroundFor(node) {
    let parent = node.parent;
    while (parent && parent.type !== "PAGE" && parent.type !== "DOCUMENT") {
      if ("fills" in parent) {
        if (parent.fills === figma.mixed) return { ambiguous: true };
        if (Array.isArray(parent.fills)) {
          const hasUnsupported = parent.fills.some((paint) => paint.type !== "SOLID");
          const color = firstSolidPaint(parent);
          if (color) return { color, ambiguous: hasUnsupported };
          if (hasUnsupported) return { ambiguous: true };
        }
      }
      parent = parent.parent;
    }
    return { ambiguous: false };
  }
  function auditContrast(node, settings2) {
    const foreground = firstSolidPaint(node);
    const background = backgroundFor(node);
    const target = { kind: "contrast" };
    const fingerprint = fingerprintForTarget(node, target);
    const required = settings2.contrastLevel === "AAA" ? 7 : 4.5;
    if (!foreground || !background.color || background.ambiguous) {
      return makeFinding({ nodeId: node.id, nodeName: node.name, nodeType: node.type, category: "colors", property: "Contrast", target, currentValue: null, currentDisplayValue: "Contrast unavailable", status: "manual-review", suggestions: [], canApply: false, reason: "Contrast could not be determined automatically.", fingerprint });
    }
    const ratio = contrastRatio(composite(foreground, background.color), background.color);
    const pass = ratio >= required;
    return makeFinding({ nodeId: node.id, nodeName: node.name, nodeType: node.type, category: "colors", property: "Contrast", target, currentValue: { foreground, background: background.color, ratio, required }, currentDisplayValue: `${ratio.toFixed(2)}:1 \xB7 ${pass ? "Pass" : "Fail"}`, status: pass ? "match" : "violation", suggestions: [], canApply: false, reason: pass ? void 0 : `Requires at least ${required}:1 for ${settings2.contrastLevel}.`, fingerprint });
  }

  // src/core/scanner.ts
  var MAX_SCAN_LAYERS = 25e3;
  function now() {
    return Date.now();
  }
  var ScanLimitError = class extends Error {
    constructor() {
      super("Your selection contains more than 25,000 layers. Reduce the selection and try again.");
      this.name = "ScanLimitError";
    }
  };
  function rootsForTarget(target) {
    return target === "selection" && figma.currentPage.selection.length ? figma.currentPage.selection : figma.currentPage.children;
  }
  function collectNodes(target, settings2, onProgress) {
    const roots = rootsForTarget(target);
    const queue = [...roots];
    const nodes = [];
    const seen = /* @__PURE__ */ new Set();
    while (queue.length) {
      const node = queue.shift();
      if (!node || seen.has(node.id)) continue;
      seen.add(node.id);
      if (!isVisible(node, settings2.includeHidden)) continue;
      if (settings2.ignoredNodeNamePatterns.some((pattern) => pattern && node.name.toLowerCase().includes(pattern.toLowerCase()))) continue;
      nodes.push(node);
      if (nodes.length > MAX_SCAN_LAYERS) throw new ScanLimitError();
      if (nodes.length % 150 === 0) onProgress(nodes.length, Math.max(nodes.length, roots.length));
      if (node.type === "INSTANCE" && !settings2.inspectNestedInstanceInternals) continue;
      if ("children" in node) queue.push(...node.children);
    }
    onProgress(nodes.length, nodes.length);
    return nodes;
  }
  async function scanPage(target, settings2, inventory2, onProgress) {
    const started = now();
    await figma.currentPage.loadAsync();
    const nodes = collectNodes(target, settings2, onProgress);
    const findings = [];
    for (const node of nodes) {
      if (settings2.checkColors) findings.push(...auditColors(node, inventory2, settings2));
      if (settings2.checkDimensions) findings.push(...auditDimensions(node, inventory2, settings2));
      if (settings2.checkTypography && node.type === "TEXT") findings.push(...auditTypography(node, inventory2, settings2));
      if (settings2.checkContrast && node.type === "TEXT") {
        const contrast = auditContrast(node, settings2);
        if (contrast) findings.push(contrast);
      }
      if (settings2.checkComponents && node.type === "INSTANCE") {
        const componentFinding = await auditComponent(node, inventory2, settings2);
        if (componentFinding) findings.push(componentFinding);
      }
    }
    const summary = {
      total: findings.length,
      fixable: findings.filter((finding) => finding.canApply).length,
      manualReview: findings.filter((finding) => finding.status === "manual-review").length,
      matches: findings.filter((finding) => finding.status === "match").length,
      unsupported: findings.filter((finding) => finding.status === "unsupported").length
    };
    return { findings, scannedLayerCount: nodes.length, target, durationMs: Math.max(0, now() - started), summary, libraryStatus: inventory2.libraryStatus };
  }

  // src/code.ts
  figma.showUI('<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>LUMI Lens \u2014 Design Check</title>\n    \n    <style>:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:12px;color:var(--figma-color-text, #1e1e1e);background:var(--figma-color-bg, #fff);font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-width:440px;background:var(--figma-color-bg, #fff)}button,select,input{font:inherit}button{color:inherit;border:0;cursor:pointer}button:disabled{cursor:default;opacity:.48}.boot-fallback{display:flex;flex-direction:column;gap:6px;padding:24px 16px;color:var(--figma-color-text, #1e1e1e)}.boot-fallback span{color:var(--figma-color-text-secondary, rgba(0,0,0,.58));font-size:11px}.app-shell{min-height:720px;padding-bottom:24px;background:var(--figma-color-bg, #fff)}.header{display:flex;align-items:center;gap:10px;height:58px;padding:0 16px;border-bottom:1px solid var(--figma-color-border, rgba(0,0,0,.12))}.brand-mark{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--figma-color-bg-brand, #7c5cff);color:var(--figma-color-text-onbrand, #fff);font-size:19px;font-weight:800;transform:rotate(-8deg)}.brand-mark span{transform:rotate(8deg)}.brand-copy{display:flex;flex-direction:column;gap:2px;flex:1}.brand-copy strong{font-size:13px;letter-spacing:-.1px}.brand-copy span,.settings-top span{color:var(--figma-color-text-secondary, rgba(0,0,0,.55));font-size:11px}.header-actions{display:flex;gap:2px}.icon-button{width:28px;height:28px;display:grid;place-items:center;border-radius:6px;background:transparent;color:var(--figma-color-text-secondary, rgba(0,0,0,.55));font-size:16px}.icon-button:hover,.back-button:hover{background:var(--figma-color-bg-hover, rgba(0,0,0,.07));color:var(--figma-color-text, #1e1e1e)}.target-section{padding:17px 16px 15px;border-bottom:1px solid var(--figma-color-border, rgba(0,0,0,.12))}.section-eyebrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;color:var(--figma-color-text-tertiary, rgba(0,0,0,.45));font-size:10px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.reload-button{padding:0;background:transparent;color:var(--figma-color-text-brand, #6d53d8);font-size:11px;letter-spacing:0;text-transform:none}.segmented{display:flex;gap:2px;padding:2px;border-radius:7px;background:var(--figma-color-bg-secondary, rgba(0,0,0,.06))}.segmented button{flex:1;padding:7px 8px;border-radius:5px;background:transparent;color:var(--figma-color-text-secondary, rgba(0,0,0,.62))}.segmented button.active{background:var(--figma-color-bg, #fff);color:var(--figma-color-text, #1e1e1e);box-shadow:0 1px 3px #0000001f;font-weight:650}.target-meta{display:flex;align-items:end;justify-content:space-between;margin:14px 1px 11px}.target-meta>div{display:flex;flex-direction:column;gap:3px}.meta-label,.layer-count span{color:var(--figma-color-text-tertiary, rgba(0,0,0,.45));font-size:10px}.layer-count{text-align:right}.notice{border-radius:6px;padding:8px 9px;margin:0 0 11px;color:var(--figma-color-text-secondary, rgba(0,0,0,.65));background:var(--figma-color-bg-secondary, rgba(0,0,0,.06));font-size:11px}.primary-button{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:9px 12px;border-radius:6px;background:var(--figma-color-bg-brand, #7c5cff);color:var(--figma-color-text-onbrand, #fff);font-weight:700}.primary-button span{opacity:.65;font-size:10px;font-weight:500}.library-banner,.error-banner,.apply-notice{display:flex;align-items:flex-start;gap:9px;margin:12px 16px 0;padding:10px;border-radius:7px;background:var(--figma-color-bg-warning, rgba(255,183,0,.13));color:var(--figma-color-text-warning, #a06400)}.library-banner>div:last-child,.error-banner>span{display:flex;flex-direction:column;gap:3px;line-height:1.35}.library-banner span{font-size:11px}.banner-icon{flex:none;display:grid;place-items:center;width:17px;height:17px;border-radius:50%;background:currentColor;color:var(--figma-color-bg-warning, #fff);font-weight:800}.progress-line{height:2px;background:var(--figma-color-bg-secondary, rgba(0,0,0,.08))}.progress-line span{display:block;height:100%;background:var(--figma-color-bg-brand, #7c5cff);transition:width .2s ease}.error-banner{background:var(--figma-color-bg-danger, rgba(242,72,72,.12));color:var(--figma-color-text-danger, #c83b3b)}.error-banner button{margin-left:auto;padding:4px 7px;border-radius:4px;background:transparent;color:inherit;font-weight:700}.summary-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;margin:13px 16px 0;overflow:hidden;border:1px solid var(--figma-color-border, rgba(0,0,0,.12));border-radius:7px;background:var(--figma-color-border, rgba(0,0,0,.12))}.summary-grid>div{display:flex;flex-direction:column;gap:3px;padding:9px 8px;background:var(--figma-color-bg, #fff)}.summary-grid strong{font-size:16px;letter-spacing:-.4px}.summary-grid span{color:var(--figma-color-text-tertiary, rgba(0,0,0,.48));font-size:10px;white-space:nowrap}.summary-grid .accent strong{color:var(--figma-color-text-brand, #6d53d8)}.summary-grid .warning strong{color:var(--figma-color-text-warning, #a06400)}.summary-grid .success strong{color:var(--figma-color-text-success, #138a4b)}.summary-grid .unsupported strong{color:var(--figma-color-text-tertiary, rgba(0,0,0,.55))}.results-section{padding:16px}.results-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.finding-heading{display:flex;flex-direction:column;gap:3px;padding:0;background:transparent;text-align:left}.finding-heading span{color:var(--figma-color-text-tertiary, rgba(0,0,0,.45));font-size:10px}.toolbar-actions{display:flex;gap:5px}.secondary-button{padding:6px 7px;border:1px solid var(--figma-color-border, rgba(0,0,0,.14));border-radius:5px;background:var(--figma-color-bg, #fff);color:var(--figma-color-text, #1e1e1e);font-size:10px;font-weight:650}.tabs{display:flex;gap:3px;border-bottom:1px solid var(--figma-color-border, rgba(0,0,0,.12))}.tabs button{display:flex;align-items:center;gap:5px;padding:8px 7px 9px;border-bottom:2px solid transparent;background:transparent;color:var(--figma-color-text-secondary, rgba(0,0,0,.58));font-size:11px}.tabs button.active{border-color:var(--figma-color-bg-brand, #7c5cff);color:var(--figma-color-text, #1e1e1e);font-weight:700}.tab-icon{opacity:.75;font-size:11px}.tabs em{display:grid;place-items:center;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--figma-color-bg-secondary, rgba(0,0,0,.07));color:var(--figma-color-text-tertiary, rgba(0,0,0,.5));font-size:9px;font-style:normal}.finding-list{display:flex;flex-direction:column;gap:5px;padding-top:8px}.finding-row{display:flex;gap:8px;padding:9px 7px;border:1px solid transparent;border-radius:7px}.finding-row:hover,.finding-row.selected{border-color:var(--figma-color-border, rgba(0,0,0,.14));background:var(--figma-color-bg-secondary, rgba(0,0,0,.045))}.checkbox{flex:none;width:15px;height:15px;margin-top:2px;padding:0;border:1px solid var(--figma-color-border-strong, rgba(0,0,0,.28));border-radius:4px;background:transparent;color:var(--figma-color-text-onbrand, #fff);font-size:10px;line-height:14px}.checkbox.checked{border-color:var(--figma-color-bg-brand, #7c5cff);background:var(--figma-color-bg-brand, #7c5cff)}.finding-main{min-width:0;flex:1}.finding-title{display:flex;align-items:center;gap:5px;min-width:0}.finding-title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.node-type{color:var(--figma-color-text-tertiary, rgba(0,0,0,.4));font-size:9px}.status-icon{display:grid;place-items:center;width:14px;height:14px;border-radius:4px;background:var(--figma-color-bg-secondary, rgba(0,0,0,.08));color:var(--figma-color-text-secondary, rgba(0,0,0,.6));font-size:10px}.status-violation{color:var(--figma-color-text-brand, #6d53d8)}.status-manual-review{background:var(--figma-color-bg-warning, rgba(255,183,0,.17));color:var(--figma-color-text-warning, #a06400)}.status-unsupported{color:var(--figma-color-text-tertiary, rgba(0,0,0,.45))}.status-match{background:var(--figma-color-bg-success, rgba(20,150,80,.12));color:var(--figma-color-text-success, #138a4b)}.finding-property{display:flex;align-items:center;gap:6px;margin:3px 0 7px 19px;color:var(--figma-color-text-secondary, rgba(0,0,0,.58));font-size:10px}.range{color:var(--figma-color-text-tertiary, rgba(0,0,0,.4))}.finding-values{display:flex;align-items:center;gap:6px;margin-left:19px;min-width:0}.current-value{overflow:hidden;max-width:105px;text-overflow:ellipsis;white-space:nowrap;color:var(--figma-color-text-secondary, rgba(0,0,0,.72));font-size:10px}.arrow{color:var(--figma-color-text-tertiary, rgba(0,0,0,.4))}.suggestion-wrap{position:relative;min-width:0;flex:1}.suggestion-button{display:flex;align-items:center;gap:5px;width:100%;padding:0;overflow:hidden;background:transparent;text-align:left}.suggestion-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--figma-color-bg-brand, #7c5cff)}.suggestion-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--figma-color-text-brand, #6d53d8);font-size:10px}.confidence{flex:none;color:var(--figma-color-text-tertiary, rgba(0,0,0,.45));font-size:9px}.chevron{color:var(--figma-color-text-tertiary, rgba(0,0,0,.45))}.suggestion-menu{position:absolute;z-index:4;top:20px;left:0;right:0;display:flex;flex-direction:column;padding:4px;border:1px solid var(--figma-color-border, rgba(0,0,0,.16));border-radius:6px;background:var(--figma-color-bg, #fff);box-shadow:0 5px 16px #00000029}.suggestion-menu button{display:flex;flex-direction:column;gap:2px;padding:7px;border-radius:4px;background:transparent;text-align:left}.suggestion-menu button:hover{background:var(--figma-color-bg-hover, rgba(0,0,0,.06))}.suggestion-menu small{color:var(--figma-color-text-tertiary, rgba(0,0,0,.5));font-size:9px}.no-suggestion{color:var(--figma-color-text-tertiary, rgba(0,0,0,.45));font-size:10px}.row-apply{align-self:center;padding:4px 6px;border-radius:4px;background:transparent;color:var(--figma-color-text-brand, #6d53d8);font-size:10px;font-weight:650}.row-apply:hover{background:var(--figma-color-bg-hover, rgba(0,0,0,.06))}.finding-reason{margin:6px 0 0 19px;color:var(--figma-color-text-tertiary, rgba(0,0,0,.5));font-size:10px;line-height:1.35}.apply-notice{margin:10px 0 0;padding:7px 9px;background:var(--figma-color-bg-success, rgba(20,150,80,.12));color:var(--figma-color-text-success, #138a4b);font-size:11px}.empty-state{display:flex;flex-direction:column;align-items:center;gap:6px;padding:45px 28px;color:var(--figma-color-text-secondary, rgba(0,0,0,.62));text-align:center}.empty-icon{display:grid;place-items:center;width:35px;height:35px;margin-bottom:5px;border-radius:11px;background:var(--figma-color-bg-secondary, rgba(0,0,0,.07));color:var(--figma-color-text-brand, #6d53d8);font-size:19px}.empty-state span{max-width:260px;color:var(--figma-color-text-tertiary, rgba(0,0,0,.45));font-size:11px;line-height:1.45}.settings-panel{min-height:720px;background:var(--figma-color-bg, #fff)}.settings-top{display:flex;align-items:center;gap:10px;height:58px;padding:0 16px;border-bottom:1px solid var(--figma-color-border, rgba(0,0,0,.12))}.settings-top>div{display:flex;flex-direction:column;gap:2px}.back-button{width:27px;height:27px;border-radius:6px;background:transparent;font-size:17px}.settings-scroll{padding:18px 16px}.setting-group{margin-bottom:23px}.toggle-row{display:flex;align-items:center;justify-content:space-between;min-height:34px;border-bottom:1px solid var(--figma-color-border, rgba(0,0,0,.08))}.toggle-row input{position:absolute;opacity:0}.toggle-row i{position:relative;width:28px;height:16px;border-radius:10px;background:var(--figma-color-bg-secondary, rgba(0,0,0,.14));transition:.15s ease}.toggle-row i:after{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--figma-color-bg, #fff);box-shadow:0 1px 2px #0000002e;content:"";transition:.15s ease}.toggle-row input:checked+i{background:var(--figma-color-bg-brand, #7c5cff)}.toggle-row input:checked+i:after{transform:translate(12px)}.select-setting,.setting-info{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:37px;padding:7px 0;border-bottom:1px solid var(--figma-color-border, rgba(0,0,0,.08))}.select-setting select{padding:3px 5px;border:1px solid var(--figma-color-border, rgba(0,0,0,.14));border-radius:4px;background:var(--figma-color-bg, #fff)}.setting-info{flex-wrap:wrap}.setting-info span{flex:1}.setting-info strong{text-align:right}.setting-info small{flex-basis:100%;color:var(--figma-color-text-tertiary, rgba(0,0,0,.5));line-height:1.35}.setting-info code{font-size:10px}@media(prefers-color-scheme:dark){.segmented button.active,.suggestion-menu,.secondary-button,.select-setting select{box-shadow:0 1px 3px #00000059}}.duplicate-styles{display:flex;flex-direction:column;gap:4px;padding:9px 0;color:var(--figma-color-text-secondary, rgba(0,0,0,.65))}.duplicate-styles strong{font-size:11px}.duplicate-styles span{color:var(--figma-color-text-tertiary, rgba(0,0,0,.5));font-size:10px}\n</style>\n  </head>\n  <body>\n    <div id="root">\n      <div class="boot-fallback" role="status">\n        <strong>LUMI Lens</strong>\n        <span>Loading Design Check\u2026</span>\n      </div>\n    </div>\n  <script>(function(){const N=document.createElement("link").relList;if(N&&N.supports&&N.supports("modulepreload"))return;for(const U of document.querySelectorAll(\'link[rel="modulepreload"]\'))G(U);new MutationObserver(U=>{for(const D of U)if(D.type==="childList")for(const B of D.addedNodes)B.tagName==="LINK"&&B.rel==="modulepreload"&&G(B)}).observe(document,{childList:!0,subtree:!0});function m(U){const D={};return U.integrity&&(D.integrity=U.integrity),U.referrerPolicy&&(D.referrerPolicy=U.referrerPolicy),U.crossOrigin==="use-credentials"?D.credentials="include":U.crossOrigin==="anonymous"?D.credentials="omit":D.credentials="same-origin",D}function G(U){if(U.ep)return;U.ep=!0;const D=m(U);fetch(U.href,D)}})();function Of(v){return v&&v.__esModule&&Object.prototype.hasOwnProperty.call(v,"default")?v.default:v}var _o={exports:{}},Sr={},jo={exports:{}},H={};/**\n * @license React\n * react.production.min.js\n *\n * Copyright (c) Facebook, Inc. and its affiliates.\n *\n * This source code is licensed under the MIT license found in the\n * LICENSE file in the root directory of this source tree.\n */var ja;function Df(){if(ja)return H;ja=1;var v=Symbol.for("react.element"),N=Symbol.for("react.portal"),m=Symbol.for("react.fragment"),G=Symbol.for("react.strict_mode"),U=Symbol.for("react.profiler"),D=Symbol.for("react.provider"),B=Symbol.for("react.context"),M=Symbol.for("react.forward_ref"),$=Symbol.for("react.suspense"),xe=Symbol.for("react.memo"),se=Symbol.for("react.lazy"),q=Symbol.iterator;function J(c){return c===null||typeof c!="object"?null:(c=q&&c[q]||c["@@iterator"],typeof c=="function"?c:null)}var Ae={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},Ne=Object.assign,b={};function X(c,y,x){this.props=c,this.context=y,this.refs=b,this.updater=x||Ae}X.prototype.isReactComponent={},X.prototype.setState=function(c,y){if(typeof c!="object"&&typeof c!="function"&&c!=null)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,c,y,"setState")},X.prototype.forceUpdate=function(c){this.updater.enqueueForceUpdate(this,c,"forceUpdate")};function en(){}en.prototype=X.prototype;function Ve(c,y,x){this.props=c,this.context=y,this.refs=b,this.updater=x||Ae}var _e=Ve.prototype=new en;_e.constructor=Ve,Ne(_e,X.prototype),_e.isPureReactComponent=!0;var me=Array.isArray,Ie=Object.prototype.hasOwnProperty,ve={current:null},ye={key:!0,ref:!0,__self:!0,__source:!0};function Me(c,y,x){var E,A={},V=null,W=null;if(y!=null)for(E in y.ref!==void 0&&(W=y.ref),y.key!==void 0&&(V=""+y.key),y)Ie.call(y,E)&&!ye.hasOwnProperty(E)&&(A[E]=y[E]);var Q=arguments.length-2;if(Q===1)A.children=x;else if(1<Q){for(var ee=Array(Q),De=0;De<Q;De++)ee[De]=arguments[De+2];A.children=ee}if(c&&c.defaultProps)for(E in Q=c.defaultProps,Q)A[E]===void 0&&(A[E]=Q[E]);return{$$typeof:v,type:c,key:V,ref:W,props:A,_owner:ve.current}}function an(c,y){return{$$typeof:v,type:c.type,key:y,ref:c.ref,props:c.props,_owner:c._owner}}function Ye(c){return typeof c=="object"&&c!==null&&c.$$typeof===v}function je(c){var y={"=":"=0",":":"=2"};return"$"+c.replace(/[=:]/g,function(x){return y[x]})}var nn=/\\/+/g;function Oe(c,y){return typeof c=="object"&&c!==null&&c.key!=null?je(""+c.key):y.toString(36)}function Ge(c,y,x,E,A){var V=typeof c;(V==="undefined"||V==="boolean")&&(c=null);var W=!1;if(c===null)W=!0;else switch(V){case"string":case"number":W=!0;break;case"object":switch(c.$$typeof){case v:case N:W=!0}}if(W)return W=c,A=A(W),c=E===""?"."+Oe(W,0):E,me(A)?(x="",c!=null&&(x=c.replace(nn,"$&/")+"/"),Ge(A,y,x,"",function(De){return De})):A!=null&&(Ye(A)&&(A=an(A,x+(!A.key||W&&W.key===A.key?"":(""+A.key).replace(nn,"$&/")+"/")+c)),y.push(A)),1;if(W=0,E=E===""?".":E+":",me(c))for(var Q=0;Q<c.length;Q++){V=c[Q];var ee=E+Oe(V,Q);W+=Ge(V,y,x,ee,A)}else if(ee=J(c),typeof ee=="function")for(c=ee.call(c),Q=0;!(V=c.next()).done;)V=V.value,ee=E+Oe(V,Q++),W+=Ge(V,y,x,ee,A);else if(V==="object")throw y=String(c),Error("Objects are not valid as a React child (found: "+(y==="[object Object]"?"object with keys {"+Object.keys(c).join(", ")+"}":y)+"). If you meant to render a collection of children, use an array instead.");return W}function Xe(c,y,x){if(c==null)return c;var E=[],A=0;return Ge(c,E,"","",function(V){return y.call(x,V,A++)}),E}function Pe(c){if(c._status===-1){var y=c._result;y=y(),y.then(function(x){(c._status===0||c._status===-1)&&(c._status=1,c._result=x)},function(x){(c._status===0||c._status===-1)&&(c._status=2,c._result=x)}),c._status===-1&&(c._status=0,c._result=y)}if(c._status===1)return c._result.default;throw c._result}var le={current:null},C={transition:null},O={ReactCurrentDispatcher:le,ReactCurrentBatchConfig:C,ReactCurrentOwner:ve};function j(){throw Error("act(...) is not supported in production builds of React.")}return H.Children={map:Xe,forEach:function(c,y,x){Xe(c,function(){y.apply(this,arguments)},x)},count:function(c){var y=0;return Xe(c,function(){y++}),y},toArray:function(c){return Xe(c,function(y){return y})||[]},only:function(c){if(!Ye(c))throw Error("React.Children.only expected to receive a single React element child.");return c}},H.Component=X,H.Fragment=m,H.Profiler=U,H.PureComponent=Ve,H.StrictMode=G,H.Suspense=$,H.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=O,H.act=j,H.cloneElement=function(c,y,x){if(c==null)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+c+".");var E=Ne({},c.props),A=c.key,V=c.ref,W=c._owner;if(y!=null){if(y.ref!==void 0&&(V=y.ref,W=ve.current),y.key!==void 0&&(A=""+y.key),c.type&&c.type.defaultProps)var Q=c.type.defaultProps;for(ee in y)Ie.call(y,ee)&&!ye.hasOwnProperty(ee)&&(E[ee]=y[ee]===void 0&&Q!==void 0?Q[ee]:y[ee])}var ee=arguments.length-2;if(ee===1)E.children=x;else if(1<ee){Q=Array(ee);for(var De=0;De<ee;De++)Q[De]=arguments[De+2];E.children=Q}return{$$typeof:v,type:c.type,key:A,ref:V,props:E,_owner:W}},H.createContext=function(c){return c={$$typeof:B,_currentValue:c,_currentValue2:c,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null},c.Provider={$$typeof:D,_context:c},c.Consumer=c},H.createElement=Me,H.createFactory=function(c){var y=Me.bind(null,c);return y.type=c,y},H.createRef=function(){return{current:null}},H.forwardRef=function(c){return{$$typeof:M,render:c}},H.isValidElement=Ye,H.lazy=function(c){return{$$typeof:se,_payload:{_status:-1,_result:c},_init:Pe}},H.memo=function(c,y){return{$$typeof:xe,type:c,compare:y===void 0?null:y}},H.startTransition=function(c){var y=C.transition;C.transition={};try{c()}finally{C.transition=y}},H.unstable_act=j,H.useCallback=function(c,y){return le.current.useCallback(c,y)},H.useContext=function(c){return le.current.useContext(c)},H.useDebugValue=function(){},H.useDeferredValue=function(c){return le.current.useDeferredValue(c)},H.useEffect=function(c,y){return le.current.useEffect(c,y)},H.useId=function(){return le.current.useId()},H.useImperativeHandle=function(c,y,x){return le.current.useImperativeHandle(c,y,x)},H.useInsertionEffect=function(c,y){return le.current.useInsertionEffect(c,y)},H.useLayoutEffect=function(c,y){return le.current.useLayoutEffect(c,y)},H.useMemo=function(c,y){return le.current.useMemo(c,y)},H.useReducer=function(c,y,x){return le.current.useReducer(c,y,x)},H.useRef=function(c){return le.current.useRef(c)},H.useState=function(c){return le.current.useState(c)},H.useSyncExternalStore=function(c,y,x){return le.current.useSyncExternalStore(c,y,x)},H.useTransition=function(){return le.current.useTransition()},H.version="18.3.1",H}var Pa;function Ro(){return Pa||(Pa=1,jo.exports=Df()),jo.exports}/**\n * @license React\n * react-jsx-runtime.production.min.js\n *\n * Copyright (c) Facebook, Inc. and its affiliates.\n *\n * This source code is licensed under the MIT license found in the\n * LICENSE file in the root directory of this source tree.\n */var La;function Ff(){if(La)return Sr;La=1;var v=Ro(),N=Symbol.for("react.element"),m=Symbol.for("react.fragment"),G=Object.prototype.hasOwnProperty,U=v.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,D={key:!0,ref:!0,__self:!0,__source:!0};function B(M,$,xe){var se,q={},J=null,Ae=null;xe!==void 0&&(J=""+xe),$.key!==void 0&&(J=""+$.key),$.ref!==void 0&&(Ae=$.ref);for(se in $)G.call($,se)&&!D.hasOwnProperty(se)&&(q[se]=$[se]);if(M&&M.defaultProps)for(se in $=M.defaultProps,$)q[se]===void 0&&(q[se]=$[se]);return{$$typeof:N,type:M,key:J,ref:Ae,props:q,_owner:U.current}}return Sr.Fragment=m,Sr.jsx=B,Sr.jsxs=B,Sr}var Ta;function Uf(){return Ta||(Ta=1,_o.exports=Ff()),_o.exports}var p=Uf(),ke=Ro();const Af=Of(ke);var zl={},Po={exports:{}},Ke={},Lo={exports:{}},To={};/**\n * @license React\n * scheduler.production.min.js\n *\n * Copyright (c) Facebook, Inc. and its affiliates.\n *\n * This source code is licensed under the MIT license found in the\n * LICENSE file in the root directory of this source tree.\n */var za;function Vf(){return za||(za=1,(function(v){function N(C,O){var j=C.length;C.push(O);e:for(;0<j;){var c=j-1>>>1,y=C[c];if(0<U(y,O))C[c]=O,C[j]=y,j=c;else break e}}function m(C){return C.length===0?null:C[0]}function G(C){if(C.length===0)return null;var O=C[0],j=C.pop();if(j!==O){C[0]=j;e:for(var c=0,y=C.length,x=y>>>1;c<x;){var E=2*(c+1)-1,A=C[E],V=E+1,W=C[V];if(0>U(A,j))V<y&&0>U(W,A)?(C[c]=W,C[V]=j,c=V):(C[c]=A,C[E]=j,c=E);else if(V<y&&0>U(W,j))C[c]=W,C[V]=j,c=V;else break e}}return O}function U(C,O){var j=C.sortIndex-O.sortIndex;return j!==0?j:C.id-O.id}if(typeof performance=="object"&&typeof performance.now=="function"){var D=performance;v.unstable_now=function(){return D.now()}}else{var B=Date,M=B.now();v.unstable_now=function(){return B.now()-M}}var $=[],xe=[],se=1,q=null,J=3,Ae=!1,Ne=!1,b=!1,X=typeof setTimeout=="function"?setTimeout:null,en=typeof clearTimeout=="function"?clearTimeout:null,Ve=typeof setImmediate<"u"?setImmediate:null;typeof navigator<"u"&&navigator.scheduling!==void 0&&navigator.scheduling.isInputPending!==void 0&&navigator.scheduling.isInputPending.bind(navigator.scheduling);function _e(C){for(var O=m(xe);O!==null;){if(O.callback===null)G(xe);else if(O.startTime<=C)G(xe),O.sortIndex=O.expirationTime,N($,O);else break;O=m(xe)}}function me(C){if(b=!1,_e(C),!Ne)if(m($)!==null)Ne=!0,Pe(Ie);else{var O=m(xe);O!==null&&le(me,O.startTime-C)}}function Ie(C,O){Ne=!1,b&&(b=!1,en(Me),Me=-1),Ae=!0;var j=J;try{for(_e(O),q=m($);q!==null&&(!(q.expirationTime>O)||C&&!je());){var c=q.callback;if(typeof c=="function"){q.callback=null,J=q.priorityLevel;var y=c(q.expirationTime<=O);O=v.unstable_now(),typeof y=="function"?q.callback=y:q===m($)&&G($),_e(O)}else G($);q=m($)}if(q!==null)var x=!0;else{var E=m(xe);E!==null&&le(me,E.startTime-O),x=!1}return x}finally{q=null,J=j,Ae=!1}}var ve=!1,ye=null,Me=-1,an=5,Ye=-1;function je(){return!(v.unstable_now()-Ye<an)}function nn(){if(ye!==null){var C=v.unstable_now();Ye=C;var O=!0;try{O=ye(!0,C)}finally{O?Oe():(ve=!1,ye=null)}}else ve=!1}var Oe;if(typeof Ve=="function")Oe=function(){Ve(nn)};else if(typeof MessageChannel<"u"){var Ge=new MessageChannel,Xe=Ge.port2;Ge.port1.onmessage=nn,Oe=function(){Xe.postMessage(null)}}else Oe=function(){X(nn,0)};function Pe(C){ye=C,ve||(ve=!0,Oe())}function le(C,O){Me=X(function(){C(v.unstable_now())},O)}v.unstable_IdlePriority=5,v.unstable_ImmediatePriority=1,v.unstable_LowPriority=4,v.unstable_NormalPriority=3,v.unstable_Profiling=null,v.unstable_UserBlockingPriority=2,v.unstable_cancelCallback=function(C){C.callback=null},v.unstable_continueExecution=function(){Ne||Ae||(Ne=!0,Pe(Ie))},v.unstable_forceFrameRate=function(C){0>C||125<C?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):an=0<C?Math.floor(1e3/C):5},v.unstable_getCurrentPriorityLevel=function(){return J},v.unstable_getFirstCallbackNode=function(){return m($)},v.unstable_next=function(C){switch(J){case 1:case 2:case 3:var O=3;break;default:O=J}var j=J;J=O;try{return C()}finally{J=j}},v.unstable_pauseExecution=function(){},v.unstable_requestPaint=function(){},v.unstable_runWithPriority=function(C,O){switch(C){case 1:case 2:case 3:case 4:case 5:break;default:C=3}var j=J;J=C;try{return O()}finally{J=j}},v.unstable_scheduleCallback=function(C,O,j){var c=v.unstable_now();switch(typeof j=="object"&&j!==null?(j=j.delay,j=typeof j=="number"&&0<j?c+j:c):j=c,C){case 1:var y=-1;break;case 2:y=250;break;case 5:y=1073741823;break;case 4:y=1e4;break;default:y=5e3}return y=j+y,C={id:se++,callback:O,priorityLevel:C,startTime:j,expirationTime:y,sortIndex:-1},j>c?(C.sortIndex=j,N(xe,C),m($)===null&&C===m(xe)&&(b?(en(Me),Me=-1):b=!0,le(me,j-c))):(C.sortIndex=y,N($,C),Ne||Ae||(Ne=!0,Pe(Ie))),C},v.unstable_shouldYield=je,v.unstable_wrapCallback=function(C){var O=J;return function(){var j=J;J=O;try{return C.apply(this,arguments)}finally{J=j}}}})(To)),To}var Ra;function $f(){return Ra||(Ra=1,Lo.exports=Vf()),Lo.exports}/**\n * @license React\n * react-dom.production.min.js\n *\n * Copyright (c) Facebook, Inc. and its affiliates.\n *\n * This source code is licensed under the MIT license found in the\n * LICENSE file in the root directory of this source tree.\n */var Ia;function Bf(){if(Ia)return Ke;Ia=1;var v=Ro(),N=$f();function m(e){for(var n="https://reactjs.org/docs/error-decoder.html?invariant="+e,t=1;t<arguments.length;t++)n+="&args[]="+encodeURIComponent(arguments[t]);return"Minified React error #"+e+"; visit "+n+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}var G=new Set,U={};function D(e,n){B(e,n),B(e+"Capture",n)}function B(e,n){for(U[e]=n,e=0;e<n.length;e++)G.add(n[e])}var M=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),$=Object.prototype.hasOwnProperty,xe=/^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$/,se={},q={};function J(e){return $.call(q,e)?!0:$.call(se,e)?!1:xe.test(e)?q[e]=!0:(se[e]=!0,!1)}function Ae(e,n,t,r){if(t!==null&&t.type===0)return!1;switch(typeof n){case"function":case"symbol":return!0;case"boolean":return r?!1:t!==null?!t.acceptsBooleans:(e=e.toLowerCase().slice(0,5),e!=="data-"&&e!=="aria-");default:return!1}}function Ne(e,n,t,r){if(n===null||typeof n>"u"||Ae(e,n,t,r))return!0;if(r)return!1;if(t!==null)switch(t.type){case 3:return!n;case 4:return n===!1;case 5:return isNaN(n);case 6:return isNaN(n)||1>n}return!1}function b(e,n,t,r,l,i,o){this.acceptsBooleans=n===2||n===3||n===4,this.attributeName=r,this.attributeNamespace=l,this.mustUseProperty=t,this.propertyName=e,this.type=n,this.sanitizeURL=i,this.removeEmptyString=o}var X={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e){X[e]=new b(e,0,!1,e,null,!1,!1)}),[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(e){var n=e[0];X[n]=new b(n,1,!1,e[1],null,!1,!1)}),["contentEditable","draggable","spellCheck","value"].forEach(function(e){X[e]=new b(e,2,!1,e.toLowerCase(),null,!1,!1)}),["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(e){X[e]=new b(e,2,!1,e,null,!1,!1)}),"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e){X[e]=new b(e,3,!1,e.toLowerCase(),null,!1,!1)}),["checked","multiple","muted","selected"].forEach(function(e){X[e]=new b(e,3,!0,e,null,!1,!1)}),["capture","download"].forEach(function(e){X[e]=new b(e,4,!1,e,null,!1,!1)}),["cols","rows","size","span"].forEach(function(e){X[e]=new b(e,6,!1,e,null,!1,!1)}),["rowSpan","start"].forEach(function(e){X[e]=new b(e,5,!1,e.toLowerCase(),null,!1,!1)});var en=/[\\-:]([a-z])/g;function Ve(e){return e[1].toUpperCase()}"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e){var n=e.replace(en,Ve);X[n]=new b(n,1,!1,e,null,!1,!1)}),"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e){var n=e.replace(en,Ve);X[n]=new b(n,1,!1,e,"http://www.w3.org/1999/xlink",!1,!1)}),["xml:base","xml:lang","xml:space"].forEach(function(e){var n=e.replace(en,Ve);X[n]=new b(n,1,!1,e,"http://www.w3.org/XML/1998/namespace",!1,!1)}),["tabIndex","crossOrigin"].forEach(function(e){X[e]=new b(e,1,!1,e.toLowerCase(),null,!1,!1)}),X.xlinkHref=new b("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1),["src","href","action","formAction"].forEach(function(e){X[e]=new b(e,1,!1,e.toLowerCase(),null,!0,!0)});function _e(e,n,t,r){var l=X.hasOwnProperty(n)?X[n]:null;(l!==null?l.type!==0:r||!(2<n.length)||n[0]!=="o"&&n[0]!=="O"||n[1]!=="n"&&n[1]!=="N")&&(Ne(n,t,l,r)&&(t=null),r||l===null?J(n)&&(t===null?e.removeAttribute(n):e.setAttribute(n,""+t)):l.mustUseProperty?e[l.propertyName]=t===null?l.type===3?!1:"":t:(n=l.attributeName,r=l.attributeNamespace,t===null?e.removeAttribute(n):(l=l.type,t=l===3||l===4&&t===!0?"":""+t,r?e.setAttributeNS(r,n,t):e.setAttribute(n,t))))}var me=v.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,Ie=Symbol.for("react.element"),ve=Symbol.for("react.portal"),ye=Symbol.for("react.fragment"),Me=Symbol.for("react.strict_mode"),an=Symbol.for("react.profiler"),Ye=Symbol.for("react.provider"),je=Symbol.for("react.context"),nn=Symbol.for("react.forward_ref"),Oe=Symbol.for("react.suspense"),Ge=Symbol.for("react.suspense_list"),Xe=Symbol.for("react.memo"),Pe=Symbol.for("react.lazy"),le=Symbol.for("react.offscreen"),C=Symbol.iterator;function O(e){return e===null||typeof e!="object"?null:(e=C&&e[C]||e["@@iterator"],typeof e=="function"?e:null)}var j=Object.assign,c;function y(e){if(c===void 0)try{throw Error()}catch(t){var n=t.stack.trim().match(/\\n( *(at )?)/);c=n&&n[1]||""}return`\n`+c+e}var x=!1;function E(e,n){if(!e||x)return"";x=!0;var t=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{if(n)if(n=function(){throw Error()},Object.defineProperty(n.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(n,[])}catch(h){var r=h}Reflect.construct(e,[],n)}else{try{n.call()}catch(h){r=h}e.call(n.prototype)}else{try{throw Error()}catch(h){r=h}e()}}catch(h){if(h&&r&&typeof h.stack=="string"){for(var l=h.stack.split(`\n`),i=r.stack.split(`\n`),o=l.length-1,u=i.length-1;1<=o&&0<=u&&l[o]!==i[u];)u--;for(;1<=o&&0<=u;o--,u--)if(l[o]!==i[u]){if(o!==1||u!==1)do if(o--,u--,0>u||l[o]!==i[u]){var s=`\n`+l[o].replace(" at new "," at ");return e.displayName&&s.includes("<anonymous>")&&(s=s.replace("<anonymous>",e.displayName)),s}while(1<=o&&0<=u);break}}}finally{x=!1,Error.prepareStackTrace=t}return(e=e?e.displayName||e.name:"")?y(e):""}function A(e){switch(e.tag){case 5:return y(e.type);case 16:return y("Lazy");case 13:return y("Suspense");case 19:return y("SuspenseList");case 0:case 2:case 15:return e=E(e.type,!1),e;case 11:return e=E(e.type.render,!1),e;case 1:return e=E(e.type,!0),e;default:return""}}function V(e){if(e==null)return null;if(typeof e=="function")return e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case ye:return"Fragment";case ve:return"Portal";case an:return"Profiler";case Me:return"StrictMode";case Oe:return"Suspense";case Ge:return"SuspenseList"}if(typeof e=="object")switch(e.$$typeof){case je:return(e.displayName||"Context")+".Consumer";case Ye:return(e._context.displayName||"Context")+".Provider";case nn:var n=e.render;return e=e.displayName,e||(e=n.displayName||n.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case Xe:return n=e.displayName||null,n!==null?n:V(e.type)||"Memo";case Pe:n=e._payload,e=e._init;try{return V(e(n))}catch{}}return null}function W(e){var n=e.type;switch(e.tag){case 24:return"Cache";case 9:return(n.displayName||"Context")+".Consumer";case 10:return(n._context.displayName||"Context")+".Provider";case 18:return"DehydratedFragment";case 11:return e=n.render,e=e.displayName||e.name||"",n.displayName||(e!==""?"ForwardRef("+e+")":"ForwardRef");case 7:return"Fragment";case 5:return n;case 4:return"Portal";case 3:return"Root";case 6:return"Text";case 16:return V(n);case 8:return n===Me?"StrictMode":"Mode";case 22:return"Offscreen";case 12:return"Profiler";case 21:return"Scope";case 13:return"Suspense";case 19:return"SuspenseList";case 25:return"TracingMarker";case 1:case 0:case 17:case 2:case 14:case 15:if(typeof n=="function")return n.displayName||n.name||null;if(typeof n=="string")return n}return null}function Q(e){switch(typeof e){case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function ee(e){var n=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(n==="checkbox"||n==="radio")}function De(e){var n=ee(e)?"checked":"value",t=Object.getOwnPropertyDescriptor(e.constructor.prototype,n),r=""+e[n];if(!e.hasOwnProperty(n)&&typeof t<"u"&&typeof t.get=="function"&&typeof t.set=="function"){var l=t.get,i=t.set;return Object.defineProperty(e,n,{configurable:!0,get:function(){return l.call(this)},set:function(o){r=""+o,i.call(this,o)}}),Object.defineProperty(e,n,{enumerable:t.enumerable}),{getValue:function(){return r},setValue:function(o){r=""+o},stopTracking:function(){e._valueTracker=null,delete e[n]}}}}function kr(e){e._valueTracker||(e._valueTracker=De(e))}function Io(e){if(!e)return!1;var n=e._valueTracker;if(!n)return!0;var t=n.getValue(),r="";return e&&(r=ee(e)?e.checked?"true":"false":e.value),e=r,e!==t?(n.setValue(e),!0):!1}function xr(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}function Rl(e,n){var t=n.checked;return j({},n,{defaultChecked:void 0,defaultValue:void 0,value:void 0,checked:t??e._wrapperState.initialChecked})}function Mo(e,n){var t=n.defaultValue==null?"":n.defaultValue,r=n.checked!=null?n.checked:n.defaultChecked;t=Q(n.value!=null?n.value:t),e._wrapperState={initialChecked:r,initialValue:t,controlled:n.type==="checkbox"||n.type==="radio"?n.checked!=null:n.value!=null}}function Oo(e,n){n=n.checked,n!=null&&_e(e,"checked",n,!1)}function Il(e,n){Oo(e,n);var t=Q(n.value),r=n.type;if(t!=null)r==="number"?(t===0&&e.value===""||e.value!=t)&&(e.value=""+t):e.value!==""+t&&(e.value=""+t);else if(r==="submit"||r==="reset"){e.removeAttribute("value");return}n.hasOwnProperty("value")?Ml(e,n.type,t):n.hasOwnProperty("defaultValue")&&Ml(e,n.type,Q(n.defaultValue)),n.checked==null&&n.defaultChecked!=null&&(e.defaultChecked=!!n.defaultChecked)}function Do(e,n,t){if(n.hasOwnProperty("value")||n.hasOwnProperty("defaultValue")){var r=n.type;if(!(r!=="submit"&&r!=="reset"||n.value!==void 0&&n.value!==null))return;n=""+e._wrapperState.initialValue,t||n===e.value||(e.value=n),e.defaultValue=n}t=e.name,t!==""&&(e.name=""),e.defaultChecked=!!e._wrapperState.initialChecked,t!==""&&(e.name=t)}function Ml(e,n,t){(n!=="number"||xr(e.ownerDocument)!==e)&&(t==null?e.defaultValue=""+e._wrapperState.initialValue:e.defaultValue!==""+t&&(e.defaultValue=""+t))}var Ot=Array.isArray;function ct(e,n,t,r){if(e=e.options,n){n={};for(var l=0;l<t.length;l++)n["$"+t[l]]=!0;for(t=0;t<e.length;t++)l=n.hasOwnProperty("$"+e[t].value),e[t].selected!==l&&(e[t].selected=l),l&&r&&(e[t].defaultSelected=!0)}else{for(t=""+Q(t),n=null,l=0;l<e.length;l++){if(e[l].value===t){e[l].selected=!0,r&&(e[l].defaultSelected=!0);return}n!==null||e[l].disabled||(n=e[l])}n!==null&&(n.selected=!0)}}function Ol(e,n){if(n.dangerouslySetInnerHTML!=null)throw Error(m(91));return j({},n,{value:void 0,defaultValue:void 0,children:""+e._wrapperState.initialValue})}function Fo(e,n){var t=n.value;if(t==null){if(t=n.children,n=n.defaultValue,t!=null){if(n!=null)throw Error(m(92));if(Ot(t)){if(1<t.length)throw Error(m(93));t=t[0]}n=t}n==null&&(n=""),t=n}e._wrapperState={initialValue:Q(t)}}function Uo(e,n){var t=Q(n.value),r=Q(n.defaultValue);t!=null&&(t=""+t,t!==e.value&&(e.value=t),n.defaultValue==null&&e.defaultValue!==t&&(e.defaultValue=t)),r!=null&&(e.defaultValue=""+r)}function Ao(e){var n=e.textContent;n===e._wrapperState.initialValue&&n!==""&&n!==null&&(e.value=n)}function Vo(e){switch(e){case"svg":return"http://www.w3.org/2000/svg";case"math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}function Dl(e,n){return e==null||e==="http://www.w3.org/1999/xhtml"?Vo(n):e==="http://www.w3.org/2000/svg"&&n==="foreignObject"?"http://www.w3.org/1999/xhtml":e}var Er,$o=(function(e){return typeof MSApp<"u"&&MSApp.execUnsafeLocalFunction?function(n,t,r,l){MSApp.execUnsafeLocalFunction(function(){return e(n,t,r,l)})}:e})(function(e,n){if(e.namespaceURI!=="http://www.w3.org/2000/svg"||"innerHTML"in e)e.innerHTML=n;else{for(Er=Er||document.createElement("div"),Er.innerHTML="<svg>"+n.valueOf().toString()+"</svg>",n=Er.firstChild;e.firstChild;)e.removeChild(e.firstChild);for(;n.firstChild;)e.appendChild(n.firstChild)}});function Dt(e,n){if(n){var t=e.firstChild;if(t&&t===e.lastChild&&t.nodeType===3){t.nodeValue=n;return}}e.textContent=n}var Ft={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},Ua=["Webkit","ms","Moz","O"];Object.keys(Ft).forEach(function(e){Ua.forEach(function(n){n=n+e.charAt(0).toUpperCase()+e.substring(1),Ft[n]=Ft[e]})});function Bo(e,n,t){return n==null||typeof n=="boolean"||n===""?"":t||typeof n!="number"||n===0||Ft.hasOwnProperty(e)&&Ft[e]?(""+n).trim():n+"px"}function Ho(e,n){e=e.style;for(var t in n)if(n.hasOwnProperty(t)){var r=t.indexOf("--")===0,l=Bo(t,n[t],r);t==="float"&&(t="cssFloat"),r?e.setProperty(t,l):e[t]=l}}var Aa=j({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0});function Fl(e,n){if(n){if(Aa[e]&&(n.children!=null||n.dangerouslySetInnerHTML!=null))throw Error(m(137,e));if(n.dangerouslySetInnerHTML!=null){if(n.children!=null)throw Error(m(60));if(typeof n.dangerouslySetInnerHTML!="object"||!("__html"in n.dangerouslySetInnerHTML))throw Error(m(61))}if(n.style!=null&&typeof n.style!="object")throw Error(m(62))}}function Ul(e,n){if(e.indexOf("-")===-1)return typeof n.is=="string";switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var Al=null;function Vl(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var $l=null,ft=null,dt=null;function Wo(e){if(e=ir(e)){if(typeof $l!="function")throw Error(m(280));var n=e.stateNode;n&&(n=Kr(n),$l(e.stateNode,e.type,n))}}function Qo(e){ft?dt?dt.push(e):dt=[e]:ft=e}function Ko(){if(ft){var e=ft,n=dt;if(dt=ft=null,Wo(e),n)for(e=0;e<n.length;e++)Wo(n[e])}}function Yo(e,n){return e(n)}function Go(){}var Bl=!1;function Xo(e,n,t){if(Bl)return e(n,t);Bl=!0;try{return Yo(e,n,t)}finally{Bl=!1,(ft!==null||dt!==null)&&(Go(),Ko())}}function Ut(e,n){var t=e.stateNode;if(t===null)return null;var r=Kr(t);if(r===null)return null;t=r[n];e:switch(n){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(r=!r.disabled)||(e=e.type,r=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!r;break e;default:e=!1}if(e)return null;if(t&&typeof t!="function")throw Error(m(231,n,typeof t));return t}var Hl=!1;if(M)try{var At={};Object.defineProperty(At,"passive",{get:function(){Hl=!0}}),window.addEventListener("test",At,At),window.removeEventListener("test",At,At)}catch{Hl=!1}function Va(e,n,t,r,l,i,o,u,s){var h=Array.prototype.slice.call(arguments,3);try{n.apply(t,h)}catch(w){this.onError(w)}}var Vt=!1,Cr=null,Nr=!1,Wl=null,$a={onError:function(e){Vt=!0,Cr=e}};function Ba(e,n,t,r,l,i,o,u,s){Vt=!1,Cr=null,Va.apply($a,arguments)}function Ha(e,n,t,r,l,i,o,u,s){if(Ba.apply(this,arguments),Vt){if(Vt){var h=Cr;Vt=!1,Cr=null}else throw Error(m(198));Nr||(Nr=!0,Wl=h)}}function Jn(e){var n=e,t=e;if(e.alternate)for(;n.return;)n=n.return;else{e=n;do n=e,(n.flags&4098)!==0&&(t=n.return),e=n.return;while(e)}return n.tag===3?t:null}function Zo(e){if(e.tag===13){var n=e.memoizedState;if(n===null&&(e=e.alternate,e!==null&&(n=e.memoizedState)),n!==null)return n.dehydrated}return null}function Jo(e){if(Jn(e)!==e)throw Error(m(188))}function Wa(e){var n=e.alternate;if(!n){if(n=Jn(e),n===null)throw Error(m(188));return n!==e?null:e}for(var t=e,r=n;;){var l=t.return;if(l===null)break;var i=l.alternate;if(i===null){if(r=l.return,r!==null){t=r;continue}break}if(l.child===i.child){for(i=l.child;i;){if(i===t)return Jo(l),e;if(i===r)return Jo(l),n;i=i.sibling}throw Error(m(188))}if(t.return!==r.return)t=l,r=i;else{for(var o=!1,u=l.child;u;){if(u===t){o=!0,t=l,r=i;break}if(u===r){o=!0,r=l,t=i;break}u=u.sibling}if(!o){for(u=i.child;u;){if(u===t){o=!0,t=i,r=l;break}if(u===r){o=!0,r=i,t=l;break}u=u.sibling}if(!o)throw Error(m(189))}}if(t.alternate!==r)throw Error(m(190))}if(t.tag!==3)throw Error(m(188));return t.stateNode.current===t?e:n}function qo(e){return e=Wa(e),e!==null?bo(e):null}function bo(e){if(e.tag===5||e.tag===6)return e;for(e=e.child;e!==null;){var n=bo(e);if(n!==null)return n;e=e.sibling}return null}var eu=N.unstable_scheduleCallback,nu=N.unstable_cancelCallback,Qa=N.unstable_shouldYield,Ka=N.unstable_requestPaint,ce=N.unstable_now,Ya=N.unstable_getCurrentPriorityLevel,Ql=N.unstable_ImmediatePriority,tu=N.unstable_UserBlockingPriority,_r=N.unstable_NormalPriority,Ga=N.unstable_LowPriority,ru=N.unstable_IdlePriority,jr=null,gn=null;function Xa(e){if(gn&&typeof gn.onCommitFiberRoot=="function")try{gn.onCommitFiberRoot(jr,e,void 0,(e.current.flags&128)===128)}catch{}}var cn=Math.clz32?Math.clz32:qa,Za=Math.log,Ja=Math.LN2;function qa(e){return e>>>=0,e===0?32:31-(Za(e)/Ja|0)|0}var Pr=64,Lr=4194304;function $t(e){switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return e&4194240;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return e&130023424;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 1073741824;default:return e}}function Tr(e,n){var t=e.pendingLanes;if(t===0)return 0;var r=0,l=e.suspendedLanes,i=e.pingedLanes,o=t&268435455;if(o!==0){var u=o&~l;u!==0?r=$t(u):(i&=o,i!==0&&(r=$t(i)))}else o=t&~l,o!==0?r=$t(o):i!==0&&(r=$t(i));if(r===0)return 0;if(n!==0&&n!==r&&(n&l)===0&&(l=r&-r,i=n&-n,l>=i||l===16&&(i&4194240)!==0))return n;if((r&4)!==0&&(r|=t&16),n=e.entangledLanes,n!==0)for(e=e.entanglements,n&=r;0<n;)t=31-cn(n),l=1<<t,r|=e[t],n&=~l;return r}function ba(e,n){switch(e){case 1:case 2:case 4:return n+250;case 8:case 16:case 32:case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return n+5e3;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return-1;case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function ec(e,n){for(var t=e.suspendedLanes,r=e.pingedLanes,l=e.expirationTimes,i=e.pendingLanes;0<i;){var o=31-cn(i),u=1<<o,s=l[o];s===-1?((u&t)===0||(u&r)!==0)&&(l[o]=ba(u,n)):s<=n&&(e.expiredLanes|=u),i&=~u}}function Kl(e){return e=e.pendingLanes&-1073741825,e!==0?e:e&1073741824?1073741824:0}function lu(){var e=Pr;return Pr<<=1,(Pr&4194240)===0&&(Pr=64),e}function Yl(e){for(var n=[],t=0;31>t;t++)n.push(e);return n}function Bt(e,n,t){e.pendingLanes|=n,n!==536870912&&(e.suspendedLanes=0,e.pingedLanes=0),e=e.eventTimes,n=31-cn(n),e[n]=t}function nc(e,n){var t=e.pendingLanes&~n;e.pendingLanes=n,e.suspendedLanes=0,e.pingedLanes=0,e.expiredLanes&=n,e.mutableReadLanes&=n,e.entangledLanes&=n,n=e.entanglements;var r=e.eventTimes;for(e=e.expirationTimes;0<t;){var l=31-cn(t),i=1<<l;n[l]=0,r[l]=-1,e[l]=-1,t&=~i}}function Gl(e,n){var t=e.entangledLanes|=n;for(e=e.entanglements;t;){var r=31-cn(t),l=1<<r;l&n|e[r]&n&&(e[r]|=n),t&=~l}}var Z=0;function iu(e){return e&=-e,1<e?4<e?(e&268435455)!==0?16:536870912:4:1}var ou,Xl,uu,su,au,Zl=!1,zr=[],Rn=null,In=null,Mn=null,Ht=new Map,Wt=new Map,On=[],tc="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");function cu(e,n){switch(e){case"focusin":case"focusout":Rn=null;break;case"dragenter":case"dragleave":In=null;break;case"mouseover":case"mouseout":Mn=null;break;case"pointerover":case"pointerout":Ht.delete(n.pointerId);break;case"gotpointercapture":case"lostpointercapture":Wt.delete(n.pointerId)}}function Qt(e,n,t,r,l,i){return e===null||e.nativeEvent!==i?(e={blockedOn:n,domEventName:t,eventSystemFlags:r,nativeEvent:i,targetContainers:[l]},n!==null&&(n=ir(n),n!==null&&Xl(n)),e):(e.eventSystemFlags|=r,n=e.targetContainers,l!==null&&n.indexOf(l)===-1&&n.push(l),e)}function rc(e,n,t,r,l){switch(n){case"focusin":return Rn=Qt(Rn,e,n,t,r,l),!0;case"dragenter":return In=Qt(In,e,n,t,r,l),!0;case"mouseover":return Mn=Qt(Mn,e,n,t,r,l),!0;case"pointerover":var i=l.pointerId;return Ht.set(i,Qt(Ht.get(i)||null,e,n,t,r,l)),!0;case"gotpointercapture":return i=l.pointerId,Wt.set(i,Qt(Wt.get(i)||null,e,n,t,r,l)),!0}return!1}function fu(e){var n=qn(e.target);if(n!==null){var t=Jn(n);if(t!==null){if(n=t.tag,n===13){if(n=Zo(t),n!==null){e.blockedOn=n,au(e.priority,function(){uu(t)});return}}else if(n===3&&t.stateNode.current.memoizedState.isDehydrated){e.blockedOn=t.tag===3?t.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Rr(e){if(e.blockedOn!==null)return!1;for(var n=e.targetContainers;0<n.length;){var t=ql(e.domEventName,e.eventSystemFlags,n[0],e.nativeEvent);if(t===null){t=e.nativeEvent;var r=new t.constructor(t.type,t);Al=r,t.target.dispatchEvent(r),Al=null}else return n=ir(t),n!==null&&Xl(n),e.blockedOn=t,!1;n.shift()}return!0}function du(e,n,t){Rr(e)&&t.delete(n)}function lc(){Zl=!1,Rn!==null&&Rr(Rn)&&(Rn=null),In!==null&&Rr(In)&&(In=null),Mn!==null&&Rr(Mn)&&(Mn=null),Ht.forEach(du),Wt.forEach(du)}function Kt(e,n){e.blockedOn===n&&(e.blockedOn=null,Zl||(Zl=!0,N.unstable_scheduleCallback(N.unstable_NormalPriority,lc)))}function Yt(e){function n(l){return Kt(l,e)}if(0<zr.length){Kt(zr[0],e);for(var t=1;t<zr.length;t++){var r=zr[t];r.blockedOn===e&&(r.blockedOn=null)}}for(Rn!==null&&Kt(Rn,e),In!==null&&Kt(In,e),Mn!==null&&Kt(Mn,e),Ht.forEach(n),Wt.forEach(n),t=0;t<On.length;t++)r=On[t],r.blockedOn===e&&(r.blockedOn=null);for(;0<On.length&&(t=On[0],t.blockedOn===null);)fu(t),t.blockedOn===null&&On.shift()}var pt=me.ReactCurrentBatchConfig,Ir=!0;function ic(e,n,t,r){var l=Z,i=pt.transition;pt.transition=null;try{Z=1,Jl(e,n,t,r)}finally{Z=l,pt.transition=i}}function oc(e,n,t,r){var l=Z,i=pt.transition;pt.transition=null;try{Z=4,Jl(e,n,t,r)}finally{Z=l,pt.transition=i}}function Jl(e,n,t,r){if(Ir){var l=ql(e,n,t,r);if(l===null)mi(e,n,r,Mr,t),cu(e,r);else if(rc(l,e,n,t,r))r.stopPropagation();else if(cu(e,r),n&4&&-1<tc.indexOf(e)){for(;l!==null;){var i=ir(l);if(i!==null&&ou(i),i=ql(e,n,t,r),i===null&&mi(e,n,r,Mr,t),i===l)break;l=i}l!==null&&r.stopPropagation()}else mi(e,n,r,null,t)}}var Mr=null;function ql(e,n,t,r){if(Mr=null,e=Vl(r),e=qn(e),e!==null)if(n=Jn(e),n===null)e=null;else if(t=n.tag,t===13){if(e=Zo(n),e!==null)return e;e=null}else if(t===3){if(n.stateNode.current.memoizedState.isDehydrated)return n.tag===3?n.stateNode.containerInfo:null;e=null}else n!==e&&(e=null);return Mr=e,null}function pu(e){switch(e){case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 1;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"toggle":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 4;case"message":switch(Ya()){case Ql:return 1;case tu:return 4;case _r:case Ga:return 16;case ru:return 536870912;default:return 16}default:return 16}}var Dn=null,bl=null,Or=null;function hu(){if(Or)return Or;var e,n=bl,t=n.length,r,l="value"in Dn?Dn.value:Dn.textContent,i=l.length;for(e=0;e<t&&n[e]===l[e];e++);var o=t-e;for(r=1;r<=o&&n[t-r]===l[i-r];r++);return Or=l.slice(e,1<r?1-r:void 0)}function Dr(e){var n=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&n===13&&(e=13)):e=n,e===10&&(e=13),32<=e||e===13?e:0}function Fr(){return!0}function mu(){return!1}function Ze(e){function n(t,r,l,i,o){this._reactName=t,this._targetInst=l,this.type=r,this.nativeEvent=i,this.target=o,this.currentTarget=null;for(var u in e)e.hasOwnProperty(u)&&(t=e[u],this[u]=t?t(i):i[u]);return this.isDefaultPrevented=(i.defaultPrevented!=null?i.defaultPrevented:i.returnValue===!1)?Fr:mu,this.isPropagationStopped=mu,this}return j(n.prototype,{preventDefault:function(){this.defaultPrevented=!0;var t=this.nativeEvent;t&&(t.preventDefault?t.preventDefault():typeof t.returnValue!="unknown"&&(t.returnValue=!1),this.isDefaultPrevented=Fr)},stopPropagation:function(){var t=this.nativeEvent;t&&(t.stopPropagation?t.stopPropagation():typeof t.cancelBubble!="unknown"&&(t.cancelBubble=!0),this.isPropagationStopped=Fr)},persist:function(){},isPersistent:Fr}),n}var ht={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},ei=Ze(ht),Gt=j({},ht,{view:0,detail:0}),uc=Ze(Gt),ni,ti,Xt,Ur=j({},Gt,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:li,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==Xt&&(Xt&&e.type==="mousemove"?(ni=e.screenX-Xt.screenX,ti=e.screenY-Xt.screenY):ti=ni=0,Xt=e),ni)},movementY:function(e){return"movementY"in e?e.movementY:ti}}),vu=Ze(Ur),sc=j({},Ur,{dataTransfer:0}),ac=Ze(sc),cc=j({},Gt,{relatedTarget:0}),ri=Ze(cc),fc=j({},ht,{animationName:0,elapsedTime:0,pseudoElement:0}),dc=Ze(fc),pc=j({},ht,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),hc=Ze(pc),mc=j({},ht,{data:0}),yu=Ze(mc),vc={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},yc={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},gc={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function wc(e){var n=this.nativeEvent;return n.getModifierState?n.getModifierState(e):(e=gc[e])?!!n[e]:!1}function li(){return wc}var Sc=j({},Gt,{key:function(e){if(e.key){var n=vc[e.key]||e.key;if(n!=="Unidentified")return n}return e.type==="keypress"?(e=Dr(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?yc[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:li,charCode:function(e){return e.type==="keypress"?Dr(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?Dr(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),kc=Ze(Sc),xc=j({},Ur,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),gu=Ze(xc),Ec=j({},Gt,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:li}),Cc=Ze(Ec),Nc=j({},ht,{propertyName:0,elapsedTime:0,pseudoElement:0}),_c=Ze(Nc),jc=j({},Ur,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),Pc=Ze(jc),Lc=[9,13,27,32],ii=M&&"CompositionEvent"in window,Zt=null;M&&"documentMode"in document&&(Zt=document.documentMode);var Tc=M&&"TextEvent"in window&&!Zt,wu=M&&(!ii||Zt&&8<Zt&&11>=Zt),Su=" ",ku=!1;function xu(e,n){switch(e){case"keyup":return Lc.indexOf(n.keyCode)!==-1;case"keydown":return n.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function Eu(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var mt=!1;function zc(e,n){switch(e){case"compositionend":return Eu(n);case"keypress":return n.which!==32?null:(ku=!0,Su);case"textInput":return e=n.data,e===Su&&ku?null:e;default:return null}}function Rc(e,n){if(mt)return e==="compositionend"||!ii&&xu(e,n)?(e=hu(),Or=bl=Dn=null,mt=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(n.ctrlKey||n.altKey||n.metaKey)||n.ctrlKey&&n.altKey){if(n.char&&1<n.char.length)return n.char;if(n.which)return String.fromCharCode(n.which)}return null;case"compositionend":return wu&&n.locale!=="ko"?null:n.data;default:return null}}var Ic={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function Cu(e){var n=e&&e.nodeName&&e.nodeName.toLowerCase();return n==="input"?!!Ic[e.type]:n==="textarea"}function Nu(e,n,t,r){Qo(r),n=Hr(n,"onChange"),0<n.length&&(t=new ei("onChange","change",null,t,r),e.push({event:t,listeners:n}))}var Jt=null,qt=null;function Mc(e){Hu(e,0)}function Ar(e){var n=St(e);if(Io(n))return e}function Oc(e,n){if(e==="change")return n}var _u=!1;if(M){var oi;if(M){var ui="oninput"in document;if(!ui){var ju=document.createElement("div");ju.setAttribute("oninput","return;"),ui=typeof ju.oninput=="function"}oi=ui}else oi=!1;_u=oi&&(!document.documentMode||9<document.documentMode)}function Pu(){Jt&&(Jt.detachEvent("onpropertychange",Lu),qt=Jt=null)}function Lu(e){if(e.propertyName==="value"&&Ar(qt)){var n=[];Nu(n,qt,e,Vl(e)),Xo(Mc,n)}}function Dc(e,n,t){e==="focusin"?(Pu(),Jt=n,qt=t,Jt.attachEvent("onpropertychange",Lu)):e==="focusout"&&Pu()}function Fc(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return Ar(qt)}function Uc(e,n){if(e==="click")return Ar(n)}function Ac(e,n){if(e==="input"||e==="change")return Ar(n)}function Vc(e,n){return e===n&&(e!==0||1/e===1/n)||e!==e&&n!==n}var fn=typeof Object.is=="function"?Object.is:Vc;function bt(e,n){if(fn(e,n))return!0;if(typeof e!="object"||e===null||typeof n!="object"||n===null)return!1;var t=Object.keys(e),r=Object.keys(n);if(t.length!==r.length)return!1;for(r=0;r<t.length;r++){var l=t[r];if(!$.call(n,l)||!fn(e[l],n[l]))return!1}return!0}function Tu(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function zu(e,n){var t=Tu(e);e=0;for(var r;t;){if(t.nodeType===3){if(r=e+t.textContent.length,e<=n&&r>=n)return{node:t,offset:n-e};e=r}e:{for(;t;){if(t.nextSibling){t=t.nextSibling;break e}t=t.parentNode}t=void 0}t=Tu(t)}}function Ru(e,n){return e&&n?e===n?!0:e&&e.nodeType===3?!1:n&&n.nodeType===3?Ru(e,n.parentNode):"contains"in e?e.contains(n):e.compareDocumentPosition?!!(e.compareDocumentPosition(n)&16):!1:!1}function Iu(){for(var e=window,n=xr();n instanceof e.HTMLIFrameElement;){try{var t=typeof n.contentWindow.location.href=="string"}catch{t=!1}if(t)e=n.contentWindow;else break;n=xr(e.document)}return n}function si(e){var n=e&&e.nodeName&&e.nodeName.toLowerCase();return n&&(n==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||n==="textarea"||e.contentEditable==="true")}function $c(e){var n=Iu(),t=e.focusedElem,r=e.selectionRange;if(n!==t&&t&&t.ownerDocument&&Ru(t.ownerDocument.documentElement,t)){if(r!==null&&si(t)){if(n=r.start,e=r.end,e===void 0&&(e=n),"selectionStart"in t)t.selectionStart=n,t.selectionEnd=Math.min(e,t.value.length);else if(e=(n=t.ownerDocument||document)&&n.defaultView||window,e.getSelection){e=e.getSelection();var l=t.textContent.length,i=Math.min(r.start,l);r=r.end===void 0?i:Math.min(r.end,l),!e.extend&&i>r&&(l=r,r=i,i=l),l=zu(t,i);var o=zu(t,r);l&&o&&(e.rangeCount!==1||e.anchorNode!==l.node||e.anchorOffset!==l.offset||e.focusNode!==o.node||e.focusOffset!==o.offset)&&(n=n.createRange(),n.setStart(l.node,l.offset),e.removeAllRanges(),i>r?(e.addRange(n),e.extend(o.node,o.offset)):(n.setEnd(o.node,o.offset),e.addRange(n)))}}for(n=[],e=t;e=e.parentNode;)e.nodeType===1&&n.push({element:e,left:e.scrollLeft,top:e.scrollTop});for(typeof t.focus=="function"&&t.focus(),t=0;t<n.length;t++)e=n[t],e.element.scrollLeft=e.left,e.element.scrollTop=e.top}}var Bc=M&&"documentMode"in document&&11>=document.documentMode,vt=null,ai=null,er=null,ci=!1;function Mu(e,n,t){var r=t.window===t?t.document:t.nodeType===9?t:t.ownerDocument;ci||vt==null||vt!==xr(r)||(r=vt,"selectionStart"in r&&si(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),er&&bt(er,r)||(er=r,r=Hr(ai,"onSelect"),0<r.length&&(n=new ei("onSelect","select",null,n,t),e.push({event:n,listeners:r}),n.target=vt)))}function Vr(e,n){var t={};return t[e.toLowerCase()]=n.toLowerCase(),t["Webkit"+e]="webkit"+n,t["Moz"+e]="moz"+n,t}var yt={animationend:Vr("Animation","AnimationEnd"),animationiteration:Vr("Animation","AnimationIteration"),animationstart:Vr("Animation","AnimationStart"),transitionend:Vr("Transition","TransitionEnd")},fi={},Ou={};M&&(Ou=document.createElement("div").style,"AnimationEvent"in window||(delete yt.animationend.animation,delete yt.animationiteration.animation,delete yt.animationstart.animation),"TransitionEvent"in window||delete yt.transitionend.transition);function $r(e){if(fi[e])return fi[e];if(!yt[e])return e;var n=yt[e],t;for(t in n)if(n.hasOwnProperty(t)&&t in Ou)return fi[e]=n[t];return e}var Du=$r("animationend"),Fu=$r("animationiteration"),Uu=$r("animationstart"),Au=$r("transitionend"),Vu=new Map,$u="abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");function Fn(e,n){Vu.set(e,n),D(n,[e])}for(var di=0;di<$u.length;di++){var pi=$u[di],Hc=pi.toLowerCase(),Wc=pi[0].toUpperCase()+pi.slice(1);Fn(Hc,"on"+Wc)}Fn(Du,"onAnimationEnd"),Fn(Fu,"onAnimationIteration"),Fn(Uu,"onAnimationStart"),Fn("dblclick","onDoubleClick"),Fn("focusin","onFocus"),Fn("focusout","onBlur"),Fn(Au,"onTransitionEnd"),B("onMouseEnter",["mouseout","mouseover"]),B("onMouseLeave",["mouseout","mouseover"]),B("onPointerEnter",["pointerout","pointerover"]),B("onPointerLeave",["pointerout","pointerover"]),D("onChange","change click focusin focusout input keydown keyup selectionchange".split(" ")),D("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")),D("onBeforeInput",["compositionend","keypress","textInput","paste"]),D("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" ")),D("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" ")),D("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var nr="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),Qc=new Set("cancel close invalid load scroll toggle".split(" ").concat(nr));function Bu(e,n,t){var r=e.type||"unknown-event";e.currentTarget=t,Ha(r,n,void 0,e),e.currentTarget=null}function Hu(e,n){n=(n&4)!==0;for(var t=0;t<e.length;t++){var r=e[t],l=r.event;r=r.listeners;e:{var i=void 0;if(n)for(var o=r.length-1;0<=o;o--){var u=r[o],s=u.instance,h=u.currentTarget;if(u=u.listener,s!==i&&l.isPropagationStopped())break e;Bu(l,u,h),i=s}else for(o=0;o<r.length;o++){if(u=r[o],s=u.instance,h=u.currentTarget,u=u.listener,s!==i&&l.isPropagationStopped())break e;Bu(l,u,h),i=s}}}if(Nr)throw e=Wl,Nr=!1,Wl=null,e}function te(e,n){var t=n[ki];t===void 0&&(t=n[ki]=new Set);var r=e+"__bubble";t.has(r)||(Wu(n,e,2,!1),t.add(r))}function hi(e,n,t){var r=0;n&&(r|=4),Wu(t,e,r,n)}var Br="_reactListening"+Math.random().toString(36).slice(2);function tr(e){if(!e[Br]){e[Br]=!0,G.forEach(function(t){t!=="selectionchange"&&(Qc.has(t)||hi(t,!1,e),hi(t,!0,e))});var n=e.nodeType===9?e:e.ownerDocument;n===null||n[Br]||(n[Br]=!0,hi("selectionchange",!1,n))}}function Wu(e,n,t,r){switch(pu(n)){case 1:var l=ic;break;case 4:l=oc;break;default:l=Jl}t=l.bind(null,n,t,e),l=void 0,!Hl||n!=="touchstart"&&n!=="touchmove"&&n!=="wheel"||(l=!0),r?l!==void 0?e.addEventListener(n,t,{capture:!0,passive:l}):e.addEventListener(n,t,!0):l!==void 0?e.addEventListener(n,t,{passive:l}):e.addEventListener(n,t,!1)}function mi(e,n,t,r,l){var i=r;if((n&1)===0&&(n&2)===0&&r!==null)e:for(;;){if(r===null)return;var o=r.tag;if(o===3||o===4){var u=r.stateNode.containerInfo;if(u===l||u.nodeType===8&&u.parentNode===l)break;if(o===4)for(o=r.return;o!==null;){var s=o.tag;if((s===3||s===4)&&(s=o.stateNode.containerInfo,s===l||s.nodeType===8&&s.parentNode===l))return;o=o.return}for(;u!==null;){if(o=qn(u),o===null)return;if(s=o.tag,s===5||s===6){r=i=o;continue e}u=u.parentNode}}r=r.return}Xo(function(){var h=i,w=Vl(t),S=[];e:{var g=Vu.get(e);if(g!==void 0){var _=ei,L=e;switch(e){case"keypress":if(Dr(t)===0)break e;case"keydown":case"keyup":_=kc;break;case"focusin":L="focus",_=ri;break;case"focusout":L="blur",_=ri;break;case"beforeblur":case"afterblur":_=ri;break;case"click":if(t.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":_=vu;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":_=ac;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":_=Cc;break;case Du:case Fu:case Uu:_=dc;break;case Au:_=_c;break;case"scroll":_=uc;break;case"wheel":_=Pc;break;case"copy":case"cut":case"paste":_=hc;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":_=gu}var T=(n&4)!==0,fe=!T&&e==="scroll",f=T?g!==null?g+"Capture":null:g;T=[];for(var a=h,d;a!==null;){d=a;var k=d.stateNode;if(d.tag===5&&k!==null&&(d=k,f!==null&&(k=Ut(a,f),k!=null&&T.push(rr(a,k,d)))),fe)break;a=a.return}0<T.length&&(g=new _(g,L,null,t,w),S.push({event:g,listeners:T}))}}if((n&7)===0){e:{if(g=e==="mouseover"||e==="pointerover",_=e==="mouseout"||e==="pointerout",g&&t!==Al&&(L=t.relatedTarget||t.fromElement)&&(qn(L)||L[En]))break e;if((_||g)&&(g=w.window===w?w:(g=w.ownerDocument)?g.defaultView||g.parentWindow:window,_?(L=t.relatedTarget||t.toElement,_=h,L=L?qn(L):null,L!==null&&(fe=Jn(L),L!==fe||L.tag!==5&&L.tag!==6)&&(L=null)):(_=null,L=h),_!==L)){if(T=vu,k="onMouseLeave",f="onMouseEnter",a="mouse",(e==="pointerout"||e==="pointerover")&&(T=gu,k="onPointerLeave",f="onPointerEnter",a="pointer"),fe=_==null?g:St(_),d=L==null?g:St(L),g=new T(k,a+"leave",_,t,w),g.target=fe,g.relatedTarget=d,k=null,qn(w)===h&&(T=new T(f,a+"enter",L,t,w),T.target=d,T.relatedTarget=fe,k=T),fe=k,_&&L)n:{for(T=_,f=L,a=0,d=T;d;d=gt(d))a++;for(d=0,k=f;k;k=gt(k))d++;for(;0<a-d;)T=gt(T),a--;for(;0<d-a;)f=gt(f),d--;for(;a--;){if(T===f||f!==null&&T===f.alternate)break n;T=gt(T),f=gt(f)}T=null}else T=null;_!==null&&Qu(S,g,_,T,!1),L!==null&&fe!==null&&Qu(S,fe,L,T,!0)}}e:{if(g=h?St(h):window,_=g.nodeName&&g.nodeName.toLowerCase(),_==="select"||_==="input"&&g.type==="file")var z=Oc;else if(Cu(g))if(_u)z=Ac;else{z=Fc;var R=Dc}else(_=g.nodeName)&&_.toLowerCase()==="input"&&(g.type==="checkbox"||g.type==="radio")&&(z=Uc);if(z&&(z=z(e,h))){Nu(S,z,t,w);break e}R&&R(e,g,h),e==="focusout"&&(R=g._wrapperState)&&R.controlled&&g.type==="number"&&Ml(g,"number",g.value)}switch(R=h?St(h):window,e){case"focusin":(Cu(R)||R.contentEditable==="true")&&(vt=R,ai=h,er=null);break;case"focusout":er=ai=vt=null;break;case"mousedown":ci=!0;break;case"contextmenu":case"mouseup":case"dragend":ci=!1,Mu(S,t,w);break;case"selectionchange":if(Bc)break;case"keydown":case"keyup":Mu(S,t,w)}var I;if(ii)e:{switch(e){case"compositionstart":var F="onCompositionStart";break e;case"compositionend":F="onCompositionEnd";break e;case"compositionupdate":F="onCompositionUpdate";break e}F=void 0}else mt?xu(e,t)&&(F="onCompositionEnd"):e==="keydown"&&t.keyCode===229&&(F="onCompositionStart");F&&(wu&&t.locale!=="ko"&&(mt||F!=="onCompositionStart"?F==="onCompositionEnd"&&mt&&(I=hu()):(Dn=w,bl="value"in Dn?Dn.value:Dn.textContent,mt=!0)),R=Hr(h,F),0<R.length&&(F=new yu(F,e,null,t,w),S.push({event:F,listeners:R}),I?F.data=I:(I=Eu(t),I!==null&&(F.data=I)))),(I=Tc?zc(e,t):Rc(e,t))&&(h=Hr(h,"onBeforeInput"),0<h.length&&(w=new yu("onBeforeInput","beforeinput",null,t,w),S.push({event:w,listeners:h}),w.data=I))}Hu(S,n)})}function rr(e,n,t){return{instance:e,listener:n,currentTarget:t}}function Hr(e,n){for(var t=n+"Capture",r=[];e!==null;){var l=e,i=l.stateNode;l.tag===5&&i!==null&&(l=i,i=Ut(e,t),i!=null&&r.unshift(rr(e,i,l)),i=Ut(e,n),i!=null&&r.push(rr(e,i,l))),e=e.return}return r}function gt(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5);return e||null}function Qu(e,n,t,r,l){for(var i=n._reactName,o=[];t!==null&&t!==r;){var u=t,s=u.alternate,h=u.stateNode;if(s!==null&&s===r)break;u.tag===5&&h!==null&&(u=h,l?(s=Ut(t,i),s!=null&&o.unshift(rr(t,s,u))):l||(s=Ut(t,i),s!=null&&o.push(rr(t,s,u)))),t=t.return}o.length!==0&&e.push({event:n,listeners:o})}var Kc=/\\r\\n?/g,Yc=/\\u0000|\\uFFFD/g;function Ku(e){return(typeof e=="string"?e:""+e).replace(Kc,`\n`).replace(Yc,"")}function Wr(e,n,t){if(n=Ku(n),Ku(e)!==n&&t)throw Error(m(425))}function Qr(){}var vi=null,yi=null;function gi(e,n){return e==="textarea"||e==="noscript"||typeof n.children=="string"||typeof n.children=="number"||typeof n.dangerouslySetInnerHTML=="object"&&n.dangerouslySetInnerHTML!==null&&n.dangerouslySetInnerHTML.__html!=null}var wi=typeof setTimeout=="function"?setTimeout:void 0,Gc=typeof clearTimeout=="function"?clearTimeout:void 0,Yu=typeof Promise=="function"?Promise:void 0,Xc=typeof queueMicrotask=="function"?queueMicrotask:typeof Yu<"u"?function(e){return Yu.resolve(null).then(e).catch(Zc)}:wi;function Zc(e){setTimeout(function(){throw e})}function Si(e,n){var t=n,r=0;do{var l=t.nextSibling;if(e.removeChild(t),l&&l.nodeType===8)if(t=l.data,t==="/$"){if(r===0){e.removeChild(l),Yt(n);return}r--}else t!=="$"&&t!=="$?"&&t!=="$!"||r++;t=l}while(t);Yt(n)}function Un(e){for(;e!=null;e=e.nextSibling){var n=e.nodeType;if(n===1||n===3)break;if(n===8){if(n=e.data,n==="$"||n==="$!"||n==="$?")break;if(n==="/$")return null}}return e}function Gu(e){e=e.previousSibling;for(var n=0;e;){if(e.nodeType===8){var t=e.data;if(t==="$"||t==="$!"||t==="$?"){if(n===0)return e;n--}else t==="/$"&&n++}e=e.previousSibling}return null}var wt=Math.random().toString(36).slice(2),wn="__reactFiber$"+wt,lr="__reactProps$"+wt,En="__reactContainer$"+wt,ki="__reactEvents$"+wt,Jc="__reactListeners$"+wt,qc="__reactHandles$"+wt;function qn(e){var n=e[wn];if(n)return n;for(var t=e.parentNode;t;){if(n=t[En]||t[wn]){if(t=n.alternate,n.child!==null||t!==null&&t.child!==null)for(e=Gu(e);e!==null;){if(t=e[wn])return t;e=Gu(e)}return n}e=t,t=e.parentNode}return null}function ir(e){return e=e[wn]||e[En],!e||e.tag!==5&&e.tag!==6&&e.tag!==13&&e.tag!==3?null:e}function St(e){if(e.tag===5||e.tag===6)return e.stateNode;throw Error(m(33))}function Kr(e){return e[lr]||null}var xi=[],kt=-1;function An(e){return{current:e}}function re(e){0>kt||(e.current=xi[kt],xi[kt]=null,kt--)}function ne(e,n){kt++,xi[kt]=e.current,e.current=n}var Vn={},Le=An(Vn),$e=An(!1),bn=Vn;function xt(e,n){var t=e.type.contextTypes;if(!t)return Vn;var r=e.stateNode;if(r&&r.__reactInternalMemoizedUnmaskedChildContext===n)return r.__reactInternalMemoizedMaskedChildContext;var l={},i;for(i in t)l[i]=n[i];return r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=n,e.__reactInternalMemoizedMaskedChildContext=l),l}function Be(e){return e=e.childContextTypes,e!=null}function Yr(){re($e),re(Le)}function Xu(e,n,t){if(Le.current!==Vn)throw Error(m(168));ne(Le,n),ne($e,t)}function Zu(e,n,t){var r=e.stateNode;if(n=n.childContextTypes,typeof r.getChildContext!="function")return t;r=r.getChildContext();for(var l in r)if(!(l in n))throw Error(m(108,W(e)||"Unknown",l));return j({},t,r)}function Gr(e){return e=(e=e.stateNode)&&e.__reactInternalMemoizedMergedChildContext||Vn,bn=Le.current,ne(Le,e),ne($e,$e.current),!0}function Ju(e,n,t){var r=e.stateNode;if(!r)throw Error(m(169));t?(e=Zu(e,n,bn),r.__reactInternalMemoizedMergedChildContext=e,re($e),re(Le),ne(Le,e)):re($e),ne($e,t)}var Cn=null,Xr=!1,Ei=!1;function qu(e){Cn===null?Cn=[e]:Cn.push(e)}function bc(e){Xr=!0,qu(e)}function $n(){if(!Ei&&Cn!==null){Ei=!0;var e=0,n=Z;try{var t=Cn;for(Z=1;e<t.length;e++){var r=t[e];do r=r(!0);while(r!==null)}Cn=null,Xr=!1}catch(l){throw Cn!==null&&(Cn=Cn.slice(e+1)),eu(Ql,$n),l}finally{Z=n,Ei=!1}}return null}var Et=[],Ct=0,Zr=null,Jr=0,tn=[],rn=0,et=null,Nn=1,_n="";function nt(e,n){Et[Ct++]=Jr,Et[Ct++]=Zr,Zr=e,Jr=n}function bu(e,n,t){tn[rn++]=Nn,tn[rn++]=_n,tn[rn++]=et,et=e;var r=Nn;e=_n;var l=32-cn(r)-1;r&=~(1<<l),t+=1;var i=32-cn(n)+l;if(30<i){var o=l-l%5;i=(r&(1<<o)-1).toString(32),r>>=o,l-=o,Nn=1<<32-cn(n)+l|t<<l|r,_n=i+e}else Nn=1<<i|t<<l|r,_n=e}function Ci(e){e.return!==null&&(nt(e,1),bu(e,1,0))}function Ni(e){for(;e===Zr;)Zr=Et[--Ct],Et[Ct]=null,Jr=Et[--Ct],Et[Ct]=null;for(;e===et;)et=tn[--rn],tn[rn]=null,_n=tn[--rn],tn[rn]=null,Nn=tn[--rn],tn[rn]=null}var Je=null,qe=null,ie=!1,dn=null;function es(e,n){var t=sn(5,null,null,0);t.elementType="DELETED",t.stateNode=n,t.return=e,n=e.deletions,n===null?(e.deletions=[t],e.flags|=16):n.push(t)}function ns(e,n){switch(e.tag){case 5:var t=e.type;return n=n.nodeType!==1||t.toLowerCase()!==n.nodeName.toLowerCase()?null:n,n!==null?(e.stateNode=n,Je=e,qe=Un(n.firstChild),!0):!1;case 6:return n=e.pendingProps===""||n.nodeType!==3?null:n,n!==null?(e.stateNode=n,Je=e,qe=null,!0):!1;case 13:return n=n.nodeType!==8?null:n,n!==null?(t=et!==null?{id:Nn,overflow:_n}:null,e.memoizedState={dehydrated:n,treeContext:t,retryLane:1073741824},t=sn(18,null,null,0),t.stateNode=n,t.return=e,e.child=t,Je=e,qe=null,!0):!1;default:return!1}}function _i(e){return(e.mode&1)!==0&&(e.flags&128)===0}function ji(e){if(ie){var n=qe;if(n){var t=n;if(!ns(e,n)){if(_i(e))throw Error(m(418));n=Un(t.nextSibling);var r=Je;n&&ns(e,n)?es(r,t):(e.flags=e.flags&-4097|2,ie=!1,Je=e)}}else{if(_i(e))throw Error(m(418));e.flags=e.flags&-4097|2,ie=!1,Je=e}}}function ts(e){for(e=e.return;e!==null&&e.tag!==5&&e.tag!==3&&e.tag!==13;)e=e.return;Je=e}function qr(e){if(e!==Je)return!1;if(!ie)return ts(e),ie=!0,!1;var n;if((n=e.tag!==3)&&!(n=e.tag!==5)&&(n=e.type,n=n!=="head"&&n!=="body"&&!gi(e.type,e.memoizedProps)),n&&(n=qe)){if(_i(e))throw rs(),Error(m(418));for(;n;)es(e,n),n=Un(n.nextSibling)}if(ts(e),e.tag===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(m(317));e:{for(e=e.nextSibling,n=0;e;){if(e.nodeType===8){var t=e.data;if(t==="/$"){if(n===0){qe=Un(e.nextSibling);break e}n--}else t!=="$"&&t!=="$!"&&t!=="$?"||n++}e=e.nextSibling}qe=null}}else qe=Je?Un(e.stateNode.nextSibling):null;return!0}function rs(){for(var e=qe;e;)e=Un(e.nextSibling)}function Nt(){qe=Je=null,ie=!1}function Pi(e){dn===null?dn=[e]:dn.push(e)}var ef=me.ReactCurrentBatchConfig;function or(e,n,t){if(e=t.ref,e!==null&&typeof e!="function"&&typeof e!="object"){if(t._owner){if(t=t._owner,t){if(t.tag!==1)throw Error(m(309));var r=t.stateNode}if(!r)throw Error(m(147,e));var l=r,i=""+e;return n!==null&&n.ref!==null&&typeof n.ref=="function"&&n.ref._stringRef===i?n.ref:(n=function(o){var u=l.refs;o===null?delete u[i]:u[i]=o},n._stringRef=i,n)}if(typeof e!="string")throw Error(m(284));if(!t._owner)throw Error(m(290,e))}return e}function br(e,n){throw e=Object.prototype.toString.call(n),Error(m(31,e==="[object Object]"?"object with keys {"+Object.keys(n).join(", ")+"}":e))}function ls(e){var n=e._init;return n(e._payload)}function is(e){function n(f,a){if(e){var d=f.deletions;d===null?(f.deletions=[a],f.flags|=16):d.push(a)}}function t(f,a){if(!e)return null;for(;a!==null;)n(f,a),a=a.sibling;return null}function r(f,a){for(f=new Map;a!==null;)a.key!==null?f.set(a.key,a):f.set(a.index,a),a=a.sibling;return f}function l(f,a){return f=Xn(f,a),f.index=0,f.sibling=null,f}function i(f,a,d){return f.index=d,e?(d=f.alternate,d!==null?(d=d.index,d<a?(f.flags|=2,a):d):(f.flags|=2,a)):(f.flags|=1048576,a)}function o(f){return e&&f.alternate===null&&(f.flags|=2),f}function u(f,a,d,k){return a===null||a.tag!==6?(a=So(d,f.mode,k),a.return=f,a):(a=l(a,d),a.return=f,a)}function s(f,a,d,k){var z=d.type;return z===ye?w(f,a,d.props.children,k,d.key):a!==null&&(a.elementType===z||typeof z=="object"&&z!==null&&z.$$typeof===Pe&&ls(z)===a.type)?(k=l(a,d.props),k.ref=or(f,a,d),k.return=f,k):(k=El(d.type,d.key,d.props,null,f.mode,k),k.ref=or(f,a,d),k.return=f,k)}function h(f,a,d,k){return a===null||a.tag!==4||a.stateNode.containerInfo!==d.containerInfo||a.stateNode.implementation!==d.implementation?(a=ko(d,f.mode,k),a.return=f,a):(a=l(a,d.children||[]),a.return=f,a)}function w(f,a,d,k,z){return a===null||a.tag!==7?(a=at(d,f.mode,k,z),a.return=f,a):(a=l(a,d),a.return=f,a)}function S(f,a,d){if(typeof a=="string"&&a!==""||typeof a=="number")return a=So(""+a,f.mode,d),a.return=f,a;if(typeof a=="object"&&a!==null){switch(a.$$typeof){case Ie:return d=El(a.type,a.key,a.props,null,f.mode,d),d.ref=or(f,null,a),d.return=f,d;case ve:return a=ko(a,f.mode,d),a.return=f,a;case Pe:var k=a._init;return S(f,k(a._payload),d)}if(Ot(a)||O(a))return a=at(a,f.mode,d,null),a.return=f,a;br(f,a)}return null}function g(f,a,d,k){var z=a!==null?a.key:null;if(typeof d=="string"&&d!==""||typeof d=="number")return z!==null?null:u(f,a,""+d,k);if(typeof d=="object"&&d!==null){switch(d.$$typeof){case Ie:return d.key===z?s(f,a,d,k):null;case ve:return d.key===z?h(f,a,d,k):null;case Pe:return z=d._init,g(f,a,z(d._payload),k)}if(Ot(d)||O(d))return z!==null?null:w(f,a,d,k,null);br(f,d)}return null}function _(f,a,d,k,z){if(typeof k=="string"&&k!==""||typeof k=="number")return f=f.get(d)||null,u(a,f,""+k,z);if(typeof k=="object"&&k!==null){switch(k.$$typeof){case Ie:return f=f.get(k.key===null?d:k.key)||null,s(a,f,k,z);case ve:return f=f.get(k.key===null?d:k.key)||null,h(a,f,k,z);case Pe:var R=k._init;return _(f,a,d,R(k._payload),z)}if(Ot(k)||O(k))return f=f.get(d)||null,w(a,f,k,z,null);br(a,k)}return null}function L(f,a,d,k){for(var z=null,R=null,I=a,F=a=0,Se=null;I!==null&&F<d.length;F++){I.index>F?(Se=I,I=null):Se=I.sibling;var Y=g(f,I,d[F],k);if(Y===null){I===null&&(I=Se);break}e&&I&&Y.alternate===null&&n(f,I),a=i(Y,a,F),R===null?z=Y:R.sibling=Y,R=Y,I=Se}if(F===d.length)return t(f,I),ie&&nt(f,F),z;if(I===null){for(;F<d.length;F++)I=S(f,d[F],k),I!==null&&(a=i(I,a,F),R===null?z=I:R.sibling=I,R=I);return ie&&nt(f,F),z}for(I=r(f,I);F<d.length;F++)Se=_(I,f,F,d[F],k),Se!==null&&(e&&Se.alternate!==null&&I.delete(Se.key===null?F:Se.key),a=i(Se,a,F),R===null?z=Se:R.sibling=Se,R=Se);return e&&I.forEach(function(Zn){return n(f,Zn)}),ie&&nt(f,F),z}function T(f,a,d,k){var z=O(d);if(typeof z!="function")throw Error(m(150));if(d=z.call(d),d==null)throw Error(m(151));for(var R=z=null,I=a,F=a=0,Se=null,Y=d.next();I!==null&&!Y.done;F++,Y=d.next()){I.index>F?(Se=I,I=null):Se=I.sibling;var Zn=g(f,I,Y.value,k);if(Zn===null){I===null&&(I=Se);break}e&&I&&Zn.alternate===null&&n(f,I),a=i(Zn,a,F),R===null?z=Zn:R.sibling=Zn,R=Zn,I=Se}if(Y.done)return t(f,I),ie&&nt(f,F),z;if(I===null){for(;!Y.done;F++,Y=d.next())Y=S(f,Y.value,k),Y!==null&&(a=i(Y,a,F),R===null?z=Y:R.sibling=Y,R=Y);return ie&&nt(f,F),z}for(I=r(f,I);!Y.done;F++,Y=d.next())Y=_(I,f,F,Y.value,k),Y!==null&&(e&&Y.alternate!==null&&I.delete(Y.key===null?F:Y.key),a=i(Y,a,F),R===null?z=Y:R.sibling=Y,R=Y);return e&&I.forEach(function(Mf){return n(f,Mf)}),ie&&nt(f,F),z}function fe(f,a,d,k){if(typeof d=="object"&&d!==null&&d.type===ye&&d.key===null&&(d=d.props.children),typeof d=="object"&&d!==null){switch(d.$$typeof){case Ie:e:{for(var z=d.key,R=a;R!==null;){if(R.key===z){if(z=d.type,z===ye){if(R.tag===7){t(f,R.sibling),a=l(R,d.props.children),a.return=f,f=a;break e}}else if(R.elementType===z||typeof z=="object"&&z!==null&&z.$$typeof===Pe&&ls(z)===R.type){t(f,R.sibling),a=l(R,d.props),a.ref=or(f,R,d),a.return=f,f=a;break e}t(f,R);break}else n(f,R);R=R.sibling}d.type===ye?(a=at(d.props.children,f.mode,k,d.key),a.return=f,f=a):(k=El(d.type,d.key,d.props,null,f.mode,k),k.ref=or(f,a,d),k.return=f,f=k)}return o(f);case ve:e:{for(R=d.key;a!==null;){if(a.key===R)if(a.tag===4&&a.stateNode.containerInfo===d.containerInfo&&a.stateNode.implementation===d.implementation){t(f,a.sibling),a=l(a,d.children||[]),a.return=f,f=a;break e}else{t(f,a);break}else n(f,a);a=a.sibling}a=ko(d,f.mode,k),a.return=f,f=a}return o(f);case Pe:return R=d._init,fe(f,a,R(d._payload),k)}if(Ot(d))return L(f,a,d,k);if(O(d))return T(f,a,d,k);br(f,d)}return typeof d=="string"&&d!==""||typeof d=="number"?(d=""+d,a!==null&&a.tag===6?(t(f,a.sibling),a=l(a,d),a.return=f,f=a):(t(f,a),a=So(d,f.mode,k),a.return=f,f=a),o(f)):t(f,a)}return fe}var _t=is(!0),os=is(!1),el=An(null),nl=null,jt=null,Li=null;function Ti(){Li=jt=nl=null}function zi(e){var n=el.current;re(el),e._currentValue=n}function Ri(e,n,t){for(;e!==null;){var r=e.alternate;if((e.childLanes&n)!==n?(e.childLanes|=n,r!==null&&(r.childLanes|=n)):r!==null&&(r.childLanes&n)!==n&&(r.childLanes|=n),e===t)break;e=e.return}}function Pt(e,n){nl=e,Li=jt=null,e=e.dependencies,e!==null&&e.firstContext!==null&&((e.lanes&n)!==0&&(He=!0),e.firstContext=null)}function ln(e){var n=e._currentValue;if(Li!==e)if(e={context:e,memoizedValue:n,next:null},jt===null){if(nl===null)throw Error(m(308));jt=e,nl.dependencies={lanes:0,firstContext:e}}else jt=jt.next=e;return n}var tt=null;function Ii(e){tt===null?tt=[e]:tt.push(e)}function us(e,n,t,r){var l=n.interleaved;return l===null?(t.next=t,Ii(n)):(t.next=l.next,l.next=t),n.interleaved=t,jn(e,r)}function jn(e,n){e.lanes|=n;var t=e.alternate;for(t!==null&&(t.lanes|=n),t=e,e=e.return;e!==null;)e.childLanes|=n,t=e.alternate,t!==null&&(t.childLanes|=n),t=e,e=e.return;return t.tag===3?t.stateNode:null}var Bn=!1;function Mi(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,interleaved:null,lanes:0},effects:null}}function ss(e,n){e=e.updateQueue,n.updateQueue===e&&(n.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,effects:e.effects})}function Pn(e,n){return{eventTime:e,lane:n,tag:0,payload:null,callback:null,next:null}}function Hn(e,n,t){var r=e.updateQueue;if(r===null)return null;if(r=r.shared,(K&2)!==0){var l=r.pending;return l===null?n.next=n:(n.next=l.next,l.next=n),r.pending=n,jn(e,t)}return l=r.interleaved,l===null?(n.next=n,Ii(r)):(n.next=l.next,l.next=n),r.interleaved=n,jn(e,t)}function tl(e,n,t){if(n=n.updateQueue,n!==null&&(n=n.shared,(t&4194240)!==0)){var r=n.lanes;r&=e.pendingLanes,t|=r,n.lanes=t,Gl(e,t)}}function as(e,n){var t=e.updateQueue,r=e.alternate;if(r!==null&&(r=r.updateQueue,t===r)){var l=null,i=null;if(t=t.firstBaseUpdate,t!==null){do{var o={eventTime:t.eventTime,lane:t.lane,tag:t.tag,payload:t.payload,callback:t.callback,next:null};i===null?l=i=o:i=i.next=o,t=t.next}while(t!==null);i===null?l=i=n:i=i.next=n}else l=i=n;t={baseState:r.baseState,firstBaseUpdate:l,lastBaseUpdate:i,shared:r.shared,effects:r.effects},e.updateQueue=t;return}e=t.lastBaseUpdate,e===null?t.firstBaseUpdate=n:e.next=n,t.lastBaseUpdate=n}function rl(e,n,t,r){var l=e.updateQueue;Bn=!1;var i=l.firstBaseUpdate,o=l.lastBaseUpdate,u=l.shared.pending;if(u!==null){l.shared.pending=null;var s=u,h=s.next;s.next=null,o===null?i=h:o.next=h,o=s;var w=e.alternate;w!==null&&(w=w.updateQueue,u=w.lastBaseUpdate,u!==o&&(u===null?w.firstBaseUpdate=h:u.next=h,w.lastBaseUpdate=s))}if(i!==null){var S=l.baseState;o=0,w=h=s=null,u=i;do{var g=u.lane,_=u.eventTime;if((r&g)===g){w!==null&&(w=w.next={eventTime:_,lane:0,tag:u.tag,payload:u.payload,callback:u.callback,next:null});e:{var L=e,T=u;switch(g=n,_=t,T.tag){case 1:if(L=T.payload,typeof L=="function"){S=L.call(_,S,g);break e}S=L;break e;case 3:L.flags=L.flags&-65537|128;case 0:if(L=T.payload,g=typeof L=="function"?L.call(_,S,g):L,g==null)break e;S=j({},S,g);break e;case 2:Bn=!0}}u.callback!==null&&u.lane!==0&&(e.flags|=64,g=l.effects,g===null?l.effects=[u]:g.push(u))}else _={eventTime:_,lane:g,tag:u.tag,payload:u.payload,callback:u.callback,next:null},w===null?(h=w=_,s=S):w=w.next=_,o|=g;if(u=u.next,u===null){if(u=l.shared.pending,u===null)break;g=u,u=g.next,g.next=null,l.lastBaseUpdate=g,l.shared.pending=null}}while(!0);if(w===null&&(s=S),l.baseState=s,l.firstBaseUpdate=h,l.lastBaseUpdate=w,n=l.shared.interleaved,n!==null){l=n;do o|=l.lane,l=l.next;while(l!==n)}else i===null&&(l.shared.lanes=0);it|=o,e.lanes=o,e.memoizedState=S}}function cs(e,n,t){if(e=n.effects,n.effects=null,e!==null)for(n=0;n<e.length;n++){var r=e[n],l=r.callback;if(l!==null){if(r.callback=null,r=t,typeof l!="function")throw Error(m(191,l));l.call(r)}}}var ur={},Sn=An(ur),sr=An(ur),ar=An(ur);function rt(e){if(e===ur)throw Error(m(174));return e}function Oi(e,n){switch(ne(ar,n),ne(sr,e),ne(Sn,ur),e=n.nodeType,e){case 9:case 11:n=(n=n.documentElement)?n.namespaceURI:Dl(null,"");break;default:e=e===8?n.parentNode:n,n=e.namespaceURI||null,e=e.tagName,n=Dl(n,e)}re(Sn),ne(Sn,n)}function Lt(){re(Sn),re(sr),re(ar)}function fs(e){rt(ar.current);var n=rt(Sn.current),t=Dl(n,e.type);n!==t&&(ne(sr,e),ne(Sn,t))}function Di(e){sr.current===e&&(re(Sn),re(sr))}var oe=An(0);function ll(e){for(var n=e;n!==null;){if(n.tag===13){var t=n.memoizedState;if(t!==null&&(t=t.dehydrated,t===null||t.data==="$?"||t.data==="$!"))return n}else if(n.tag===19&&n.memoizedProps.revealOrder!==void 0){if((n.flags&128)!==0)return n}else if(n.child!==null){n.child.return=n,n=n.child;continue}if(n===e)break;for(;n.sibling===null;){if(n.return===null||n.return===e)return null;n=n.return}n.sibling.return=n.return,n=n.sibling}return null}var Fi=[];function Ui(){for(var e=0;e<Fi.length;e++)Fi[e]._workInProgressVersionPrimary=null;Fi.length=0}var il=me.ReactCurrentDispatcher,Ai=me.ReactCurrentBatchConfig,lt=0,ue=null,pe=null,ge=null,ol=!1,cr=!1,fr=0,nf=0;function Te(){throw Error(m(321))}function Vi(e,n){if(n===null)return!1;for(var t=0;t<n.length&&t<e.length;t++)if(!fn(e[t],n[t]))return!1;return!0}function $i(e,n,t,r,l,i){if(lt=i,ue=n,n.memoizedState=null,n.updateQueue=null,n.lanes=0,il.current=e===null||e.memoizedState===null?of:uf,e=t(r,l),cr){i=0;do{if(cr=!1,fr=0,25<=i)throw Error(m(301));i+=1,ge=pe=null,n.updateQueue=null,il.current=sf,e=t(r,l)}while(cr)}if(il.current=al,n=pe!==null&&pe.next!==null,lt=0,ge=pe=ue=null,ol=!1,n)throw Error(m(300));return e}function Bi(){var e=fr!==0;return fr=0,e}function kn(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return ge===null?ue.memoizedState=ge=e:ge=ge.next=e,ge}function on(){if(pe===null){var e=ue.alternate;e=e!==null?e.memoizedState:null}else e=pe.next;var n=ge===null?ue.memoizedState:ge.next;if(n!==null)ge=n,pe=e;else{if(e===null)throw Error(m(310));pe=e,e={memoizedState:pe.memoizedState,baseState:pe.baseState,baseQueue:pe.baseQueue,queue:pe.queue,next:null},ge===null?ue.memoizedState=ge=e:ge=ge.next=e}return ge}function dr(e,n){return typeof n=="function"?n(e):n}function Hi(e){var n=on(),t=n.queue;if(t===null)throw Error(m(311));t.lastRenderedReducer=e;var r=pe,l=r.baseQueue,i=t.pending;if(i!==null){if(l!==null){var o=l.next;l.next=i.next,i.next=o}r.baseQueue=l=i,t.pending=null}if(l!==null){i=l.next,r=r.baseState;var u=o=null,s=null,h=i;do{var w=h.lane;if((lt&w)===w)s!==null&&(s=s.next={lane:0,action:h.action,hasEagerState:h.hasEagerState,eagerState:h.eagerState,next:null}),r=h.hasEagerState?h.eagerState:e(r,h.action);else{var S={lane:w,action:h.action,hasEagerState:h.hasEagerState,eagerState:h.eagerState,next:null};s===null?(u=s=S,o=r):s=s.next=S,ue.lanes|=w,it|=w}h=h.next}while(h!==null&&h!==i);s===null?o=r:s.next=u,fn(r,n.memoizedState)||(He=!0),n.memoizedState=r,n.baseState=o,n.baseQueue=s,t.lastRenderedState=r}if(e=t.interleaved,e!==null){l=e;do i=l.lane,ue.lanes|=i,it|=i,l=l.next;while(l!==e)}else l===null&&(t.lanes=0);return[n.memoizedState,t.dispatch]}function Wi(e){var n=on(),t=n.queue;if(t===null)throw Error(m(311));t.lastRenderedReducer=e;var r=t.dispatch,l=t.pending,i=n.memoizedState;if(l!==null){t.pending=null;var o=l=l.next;do i=e(i,o.action),o=o.next;while(o!==l);fn(i,n.memoizedState)||(He=!0),n.memoizedState=i,n.baseQueue===null&&(n.baseState=i),t.lastRenderedState=i}return[i,r]}function ds(){}function ps(e,n){var t=ue,r=on(),l=n(),i=!fn(r.memoizedState,l);if(i&&(r.memoizedState=l,He=!0),r=r.queue,Qi(vs.bind(null,t,r,e),[e]),r.getSnapshot!==n||i||ge!==null&&ge.memoizedState.tag&1){if(t.flags|=2048,pr(9,ms.bind(null,t,r,l,n),void 0,null),we===null)throw Error(m(349));(lt&30)!==0||hs(t,n,l)}return l}function hs(e,n,t){e.flags|=16384,e={getSnapshot:n,value:t},n=ue.updateQueue,n===null?(n={lastEffect:null,stores:null},ue.updateQueue=n,n.stores=[e]):(t=n.stores,t===null?n.stores=[e]:t.push(e))}function ms(e,n,t,r){n.value=t,n.getSnapshot=r,ys(n)&&gs(e)}function vs(e,n,t){return t(function(){ys(n)&&gs(e)})}function ys(e){var n=e.getSnapshot;e=e.value;try{var t=n();return!fn(e,t)}catch{return!0}}function gs(e){var n=jn(e,1);n!==null&&vn(n,e,1,-1)}function ws(e){var n=kn();return typeof e=="function"&&(e=e()),n.memoizedState=n.baseState=e,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:dr,lastRenderedState:e},n.queue=e,e=e.dispatch=lf.bind(null,ue,e),[n.memoizedState,e]}function pr(e,n,t,r){return e={tag:e,create:n,destroy:t,deps:r,next:null},n=ue.updateQueue,n===null?(n={lastEffect:null,stores:null},ue.updateQueue=n,n.lastEffect=e.next=e):(t=n.lastEffect,t===null?n.lastEffect=e.next=e:(r=t.next,t.next=e,e.next=r,n.lastEffect=e)),e}function Ss(){return on().memoizedState}function ul(e,n,t,r){var l=kn();ue.flags|=e,l.memoizedState=pr(1|n,t,void 0,r===void 0?null:r)}function sl(e,n,t,r){var l=on();r=r===void 0?null:r;var i=void 0;if(pe!==null){var o=pe.memoizedState;if(i=o.destroy,r!==null&&Vi(r,o.deps)){l.memoizedState=pr(n,t,i,r);return}}ue.flags|=e,l.memoizedState=pr(1|n,t,i,r)}function ks(e,n){return ul(8390656,8,e,n)}function Qi(e,n){return sl(2048,8,e,n)}function xs(e,n){return sl(4,2,e,n)}function Es(e,n){return sl(4,4,e,n)}function Cs(e,n){if(typeof n=="function")return e=e(),n(e),function(){n(null)};if(n!=null)return e=e(),n.current=e,function(){n.current=null}}function Ns(e,n,t){return t=t!=null?t.concat([e]):null,sl(4,4,Cs.bind(null,n,e),t)}function Ki(){}function _s(e,n){var t=on();n=n===void 0?null:n;var r=t.memoizedState;return r!==null&&n!==null&&Vi(n,r[1])?r[0]:(t.memoizedState=[e,n],e)}function js(e,n){var t=on();n=n===void 0?null:n;var r=t.memoizedState;return r!==null&&n!==null&&Vi(n,r[1])?r[0]:(e=e(),t.memoizedState=[e,n],e)}function Ps(e,n,t){return(lt&21)===0?(e.baseState&&(e.baseState=!1,He=!0),e.memoizedState=t):(fn(t,n)||(t=lu(),ue.lanes|=t,it|=t,e.baseState=!0),n)}function tf(e,n){var t=Z;Z=t!==0&&4>t?t:4,e(!0);var r=Ai.transition;Ai.transition={};try{e(!1),n()}finally{Z=t,Ai.transition=r}}function Ls(){return on().memoizedState}function rf(e,n,t){var r=Yn(e);if(t={lane:r,action:t,hasEagerState:!1,eagerState:null,next:null},Ts(e))zs(n,t);else if(t=us(e,n,t,r),t!==null){var l=Ue();vn(t,e,r,l),Rs(t,n,r)}}function lf(e,n,t){var r=Yn(e),l={lane:r,action:t,hasEagerState:!1,eagerState:null,next:null};if(Ts(e))zs(n,l);else{var i=e.alternate;if(e.lanes===0&&(i===null||i.lanes===0)&&(i=n.lastRenderedReducer,i!==null))try{var o=n.lastRenderedState,u=i(o,t);if(l.hasEagerState=!0,l.eagerState=u,fn(u,o)){var s=n.interleaved;s===null?(l.next=l,Ii(n)):(l.next=s.next,s.next=l),n.interleaved=l;return}}catch{}finally{}t=us(e,n,l,r),t!==null&&(l=Ue(),vn(t,e,r,l),Rs(t,n,r))}}function Ts(e){var n=e.alternate;return e===ue||n!==null&&n===ue}function zs(e,n){cr=ol=!0;var t=e.pending;t===null?n.next=n:(n.next=t.next,t.next=n),e.pending=n}function Rs(e,n,t){if((t&4194240)!==0){var r=n.lanes;r&=e.pendingLanes,t|=r,n.lanes=t,Gl(e,t)}}var al={readContext:ln,useCallback:Te,useContext:Te,useEffect:Te,useImperativeHandle:Te,useInsertionEffect:Te,useLayoutEffect:Te,useMemo:Te,useReducer:Te,useRef:Te,useState:Te,useDebugValue:Te,useDeferredValue:Te,useTransition:Te,useMutableSource:Te,useSyncExternalStore:Te,useId:Te,unstable_isNewReconciler:!1},of={readContext:ln,useCallback:function(e,n){return kn().memoizedState=[e,n===void 0?null:n],e},useContext:ln,useEffect:ks,useImperativeHandle:function(e,n,t){return t=t!=null?t.concat([e]):null,ul(4194308,4,Cs.bind(null,n,e),t)},useLayoutEffect:function(e,n){return ul(4194308,4,e,n)},useInsertionEffect:function(e,n){return ul(4,2,e,n)},useMemo:function(e,n){var t=kn();return n=n===void 0?null:n,e=e(),t.memoizedState=[e,n],e},useReducer:function(e,n,t){var r=kn();return n=t!==void 0?t(n):n,r.memoizedState=r.baseState=n,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:n},r.queue=e,e=e.dispatch=rf.bind(null,ue,e),[r.memoizedState,e]},useRef:function(e){var n=kn();return e={current:e},n.memoizedState=e},useState:ws,useDebugValue:Ki,useDeferredValue:function(e){return kn().memoizedState=e},useTransition:function(){var e=ws(!1),n=e[0];return e=tf.bind(null,e[1]),kn().memoizedState=e,[n,e]},useMutableSource:function(){},useSyncExternalStore:function(e,n,t){var r=ue,l=kn();if(ie){if(t===void 0)throw Error(m(407));t=t()}else{if(t=n(),we===null)throw Error(m(349));(lt&30)!==0||hs(r,n,t)}l.memoizedState=t;var i={value:t,getSnapshot:n};return l.queue=i,ks(vs.bind(null,r,i,e),[e]),r.flags|=2048,pr(9,ms.bind(null,r,i,t,n),void 0,null),t},useId:function(){var e=kn(),n=we.identifierPrefix;if(ie){var t=_n,r=Nn;t=(r&~(1<<32-cn(r)-1)).toString(32)+t,n=":"+n+"R"+t,t=fr++,0<t&&(n+="H"+t.toString(32)),n+=":"}else t=nf++,n=":"+n+"r"+t.toString(32)+":";return e.memoizedState=n},unstable_isNewReconciler:!1},uf={readContext:ln,useCallback:_s,useContext:ln,useEffect:Qi,useImperativeHandle:Ns,useInsertionEffect:xs,useLayoutEffect:Es,useMemo:js,useReducer:Hi,useRef:Ss,useState:function(){return Hi(dr)},useDebugValue:Ki,useDeferredValue:function(e){var n=on();return Ps(n,pe.memoizedState,e)},useTransition:function(){var e=Hi(dr)[0],n=on().memoizedState;return[e,n]},useMutableSource:ds,useSyncExternalStore:ps,useId:Ls,unstable_isNewReconciler:!1},sf={readContext:ln,useCallback:_s,useContext:ln,useEffect:Qi,useImperativeHandle:Ns,useInsertionEffect:xs,useLayoutEffect:Es,useMemo:js,useReducer:Wi,useRef:Ss,useState:function(){return Wi(dr)},useDebugValue:Ki,useDeferredValue:function(e){var n=on();return pe===null?n.memoizedState=e:Ps(n,pe.memoizedState,e)},useTransition:function(){var e=Wi(dr)[0],n=on().memoizedState;return[e,n]},useMutableSource:ds,useSyncExternalStore:ps,useId:Ls,unstable_isNewReconciler:!1};function pn(e,n){if(e&&e.defaultProps){n=j({},n),e=e.defaultProps;for(var t in e)n[t]===void 0&&(n[t]=e[t]);return n}return n}function Yi(e,n,t,r){n=e.memoizedState,t=t(r,n),t=t==null?n:j({},n,t),e.memoizedState=t,e.lanes===0&&(e.updateQueue.baseState=t)}var cl={isMounted:function(e){return(e=e._reactInternals)?Jn(e)===e:!1},enqueueSetState:function(e,n,t){e=e._reactInternals;var r=Ue(),l=Yn(e),i=Pn(r,l);i.payload=n,t!=null&&(i.callback=t),n=Hn(e,i,l),n!==null&&(vn(n,e,l,r),tl(n,e,l))},enqueueReplaceState:function(e,n,t){e=e._reactInternals;var r=Ue(),l=Yn(e),i=Pn(r,l);i.tag=1,i.payload=n,t!=null&&(i.callback=t),n=Hn(e,i,l),n!==null&&(vn(n,e,l,r),tl(n,e,l))},enqueueForceUpdate:function(e,n){e=e._reactInternals;var t=Ue(),r=Yn(e),l=Pn(t,r);l.tag=2,n!=null&&(l.callback=n),n=Hn(e,l,r),n!==null&&(vn(n,e,r,t),tl(n,e,r))}};function Is(e,n,t,r,l,i,o){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(r,i,o):n.prototype&&n.prototype.isPureReactComponent?!bt(t,r)||!bt(l,i):!0}function Ms(e,n,t){var r=!1,l=Vn,i=n.contextType;return typeof i=="object"&&i!==null?i=ln(i):(l=Be(n)?bn:Le.current,r=n.contextTypes,i=(r=r!=null)?xt(e,l):Vn),n=new n(t,i),e.memoizedState=n.state!==null&&n.state!==void 0?n.state:null,n.updater=cl,e.stateNode=n,n._reactInternals=e,r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=l,e.__reactInternalMemoizedMaskedChildContext=i),n}function Os(e,n,t,r){e=n.state,typeof n.componentWillReceiveProps=="function"&&n.componentWillReceiveProps(t,r),typeof n.UNSAFE_componentWillReceiveProps=="function"&&n.UNSAFE_componentWillReceiveProps(t,r),n.state!==e&&cl.enqueueReplaceState(n,n.state,null)}function Gi(e,n,t,r){var l=e.stateNode;l.props=t,l.state=e.memoizedState,l.refs={},Mi(e);var i=n.contextType;typeof i=="object"&&i!==null?l.context=ln(i):(i=Be(n)?bn:Le.current,l.context=xt(e,i)),l.state=e.memoizedState,i=n.getDerivedStateFromProps,typeof i=="function"&&(Yi(e,n,i,t),l.state=e.memoizedState),typeof n.getDerivedStateFromProps=="function"||typeof l.getSnapshotBeforeUpdate=="function"||typeof l.UNSAFE_componentWillMount!="function"&&typeof l.componentWillMount!="function"||(n=l.state,typeof l.componentWillMount=="function"&&l.componentWillMount(),typeof l.UNSAFE_componentWillMount=="function"&&l.UNSAFE_componentWillMount(),n!==l.state&&cl.enqueueReplaceState(l,l.state,null),rl(e,t,l,r),l.state=e.memoizedState),typeof l.componentDidMount=="function"&&(e.flags|=4194308)}function Tt(e,n){try{var t="",r=n;do t+=A(r),r=r.return;while(r);var l=t}catch(i){l=`\nError generating stack: `+i.message+`\n`+i.stack}return{value:e,source:n,stack:l,digest:null}}function Xi(e,n,t){return{value:e,source:null,stack:t??null,digest:n??null}}function Zi(e,n){try{console.error(n.value)}catch(t){setTimeout(function(){throw t})}}var af=typeof WeakMap=="function"?WeakMap:Map;function Ds(e,n,t){t=Pn(-1,t),t.tag=3,t.payload={element:null};var r=n.value;return t.callback=function(){yl||(yl=!0,fo=r),Zi(e,n)},t}function Fs(e,n,t){t=Pn(-1,t),t.tag=3;var r=e.type.getDerivedStateFromError;if(typeof r=="function"){var l=n.value;t.payload=function(){return r(l)},t.callback=function(){Zi(e,n)}}var i=e.stateNode;return i!==null&&typeof i.componentDidCatch=="function"&&(t.callback=function(){Zi(e,n),typeof r!="function"&&(Qn===null?Qn=new Set([this]):Qn.add(this));var o=n.stack;this.componentDidCatch(n.value,{componentStack:o!==null?o:""})}),t}function Us(e,n,t){var r=e.pingCache;if(r===null){r=e.pingCache=new af;var l=new Set;r.set(n,l)}else l=r.get(n),l===void 0&&(l=new Set,r.set(n,l));l.has(t)||(l.add(t),e=Ef.bind(null,e,n,t),n.then(e,e))}function As(e){do{var n;if((n=e.tag===13)&&(n=e.memoizedState,n=n!==null?n.dehydrated!==null:!0),n)return e;e=e.return}while(e!==null);return null}function Vs(e,n,t,r,l){return(e.mode&1)===0?(e===n?e.flags|=65536:(e.flags|=128,t.flags|=131072,t.flags&=-52805,t.tag===1&&(t.alternate===null?t.tag=17:(n=Pn(-1,1),n.tag=2,Hn(t,n,1))),t.lanes|=1),e):(e.flags|=65536,e.lanes=l,e)}var cf=me.ReactCurrentOwner,He=!1;function Fe(e,n,t,r){n.child=e===null?os(n,null,t,r):_t(n,e.child,t,r)}function $s(e,n,t,r,l){t=t.render;var i=n.ref;return Pt(n,l),r=$i(e,n,t,r,i,l),t=Bi(),e!==null&&!He?(n.updateQueue=e.updateQueue,n.flags&=-2053,e.lanes&=~l,Ln(e,n,l)):(ie&&t&&Ci(n),n.flags|=1,Fe(e,n,r,l),n.child)}function Bs(e,n,t,r,l){if(e===null){var i=t.type;return typeof i=="function"&&!wo(i)&&i.defaultProps===void 0&&t.compare===null&&t.defaultProps===void 0?(n.tag=15,n.type=i,Hs(e,n,i,r,l)):(e=El(t.type,null,r,n,n.mode,l),e.ref=n.ref,e.return=n,n.child=e)}if(i=e.child,(e.lanes&l)===0){var o=i.memoizedProps;if(t=t.compare,t=t!==null?t:bt,t(o,r)&&e.ref===n.ref)return Ln(e,n,l)}return n.flags|=1,e=Xn(i,r),e.ref=n.ref,e.return=n,n.child=e}function Hs(e,n,t,r,l){if(e!==null){var i=e.memoizedProps;if(bt(i,r)&&e.ref===n.ref)if(He=!1,n.pendingProps=r=i,(e.lanes&l)!==0)(e.flags&131072)!==0&&(He=!0);else return n.lanes=e.lanes,Ln(e,n,l)}return Ji(e,n,t,r,l)}function Ws(e,n,t){var r=n.pendingProps,l=r.children,i=e!==null?e.memoizedState:null;if(r.mode==="hidden")if((n.mode&1)===0)n.memoizedState={baseLanes:0,cachePool:null,transitions:null},ne(Rt,be),be|=t;else{if((t&1073741824)===0)return e=i!==null?i.baseLanes|t:t,n.lanes=n.childLanes=1073741824,n.memoizedState={baseLanes:e,cachePool:null,transitions:null},n.updateQueue=null,ne(Rt,be),be|=e,null;n.memoizedState={baseLanes:0,cachePool:null,transitions:null},r=i!==null?i.baseLanes:t,ne(Rt,be),be|=r}else i!==null?(r=i.baseLanes|t,n.memoizedState=null):r=t,ne(Rt,be),be|=r;return Fe(e,n,l,t),n.child}function Qs(e,n){var t=n.ref;(e===null&&t!==null||e!==null&&e.ref!==t)&&(n.flags|=512,n.flags|=2097152)}function Ji(e,n,t,r,l){var i=Be(t)?bn:Le.current;return i=xt(n,i),Pt(n,l),t=$i(e,n,t,r,i,l),r=Bi(),e!==null&&!He?(n.updateQueue=e.updateQueue,n.flags&=-2053,e.lanes&=~l,Ln(e,n,l)):(ie&&r&&Ci(n),n.flags|=1,Fe(e,n,t,l),n.child)}function Ks(e,n,t,r,l){if(Be(t)){var i=!0;Gr(n)}else i=!1;if(Pt(n,l),n.stateNode===null)dl(e,n),Ms(n,t,r),Gi(n,t,r,l),r=!0;else if(e===null){var o=n.stateNode,u=n.memoizedProps;o.props=u;var s=o.context,h=t.contextType;typeof h=="object"&&h!==null?h=ln(h):(h=Be(t)?bn:Le.current,h=xt(n,h));var w=t.getDerivedStateFromProps,S=typeof w=="function"||typeof o.getSnapshotBeforeUpdate=="function";S||typeof o.UNSAFE_componentWillReceiveProps!="function"&&typeof o.componentWillReceiveProps!="function"||(u!==r||s!==h)&&Os(n,o,r,h),Bn=!1;var g=n.memoizedState;o.state=g,rl(n,r,o,l),s=n.memoizedState,u!==r||g!==s||$e.current||Bn?(typeof w=="function"&&(Yi(n,t,w,r),s=n.memoizedState),(u=Bn||Is(n,t,u,r,g,s,h))?(S||typeof o.UNSAFE_componentWillMount!="function"&&typeof o.componentWillMount!="function"||(typeof o.componentWillMount=="function"&&o.componentWillMount(),typeof o.UNSAFE_componentWillMount=="function"&&o.UNSAFE_componentWillMount()),typeof o.componentDidMount=="function"&&(n.flags|=4194308)):(typeof o.componentDidMount=="function"&&(n.flags|=4194308),n.memoizedProps=r,n.memoizedState=s),o.props=r,o.state=s,o.context=h,r=u):(typeof o.componentDidMount=="function"&&(n.flags|=4194308),r=!1)}else{o=n.stateNode,ss(e,n),u=n.memoizedProps,h=n.type===n.elementType?u:pn(n.type,u),o.props=h,S=n.pendingProps,g=o.context,s=t.contextType,typeof s=="object"&&s!==null?s=ln(s):(s=Be(t)?bn:Le.current,s=xt(n,s));var _=t.getDerivedStateFromProps;(w=typeof _=="function"||typeof o.getSnapshotBeforeUpdate=="function")||typeof o.UNSAFE_componentWillReceiveProps!="function"&&typeof o.componentWillReceiveProps!="function"||(u!==S||g!==s)&&Os(n,o,r,s),Bn=!1,g=n.memoizedState,o.state=g,rl(n,r,o,l);var L=n.memoizedState;u!==S||g!==L||$e.current||Bn?(typeof _=="function"&&(Yi(n,t,_,r),L=n.memoizedState),(h=Bn||Is(n,t,h,r,g,L,s)||!1)?(w||typeof o.UNSAFE_componentWillUpdate!="function"&&typeof o.componentWillUpdate!="function"||(typeof o.componentWillUpdate=="function"&&o.componentWillUpdate(r,L,s),typeof o.UNSAFE_componentWillUpdate=="function"&&o.UNSAFE_componentWillUpdate(r,L,s)),typeof o.componentDidUpdate=="function"&&(n.flags|=4),typeof o.getSnapshotBeforeUpdate=="function"&&(n.flags|=1024)):(typeof o.componentDidUpdate!="function"||u===e.memoizedProps&&g===e.memoizedState||(n.flags|=4),typeof o.getSnapshotBeforeUpdate!="function"||u===e.memoizedProps&&g===e.memoizedState||(n.flags|=1024),n.memoizedProps=r,n.memoizedState=L),o.props=r,o.state=L,o.context=s,r=h):(typeof o.componentDidUpdate!="function"||u===e.memoizedProps&&g===e.memoizedState||(n.flags|=4),typeof o.getSnapshotBeforeUpdate!="function"||u===e.memoizedProps&&g===e.memoizedState||(n.flags|=1024),r=!1)}return qi(e,n,t,r,i,l)}function qi(e,n,t,r,l,i){Qs(e,n);var o=(n.flags&128)!==0;if(!r&&!o)return l&&Ju(n,t,!1),Ln(e,n,i);r=n.stateNode,cf.current=n;var u=o&&typeof t.getDerivedStateFromError!="function"?null:r.render();return n.flags|=1,e!==null&&o?(n.child=_t(n,e.child,null,i),n.child=_t(n,null,u,i)):Fe(e,n,u,i),n.memoizedState=r.state,l&&Ju(n,t,!0),n.child}function Ys(e){var n=e.stateNode;n.pendingContext?Xu(e,n.pendingContext,n.pendingContext!==n.context):n.context&&Xu(e,n.context,!1),Oi(e,n.containerInfo)}function Gs(e,n,t,r,l){return Nt(),Pi(l),n.flags|=256,Fe(e,n,t,r),n.child}var bi={dehydrated:null,treeContext:null,retryLane:0};function eo(e){return{baseLanes:e,cachePool:null,transitions:null}}function Xs(e,n,t){var r=n.pendingProps,l=oe.current,i=!1,o=(n.flags&128)!==0,u;if((u=o)||(u=e!==null&&e.memoizedState===null?!1:(l&2)!==0),u?(i=!0,n.flags&=-129):(e===null||e.memoizedState!==null)&&(l|=1),ne(oe,l&1),e===null)return ji(n),e=n.memoizedState,e!==null&&(e=e.dehydrated,e!==null)?((n.mode&1)===0?n.lanes=1:e.data==="$!"?n.lanes=8:n.lanes=1073741824,null):(o=r.children,e=r.fallback,i?(r=n.mode,i=n.child,o={mode:"hidden",children:o},(r&1)===0&&i!==null?(i.childLanes=0,i.pendingProps=o):i=Cl(o,r,0,null),e=at(e,r,t,null),i.return=n,e.return=n,i.sibling=e,n.child=i,n.child.memoizedState=eo(t),n.memoizedState=bi,e):no(n,o));if(l=e.memoizedState,l!==null&&(u=l.dehydrated,u!==null))return ff(e,n,o,r,u,l,t);if(i){i=r.fallback,o=n.mode,l=e.child,u=l.sibling;var s={mode:"hidden",children:r.children};return(o&1)===0&&n.child!==l?(r=n.child,r.childLanes=0,r.pendingProps=s,n.deletions=null):(r=Xn(l,s),r.subtreeFlags=l.subtreeFlags&14680064),u!==null?i=Xn(u,i):(i=at(i,o,t,null),i.flags|=2),i.return=n,r.return=n,r.sibling=i,n.child=r,r=i,i=n.child,o=e.child.memoizedState,o=o===null?eo(t):{baseLanes:o.baseLanes|t,cachePool:null,transitions:o.transitions},i.memoizedState=o,i.childLanes=e.childLanes&~t,n.memoizedState=bi,r}return i=e.child,e=i.sibling,r=Xn(i,{mode:"visible",children:r.children}),(n.mode&1)===0&&(r.lanes=t),r.return=n,r.sibling=null,e!==null&&(t=n.deletions,t===null?(n.deletions=[e],n.flags|=16):t.push(e)),n.child=r,n.memoizedState=null,r}function no(e,n){return n=Cl({mode:"visible",children:n},e.mode,0,null),n.return=e,e.child=n}function fl(e,n,t,r){return r!==null&&Pi(r),_t(n,e.child,null,t),e=no(n,n.pendingProps.children),e.flags|=2,n.memoizedState=null,e}function ff(e,n,t,r,l,i,o){if(t)return n.flags&256?(n.flags&=-257,r=Xi(Error(m(422))),fl(e,n,o,r)):n.memoizedState!==null?(n.child=e.child,n.flags|=128,null):(i=r.fallback,l=n.mode,r=Cl({mode:"visible",children:r.children},l,0,null),i=at(i,l,o,null),i.flags|=2,r.return=n,i.return=n,r.sibling=i,n.child=r,(n.mode&1)!==0&&_t(n,e.child,null,o),n.child.memoizedState=eo(o),n.memoizedState=bi,i);if((n.mode&1)===0)return fl(e,n,o,null);if(l.data==="$!"){if(r=l.nextSibling&&l.nextSibling.dataset,r)var u=r.dgst;return r=u,i=Error(m(419)),r=Xi(i,r,void 0),fl(e,n,o,r)}if(u=(o&e.childLanes)!==0,He||u){if(r=we,r!==null){switch(o&-o){case 4:l=2;break;case 16:l=8;break;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:l=32;break;case 536870912:l=268435456;break;default:l=0}l=(l&(r.suspendedLanes|o))!==0?0:l,l!==0&&l!==i.retryLane&&(i.retryLane=l,jn(e,l),vn(r,e,l,-1))}return go(),r=Xi(Error(m(421))),fl(e,n,o,r)}return l.data==="$?"?(n.flags|=128,n.child=e.child,n=Cf.bind(null,e),l._reactRetry=n,null):(e=i.treeContext,qe=Un(l.nextSibling),Je=n,ie=!0,dn=null,e!==null&&(tn[rn++]=Nn,tn[rn++]=_n,tn[rn++]=et,Nn=e.id,_n=e.overflow,et=n),n=no(n,r.children),n.flags|=4096,n)}function Zs(e,n,t){e.lanes|=n;var r=e.alternate;r!==null&&(r.lanes|=n),Ri(e.return,n,t)}function to(e,n,t,r,l){var i=e.memoizedState;i===null?e.memoizedState={isBackwards:n,rendering:null,renderingStartTime:0,last:r,tail:t,tailMode:l}:(i.isBackwards=n,i.rendering=null,i.renderingStartTime=0,i.last=r,i.tail=t,i.tailMode=l)}function Js(e,n,t){var r=n.pendingProps,l=r.revealOrder,i=r.tail;if(Fe(e,n,r.children,t),r=oe.current,(r&2)!==0)r=r&1|2,n.flags|=128;else{if(e!==null&&(e.flags&128)!==0)e:for(e=n.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&Zs(e,t,n);else if(e.tag===19)Zs(e,t,n);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===n)break e;for(;e.sibling===null;){if(e.return===null||e.return===n)break e;e=e.return}e.sibling.return=e.return,e=e.sibling}r&=1}if(ne(oe,r),(n.mode&1)===0)n.memoizedState=null;else switch(l){case"forwards":for(t=n.child,l=null;t!==null;)e=t.alternate,e!==null&&ll(e)===null&&(l=t),t=t.sibling;t=l,t===null?(l=n.child,n.child=null):(l=t.sibling,t.sibling=null),to(n,!1,l,t,i);break;case"backwards":for(t=null,l=n.child,n.child=null;l!==null;){if(e=l.alternate,e!==null&&ll(e)===null){n.child=l;break}e=l.sibling,l.sibling=t,t=l,l=e}to(n,!0,t,null,i);break;case"together":to(n,!1,null,null,void 0);break;default:n.memoizedState=null}return n.child}function dl(e,n){(n.mode&1)===0&&e!==null&&(e.alternate=null,n.alternate=null,n.flags|=2)}function Ln(e,n,t){if(e!==null&&(n.dependencies=e.dependencies),it|=n.lanes,(t&n.childLanes)===0)return null;if(e!==null&&n.child!==e.child)throw Error(m(153));if(n.child!==null){for(e=n.child,t=Xn(e,e.pendingProps),n.child=t,t.return=n;e.sibling!==null;)e=e.sibling,t=t.sibling=Xn(e,e.pendingProps),t.return=n;t.sibling=null}return n.child}function df(e,n,t){switch(n.tag){case 3:Ys(n),Nt();break;case 5:fs(n);break;case 1:Be(n.type)&&Gr(n);break;case 4:Oi(n,n.stateNode.containerInfo);break;case 10:var r=n.type._context,l=n.memoizedProps.value;ne(el,r._currentValue),r._currentValue=l;break;case 13:if(r=n.memoizedState,r!==null)return r.dehydrated!==null?(ne(oe,oe.current&1),n.flags|=128,null):(t&n.child.childLanes)!==0?Xs(e,n,t):(ne(oe,oe.current&1),e=Ln(e,n,t),e!==null?e.sibling:null);ne(oe,oe.current&1);break;case 19:if(r=(t&n.childLanes)!==0,(e.flags&128)!==0){if(r)return Js(e,n,t);n.flags|=128}if(l=n.memoizedState,l!==null&&(l.rendering=null,l.tail=null,l.lastEffect=null),ne(oe,oe.current),r)break;return null;case 22:case 23:return n.lanes=0,Ws(e,n,t)}return Ln(e,n,t)}var qs,ro,bs,ea;qs=function(e,n){for(var t=n.child;t!==null;){if(t.tag===5||t.tag===6)e.appendChild(t.stateNode);else if(t.tag!==4&&t.child!==null){t.child.return=t,t=t.child;continue}if(t===n)break;for(;t.sibling===null;){if(t.return===null||t.return===n)return;t=t.return}t.sibling.return=t.return,t=t.sibling}},ro=function(){},bs=function(e,n,t,r){var l=e.memoizedProps;if(l!==r){e=n.stateNode,rt(Sn.current);var i=null;switch(t){case"input":l=Rl(e,l),r=Rl(e,r),i=[];break;case"select":l=j({},l,{value:void 0}),r=j({},r,{value:void 0}),i=[];break;case"textarea":l=Ol(e,l),r=Ol(e,r),i=[];break;default:typeof l.onClick!="function"&&typeof r.onClick=="function"&&(e.onclick=Qr)}Fl(t,r);var o;t=null;for(h in l)if(!r.hasOwnProperty(h)&&l.hasOwnProperty(h)&&l[h]!=null)if(h==="style"){var u=l[h];for(o in u)u.hasOwnProperty(o)&&(t||(t={}),t[o]="")}else h!=="dangerouslySetInnerHTML"&&h!=="children"&&h!=="suppressContentEditableWarning"&&h!=="suppressHydrationWarning"&&h!=="autoFocus"&&(U.hasOwnProperty(h)?i||(i=[]):(i=i||[]).push(h,null));for(h in r){var s=r[h];if(u=l!=null?l[h]:void 0,r.hasOwnProperty(h)&&s!==u&&(s!=null||u!=null))if(h==="style")if(u){for(o in u)!u.hasOwnProperty(o)||s&&s.hasOwnProperty(o)||(t||(t={}),t[o]="");for(o in s)s.hasOwnProperty(o)&&u[o]!==s[o]&&(t||(t={}),t[o]=s[o])}else t||(i||(i=[]),i.push(h,t)),t=s;else h==="dangerouslySetInnerHTML"?(s=s?s.__html:void 0,u=u?u.__html:void 0,s!=null&&u!==s&&(i=i||[]).push(h,s)):h==="children"?typeof s!="string"&&typeof s!="number"||(i=i||[]).push(h,""+s):h!=="suppressContentEditableWarning"&&h!=="suppressHydrationWarning"&&(U.hasOwnProperty(h)?(s!=null&&h==="onScroll"&&te("scroll",e),i||u===s||(i=[])):(i=i||[]).push(h,s))}t&&(i=i||[]).push("style",t);var h=i;(n.updateQueue=h)&&(n.flags|=4)}},ea=function(e,n,t,r){t!==r&&(n.flags|=4)};function hr(e,n){if(!ie)switch(e.tailMode){case"hidden":n=e.tail;for(var t=null;n!==null;)n.alternate!==null&&(t=n),n=n.sibling;t===null?e.tail=null:t.sibling=null;break;case"collapsed":t=e.tail;for(var r=null;t!==null;)t.alternate!==null&&(r=t),t=t.sibling;r===null?n||e.tail===null?e.tail=null:e.tail.sibling=null:r.sibling=null}}function ze(e){var n=e.alternate!==null&&e.alternate.child===e.child,t=0,r=0;if(n)for(var l=e.child;l!==null;)t|=l.lanes|l.childLanes,r|=l.subtreeFlags&14680064,r|=l.flags&14680064,l.return=e,l=l.sibling;else for(l=e.child;l!==null;)t|=l.lanes|l.childLanes,r|=l.subtreeFlags,r|=l.flags,l.return=e,l=l.sibling;return e.subtreeFlags|=r,e.childLanes=t,n}function pf(e,n,t){var r=n.pendingProps;switch(Ni(n),n.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return ze(n),null;case 1:return Be(n.type)&&Yr(),ze(n),null;case 3:return r=n.stateNode,Lt(),re($e),re(Le),Ui(),r.pendingContext&&(r.context=r.pendingContext,r.pendingContext=null),(e===null||e.child===null)&&(qr(n)?n.flags|=4:e===null||e.memoizedState.isDehydrated&&(n.flags&256)===0||(n.flags|=1024,dn!==null&&(mo(dn),dn=null))),ro(e,n),ze(n),null;case 5:Di(n);var l=rt(ar.current);if(t=n.type,e!==null&&n.stateNode!=null)bs(e,n,t,r,l),e.ref!==n.ref&&(n.flags|=512,n.flags|=2097152);else{if(!r){if(n.stateNode===null)throw Error(m(166));return ze(n),null}if(e=rt(Sn.current),qr(n)){r=n.stateNode,t=n.type;var i=n.memoizedProps;switch(r[wn]=n,r[lr]=i,e=(n.mode&1)!==0,t){case"dialog":te("cancel",r),te("close",r);break;case"iframe":case"object":case"embed":te("load",r);break;case"video":case"audio":for(l=0;l<nr.length;l++)te(nr[l],r);break;case"source":te("error",r);break;case"img":case"image":case"link":te("error",r),te("load",r);break;case"details":te("toggle",r);break;case"input":Mo(r,i),te("invalid",r);break;case"select":r._wrapperState={wasMultiple:!!i.multiple},te("invalid",r);break;case"textarea":Fo(r,i),te("invalid",r)}Fl(t,i),l=null;for(var o in i)if(i.hasOwnProperty(o)){var u=i[o];o==="children"?typeof u=="string"?r.textContent!==u&&(i.suppressHydrationWarning!==!0&&Wr(r.textContent,u,e),l=["children",u]):typeof u=="number"&&r.textContent!==""+u&&(i.suppressHydrationWarning!==!0&&Wr(r.textContent,u,e),l=["children",""+u]):U.hasOwnProperty(o)&&u!=null&&o==="onScroll"&&te("scroll",r)}switch(t){case"input":kr(r),Do(r,i,!0);break;case"textarea":kr(r),Ao(r);break;case"select":case"option":break;default:typeof i.onClick=="function"&&(r.onclick=Qr)}r=l,n.updateQueue=r,r!==null&&(n.flags|=4)}else{o=l.nodeType===9?l:l.ownerDocument,e==="http://www.w3.org/1999/xhtml"&&(e=Vo(t)),e==="http://www.w3.org/1999/xhtml"?t==="script"?(e=o.createElement("div"),e.innerHTML="<script><\\/script>",e=e.removeChild(e.firstChild)):typeof r.is=="string"?e=o.createElement(t,{is:r.is}):(e=o.createElement(t),t==="select"&&(o=e,r.multiple?o.multiple=!0:r.size&&(o.size=r.size))):e=o.createElementNS(e,t),e[wn]=n,e[lr]=r,qs(e,n,!1,!1),n.stateNode=e;e:{switch(o=Ul(t,r),t){case"dialog":te("cancel",e),te("close",e),l=r;break;case"iframe":case"object":case"embed":te("load",e),l=r;break;case"video":case"audio":for(l=0;l<nr.length;l++)te(nr[l],e);l=r;break;case"source":te("error",e),l=r;break;case"img":case"image":case"link":te("error",e),te("load",e),l=r;break;case"details":te("toggle",e),l=r;break;case"input":Mo(e,r),l=Rl(e,r),te("invalid",e);break;case"option":l=r;break;case"select":e._wrapperState={wasMultiple:!!r.multiple},l=j({},r,{value:void 0}),te("invalid",e);break;case"textarea":Fo(e,r),l=Ol(e,r),te("invalid",e);break;default:l=r}Fl(t,l),u=l;for(i in u)if(u.hasOwnProperty(i)){var s=u[i];i==="style"?Ho(e,s):i==="dangerouslySetInnerHTML"?(s=s?s.__html:void 0,s!=null&&$o(e,s)):i==="children"?typeof s=="string"?(t!=="textarea"||s!=="")&&Dt(e,s):typeof s=="number"&&Dt(e,""+s):i!=="suppressContentEditableWarning"&&i!=="suppressHydrationWarning"&&i!=="autoFocus"&&(U.hasOwnProperty(i)?s!=null&&i==="onScroll"&&te("scroll",e):s!=null&&_e(e,i,s,o))}switch(t){case"input":kr(e),Do(e,r,!1);break;case"textarea":kr(e),Ao(e);break;case"option":r.value!=null&&e.setAttribute("value",""+Q(r.value));break;case"select":e.multiple=!!r.multiple,i=r.value,i!=null?ct(e,!!r.multiple,i,!1):r.defaultValue!=null&&ct(e,!!r.multiple,r.defaultValue,!0);break;default:typeof l.onClick=="function"&&(e.onclick=Qr)}switch(t){case"button":case"input":case"select":case"textarea":r=!!r.autoFocus;break e;case"img":r=!0;break e;default:r=!1}}r&&(n.flags|=4)}n.ref!==null&&(n.flags|=512,n.flags|=2097152)}return ze(n),null;case 6:if(e&&n.stateNode!=null)ea(e,n,e.memoizedProps,r);else{if(typeof r!="string"&&n.stateNode===null)throw Error(m(166));if(t=rt(ar.current),rt(Sn.current),qr(n)){if(r=n.stateNode,t=n.memoizedProps,r[wn]=n,(i=r.nodeValue!==t)&&(e=Je,e!==null))switch(e.tag){case 3:Wr(r.nodeValue,t,(e.mode&1)!==0);break;case 5:e.memoizedProps.suppressHydrationWarning!==!0&&Wr(r.nodeValue,t,(e.mode&1)!==0)}i&&(n.flags|=4)}else r=(t.nodeType===9?t:t.ownerDocument).createTextNode(r),r[wn]=n,n.stateNode=r}return ze(n),null;case 13:if(re(oe),r=n.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(ie&&qe!==null&&(n.mode&1)!==0&&(n.flags&128)===0)rs(),Nt(),n.flags|=98560,i=!1;else if(i=qr(n),r!==null&&r.dehydrated!==null){if(e===null){if(!i)throw Error(m(318));if(i=n.memoizedState,i=i!==null?i.dehydrated:null,!i)throw Error(m(317));i[wn]=n}else Nt(),(n.flags&128)===0&&(n.memoizedState=null),n.flags|=4;ze(n),i=!1}else dn!==null&&(mo(dn),dn=null),i=!0;if(!i)return n.flags&65536?n:null}return(n.flags&128)!==0?(n.lanes=t,n):(r=r!==null,r!==(e!==null&&e.memoizedState!==null)&&r&&(n.child.flags|=8192,(n.mode&1)!==0&&(e===null||(oe.current&1)!==0?he===0&&(he=3):go())),n.updateQueue!==null&&(n.flags|=4),ze(n),null);case 4:return Lt(),ro(e,n),e===null&&tr(n.stateNode.containerInfo),ze(n),null;case 10:return zi(n.type._context),ze(n),null;case 17:return Be(n.type)&&Yr(),ze(n),null;case 19:if(re(oe),i=n.memoizedState,i===null)return ze(n),null;if(r=(n.flags&128)!==0,o=i.rendering,o===null)if(r)hr(i,!1);else{if(he!==0||e!==null&&(e.flags&128)!==0)for(e=n.child;e!==null;){if(o=ll(e),o!==null){for(n.flags|=128,hr(i,!1),r=o.updateQueue,r!==null&&(n.updateQueue=r,n.flags|=4),n.subtreeFlags=0,r=t,t=n.child;t!==null;)i=t,e=r,i.flags&=14680066,o=i.alternate,o===null?(i.childLanes=0,i.lanes=e,i.child=null,i.subtreeFlags=0,i.memoizedProps=null,i.memoizedState=null,i.updateQueue=null,i.dependencies=null,i.stateNode=null):(i.childLanes=o.childLanes,i.lanes=o.lanes,i.child=o.child,i.subtreeFlags=0,i.deletions=null,i.memoizedProps=o.memoizedProps,i.memoizedState=o.memoizedState,i.updateQueue=o.updateQueue,i.type=o.type,e=o.dependencies,i.dependencies=e===null?null:{lanes:e.lanes,firstContext:e.firstContext}),t=t.sibling;return ne(oe,oe.current&1|2),n.child}e=e.sibling}i.tail!==null&&ce()>It&&(n.flags|=128,r=!0,hr(i,!1),n.lanes=4194304)}else{if(!r)if(e=ll(o),e!==null){if(n.flags|=128,r=!0,t=e.updateQueue,t!==null&&(n.updateQueue=t,n.flags|=4),hr(i,!0),i.tail===null&&i.tailMode==="hidden"&&!o.alternate&&!ie)return ze(n),null}else 2*ce()-i.renderingStartTime>It&&t!==1073741824&&(n.flags|=128,r=!0,hr(i,!1),n.lanes=4194304);i.isBackwards?(o.sibling=n.child,n.child=o):(t=i.last,t!==null?t.sibling=o:n.child=o,i.last=o)}return i.tail!==null?(n=i.tail,i.rendering=n,i.tail=n.sibling,i.renderingStartTime=ce(),n.sibling=null,t=oe.current,ne(oe,r?t&1|2:t&1),n):(ze(n),null);case 22:case 23:return yo(),r=n.memoizedState!==null,e!==null&&e.memoizedState!==null!==r&&(n.flags|=8192),r&&(n.mode&1)!==0?(be&1073741824)!==0&&(ze(n),n.subtreeFlags&6&&(n.flags|=8192)):ze(n),null;case 24:return null;case 25:return null}throw Error(m(156,n.tag))}function hf(e,n){switch(Ni(n),n.tag){case 1:return Be(n.type)&&Yr(),e=n.flags,e&65536?(n.flags=e&-65537|128,n):null;case 3:return Lt(),re($e),re(Le),Ui(),e=n.flags,(e&65536)!==0&&(e&128)===0?(n.flags=e&-65537|128,n):null;case 5:return Di(n),null;case 13:if(re(oe),e=n.memoizedState,e!==null&&e.dehydrated!==null){if(n.alternate===null)throw Error(m(340));Nt()}return e=n.flags,e&65536?(n.flags=e&-65537|128,n):null;case 19:return re(oe),null;case 4:return Lt(),null;case 10:return zi(n.type._context),null;case 22:case 23:return yo(),null;case 24:return null;default:return null}}var pl=!1,Re=!1,mf=typeof WeakSet=="function"?WeakSet:Set,P=null;function zt(e,n){var t=e.ref;if(t!==null)if(typeof t=="function")try{t(null)}catch(r){ae(e,n,r)}else t.current=null}function lo(e,n,t){try{t()}catch(r){ae(e,n,r)}}var na=!1;function vf(e,n){if(vi=Ir,e=Iu(),si(e)){if("selectionStart"in e)var t={start:e.selectionStart,end:e.selectionEnd};else e:{t=(t=e.ownerDocument)&&t.defaultView||window;var r=t.getSelection&&t.getSelection();if(r&&r.rangeCount!==0){t=r.anchorNode;var l=r.anchorOffset,i=r.focusNode;r=r.focusOffset;try{t.nodeType,i.nodeType}catch{t=null;break e}var o=0,u=-1,s=-1,h=0,w=0,S=e,g=null;n:for(;;){for(var _;S!==t||l!==0&&S.nodeType!==3||(u=o+l),S!==i||r!==0&&S.nodeType!==3||(s=o+r),S.nodeType===3&&(o+=S.nodeValue.length),(_=S.firstChild)!==null;)g=S,S=_;for(;;){if(S===e)break n;if(g===t&&++h===l&&(u=o),g===i&&++w===r&&(s=o),(_=S.nextSibling)!==null)break;S=g,g=S.parentNode}S=_}t=u===-1||s===-1?null:{start:u,end:s}}else t=null}t=t||{start:0,end:0}}else t=null;for(yi={focusedElem:e,selectionRange:t},Ir=!1,P=n;P!==null;)if(n=P,e=n.child,(n.subtreeFlags&1028)!==0&&e!==null)e.return=n,P=e;else for(;P!==null;){n=P;try{var L=n.alternate;if((n.flags&1024)!==0)switch(n.tag){case 0:case 11:case 15:break;case 1:if(L!==null){var T=L.memoizedProps,fe=L.memoizedState,f=n.stateNode,a=f.getSnapshotBeforeUpdate(n.elementType===n.type?T:pn(n.type,T),fe);f.__reactInternalSnapshotBeforeUpdate=a}break;case 3:var d=n.stateNode.containerInfo;d.nodeType===1?d.textContent="":d.nodeType===9&&d.documentElement&&d.removeChild(d.documentElement);break;case 5:case 6:case 4:case 17:break;default:throw Error(m(163))}}catch(k){ae(n,n.return,k)}if(e=n.sibling,e!==null){e.return=n.return,P=e;break}P=n.return}return L=na,na=!1,L}function mr(e,n,t){var r=n.updateQueue;if(r=r!==null?r.lastEffect:null,r!==null){var l=r=r.next;do{if((l.tag&e)===e){var i=l.destroy;l.destroy=void 0,i!==void 0&&lo(n,t,i)}l=l.next}while(l!==r)}}function hl(e,n){if(n=n.updateQueue,n=n!==null?n.lastEffect:null,n!==null){var t=n=n.next;do{if((t.tag&e)===e){var r=t.create;t.destroy=r()}t=t.next}while(t!==n)}}function io(e){var n=e.ref;if(n!==null){var t=e.stateNode;switch(e.tag){case 5:e=t;break;default:e=t}typeof n=="function"?n(e):n.current=e}}function ta(e){var n=e.alternate;n!==null&&(e.alternate=null,ta(n)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(n=e.stateNode,n!==null&&(delete n[wn],delete n[lr],delete n[ki],delete n[Jc],delete n[qc])),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}function ra(e){return e.tag===5||e.tag===3||e.tag===4}function la(e){e:for(;;){for(;e.sibling===null;){if(e.return===null||ra(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.flags&2||e.child===null||e.tag===4)continue e;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function oo(e,n,t){var r=e.tag;if(r===5||r===6)e=e.stateNode,n?t.nodeType===8?t.parentNode.insertBefore(e,n):t.insertBefore(e,n):(t.nodeType===8?(n=t.parentNode,n.insertBefore(e,t)):(n=t,n.appendChild(e)),t=t._reactRootContainer,t!=null||n.onclick!==null||(n.onclick=Qr));else if(r!==4&&(e=e.child,e!==null))for(oo(e,n,t),e=e.sibling;e!==null;)oo(e,n,t),e=e.sibling}function uo(e,n,t){var r=e.tag;if(r===5||r===6)e=e.stateNode,n?t.insertBefore(e,n):t.appendChild(e);else if(r!==4&&(e=e.child,e!==null))for(uo(e,n,t),e=e.sibling;e!==null;)uo(e,n,t),e=e.sibling}var Ee=null,hn=!1;function Wn(e,n,t){for(t=t.child;t!==null;)ia(e,n,t),t=t.sibling}function ia(e,n,t){if(gn&&typeof gn.onCommitFiberUnmount=="function")try{gn.onCommitFiberUnmount(jr,t)}catch{}switch(t.tag){case 5:Re||zt(t,n);case 6:var r=Ee,l=hn;Ee=null,Wn(e,n,t),Ee=r,hn=l,Ee!==null&&(hn?(e=Ee,t=t.stateNode,e.nodeType===8?e.parentNode.removeChild(t):e.removeChild(t)):Ee.removeChild(t.stateNode));break;case 18:Ee!==null&&(hn?(e=Ee,t=t.stateNode,e.nodeType===8?Si(e.parentNode,t):e.nodeType===1&&Si(e,t),Yt(e)):Si(Ee,t.stateNode));break;case 4:r=Ee,l=hn,Ee=t.stateNode.containerInfo,hn=!0,Wn(e,n,t),Ee=r,hn=l;break;case 0:case 11:case 14:case 15:if(!Re&&(r=t.updateQueue,r!==null&&(r=r.lastEffect,r!==null))){l=r=r.next;do{var i=l,o=i.destroy;i=i.tag,o!==void 0&&((i&2)!==0||(i&4)!==0)&&lo(t,n,o),l=l.next}while(l!==r)}Wn(e,n,t);break;case 1:if(!Re&&(zt(t,n),r=t.stateNode,typeof r.componentWillUnmount=="function"))try{r.props=t.memoizedProps,r.state=t.memoizedState,r.componentWillUnmount()}catch(u){ae(t,n,u)}Wn(e,n,t);break;case 21:Wn(e,n,t);break;case 22:t.mode&1?(Re=(r=Re)||t.memoizedState!==null,Wn(e,n,t),Re=r):Wn(e,n,t);break;default:Wn(e,n,t)}}function oa(e){var n=e.updateQueue;if(n!==null){e.updateQueue=null;var t=e.stateNode;t===null&&(t=e.stateNode=new mf),n.forEach(function(r){var l=Nf.bind(null,e,r);t.has(r)||(t.add(r),r.then(l,l))})}}function mn(e,n){var t=n.deletions;if(t!==null)for(var r=0;r<t.length;r++){var l=t[r];try{var i=e,o=n,u=o;e:for(;u!==null;){switch(u.tag){case 5:Ee=u.stateNode,hn=!1;break e;case 3:Ee=u.stateNode.containerInfo,hn=!0;break e;case 4:Ee=u.stateNode.containerInfo,hn=!0;break e}u=u.return}if(Ee===null)throw Error(m(160));ia(i,o,l),Ee=null,hn=!1;var s=l.alternate;s!==null&&(s.return=null),l.return=null}catch(h){ae(l,n,h)}}if(n.subtreeFlags&12854)for(n=n.child;n!==null;)ua(n,e),n=n.sibling}function ua(e,n){var t=e.alternate,r=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:if(mn(n,e),xn(e),r&4){try{mr(3,e,e.return),hl(3,e)}catch(T){ae(e,e.return,T)}try{mr(5,e,e.return)}catch(T){ae(e,e.return,T)}}break;case 1:mn(n,e),xn(e),r&512&&t!==null&&zt(t,t.return);break;case 5:if(mn(n,e),xn(e),r&512&&t!==null&&zt(t,t.return),e.flags&32){var l=e.stateNode;try{Dt(l,"")}catch(T){ae(e,e.return,T)}}if(r&4&&(l=e.stateNode,l!=null)){var i=e.memoizedProps,o=t!==null?t.memoizedProps:i,u=e.type,s=e.updateQueue;if(e.updateQueue=null,s!==null)try{u==="input"&&i.type==="radio"&&i.name!=null&&Oo(l,i),Ul(u,o);var h=Ul(u,i);for(o=0;o<s.length;o+=2){var w=s[o],S=s[o+1];w==="style"?Ho(l,S):w==="dangerouslySetInnerHTML"?$o(l,S):w==="children"?Dt(l,S):_e(l,w,S,h)}switch(u){case"input":Il(l,i);break;case"textarea":Uo(l,i);break;case"select":var g=l._wrapperState.wasMultiple;l._wrapperState.wasMultiple=!!i.multiple;var _=i.value;_!=null?ct(l,!!i.multiple,_,!1):g!==!!i.multiple&&(i.defaultValue!=null?ct(l,!!i.multiple,i.defaultValue,!0):ct(l,!!i.multiple,i.multiple?[]:"",!1))}l[lr]=i}catch(T){ae(e,e.return,T)}}break;case 6:if(mn(n,e),xn(e),r&4){if(e.stateNode===null)throw Error(m(162));l=e.stateNode,i=e.memoizedProps;try{l.nodeValue=i}catch(T){ae(e,e.return,T)}}break;case 3:if(mn(n,e),xn(e),r&4&&t!==null&&t.memoizedState.isDehydrated)try{Yt(n.containerInfo)}catch(T){ae(e,e.return,T)}break;case 4:mn(n,e),xn(e);break;case 13:mn(n,e),xn(e),l=e.child,l.flags&8192&&(i=l.memoizedState!==null,l.stateNode.isHidden=i,!i||l.alternate!==null&&l.alternate.memoizedState!==null||(co=ce())),r&4&&oa(e);break;case 22:if(w=t!==null&&t.memoizedState!==null,e.mode&1?(Re=(h=Re)||w,mn(n,e),Re=h):mn(n,e),xn(e),r&8192){if(h=e.memoizedState!==null,(e.stateNode.isHidden=h)&&!w&&(e.mode&1)!==0)for(P=e,w=e.child;w!==null;){for(S=P=w;P!==null;){switch(g=P,_=g.child,g.tag){case 0:case 11:case 14:case 15:mr(4,g,g.return);break;case 1:zt(g,g.return);var L=g.stateNode;if(typeof L.componentWillUnmount=="function"){r=g,t=g.return;try{n=r,L.props=n.memoizedProps,L.state=n.memoizedState,L.componentWillUnmount()}catch(T){ae(r,t,T)}}break;case 5:zt(g,g.return);break;case 22:if(g.memoizedState!==null){ca(S);continue}}_!==null?(_.return=g,P=_):ca(S)}w=w.sibling}e:for(w=null,S=e;;){if(S.tag===5){if(w===null){w=S;try{l=S.stateNode,h?(i=l.style,typeof i.setProperty=="function"?i.setProperty("display","none","important"):i.display="none"):(u=S.stateNode,s=S.memoizedProps.style,o=s!=null&&s.hasOwnProperty("display")?s.display:null,u.style.display=Bo("display",o))}catch(T){ae(e,e.return,T)}}}else if(S.tag===6){if(w===null)try{S.stateNode.nodeValue=h?"":S.memoizedProps}catch(T){ae(e,e.return,T)}}else if((S.tag!==22&&S.tag!==23||S.memoizedState===null||S===e)&&S.child!==null){S.child.return=S,S=S.child;continue}if(S===e)break e;for(;S.sibling===null;){if(S.return===null||S.return===e)break e;w===S&&(w=null),S=S.return}w===S&&(w=null),S.sibling.return=S.return,S=S.sibling}}break;case 19:mn(n,e),xn(e),r&4&&oa(e);break;case 21:break;default:mn(n,e),xn(e)}}function xn(e){var n=e.flags;if(n&2){try{e:{for(var t=e.return;t!==null;){if(ra(t)){var r=t;break e}t=t.return}throw Error(m(160))}switch(r.tag){case 5:var l=r.stateNode;r.flags&32&&(Dt(l,""),r.flags&=-33);var i=la(e);uo(e,i,l);break;case 3:case 4:var o=r.stateNode.containerInfo,u=la(e);oo(e,u,o);break;default:throw Error(m(161))}}catch(s){ae(e,e.return,s)}e.flags&=-3}n&4096&&(e.flags&=-4097)}function yf(e,n,t){P=e,sa(e)}function sa(e,n,t){for(var r=(e.mode&1)!==0;P!==null;){var l=P,i=l.child;if(l.tag===22&&r){var o=l.memoizedState!==null||pl;if(!o){var u=l.alternate,s=u!==null&&u.memoizedState!==null||Re;u=pl;var h=Re;if(pl=o,(Re=s)&&!h)for(P=l;P!==null;)o=P,s=o.child,o.tag===22&&o.memoizedState!==null?fa(l):s!==null?(s.return=o,P=s):fa(l);for(;i!==null;)P=i,sa(i),i=i.sibling;P=l,pl=u,Re=h}aa(e)}else(l.subtreeFlags&8772)!==0&&i!==null?(i.return=l,P=i):aa(e)}}function aa(e){for(;P!==null;){var n=P;if((n.flags&8772)!==0){var t=n.alternate;try{if((n.flags&8772)!==0)switch(n.tag){case 0:case 11:case 15:Re||hl(5,n);break;case 1:var r=n.stateNode;if(n.flags&4&&!Re)if(t===null)r.componentDidMount();else{var l=n.elementType===n.type?t.memoizedProps:pn(n.type,t.memoizedProps);r.componentDidUpdate(l,t.memoizedState,r.__reactInternalSnapshotBeforeUpdate)}var i=n.updateQueue;i!==null&&cs(n,i,r);break;case 3:var o=n.updateQueue;if(o!==null){if(t=null,n.child!==null)switch(n.child.tag){case 5:t=n.child.stateNode;break;case 1:t=n.child.stateNode}cs(n,o,t)}break;case 5:var u=n.stateNode;if(t===null&&n.flags&4){t=u;var s=n.memoizedProps;switch(n.type){case"button":case"input":case"select":case"textarea":s.autoFocus&&t.focus();break;case"img":s.src&&(t.src=s.src)}}break;case 6:break;case 4:break;case 12:break;case 13:if(n.memoizedState===null){var h=n.alternate;if(h!==null){var w=h.memoizedState;if(w!==null){var S=w.dehydrated;S!==null&&Yt(S)}}}break;case 19:case 17:case 21:case 22:case 23:case 25:break;default:throw Error(m(163))}Re||n.flags&512&&io(n)}catch(g){ae(n,n.return,g)}}if(n===e){P=null;break}if(t=n.sibling,t!==null){t.return=n.return,P=t;break}P=n.return}}function ca(e){for(;P!==null;){var n=P;if(n===e){P=null;break}var t=n.sibling;if(t!==null){t.return=n.return,P=t;break}P=n.return}}function fa(e){for(;P!==null;){var n=P;try{switch(n.tag){case 0:case 11:case 15:var t=n.return;try{hl(4,n)}catch(s){ae(n,t,s)}break;case 1:var r=n.stateNode;if(typeof r.componentDidMount=="function"){var l=n.return;try{r.componentDidMount()}catch(s){ae(n,l,s)}}var i=n.return;try{io(n)}catch(s){ae(n,i,s)}break;case 5:var o=n.return;try{io(n)}catch(s){ae(n,o,s)}}}catch(s){ae(n,n.return,s)}if(n===e){P=null;break}var u=n.sibling;if(u!==null){u.return=n.return,P=u;break}P=n.return}}var gf=Math.ceil,ml=me.ReactCurrentDispatcher,so=me.ReactCurrentOwner,un=me.ReactCurrentBatchConfig,K=0,we=null,de=null,Ce=0,be=0,Rt=An(0),he=0,vr=null,it=0,vl=0,ao=0,yr=null,We=null,co=0,It=1/0,Tn=null,yl=!1,fo=null,Qn=null,gl=!1,Kn=null,wl=0,gr=0,po=null,Sl=-1,kl=0;function Ue(){return(K&6)!==0?ce():Sl!==-1?Sl:Sl=ce()}function Yn(e){return(e.mode&1)===0?1:(K&2)!==0&&Ce!==0?Ce&-Ce:ef.transition!==null?(kl===0&&(kl=lu()),kl):(e=Z,e!==0||(e=window.event,e=e===void 0?16:pu(e.type)),e)}function vn(e,n,t,r){if(50<gr)throw gr=0,po=null,Error(m(185));Bt(e,t,r),((K&2)===0||e!==we)&&(e===we&&((K&2)===0&&(vl|=t),he===4&&Gn(e,Ce)),Qe(e,r),t===1&&K===0&&(n.mode&1)===0&&(It=ce()+500,Xr&&$n()))}function Qe(e,n){var t=e.callbackNode;ec(e,n);var r=Tr(e,e===we?Ce:0);if(r===0)t!==null&&nu(t),e.callbackNode=null,e.callbackPriority=0;else if(n=r&-r,e.callbackPriority!==n){if(t!=null&&nu(t),n===1)e.tag===0?bc(pa.bind(null,e)):qu(pa.bind(null,e)),Xc(function(){(K&6)===0&&$n()}),t=null;else{switch(iu(r)){case 1:t=Ql;break;case 4:t=tu;break;case 16:t=_r;break;case 536870912:t=ru;break;default:t=_r}t=ka(t,da.bind(null,e))}e.callbackPriority=n,e.callbackNode=t}}function da(e,n){if(Sl=-1,kl=0,(K&6)!==0)throw Error(m(327));var t=e.callbackNode;if(Mt()&&e.callbackNode!==t)return null;var r=Tr(e,e===we?Ce:0);if(r===0)return null;if((r&30)!==0||(r&e.expiredLanes)!==0||n)n=xl(e,r);else{n=r;var l=K;K|=2;var i=ma();(we!==e||Ce!==n)&&(Tn=null,It=ce()+500,ut(e,n));do try{kf();break}catch(u){ha(e,u)}while(!0);Ti(),ml.current=i,K=l,de!==null?n=0:(we=null,Ce=0,n=he)}if(n!==0){if(n===2&&(l=Kl(e),l!==0&&(r=l,n=ho(e,l))),n===1)throw t=vr,ut(e,0),Gn(e,r),Qe(e,ce()),t;if(n===6)Gn(e,r);else{if(l=e.current.alternate,(r&30)===0&&!wf(l)&&(n=xl(e,r),n===2&&(i=Kl(e),i!==0&&(r=i,n=ho(e,i))),n===1))throw t=vr,ut(e,0),Gn(e,r),Qe(e,ce()),t;switch(e.finishedWork=l,e.finishedLanes=r,n){case 0:case 1:throw Error(m(345));case 2:st(e,We,Tn);break;case 3:if(Gn(e,r),(r&130023424)===r&&(n=co+500-ce(),10<n)){if(Tr(e,0)!==0)break;if(l=e.suspendedLanes,(l&r)!==r){Ue(),e.pingedLanes|=e.suspendedLanes&l;break}e.timeoutHandle=wi(st.bind(null,e,We,Tn),n);break}st(e,We,Tn);break;case 4:if(Gn(e,r),(r&4194240)===r)break;for(n=e.eventTimes,l=-1;0<r;){var o=31-cn(r);i=1<<o,o=n[o],o>l&&(l=o),r&=~i}if(r=l,r=ce()-r,r=(120>r?120:480>r?480:1080>r?1080:1920>r?1920:3e3>r?3e3:4320>r?4320:1960*gf(r/1960))-r,10<r){e.timeoutHandle=wi(st.bind(null,e,We,Tn),r);break}st(e,We,Tn);break;case 5:st(e,We,Tn);break;default:throw Error(m(329))}}}return Qe(e,ce()),e.callbackNode===t?da.bind(null,e):null}function ho(e,n){var t=yr;return e.current.memoizedState.isDehydrated&&(ut(e,n).flags|=256),e=xl(e,n),e!==2&&(n=We,We=t,n!==null&&mo(n)),e}function mo(e){We===null?We=e:We.push.apply(We,e)}function wf(e){for(var n=e;;){if(n.flags&16384){var t=n.updateQueue;if(t!==null&&(t=t.stores,t!==null))for(var r=0;r<t.length;r++){var l=t[r],i=l.getSnapshot;l=l.value;try{if(!fn(i(),l))return!1}catch{return!1}}}if(t=n.child,n.subtreeFlags&16384&&t!==null)t.return=n,n=t;else{if(n===e)break;for(;n.sibling===null;){if(n.return===null||n.return===e)return!0;n=n.return}n.sibling.return=n.return,n=n.sibling}}return!0}function Gn(e,n){for(n&=~ao,n&=~vl,e.suspendedLanes|=n,e.pingedLanes&=~n,e=e.expirationTimes;0<n;){var t=31-cn(n),r=1<<t;e[t]=-1,n&=~r}}function pa(e){if((K&6)!==0)throw Error(m(327));Mt();var n=Tr(e,0);if((n&1)===0)return Qe(e,ce()),null;var t=xl(e,n);if(e.tag!==0&&t===2){var r=Kl(e);r!==0&&(n=r,t=ho(e,r))}if(t===1)throw t=vr,ut(e,0),Gn(e,n),Qe(e,ce()),t;if(t===6)throw Error(m(345));return e.finishedWork=e.current.alternate,e.finishedLanes=n,st(e,We,Tn),Qe(e,ce()),null}function vo(e,n){var t=K;K|=1;try{return e(n)}finally{K=t,K===0&&(It=ce()+500,Xr&&$n())}}function ot(e){Kn!==null&&Kn.tag===0&&(K&6)===0&&Mt();var n=K;K|=1;var t=un.transition,r=Z;try{if(un.transition=null,Z=1,e)return e()}finally{Z=r,un.transition=t,K=n,(K&6)===0&&$n()}}function yo(){be=Rt.current,re(Rt)}function ut(e,n){e.finishedWork=null,e.finishedLanes=0;var t=e.timeoutHandle;if(t!==-1&&(e.timeoutHandle=-1,Gc(t)),de!==null)for(t=de.return;t!==null;){var r=t;switch(Ni(r),r.tag){case 1:r=r.type.childContextTypes,r!=null&&Yr();break;case 3:Lt(),re($e),re(Le),Ui();break;case 5:Di(r);break;case 4:Lt();break;case 13:re(oe);break;case 19:re(oe);break;case 10:zi(r.type._context);break;case 22:case 23:yo()}t=t.return}if(we=e,de=e=Xn(e.current,null),Ce=be=n,he=0,vr=null,ao=vl=it=0,We=yr=null,tt!==null){for(n=0;n<tt.length;n++)if(t=tt[n],r=t.interleaved,r!==null){t.interleaved=null;var l=r.next,i=t.pending;if(i!==null){var o=i.next;i.next=l,r.next=o}t.pending=r}tt=null}return e}function ha(e,n){do{var t=de;try{if(Ti(),il.current=al,ol){for(var r=ue.memoizedState;r!==null;){var l=r.queue;l!==null&&(l.pending=null),r=r.next}ol=!1}if(lt=0,ge=pe=ue=null,cr=!1,fr=0,so.current=null,t===null||t.return===null){he=1,vr=n,de=null;break}e:{var i=e,o=t.return,u=t,s=n;if(n=Ce,u.flags|=32768,s!==null&&typeof s=="object"&&typeof s.then=="function"){var h=s,w=u,S=w.tag;if((w.mode&1)===0&&(S===0||S===11||S===15)){var g=w.alternate;g?(w.updateQueue=g.updateQueue,w.memoizedState=g.memoizedState,w.lanes=g.lanes):(w.updateQueue=null,w.memoizedState=null)}var _=As(o);if(_!==null){_.flags&=-257,Vs(_,o,u,i,n),_.mode&1&&Us(i,h,n),n=_,s=h;var L=n.updateQueue;if(L===null){var T=new Set;T.add(s),n.updateQueue=T}else L.add(s);break e}else{if((n&1)===0){Us(i,h,n),go();break e}s=Error(m(426))}}else if(ie&&u.mode&1){var fe=As(o);if(fe!==null){(fe.flags&65536)===0&&(fe.flags|=256),Vs(fe,o,u,i,n),Pi(Tt(s,u));break e}}i=s=Tt(s,u),he!==4&&(he=2),yr===null?yr=[i]:yr.push(i),i=o;do{switch(i.tag){case 3:i.flags|=65536,n&=-n,i.lanes|=n;var f=Ds(i,s,n);as(i,f);break e;case 1:u=s;var a=i.type,d=i.stateNode;if((i.flags&128)===0&&(typeof a.getDerivedStateFromError=="function"||d!==null&&typeof d.componentDidCatch=="function"&&(Qn===null||!Qn.has(d)))){i.flags|=65536,n&=-n,i.lanes|=n;var k=Fs(i,u,n);as(i,k);break e}}i=i.return}while(i!==null)}ya(t)}catch(z){n=z,de===t&&t!==null&&(de=t=t.return);continue}break}while(!0)}function ma(){var e=ml.current;return ml.current=al,e===null?al:e}function go(){(he===0||he===3||he===2)&&(he=4),we===null||(it&268435455)===0&&(vl&268435455)===0||Gn(we,Ce)}function xl(e,n){var t=K;K|=2;var r=ma();(we!==e||Ce!==n)&&(Tn=null,ut(e,n));do try{Sf();break}catch(l){ha(e,l)}while(!0);if(Ti(),K=t,ml.current=r,de!==null)throw Error(m(261));return we=null,Ce=0,he}function Sf(){for(;de!==null;)va(de)}function kf(){for(;de!==null&&!Qa();)va(de)}function va(e){var n=Sa(e.alternate,e,be);e.memoizedProps=e.pendingProps,n===null?ya(e):de=n,so.current=null}function ya(e){var n=e;do{var t=n.alternate;if(e=n.return,(n.flags&32768)===0){if(t=pf(t,n,be),t!==null){de=t;return}}else{if(t=hf(t,n),t!==null){t.flags&=32767,de=t;return}if(e!==null)e.flags|=32768,e.subtreeFlags=0,e.deletions=null;else{he=6,de=null;return}}if(n=n.sibling,n!==null){de=n;return}de=n=e}while(n!==null);he===0&&(he=5)}function st(e,n,t){var r=Z,l=un.transition;try{un.transition=null,Z=1,xf(e,n,t,r)}finally{un.transition=l,Z=r}return null}function xf(e,n,t,r){do Mt();while(Kn!==null);if((K&6)!==0)throw Error(m(327));t=e.finishedWork;var l=e.finishedLanes;if(t===null)return null;if(e.finishedWork=null,e.finishedLanes=0,t===e.current)throw Error(m(177));e.callbackNode=null,e.callbackPriority=0;var i=t.lanes|t.childLanes;if(nc(e,i),e===we&&(de=we=null,Ce=0),(t.subtreeFlags&2064)===0&&(t.flags&2064)===0||gl||(gl=!0,ka(_r,function(){return Mt(),null})),i=(t.flags&15990)!==0,(t.subtreeFlags&15990)!==0||i){i=un.transition,un.transition=null;var o=Z;Z=1;var u=K;K|=4,so.current=null,vf(e,t),ua(t,e),$c(yi),Ir=!!vi,yi=vi=null,e.current=t,yf(t),Ka(),K=u,Z=o,un.transition=i}else e.current=t;if(gl&&(gl=!1,Kn=e,wl=l),i=e.pendingLanes,i===0&&(Qn=null),Xa(t.stateNode),Qe(e,ce()),n!==null)for(r=e.onRecoverableError,t=0;t<n.length;t++)l=n[t],r(l.value,{componentStack:l.stack,digest:l.digest});if(yl)throw yl=!1,e=fo,fo=null,e;return(wl&1)!==0&&e.tag!==0&&Mt(),i=e.pendingLanes,(i&1)!==0?e===po?gr++:(gr=0,po=e):gr=0,$n(),null}function Mt(){if(Kn!==null){var e=iu(wl),n=un.transition,t=Z;try{if(un.transition=null,Z=16>e?16:e,Kn===null)var r=!1;else{if(e=Kn,Kn=null,wl=0,(K&6)!==0)throw Error(m(331));var l=K;for(K|=4,P=e.current;P!==null;){var i=P,o=i.child;if((P.flags&16)!==0){var u=i.deletions;if(u!==null){for(var s=0;s<u.length;s++){var h=u[s];for(P=h;P!==null;){var w=P;switch(w.tag){case 0:case 11:case 15:mr(8,w,i)}var S=w.child;if(S!==null)S.return=w,P=S;else for(;P!==null;){w=P;var g=w.sibling,_=w.return;if(ta(w),w===h){P=null;break}if(g!==null){g.return=_,P=g;break}P=_}}}var L=i.alternate;if(L!==null){var T=L.child;if(T!==null){L.child=null;do{var fe=T.sibling;T.sibling=null,T=fe}while(T!==null)}}P=i}}if((i.subtreeFlags&2064)!==0&&o!==null)o.return=i,P=o;else e:for(;P!==null;){if(i=P,(i.flags&2048)!==0)switch(i.tag){case 0:case 11:case 15:mr(9,i,i.return)}var f=i.sibling;if(f!==null){f.return=i.return,P=f;break e}P=i.return}}var a=e.current;for(P=a;P!==null;){o=P;var d=o.child;if((o.subtreeFlags&2064)!==0&&d!==null)d.return=o,P=d;else e:for(o=a;P!==null;){if(u=P,(u.flags&2048)!==0)try{switch(u.tag){case 0:case 11:case 15:hl(9,u)}}catch(z){ae(u,u.return,z)}if(u===o){P=null;break e}var k=u.sibling;if(k!==null){k.return=u.return,P=k;break e}P=u.return}}if(K=l,$n(),gn&&typeof gn.onPostCommitFiberRoot=="function")try{gn.onPostCommitFiberRoot(jr,e)}catch{}r=!0}return r}finally{Z=t,un.transition=n}}return!1}function ga(e,n,t){n=Tt(t,n),n=Ds(e,n,1),e=Hn(e,n,1),n=Ue(),e!==null&&(Bt(e,1,n),Qe(e,n))}function ae(e,n,t){if(e.tag===3)ga(e,e,t);else for(;n!==null;){if(n.tag===3){ga(n,e,t);break}else if(n.tag===1){var r=n.stateNode;if(typeof n.type.getDerivedStateFromError=="function"||typeof r.componentDidCatch=="function"&&(Qn===null||!Qn.has(r))){e=Tt(t,e),e=Fs(n,e,1),n=Hn(n,e,1),e=Ue(),n!==null&&(Bt(n,1,e),Qe(n,e));break}}n=n.return}}function Ef(e,n,t){var r=e.pingCache;r!==null&&r.delete(n),n=Ue(),e.pingedLanes|=e.suspendedLanes&t,we===e&&(Ce&t)===t&&(he===4||he===3&&(Ce&130023424)===Ce&&500>ce()-co?ut(e,0):ao|=t),Qe(e,n)}function wa(e,n){n===0&&((e.mode&1)===0?n=1:(n=Lr,Lr<<=1,(Lr&130023424)===0&&(Lr=4194304)));var t=Ue();e=jn(e,n),e!==null&&(Bt(e,n,t),Qe(e,t))}function Cf(e){var n=e.memoizedState,t=0;n!==null&&(t=n.retryLane),wa(e,t)}function Nf(e,n){var t=0;switch(e.tag){case 13:var r=e.stateNode,l=e.memoizedState;l!==null&&(t=l.retryLane);break;case 19:r=e.stateNode;break;default:throw Error(m(314))}r!==null&&r.delete(n),wa(e,t)}var Sa;Sa=function(e,n,t){if(e!==null)if(e.memoizedProps!==n.pendingProps||$e.current)He=!0;else{if((e.lanes&t)===0&&(n.flags&128)===0)return He=!1,df(e,n,t);He=(e.flags&131072)!==0}else He=!1,ie&&(n.flags&1048576)!==0&&bu(n,Jr,n.index);switch(n.lanes=0,n.tag){case 2:var r=n.type;dl(e,n),e=n.pendingProps;var l=xt(n,Le.current);Pt(n,t),l=$i(null,n,r,e,l,t);var i=Bi();return n.flags|=1,typeof l=="object"&&l!==null&&typeof l.render=="function"&&l.$$typeof===void 0?(n.tag=1,n.memoizedState=null,n.updateQueue=null,Be(r)?(i=!0,Gr(n)):i=!1,n.memoizedState=l.state!==null&&l.state!==void 0?l.state:null,Mi(n),l.updater=cl,n.stateNode=l,l._reactInternals=n,Gi(n,r,e,t),n=qi(null,n,r,!0,i,t)):(n.tag=0,ie&&i&&Ci(n),Fe(null,n,l,t),n=n.child),n;case 16:r=n.elementType;e:{switch(dl(e,n),e=n.pendingProps,l=r._init,r=l(r._payload),n.type=r,l=n.tag=jf(r),e=pn(r,e),l){case 0:n=Ji(null,n,r,e,t);break e;case 1:n=Ks(null,n,r,e,t);break e;case 11:n=$s(null,n,r,e,t);break e;case 14:n=Bs(null,n,r,pn(r.type,e),t);break e}throw Error(m(306,r,""))}return n;case 0:return r=n.type,l=n.pendingProps,l=n.elementType===r?l:pn(r,l),Ji(e,n,r,l,t);case 1:return r=n.type,l=n.pendingProps,l=n.elementType===r?l:pn(r,l),Ks(e,n,r,l,t);case 3:e:{if(Ys(n),e===null)throw Error(m(387));r=n.pendingProps,i=n.memoizedState,l=i.element,ss(e,n),rl(n,r,null,t);var o=n.memoizedState;if(r=o.element,i.isDehydrated)if(i={element:r,isDehydrated:!1,cache:o.cache,pendingSuspenseBoundaries:o.pendingSuspenseBoundaries,transitions:o.transitions},n.updateQueue.baseState=i,n.memoizedState=i,n.flags&256){l=Tt(Error(m(423)),n),n=Gs(e,n,r,t,l);break e}else if(r!==l){l=Tt(Error(m(424)),n),n=Gs(e,n,r,t,l);break e}else for(qe=Un(n.stateNode.containerInfo.firstChild),Je=n,ie=!0,dn=null,t=os(n,null,r,t),n.child=t;t;)t.flags=t.flags&-3|4096,t=t.sibling;else{if(Nt(),r===l){n=Ln(e,n,t);break e}Fe(e,n,r,t)}n=n.child}return n;case 5:return fs(n),e===null&&ji(n),r=n.type,l=n.pendingProps,i=e!==null?e.memoizedProps:null,o=l.children,gi(r,l)?o=null:i!==null&&gi(r,i)&&(n.flags|=32),Qs(e,n),Fe(e,n,o,t),n.child;case 6:return e===null&&ji(n),null;case 13:return Xs(e,n,t);case 4:return Oi(n,n.stateNode.containerInfo),r=n.pendingProps,e===null?n.child=_t(n,null,r,t):Fe(e,n,r,t),n.child;case 11:return r=n.type,l=n.pendingProps,l=n.elementType===r?l:pn(r,l),$s(e,n,r,l,t);case 7:return Fe(e,n,n.pendingProps,t),n.child;case 8:return Fe(e,n,n.pendingProps.children,t),n.child;case 12:return Fe(e,n,n.pendingProps.children,t),n.child;case 10:e:{if(r=n.type._context,l=n.pendingProps,i=n.memoizedProps,o=l.value,ne(el,r._currentValue),r._currentValue=o,i!==null)if(fn(i.value,o)){if(i.children===l.children&&!$e.current){n=Ln(e,n,t);break e}}else for(i=n.child,i!==null&&(i.return=n);i!==null;){var u=i.dependencies;if(u!==null){o=i.child;for(var s=u.firstContext;s!==null;){if(s.context===r){if(i.tag===1){s=Pn(-1,t&-t),s.tag=2;var h=i.updateQueue;if(h!==null){h=h.shared;var w=h.pending;w===null?s.next=s:(s.next=w.next,w.next=s),h.pending=s}}i.lanes|=t,s=i.alternate,s!==null&&(s.lanes|=t),Ri(i.return,t,n),u.lanes|=t;break}s=s.next}}else if(i.tag===10)o=i.type===n.type?null:i.child;else if(i.tag===18){if(o=i.return,o===null)throw Error(m(341));o.lanes|=t,u=o.alternate,u!==null&&(u.lanes|=t),Ri(o,t,n),o=i.sibling}else o=i.child;if(o!==null)o.return=i;else for(o=i;o!==null;){if(o===n){o=null;break}if(i=o.sibling,i!==null){i.return=o.return,o=i;break}o=o.return}i=o}Fe(e,n,l.children,t),n=n.child}return n;case 9:return l=n.type,r=n.pendingProps.children,Pt(n,t),l=ln(l),r=r(l),n.flags|=1,Fe(e,n,r,t),n.child;case 14:return r=n.type,l=pn(r,n.pendingProps),l=pn(r.type,l),Bs(e,n,r,l,t);case 15:return Hs(e,n,n.type,n.pendingProps,t);case 17:return r=n.type,l=n.pendingProps,l=n.elementType===r?l:pn(r,l),dl(e,n),n.tag=1,Be(r)?(e=!0,Gr(n)):e=!1,Pt(n,t),Ms(n,r,l),Gi(n,r,l,t),qi(null,n,r,!0,e,t);case 19:return Js(e,n,t);case 22:return Ws(e,n,t)}throw Error(m(156,n.tag))};function ka(e,n){return eu(e,n)}function _f(e,n,t,r){this.tag=e,this.key=t,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.ref=null,this.pendingProps=n,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function sn(e,n,t,r){return new _f(e,n,t,r)}function wo(e){return e=e.prototype,!(!e||!e.isReactComponent)}function jf(e){if(typeof e=="function")return wo(e)?1:0;if(e!=null){if(e=e.$$typeof,e===nn)return 11;if(e===Xe)return 14}return 2}function Xn(e,n){var t=e.alternate;return t===null?(t=sn(e.tag,n,e.key,e.mode),t.elementType=e.elementType,t.type=e.type,t.stateNode=e.stateNode,t.alternate=e,e.alternate=t):(t.pendingProps=n,t.type=e.type,t.flags=0,t.subtreeFlags=0,t.deletions=null),t.flags=e.flags&14680064,t.childLanes=e.childLanes,t.lanes=e.lanes,t.child=e.child,t.memoizedProps=e.memoizedProps,t.memoizedState=e.memoizedState,t.updateQueue=e.updateQueue,n=e.dependencies,t.dependencies=n===null?null:{lanes:n.lanes,firstContext:n.firstContext},t.sibling=e.sibling,t.index=e.index,t.ref=e.ref,t}function El(e,n,t,r,l,i){var o=2;if(r=e,typeof e=="function")wo(e)&&(o=1);else if(typeof e=="string")o=5;else e:switch(e){case ye:return at(t.children,l,i,n);case Me:o=8,l|=8;break;case an:return e=sn(12,t,n,l|2),e.elementType=an,e.lanes=i,e;case Oe:return e=sn(13,t,n,l),e.elementType=Oe,e.lanes=i,e;case Ge:return e=sn(19,t,n,l),e.elementType=Ge,e.lanes=i,e;case le:return Cl(t,l,i,n);default:if(typeof e=="object"&&e!==null)switch(e.$$typeof){case Ye:o=10;break e;case je:o=9;break e;case nn:o=11;break e;case Xe:o=14;break e;case Pe:o=16,r=null;break e}throw Error(m(130,e==null?e:typeof e,""))}return n=sn(o,t,n,l),n.elementType=e,n.type=r,n.lanes=i,n}function at(e,n,t,r){return e=sn(7,e,r,n),e.lanes=t,e}function Cl(e,n,t,r){return e=sn(22,e,r,n),e.elementType=le,e.lanes=t,e.stateNode={isHidden:!1},e}function So(e,n,t){return e=sn(6,e,null,n),e.lanes=t,e}function ko(e,n,t){return n=sn(4,e.children!==null?e.children:[],e.key,n),n.lanes=t,n.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},n}function Pf(e,n,t,r,l){this.tag=n,this.containerInfo=e,this.finishedWork=this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.pendingContext=this.context=null,this.callbackPriority=0,this.eventTimes=Yl(0),this.expirationTimes=Yl(-1),this.entangledLanes=this.finishedLanes=this.mutableReadLanes=this.expiredLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=Yl(0),this.identifierPrefix=r,this.onRecoverableError=l,this.mutableSourceEagerHydrationData=null}function xo(e,n,t,r,l,i,o,u,s){return e=new Pf(e,n,t,u,s),n===1?(n=1,i===!0&&(n|=8)):n=0,i=sn(3,null,null,n),e.current=i,i.stateNode=e,i.memoizedState={element:r,isDehydrated:t,cache:null,transitions:null,pendingSuspenseBoundaries:null},Mi(i),e}function Lf(e,n,t){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:ve,key:r==null?null:""+r,children:e,containerInfo:n,implementation:t}}function xa(e){if(!e)return Vn;e=e._reactInternals;e:{if(Jn(e)!==e||e.tag!==1)throw Error(m(170));var n=e;do{switch(n.tag){case 3:n=n.stateNode.context;break e;case 1:if(Be(n.type)){n=n.stateNode.__reactInternalMemoizedMergedChildContext;break e}}n=n.return}while(n!==null);throw Error(m(171))}if(e.tag===1){var t=e.type;if(Be(t))return Zu(e,t,n)}return n}function Ea(e,n,t,r,l,i,o,u,s){return e=xo(t,r,!0,e,l,i,o,u,s),e.context=xa(null),t=e.current,r=Ue(),l=Yn(t),i=Pn(r,l),i.callback=n??null,Hn(t,i,l),e.current.lanes=l,Bt(e,l,r),Qe(e,r),e}function Nl(e,n,t,r){var l=n.current,i=Ue(),o=Yn(l);return t=xa(t),n.context===null?n.context=t:n.pendingContext=t,n=Pn(i,o),n.payload={element:e},r=r===void 0?null:r,r!==null&&(n.callback=r),e=Hn(l,n,o),e!==null&&(vn(e,l,o,i),tl(e,l,o)),o}function _l(e){if(e=e.current,!e.child)return null;switch(e.child.tag){case 5:return e.child.stateNode;default:return e.child.stateNode}}function Ca(e,n){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var t=e.retryLane;e.retryLane=t!==0&&t<n?t:n}}function Eo(e,n){Ca(e,n),(e=e.alternate)&&Ca(e,n)}function Tf(){return null}var Na=typeof reportError=="function"?reportError:function(e){console.error(e)};function Co(e){this._internalRoot=e}jl.prototype.render=Co.prototype.render=function(e){var n=this._internalRoot;if(n===null)throw Error(m(409));Nl(e,n,null,null)},jl.prototype.unmount=Co.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var n=e.containerInfo;ot(function(){Nl(null,e,null,null)}),n[En]=null}};function jl(e){this._internalRoot=e}jl.prototype.unstable_scheduleHydration=function(e){if(e){var n=su();e={blockedOn:null,target:e,priority:n};for(var t=0;t<On.length&&n!==0&&n<On[t].priority;t++);On.splice(t,0,e),t===0&&fu(e)}};function No(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function Pl(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11&&(e.nodeType!==8||e.nodeValue!==" react-mount-point-unstable "))}function _a(){}function zf(e,n,t,r,l){if(l){if(typeof r=="function"){var i=r;r=function(){var h=_l(o);i.call(h)}}var o=Ea(n,r,e,0,null,!1,!1,"",_a);return e._reactRootContainer=o,e[En]=o.current,tr(e.nodeType===8?e.parentNode:e),ot(),o}for(;l=e.lastChild;)e.removeChild(l);if(typeof r=="function"){var u=r;r=function(){var h=_l(s);u.call(h)}}var s=xo(e,0,!1,null,null,!1,!1,"",_a);return e._reactRootContainer=s,e[En]=s.current,tr(e.nodeType===8?e.parentNode:e),ot(function(){Nl(n,s,t,r)}),s}function Ll(e,n,t,r,l){var i=t._reactRootContainer;if(i){var o=i;if(typeof l=="function"){var u=l;l=function(){var s=_l(o);u.call(s)}}Nl(n,o,e,l)}else o=zf(t,n,e,l,r);return _l(o)}ou=function(e){switch(e.tag){case 3:var n=e.stateNode;if(n.current.memoizedState.isDehydrated){var t=$t(n.pendingLanes);t!==0&&(Gl(n,t|1),Qe(n,ce()),(K&6)===0&&(It=ce()+500,$n()))}break;case 13:ot(function(){var r=jn(e,1);if(r!==null){var l=Ue();vn(r,e,1,l)}}),Eo(e,1)}},Xl=function(e){if(e.tag===13){var n=jn(e,134217728);if(n!==null){var t=Ue();vn(n,e,134217728,t)}Eo(e,134217728)}},uu=function(e){if(e.tag===13){var n=Yn(e),t=jn(e,n);if(t!==null){var r=Ue();vn(t,e,n,r)}Eo(e,n)}},su=function(){return Z},au=function(e,n){var t=Z;try{return Z=e,n()}finally{Z=t}},$l=function(e,n,t){switch(n){case"input":if(Il(e,t),n=t.name,t.type==="radio"&&n!=null){for(t=e;t.parentNode;)t=t.parentNode;for(t=t.querySelectorAll("input[name="+JSON.stringify(""+n)+\'][type="radio"]\'),n=0;n<t.length;n++){var r=t[n];if(r!==e&&r.form===e.form){var l=Kr(r);if(!l)throw Error(m(90));Io(r),Il(r,l)}}}break;case"textarea":Uo(e,t);break;case"select":n=t.value,n!=null&&ct(e,!!t.multiple,n,!1)}},Yo=vo,Go=ot;var Rf={usingClientEntryPoint:!1,Events:[ir,St,Kr,Qo,Ko,vo]},wr={findFiberByHostInstance:qn,bundleType:0,version:"18.3.1",rendererPackageName:"react-dom"},If={bundleType:wr.bundleType,version:wr.version,rendererPackageName:wr.rendererPackageName,rendererConfig:wr.rendererConfig,overrideHookState:null,overrideHookStateDeletePath:null,overrideHookStateRenamePath:null,overrideProps:null,overridePropsDeletePath:null,overridePropsRenamePath:null,setErrorHandler:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:me.ReactCurrentDispatcher,findHostInstanceByFiber:function(e){return e=qo(e),e===null?null:e.stateNode},findFiberByHostInstance:wr.findFiberByHostInstance||Tf,findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null,reconcilerVersion:"18.3.1-next-f1338f8080-20240426"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"){var Tl=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!Tl.isDisabled&&Tl.supportsFiber)try{jr=Tl.inject(If),gn=Tl}catch{}}return Ke.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Rf,Ke.createPortal=function(e,n){var t=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!No(n))throw Error(m(200));return Lf(e,n,null,t)},Ke.createRoot=function(e,n){if(!No(e))throw Error(m(299));var t=!1,r="",l=Na;return n!=null&&(n.unstable_strictMode===!0&&(t=!0),n.identifierPrefix!==void 0&&(r=n.identifierPrefix),n.onRecoverableError!==void 0&&(l=n.onRecoverableError)),n=xo(e,1,!1,null,null,t,!1,r,l),e[En]=n.current,tr(e.nodeType===8?e.parentNode:e),new Co(n)},Ke.findDOMNode=function(e){if(e==null)return null;if(e.nodeType===1)return e;var n=e._reactInternals;if(n===void 0)throw typeof e.render=="function"?Error(m(188)):(e=Object.keys(e).join(","),Error(m(268,e)));return e=qo(n),e=e===null?null:e.stateNode,e},Ke.flushSync=function(e){return ot(e)},Ke.hydrate=function(e,n,t){if(!Pl(n))throw Error(m(200));return Ll(null,e,n,!0,t)},Ke.hydrateRoot=function(e,n,t){if(!No(e))throw Error(m(405));var r=t!=null&&t.hydratedSources||null,l=!1,i="",o=Na;if(t!=null&&(t.unstable_strictMode===!0&&(l=!0),t.identifierPrefix!==void 0&&(i=t.identifierPrefix),t.onRecoverableError!==void 0&&(o=t.onRecoverableError)),n=Ea(n,null,e,1,t??null,l,!1,i,o),e[En]=n.current,tr(e),r)for(e=0;e<r.length;e++)t=r[e],l=t._getVersion,l=l(t._source),n.mutableSourceEagerHydrationData==null?n.mutableSourceEagerHydrationData=[t,l]:n.mutableSourceEagerHydrationData.push(t,l);return new jl(n)},Ke.render=function(e,n,t){if(!Pl(n))throw Error(m(200));return Ll(null,e,n,!1,t)},Ke.unmountComponentAtNode=function(e){if(!Pl(e))throw Error(m(40));return e._reactRootContainer?(ot(function(){Ll(null,null,e,!1,function(){e._reactRootContainer=null,e[En]=null})}),!0):!1},Ke.unstable_batchedUpdates=vo,Ke.unstable_renderSubtreeIntoContainer=function(e,n,t,r){if(!Pl(t))throw Error(m(200));if(e==null||e._reactInternals===void 0)throw Error(m(38));return Ll(e,n,t,!1,r)},Ke.version="18.3.1-next-f1338f8080-20240426",Ke}var Ma;function Hf(){if(Ma)return Po.exports;Ma=1;function v(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(v)}catch(N){console.error(N)}}return v(),Po.exports=Bf(),Po.exports}var Oa;function Wf(){if(Oa)return zl;Oa=1;var v=Hf();return zl.createRoot=v.createRoot,zl.hydrateRoot=v.hydrateRoot,zl}var Qf=Wf();function Kf(v){parent.postMessage({pluginMessage:v},"*")}const Yf={target:"selection",includeHidden:!1,inspectNestedInstanceInternals:!1,showPrimitiveTokens:!1,checkColors:!0,checkDimensions:!0,checkTypography:!0,checkComponents:!0,checkContrast:!1,contrastLevel:"AA",showRowCounts:!0,ignoredNodeNamePatterns:[]},Da=[{id:"colors",label:"Colors",icon:"\u25CF"},{id:"dimensions",label:"Dimensions",icon:"\u2194"},{id:"typography",label:"Typography",icon:"Aa"},{id:"components",label:"Components",icon:"\u25C8"}];function yn(v){Kf(v)}function Gf({status:v}){return p.jsx("span",{className:`status-icon status-${v}`,"aria-hidden":!0,children:v==="match"?"\u2713":v==="manual-review"?"!":v==="unsupported"?"\u2013":v==="stale"?"\u21BB":"\xB7"})}function Xf({onSettings:v,onClose:N}){return p.jsxs("header",{className:"header",children:[p.jsx("div",{className:"brand-mark",children:p.jsx("span",{children:"l"})}),p.jsxs("div",{className:"brand-copy",children:[p.jsx("strong",{children:"LUMI Lens"}),p.jsx("span",{children:"Design system quality check"})]}),p.jsxs("div",{className:"header-actions",children:[p.jsx("button",{className:"icon-button",onClick:v,"aria-label":"Settings",children:"\u2699"}),p.jsx("button",{className:"icon-button",onClick:N,"aria-label":"Close",children:"\xD7"})]})]})}function Zf({target:v,onTarget:N,onReload:m,onCheck:G}){return p.jsxs("section",{className:"target-section",children:[p.jsxs("div",{className:"section-eyebrow",children:["AUDIT TARGET ",p.jsx("button",{className:"reload-button",onClick:m,children:"\u21BB Reload"})]}),p.jsxs("div",{className:"segmented",children:[p.jsx("button",{className:v.target==="selection"?"active":"",onClick:()=>N("selection"),children:"Current selection"}),p.jsx("button",{className:v.target==="page"?"active":"",onClick:()=>N("page"),children:"Current page"})]}),p.jsxs("div",{className:"target-meta",children:[p.jsxs("div",{children:[p.jsx("span",{className:"meta-label",children:"Page"}),p.jsx("strong",{children:v.pageName})]}),p.jsxs("div",{className:"layer-count",children:[p.jsx("strong",{children:v.layerCount.toLocaleString()}),p.jsx("span",{children:"layers to scan"})]})]}),v.message&&p.jsx("div",{className:"notice subtle",children:v.message}),p.jsxs("button",{className:"primary-button",onClick:G,children:["Check designs ",p.jsx("span",{children:"\u2318\u21B5"})]})]})}function Jf({result:v}){const N=(v==null?void 0:v.summary)??{total:0,fixable:0,manualReview:0,matches:0,unsupported:0};return p.jsxs("section",{className:"summary-grid",children:[p.jsxs("div",{children:[p.jsx("strong",{children:N.total}),p.jsx("span",{children:"Findings"})]}),p.jsxs("div",{className:"accent",children:[p.jsx("strong",{children:N.fixable}),p.jsx("span",{children:"Fixable"})]}),p.jsxs("div",{className:"warning",children:[p.jsx("strong",{children:N.manualReview}),p.jsx("span",{children:"Manual review"})]}),p.jsxs("div",{className:"success",children:[p.jsx("strong",{children:N.matches}),p.jsx("span",{children:"Matches"})]}),p.jsxs("div",{className:"unsupported",children:[p.jsx("strong",{children:N.unsupported}),p.jsx("span",{children:"Unsupported"})]})]})}function qf({finding:v,onSelect:N}){const[m,G]=ke.useState(!1),U=v.suggestions[0];return U?p.jsxs("div",{className:"suggestion-wrap",children:[p.jsxs("button",{className:"suggestion-button",onClick:()=>G(!m),disabled:!v.canApply,children:[p.jsx("span",{className:"suggestion-dot"}),p.jsx("span",{className:"suggestion-name",children:U.tokenName}),p.jsx("span",{className:"confidence",children:U.confidence}),p.jsx("span",{className:"chevron",children:"\u2304"})]}),m&&p.jsx("div",{className:"suggestion-menu",children:v.suggestions.map(D=>p.jsxs("button",{onClick:()=>{N(D.id),G(!1)},children:[p.jsx("span",{children:D.tokenName}),p.jsxs("small",{children:[D.confidence," \xB7 ",D.rationale]})]},D.id))})]}):p.jsx("span",{className:"no-suggestion",children:"No safe fix"})}function bf({finding:v,selected:N,onToggle:m,onSelect:G,onPreview:U,onApply:D,onClearPreview:B}){const M=v.suggestions[0];return p.jsxs("article",{className:`finding-row ${N?"selected":""} ${v.status}`,onClick:G,onMouseEnter:()=>M&&U(M.id),onMouseLeave:B,children:[p.jsx("button",{className:`checkbox ${N?"checked":""}`,onClick:$=>{$.stopPropagation(),m($)},"aria-label":N?"Deselect finding":"Select finding",children:N?"\u2713":""}),p.jsxs("div",{className:"finding-main",children:[p.jsxs("div",{className:"finding-title",children:[p.jsx(Gf,{status:v.status}),p.jsx("strong",{children:v.nodeName}),p.jsx("span",{className:"node-type",children:v.nodeType})]}),p.jsxs("div",{className:"finding-property",children:[v.property,v.range&&p.jsxs("span",{className:"range",children:["Characters ",v.range.start,"\u2013",v.range.end]})]}),p.jsxs("div",{className:"finding-values",children:[p.jsx("span",{className:"current-value",title:v.reason,children:v.currentDisplayValue||"Hardcoded"}),p.jsx("span",{className:"arrow",children:"\u2192"}),p.jsx(qf,{finding:v,onSelect:U})]}),v.reason&&v.status!=="violation"&&p.jsx("div",{className:"finding-reason",children:v.reason})]}),p.jsx("button",{className:"row-apply",disabled:!v.canApply,onClick:$=>{$.stopPropagation(),D()},children:"Apply"})]})}function Fa({category:v,matched:N}){return p.jsxs("div",{className:"empty-state",children:[p.jsx("div",{className:"empty-icon",children:N?"\u2713":"\u25CC"}),p.jsx("strong",{children:N?`No remaining ${v.toLowerCase()} issues`:`Check designs to find ${v.toLowerCase()} issues`}),p.jsx("span",{children:N?"Everything in this category is aligned with the LUMI system.":"LUMI Lens will inspect the active target and suggest safe replacements."})]})}function ed({status:v}){if(!v||v.enabled&&v.tokenCount>0)return null;const N=v.enabled?"No LUMI tokens discovered":"LUMI library not enabled",m=v.message??"Enable the LUMI library in Figma Libraries, then reload.";return p.jsxs("div",{className:"library-banner",children:[p.jsx("div",{className:"banner-icon",children:"!"}),p.jsxs("div",{children:[p.jsx("strong",{children:N}),p.jsx("span",{children:m})]})]})}function nd({settings:v,libraryStatus:N,textStyles:m,onUpdate:G,onClose:U}){const D=M=>G({...v,...M}),B=(m==null?void 0:m.filter(M=>M.name==="Label/Supporting Emphasized"))??[];return p.jsxs("div",{className:"settings-panel",children:[p.jsxs("div",{className:"settings-top",children:[p.jsx("button",{className:"back-button",onClick:U,children:"\u2190"}),p.jsxs("div",{children:[p.jsx("strong",{children:"Settings"}),p.jsx("span",{children:"Configure what LUMI Lens checks"})]})]}),p.jsxs("div",{className:"settings-scroll",children:[p.jsxs(zo,{title:"Checks",children:[p.jsx(zn,{label:"Check colors",value:v.checkColors,onChange:M=>D({checkColors:M})}),p.jsx(zn,{label:"Check dimensions",value:v.checkDimensions,onChange:M=>D({checkDimensions:M})}),p.jsx(zn,{label:"Check typography",value:v.checkTypography,onChange:M=>D({checkTypography:M})}),p.jsx(zn,{label:"Check components",value:v.checkComponents,onChange:M=>D({checkComponents:M})}),p.jsx(zn,{label:"Check contrast",value:v.checkContrast,onChange:M=>D({checkContrast:M})}),v.checkContrast&&p.jsxs("div",{className:"select-setting",children:[p.jsx("span",{children:"Contrast level"}),p.jsxs("select",{value:v.contrastLevel,onChange:M=>D({contrastLevel:M.target.value}),children:[p.jsx("option",{children:"AA"}),p.jsx("option",{children:"AAA"})]})]})]}),p.jsxs(zo,{title:"Advanced",children:[p.jsx(zn,{label:"Include hidden layers",value:v.includeHidden,onChange:M=>D({includeHidden:M})}),p.jsx(zn,{label:"Inspect nested instance internals",value:v.inspectNestedInstanceInternals,onChange:M=>D({inspectNestedInstanceInternals:M})}),p.jsx(zn,{label:"Show primitive tokens",value:v.showPrimitiveTokens,onChange:M=>D({showPrimitiveTokens:M})}),p.jsx(zn,{label:"Show row counts",value:v.showRowCounts,onChange:M=>D({showRowCounts:M})})]}),p.jsxs(zo,{title:"LUMI source",children:[p.jsxs("div",{className:"setting-info",children:[p.jsx("span",{children:"Library"}),p.jsx("strong",{children:(N==null?void 0:N.name)??"LUMI Design System"}),p.jsx("small",{children:N!=null&&N.enabled?`${N.tokenCount} semantic tokens available \xB7 ${N.importedTokenCount} imported locally`:(N==null?void 0:N.message)??"Enable it in Figma Libraries, then reload."})]}),p.jsxs("div",{className:"setting-info",children:[p.jsx("span",{children:"Component allowlist"}),p.jsx("strong",{children:"Configuration file"}),p.jsxs("small",{children:["Update approved component keys in ",p.jsx("code",{children:"src/config/lumi.ts"}),"."]})]}),B.length>1&&p.jsxs("div",{className:"duplicate-styles",children:[p.jsx("strong",{children:"Label/Supporting Emphasized variants"}),B.map(M=>p.jsxs("span",{children:[M.lineHeight," \xB7 ",M.isLegacyDuplicate?"Legacy duplicate":"Preferred"]},M.id))]})]})]})]})}function zo({title:v,children:N}){return p.jsxs("section",{className:"setting-group",children:[p.jsx("div",{className:"section-eyebrow",children:v}),N]})}function zn({label:v,value:N,onChange:m}){return p.jsxs("label",{className:"toggle-row",children:[p.jsx("span",{children:v}),p.jsx("input",{type:"checkbox",checked:N,onChange:G=>m(G.target.checked)}),p.jsx("i",{})]})}function td(){var y;const[v,N]=ke.useState(),[m,G]=ke.useState({target:"page",pageName:"Current page",layerCount:0,hasSelection:!1,message:"No layers selected. Scanning the current page."}),[U,D]=ke.useState(Yf),[B,M]=ke.useState(),[$,xe]=ke.useState("colors"),[se,q]=ke.useState(new Set),[J,Ae]=ke.useState(),[Ne,b]=ke.useState({}),[X,en]=ke.useState(!1),[Ve,_e]=ke.useState(!1),[me,Ie]=ke.useState(0),[ve,ye]=ke.useState(),[Me,an]=ke.useState(),Ye=ke.useCallback(x=>{var A;const E=(A=x.data)==null?void 0:A.pluginMessage;if(E)switch(E.type){case"INITIAL_STATE":N(E.payload),G(E.payload.target),D(E.payload.settings),ye(void 0);break;case"SELECTION_CHANGED":G(E.payload);break;case"SCAN_STARTED":_e(!0),Ie(0),ye(void 0);break;case"SCAN_PROGRESS":Ie(E.total?Math.round(E.completed/E.total*100):0);break;case"SCAN_COMPLETE":M(E.payload),_e(!1),Ie(100),q(new Set);break;case"SCAN_ERROR":_e(!1),ye(E.message);break;case"APPLY_STARTED":_e(!0),an(void 0);break;case"APPLY_COMPLETE":an(E.payload.failures.length?`${E.payload.applied} applied \xB7 ${E.payload.failures.length} need review`:`${E.payload.applied} fixes applied`);break;case"LIBRARY_STATUS":N(V=>V&&{...V,libraryStatus:E.payload});break}},[]);ke.useEffect(()=>(window.addEventListener("message",Ye),()=>window.removeEventListener("message",Ye)),[Ye]);const je=ke.useMemo(()=>(B==null?void 0:B.findings.filter(x=>x.category===$&&x.status!=="match"))??[],[B,$]),nn=(x,E)=>q(A=>{const V=je.findIndex(Q=>Q.id===x),W=new Set(A);if(E.shiftKey&&J!==void 0&&V>=0){const Q=Math.min(J,V),ee=Math.max(J,V);je.slice(Q,ee+1).forEach(De=>W.add(De.id))}else E.metaKey||E.ctrlKey,W.has(x)?W.delete(x):W.add(x);return Ae(V),W}),Oe=x=>{D(x),yn({type:"SETTINGS_UPDATED",settings:x})},Ge=x=>{const E={...U,target:x};D(E),yn({type:"SETTINGS_UPDATED",settings:E}),G(A=>({...A,target:x}))},Xe=()=>yn({type:"SCAN",target:U.target==="selection"&&!m.hasSelection?"page":U.target,filters:U}),Pe=()=>yn({type:"APPLY_SELECTED",findingIds:[...se],suggestionIds:Ne}),le=x=>yn({type:"APPLY_SELECTED",findingIds:[x],suggestionIds:Ne}),C=()=>yn({type:"APPLY_TAB",category:$,suggestionIds:Ne}),O=(x,E)=>{b(A=>({...A,[x.id]:E})),yn({type:"PREVIEW_SUGGESTION",findingId:x.id,suggestionId:E})},j=()=>q(x=>{const E=new Set(x),A=je.length>0&&je.every(V=>E.has(V.id));return je.forEach(V=>A?E.delete(V.id):E.add(V.id)),E}),c=je.length;return X?p.jsx(nd,{settings:U,libraryStatus:v==null?void 0:v.libraryStatus,textStyles:v==null?void 0:v.textStyles,onUpdate:Oe,onClose:()=>en(!1)}):p.jsxs("main",{className:"app-shell",children:[p.jsx(Xf,{onSettings:()=>en(!0),onClose:()=>yn({type:"CLOSE"})}),p.jsx(Zf,{target:m,onTarget:Ge,onReload:()=>yn({type:"RELOAD"}),onCheck:Xe}),p.jsx(ed,{status:(B==null?void 0:B.libraryStatus)??(v==null?void 0:v.libraryStatus)}),Ve&&p.jsx("div",{className:"progress-line",children:p.jsx("span",{style:{width:`${me}%`}})}),ve&&p.jsxs("div",{className:"error-banner",children:[p.jsx("strong",{children:"Check paused"}),p.jsx("span",{children:ve}),p.jsx("button",{onClick:Xe,children:"Try again"})]}),B&&p.jsxs(p.Fragment,{children:[p.jsx(Jf,{result:B}),p.jsxs("section",{className:"results-section",children:[p.jsxs("div",{className:"results-toolbar",children:[p.jsxs("button",{className:"finding-heading",onClick:j,children:[p.jsx("strong",{children:"Findings"}),p.jsxs("span",{children:[B.durationMs," ms \xB7 ",B.scannedLayerCount.toLocaleString()," layers scanned"]})]}),p.jsxs("div",{className:"toolbar-actions",children:[p.jsxs("button",{className:"secondary-button",disabled:!se.size||Ve,onClick:Pe,children:["Apply selected",se.size?` (${se.size})`:""]}),p.jsx("button",{className:"secondary-button",disabled:!c||Ve,onClick:C,children:"Apply all in tab"})]})]}),p.jsx("nav",{className:"tabs",children:Da.map(x=>{const E=B.findings.filter(A=>A.category===x.id&&A.status!=="match").length;return p.jsxs("button",{className:$===x.id?"active":"",onClick:()=>xe(x.id),children:[p.jsx("span",{className:"tab-icon",children:x.icon}),x.label,U.showRowCounts&&p.jsx("em",{children:E})]},x.id)})}),Me&&p.jsx("div",{className:"apply-notice",children:Me}),p.jsx("div",{className:"finding-list",children:je.length?je.map(x=>p.jsx(bf,{finding:x,selected:se.has(x.id),onToggle:E=>nn(x.id,E),onSelect:()=>yn({type:"SELECT_NODE",nodeId:x.nodeId}),onPreview:E=>O(x,E),onApply:()=>le(x.id),onClearPreview:()=>yn({type:"CLEAR_PREVIEW"})},x.id)):p.jsx(Fa,{category:((y=Da.find(x=>x.id===$))==null?void 0:y.label)??$,matched:!!B})})]})]}),!B&&p.jsx(Fa,{category:"your design",matched:!1})]})}Qf.createRoot(document.getElementById("root")).render(p.jsx(Af.StrictMode,{children:p.jsx(td,{})}));\n<\/script>\n  </body>\n</html>\n', { width: 440, height: 720, themeColors: true });
  var settings;
  var inventory;
  var lastScan;
  var scanning = false;
  function post(message) {
    figma.ui.postMessage(message);
  }
  function countLayers(nodes) {
    const queue = [...nodes];
    const seen = /* @__PURE__ */ new Set();
    let count = 0;
    while (queue.length && count <= 25e3) {
      const node = queue.shift();
      if (!node || seen.has(node.id)) continue;
      seen.add(node.id);
      if (!("visible" in node) || node.visible || settings?.includeHidden) count += 1;
      if ("children" in node) queue.push(...node.children);
    }
    return count;
  }
  function targetSummary(target = settings?.target ?? "selection") {
    const hasSelection = figma.currentPage.selection.length > 0;
    const actualTarget = target === "selection" && !hasSelection ? "page" : target;
    const roots = actualTarget === "selection" ? figma.currentPage.selection : figma.currentPage.children;
    return {
      target: actualTarget,
      pageName: figma.currentPage.name,
      layerCount: countLayers(roots),
      hasSelection,
      message: actualTarget === "page" && !hasSelection ? "No layers selected. Scanning the current page." : void 0
    };
  }
  async function initialize(force = false) {
    try {
      await figma.currentPage.loadAsync();
      settings = await loadSettings();
      inventory = await discoverInventory(force);
      post({ type: "INITIAL_STATE", payload: { target: targetSummary(settings.target), settings, libraryStatus: inventory.libraryStatus, tokens: inventory.tokens.filter((token) => settings.showPrimitiveTokens || !token.primitive), textStyles: inventory.textStyles } });
      post({ type: "LIBRARY_STATUS", payload: inventory.libraryStatus });
    } catch (error) {
      post({ type: "SCAN_ERROR", message: error instanceof Error ? error.message : "Could not initialize LUMI Lens." });
    }
  }
  async function runScan(target, nextSettings = settings) {
    if (scanning) return;
    scanning = true;
    settings = nextSettings;
    post({ type: "SCAN_STARTED" });
    try {
      inventory ?? (inventory = await discoverInventory());
      await clearPreview();
      lastScan = await scanPage(target, settings, inventory, (completed, total) => post({ type: "SCAN_PROGRESS", completed, total }));
      post({ type: "SCAN_COMPLETE", payload: lastScan });
    } catch (error) {
      post({ type: "SCAN_ERROR", message: error instanceof ScanLimitError ? error.message : error instanceof Error ? error.message : "The design check could not complete." });
    } finally {
      scanning = false;
    }
  }
  figma.on("selectionchange", () => post({ type: "SELECTION_CHANGED", payload: targetSummary() }));
  figma.ui.onmessage = async (message) => {
    try {
      switch (message.type) {
        case "SCAN":
          await runScan(message.target, message.filters);
          break;
        case "RELOAD":
          invalidateInventory();
          await initialize(true);
          break;
        case "SELECT_NODE": {
          const node = await figma.getNodeByIdAsync(message.nodeId);
          if (node && node.type !== "DOCUMENT" && node.type !== "PAGE") {
            figma.currentPage.selection = [node];
            figma.viewport.scrollAndZoomIntoView([node]);
          }
          break;
        }
        case "PREVIEW_SUGGESTION":
          if (lastScan && inventory) {
            const finding = lastScan.findings.find((item) => item.id === message.findingId);
            if (finding) await previewSuggestion(finding, message.suggestionId, inventory);
          }
          post({ type: "PREVIEW_COMPLETE" });
          break;
        case "CLEAR_PREVIEW":
          await clearPreview();
          break;
        case "APPLY_SELECTED": {
          if (!lastScan) break;
          post({ type: "APPLY_STARTED" });
          await clearPreview();
          const findings = lastScan.findings.filter((finding) => message.findingIds.includes(finding.id));
          const result = await applyFindings(findings, message.suggestionIds ?? {}, inventory);
          post({ type: "APPLY_COMPLETE", payload: { ...result, refreshed: false } });
          await runScan(lastScan.target, settings);
          break;
        }
        case "APPLY_TAB": {
          if (!lastScan) break;
          post({ type: "APPLY_STARTED" });
          await clearPreview();
          const findings = lastScan.findings.filter((finding) => finding.category === message.category);
          const result = await applyFindings(findings, message.suggestionIds ?? {}, inventory);
          post({ type: "APPLY_COMPLETE", payload: { ...result, refreshed: false } });
          await runScan(lastScan.target, settings);
          break;
        }
        case "SETTINGS_UPDATED":
          settings = message.settings;
          await saveSettings(settings);
          post({ type: "SELECTION_CHANGED", payload: targetSummary(settings.target) });
          break;
        case "CLOSE":
          await clearPreview();
          figma.closePlugin();
          break;
      }
    } catch (error) {
      post({ type: "SCAN_ERROR", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  };
  void initialize();
})();
