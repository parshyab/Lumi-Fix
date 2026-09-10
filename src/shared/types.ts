export type Category = "colors" | "dimensions" | "typography" | "components";

export type FindingStatus =
  | "match"
  | "violation"
  | "manual-review"
  | "unsupported"
  | "stale";

export type SuggestionSource = "local" | "lumi-library" | "style";
export type Confidence = "high" | "medium" | "low";
export type MatchType = "exact" | "semantic" | "nearby" | "manual";
export type ResolvedType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN" | "OTHER";

export type SerializableColor = { r: number; g: number; b: number; a: number };

export type Suggestion = {
  id: string;
  tokenName: string;
  tokenKey?: string;
  tokenId?: string;
  source: SuggestionSource;
  resolvedType: string;
  score: number;
  confidence: Confidence;
  matchType: MatchType;
  rationale: string;
  canApply: boolean;
  previewValue?: SerializableColor | number;
  unavailableReason?: string;
};

export type FindingTarget =
  | { kind: "paint"; field: "fills" | "strokes"; paintIndex: number; range?: { start: number; end: number } }
  | { kind: "dimension"; field: string }
  | { kind: "text-style"; range?: { start: number; end: number } }
  | { kind: "component" }
  | { kind: "contrast" };

export type Finding = {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  category: Category;
  property: string;
  range?: { start: number; end: number };
  currentValue: unknown;
  currentDisplayValue: string;
  currentVariableName?: string;
  currentStyleName?: string;
  status: FindingStatus;
  suggestions: Suggestion[];
  canApply: boolean;
  reason?: string;
  fingerprint: string;
  target: FindingTarget;
};

export type Settings = {
  target: "selection" | "page";
  includeHidden: boolean;
  inspectNestedInstanceInternals: boolean;
  showPrimitiveTokens: boolean;
  checkColors: boolean;
  checkDimensions: boolean;
  checkTypography: boolean;
  checkComponents: boolean;
  checkContrast: boolean;
  contrastLevel: "AA" | "AAA";
  showRowCounts: boolean;
  ignoredNodeNamePatterns: string[];
};

export const DEFAULT_SETTINGS: Settings = {
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
  ignoredNodeNamePatterns: [],
};

export type TargetSummary = {
  target: "selection" | "page";
  pageName: string;
  layerCount: number;
  hasSelection: boolean;
  message?: string;
};

export type TokenRegistryEntry = {
  id?: string;
  key?: string;
  name: string;
  source: "local" | "lumi-library";
  resolvedType: ResolvedType | string;
  collectionName: string;
  libraryName?: string;
  remote?: boolean;
  scope?: string[];
  imported: boolean;
  boundCount: number;
  semantic: boolean;
  primitive: boolean;
  value?: SerializableColor | number | boolean | string;
};

export type TextStyleRecord = {
  id: string;
  key?: string;
  name: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  fontWeight?: number;
  lineHeight: string;
  letterSpacing: string;
  textCase: string;
  textDecoration: string;
  paragraphSpacing?: number;
  paragraphIndent?: number;
  isCanonical: boolean;
  isLegacyDuplicate: boolean;
};

export type LibraryStatus = {
  name: string;
  available: boolean;
  enabled: boolean;
  tokenCount: number;
  importedTokenCount: number;
  message?: string;
};

export type ScanResult = {
  findings: Finding[];
  scannedLayerCount: number;
  target: "selection" | "page";
  durationMs: number;
  summary: {
    total: number;
    fixable: number;
    manualReview: number;
    matches: number;
    unsupported: number;
  };
  libraryStatus: LibraryStatus;
};

export type InitialState = {
  target: TargetSummary;
  settings: Settings;
  libraryStatus: LibraryStatus;
  tokens: TokenRegistryEntry[];
  textStyles: TextStyleRecord[];
};

export type ApplyFailure = { findingId: string; nodeId: string; nodeName: string; reason: string };
export type ApplyResult = {
  applied: number;
  skipped: number;
  failures: ApplyFailure[];
  refreshed: boolean;
};
