import { loadSettings, saveSettings } from "./config/settings";
import { discoverInventory, invalidateInventory } from "./core/inventory";
import { applyFindings } from "./core/applyFix";
import { clearPreview, previewSuggestion } from "./core/preview";
import { scanPage, ScanLimitError } from "./core/scanner";
import type { UIMessage, PluginMessage } from "./shared/messages";
import type { Settings, TargetSummary } from "./shared/types";

figma.showUI(__html__, { width: 440, height: 720, themeColors: true });

let settings: Settings;
let inventory: Awaited<ReturnType<typeof discoverInventory>>;
let lastScan: Awaited<ReturnType<typeof scanPage>> | undefined;
let scanning = false;

function post(message: PluginMessage): void {
  figma.ui.postMessage(message);
}

function countLayers(nodes: readonly SceneNode[]): number {
  const queue = [...nodes];
  const seen = new Set<string>();
  let count = 0;
  while (queue.length && count <= 25_000) {
    const node = queue.shift();
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    if (!("visible" in node) || node.visible || settings?.includeHidden) count += 1;
    if ("children" in node) queue.push(...node.children);
  }
  return count;
}

function targetSummary(target: "selection" | "page" = settings?.target ?? "selection"): TargetSummary {
  const hasSelection = figma.currentPage.selection.length > 0;
  const actualTarget = target === "selection" && !hasSelection ? "page" : target;
  const roots = actualTarget === "selection" ? figma.currentPage.selection : figma.currentPage.children;
  return {
    target: actualTarget,
    pageName: figma.currentPage.name,
    layerCount: countLayers(roots),
    hasSelection,
    message: actualTarget === "page" && !hasSelection ? "No layers selected. Scanning the current page." : undefined,
  };
}

async function initialize(force = false): Promise<void> {
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

async function runScan(target: "selection" | "page", nextSettings: Settings = settings): Promise<void> {
  if (scanning) return;
  scanning = true;
  settings = nextSettings;
  post({ type: "SCAN_STARTED" });
  try {
    inventory ??= await discoverInventory();
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

figma.ui.onmessage = async (message: UIMessage) => {
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
          figma.currentPage.selection = [node as SceneNode];
          figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
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
