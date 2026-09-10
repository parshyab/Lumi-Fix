import type { Inventory } from "./inventory";
import { auditColors } from "./colorAudit";
import { auditDimensions } from "./dimensionAudit";
import { auditTypography } from "./typographyAudit";
import { auditComponent } from "./componentAudit";
import { auditContrast } from "./contrastAudit";
import { isVisible } from "./auditHelpers";
import type { Finding, ScanResult, Settings } from "../shared/types";

export const MAX_SCAN_LAYERS = 25_000;

// The Figma main-thread plugin sandbox does not guarantee the browser
// Performance API. Date.now() is available in the sandbox and is sufficient
// for the user-facing scan duration.
function now(): number {
  return Date.now();
}

export class ScanLimitError extends Error {
  constructor() {
    super("Your selection contains more than 25,000 layers. Reduce the selection and try again.");
    this.name = "ScanLimitError";
  }
}

function rootsForTarget(target: "selection" | "page"): readonly SceneNode[] {
  return target === "selection" && figma.currentPage.selection.length ? figma.currentPage.selection : figma.currentPage.children;
}

function collectNodes(target: "selection" | "page", settings: Settings, onProgress: (completed: number, total: number) => void): SceneNode[] {
  const roots = rootsForTarget(target);
  const queue: SceneNode[] = [...roots];
  const nodes: SceneNode[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const node = queue.shift();
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    if (!isVisible(node, settings.includeHidden)) continue;
    if (settings.ignoredNodeNamePatterns.some((pattern) => pattern && node.name.toLowerCase().includes(pattern.toLowerCase()))) continue;
    nodes.push(node);
    if (nodes.length > MAX_SCAN_LAYERS) throw new ScanLimitError();
    if (nodes.length % 150 === 0) onProgress(nodes.length, Math.max(nodes.length, roots.length));
    if (node.type === "INSTANCE" && !settings.inspectNestedInstanceInternals) continue;
    if ("children" in node) queue.push(...node.children);
  }
  onProgress(nodes.length, nodes.length);
  return nodes;
}

export async function scanPage(target: "selection" | "page", settings: Settings, inventory: Inventory, onProgress: (completed: number, total: number) => void): Promise<ScanResult> {
  const started = now();
  await figma.currentPage.loadAsync();
  const nodes = collectNodes(target, settings, onProgress);
  const findings: Finding[] = [];
  for (const node of nodes) {
    if (settings.checkColors) findings.push(...auditColors(node, inventory, settings));
    if (settings.checkDimensions) findings.push(...auditDimensions(node, inventory, settings));
    if (settings.checkTypography && node.type === "TEXT") findings.push(...auditTypography(node, inventory, settings));
    if (settings.checkContrast && node.type === "TEXT") {
      const contrast = auditContrast(node, settings);
      if (contrast) findings.push(contrast);
    }
    if (settings.checkComponents && node.type === "INSTANCE") {
      const componentFinding = await auditComponent(node, inventory, settings);
      if (componentFinding) findings.push(componentFinding);
    }
  }
  const summary = {
    total: findings.length,
    fixable: findings.filter((finding) => finding.canApply).length,
    manualReview: findings.filter((finding) => finding.status === "manual-review").length,
    matches: findings.filter((finding) => finding.status === "match").length,
    unsupported: findings.filter((finding) => finding.status === "unsupported").length,
  };
  return { findings, scannedLayerCount: nodes.length, target, durationMs: Math.max(0, now() - started), summary, libraryStatus: inventory.libraryStatus };
}
