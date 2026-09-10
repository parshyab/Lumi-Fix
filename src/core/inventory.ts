import { getTokenRule, isCanonicalTextStyle, isPrimitiveToken, isPreferredTextStyle, LUMI_LIBRARY_NAME } from "../config/lumi";
import type { LibraryStatus, ResolvedType, TextStyleRecord, TokenRegistryEntry } from "../shared/types";

type LibraryVariableLike = {
  key?: string;
  variableKey?: string;
  name: string;
  resolvedType: string;
  scopes?: string[];
  collectionName?: string;
  libraryName?: string;
};

type LibraryDiscovery = {
  tokens: TokenRegistryEntry[];
  available: boolean;
  error?: string;
};

export type Inventory = {
  tokens: TokenRegistryEntry[];
  tokenById: Map<string, TokenRegistryEntry>;
  tokenByKey: Map<string, TokenRegistryEntry>;
  textStyles: TextStyleRecord[];
  libraryStatus: LibraryStatus;
};

let cachedInventory: Inventory | undefined;

function resolvedType(value: unknown): ResolvedType | string {
  return typeof value === "string" && ["COLOR", "FLOAT", "STRING", "BOOLEAN"].includes(value) ? value as ResolvedType : "OTHER";
}

function lineHeightLabel(lineHeight: LineHeight): string {
  if (lineHeight.unit === "AUTO") return "AUTO";
  return `${lineHeight.value}${lineHeight.unit}`;
}

function letterSpacingLabel(letterSpacing: LetterSpacing): string {
  return `${letterSpacing.value}${letterSpacing.unit}`;
}

function numericLineHeight(style: TextStyle): number | undefined {
  return style.lineHeight.unit === "PIXELS" ? style.lineHeight.value : undefined;
}

function valueFromVariable(variable: Variable): TokenRegistryEntry["value"] {
  const mode = Object.keys(variable.valuesByMode)[0];
  const value = mode ? variable.valuesByMode[mode] : undefined;
  if (value && typeof value === "object" && "r" in value && "g" in value && "b" in value) {
    const color = value as { r: number; g: number; b: number; a?: number };
    return { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 };
  }
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

function isLumiName(name: string): boolean {
  return name.toLowerCase().includes("lumi");
}

function isLumiLibraryName(name: string): boolean {
  return name.trim().toLowerCase() === LUMI_LIBRARY_NAME.toLowerCase();
}

async function discoverLocalTokens(): Promise<{ tokens: TokenRegistryEntry[]; byId: Map<string, TokenRegistryEntry>; byKey: Map<string, TokenRegistryEntry> }> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collectionNames = new Map(collections.map((collection) => [collection.id, collection.name]));
  const variables = await figma.variables.getLocalVariablesAsync();
  const tokens: TokenRegistryEntry[] = [];
  const byId = new Map<string, TokenRegistryEntry>();
  const byKey = new Map<string, TokenRegistryEntry>();
  for (const variable of variables) {
    const collectionName = collectionNames.get(variable.variableCollectionId) ?? "";
    const entry: TokenRegistryEntry = {
      id: variable.id,
      key: variable.key,
      name: variable.name,
      source: "local",
      resolvedType: resolvedType(variable.resolvedType),
      collectionName,
      libraryName: isLumiName(collectionName) || (variable.remote && Boolean(getTokenRule(variable.name))) ? LUMI_LIBRARY_NAME : undefined,
      remote: variable.remote,
      scope: variable.scopes,
      imported: true,
      boundCount: 0,
      semantic: Boolean(getTokenRule(variable.name)) || !isPrimitiveToken(variable.name, collectionName),
      primitive: isPrimitiveToken(variable.name, collectionName),
      value: valueFromVariable(variable),
    };
    tokens.push(entry);
    byId.set(variable.id, entry);
    byKey.set(variable.key, entry);
  }
  return { tokens, byId, byKey };
}

async function discoverLibraryTokens(): Promise<LibraryDiscovery> {
  let availableCollections: LibraryVariableCollection[];
  try {
    availableCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  } catch (error) {
    return { tokens: [], available: false, error: error instanceof Error ? error.message : "Figma could not read enabled libraries." };
  }
  const lumiCollections = availableCollections.filter((collection) => isLumiLibraryName(collection.libraryName));
  const tokens: TokenRegistryEntry[] = [];
  const errors: string[] = [];
  const results = await Promise.all(lumiCollections.map(async (collection) => {
    try {
      return await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collection.key) as unknown as LibraryVariableLike[];
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
        primitive: isPrimitiveToken(variable.name, collectionName),
      });
    }
  });
  return { tokens, available: lumiCollections.length > 0, error: errors.length ? errors.join("; ") : undefined };
}

async function discoverTextStyles(): Promise<TextStyleRecord[]> {
  const styles = await figma.getLocalTextStylesAsync();
  const byName = new Map<string, TextStyle[]>();
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
      isLegacyDuplicate: duplicate && !canonical,
    };
  });
}

export async function discoverInventory(force = false): Promise<Inventory> {
  if (cachedInventory && !force) return cachedInventory;
  const [local, library, textStyles] = await Promise.all([
    discoverLocalTokens().catch(() => ({ tokens: [], byId: new Map<string, TokenRegistryEntry>(), byKey: new Map<string, TokenRegistryEntry>() })),
    discoverLibraryTokens(),
    discoverTextStyles().catch(() => []),
  ]);
  const lumiKeys = new Set(library.tokens.map((token) => token.key).filter((key): key is string => Boolean(key)));
  for (const token of local.tokens) {
    if (token.key && lumiKeys.has(token.key)) token.libraryName = LUMI_LIBRARY_NAME;
  }
  const tokens = [...local.tokens, ...library.tokens.filter((libraryToken) => !local.byKey.has(libraryToken.key ?? ""))];
  const libraryImportedCount = local.tokens.filter((token) => token.libraryName === LUMI_LIBRARY_NAME && token.imported).length;
  const enabled = library.available || libraryImportedCount > 0;
  const semanticTokenCount = tokens.filter((token) => !token.primitive).length;
  const message = library.error
    ? `Could not read the enabled LUMI library. Reload the plugin and verify your Figma library access. (${library.error})`
    : enabled
      ? undefined
      : `${LUMI_LIBRARY_NAME} is not enabled in this file. Enable the LUMI library in Figma Libraries, then reload.`;
  const libraryStatus: LibraryStatus = {
    name: LUMI_LIBRARY_NAME,
    available: library.available,
    enabled,
    tokenCount: semanticTokenCount,
    importedTokenCount: libraryImportedCount,
    message,
  };
  const tokenById = new Map(local.byId);
  const tokenByKey = new Map(local.byKey);
  for (const token of library.tokens) {
    if (token.key) tokenByKey.set(token.key, token);
  }
  cachedInventory = { tokens, tokenById, tokenByKey, textStyles, libraryStatus };
  return cachedInventory;
}

export function invalidateInventory(): void {
  cachedInventory = undefined;
}

export function isTokenVisible(token: TokenRegistryEntry, showPrimitiveTokens: boolean): boolean {
  return showPrimitiveTokens || !token.primitive;
}

export function approvedLumiTokens(inventory: Inventory): TokenRegistryEntry[] {
  return inventory.tokens.filter((token) => token.source === "lumi-library" || token.libraryName === LUMI_LIBRARY_NAME);
}

export async function resolveToken(entry: TokenRegistryEntry): Promise<Variable | null> {
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
