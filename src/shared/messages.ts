import type {
  ApplyResult,
  Category,
  InitialState,
  LibraryStatus,
  ScanResult,
  Settings,
  TargetSummary,
} from "./types";

export type UIMessage =
  | { type: "SCAN"; target: "selection" | "page"; filters: Settings }
  | { type: "RELOAD" }
  | { type: "SELECT_NODE"; nodeId: string }
  | { type: "PREVIEW_SUGGESTION"; findingId: string; suggestionId: string }
  | { type: "CLEAR_PREVIEW" }
  | { type: "APPLY_SELECTED"; findingIds: string[]; suggestionIds?: Record<string, string> }
  | { type: "APPLY_TAB"; category: Category; suggestionIds?: Record<string, string> }
  | { type: "SETTINGS_UPDATED"; settings: Settings }
  | { type: "CLOSE" };

export type PluginMessage =
  | { type: "INITIAL_STATE"; payload: InitialState }
  | { type: "SCAN_STARTED" }
  | { type: "SCAN_PROGRESS"; completed: number; total: number }
  | { type: "SCAN_COMPLETE"; payload: ScanResult }
  | { type: "SCAN_ERROR"; message: string }
  | { type: "SELECTION_CHANGED"; payload: TargetSummary }
  | { type: "APPLY_STARTED" }
  | { type: "APPLY_COMPLETE"; payload: ApplyResult }
  | { type: "PREVIEW_COMPLETE" }
  | { type: "LIBRARY_STATUS"; payload: LibraryStatus };

export function sendToPlugin(message: UIMessage): void {
  parent.postMessage({ pluginMessage: message }, "*");
}
