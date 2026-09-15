import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { sendToPlugin } from "../shared/messages";
import type { PluginMessage } from "../shared/messages";
import type { Category, Finding, InitialState, LibraryStatus, ScanResult, Settings, TargetSummary, TextStyleRecord } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import logoUrl from "./assets/lumi-starburst-icon.png";

const categories: Array<{ id: Category; label: string; icon: string }> = [
  { id: "colors", label: "Colors", icon: "●" },
  { id: "dimensions", label: "Dimensions", icon: "↔" },
  { id: "typography", label: "Typography", icon: "Aa" },
  { id: "components", label: "Components", icon: "◈" },
];

function send(message: Parameters<typeof sendToPlugin>[0]): void { sendToPlugin(message); }

function StatusIcon({ status }: { status: Finding["status"] }): JSX.Element {
  return <span className={`status-icon status-${status}`} aria-hidden>{status === "match" ? "✓" : status === "manual-review" ? "!" : status === "unsupported" ? "–" : status === "stale" ? "↻" : "·"}</span>;
}

function Header(): JSX.Element {
  return <header className="header">
    <img className="brand-logo" src={logoUrl} alt="" aria-hidden="true" />
    <div className="brand-copy"><strong>LUMI Lens</strong><span>Design system quality check</span></div>
  </header>;
}

function TargetSelector({ target, onTarget, onReload, onSettings, onCheck }: { target: TargetSummary; onTarget: (target: "selection" | "page") => void; onReload: () => void; onSettings: () => void; onCheck: () => void }): JSX.Element {
  return <section className="target-section">
    <div className="section-eyebrow"><span>AUDIT TARGET</span><span className="section-tools"><button className="text-button" onClick={onSettings}>Settings</button><button className="reload-button" onClick={onReload}>↻ Reload</button></span></div>
    <div className="segmented"><button className={target.target === "selection" ? "active" : ""} onClick={() => onTarget("selection")}>Current selection</button><button className={target.target === "page" ? "active" : ""} onClick={() => onTarget("page")}>Current page</button></div>
    <div className="target-meta"><div><span className="meta-label">Page</span><strong>{target.pageName}</strong></div><div className="layer-count"><strong>{target.layerCount.toLocaleString()}</strong><span>layers to scan</span></div></div>
    {target.message && <div className="notice subtle">{target.message}</div>}
    <button className="primary-button" onClick={onCheck}>Check designs <span>⌘↵</span></button>
  </section>;
}

function Summary({ result }: { result?: ScanResult }): JSX.Element {
  const summary = result?.summary ?? { total: 0, fixable: 0, manualReview: 0, matches: 0, unsupported: 0 };
  return <section className="summary-grid"><div><strong>{summary.total}</strong><span>Findings</span></div><div className="accent"><strong>{summary.fixable}</strong><span>Fixable</span></div><div className="warning"><strong>{summary.manualReview}</strong><span>Manual review</span></div><div className="success"><strong>{summary.matches}</strong><span>Matches</span></div><div className="unsupported"><strong>{summary.unsupported}</strong><span>Unsupported</span></div></section>;
}

function SuggestionMenu({ finding, onSelect }: { finding: Finding; onSelect: (suggestionId: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const suggestion = finding.suggestions[0];
  if (!suggestion) return <span className="no-suggestion">No safe fix</span>;
  return <div className="suggestion-wrap">
    <button className="suggestion-button" onClick={() => setOpen(!open)} disabled={!finding.canApply}><span className="suggestion-dot" /><span className="suggestion-name">{suggestion.tokenName}</span><span className="confidence">{suggestion.confidence}</span><span className="chevron">⌄</span></button>
    {open && <div className="suggestion-menu">{finding.suggestions.map((item) => <button key={item.id} onClick={() => { onSelect(item.id); setOpen(false); }}><span>{item.tokenName}</span><small>{item.confidence} · {item.rationale}</small></button>)}</div>}
  </div>;
}

function FindingRow({ finding, selected, onToggle, onSelect, onPreview, onApply, onClearPreview }: { finding: Finding; selected: boolean; onToggle: (event: MouseEvent<HTMLButtonElement>) => void; onSelect: () => void; onPreview: (id: string) => void; onApply: () => void; onClearPreview: () => void }): JSX.Element {
  const suggestion = finding.suggestions[0];
  return <article className={`finding-row ${selected ? "selected" : ""} ${finding.status}`} onClick={onSelect} onMouseEnter={() => suggestion && onPreview(suggestion.id)} onMouseLeave={onClearPreview}>
    <button className={`checkbox ${selected ? "checked" : ""}`} onClick={(event) => { event.stopPropagation(); onToggle(event); }} aria-label={selected ? "Deselect finding" : "Select finding"}>{selected ? "✓" : ""}</button>
    <div className="finding-main"><div className="finding-title"><StatusIcon status={finding.status} /><strong>{finding.nodeName}</strong><span className="node-type">{finding.nodeType}</span></div><div className="finding-property">{finding.property}{finding.range && <span className="range">Characters {finding.range.start}–{finding.range.end}</span>}</div><div className="finding-values"><span className="current-value" title={finding.reason}>{finding.currentDisplayValue || "Hardcoded"}</span><span className="arrow">→</span><SuggestionMenu finding={finding} onSelect={onPreview} /></div>{finding.reason && finding.status !== "violation" && <div className="finding-reason">{finding.reason}</div>}</div>
    <button className="row-apply" disabled={!finding.canApply} onClick={(event) => { event.stopPropagation(); onApply(); }}>Apply</button>
  </article>;
}

function EmptyState({ category, matched }: { category: string; matched: boolean }): JSX.Element {
  return <div className="empty-state"><div className="empty-icon">{matched ? "✓" : "◌"}</div><strong>{matched ? `No remaining ${category.toLowerCase()} issues` : `Check designs to find ${category.toLowerCase()} issues`}</strong><span>{matched ? "Everything in this category is aligned with the LUMI system." : "LUMI Lens will inspect the active target and suggest safe replacements."}</span></div>;
}

function LibraryBanner({ status }: { status?: LibraryStatus }): JSX.Element | null {
  if (!status || (status.enabled && status.tokenCount > 0)) return null;
  const title = status.enabled ? "No LUMI tokens discovered" : "LUMI library not enabled";
  const message = status.message ?? "Enable the LUMI library in Figma Libraries, then reload.";
  return <div className="library-banner"><div className="banner-icon">!</div><div><strong>{title}</strong><span>{message}</span></div></div>;
}

function SettingsPanel({ settings, libraryStatus, textStyles, onUpdate, onClose }: { settings: Settings; libraryStatus?: LibraryStatus; textStyles?: TextStyleRecord[]; onUpdate: (settings: Settings) => void; onClose: () => void }): JSX.Element {
  const update = (patch: Partial<Settings>) => onUpdate({ ...settings, ...patch });
  const supportingStyles = textStyles?.filter((style) => style.name === "Label/Supporting Emphasized") ?? [];
  return <div className="settings-panel"><div className="settings-top"><button className="back-button" onClick={onClose}>←</button><div><strong>Settings</strong><span>Configure what LUMI Lens checks</span></div></div><div className="settings-scroll">
    <SettingGroup title="Checks"><Toggle label="Check colors" value={settings.checkColors} onChange={(value) => update({ checkColors: value })} /><Toggle label="Check dimensions" value={settings.checkDimensions} onChange={(value) => update({ checkDimensions: value })} /><Toggle label="Check typography" value={settings.checkTypography} onChange={(value) => update({ checkTypography: value })} /><Toggle label="Check components" value={settings.checkComponents} onChange={(value) => update({ checkComponents: value })} /><Toggle label="Check contrast" value={settings.checkContrast} onChange={(value) => update({ checkContrast: value })} />{settings.checkContrast && <div className="select-setting"><span>Contrast level</span><select value={settings.contrastLevel} onChange={(event) => update({ contrastLevel: event.target.value as Settings["contrastLevel"] })}><option>AA</option><option>AAA</option></select></div>}</SettingGroup>
    <SettingGroup title="Advanced"><Toggle label="Include hidden layers" value={settings.includeHidden} onChange={(value) => update({ includeHidden: value })} /><Toggle label="Inspect nested instance internals" value={settings.inspectNestedInstanceInternals} onChange={(value) => update({ inspectNestedInstanceInternals: value })} /><Toggle label="Show primitive tokens" value={settings.showPrimitiveTokens} onChange={(value) => update({ showPrimitiveTokens: value })} /><Toggle label="Show row counts" value={settings.showRowCounts} onChange={(value) => update({ showRowCounts: value })} /></SettingGroup>
    <SettingGroup title="LUMI source"><div className="setting-info"><span>Library</span><strong>{libraryStatus?.name ?? "LUMI Design System"}</strong><small>{libraryStatus?.enabled ? `${libraryStatus.tokenCount} semantic tokens available · ${libraryStatus.importedTokenCount} imported locally` : libraryStatus?.message ?? "Enable it in Figma Libraries, then reload."}</small></div><div className="setting-info"><span>Component allowlist</span><strong>Configuration file</strong><small>Update approved component keys in <code>src/config/lumi.ts</code>.</small></div>{supportingStyles.length > 1 && <div className="duplicate-styles"><strong>Label/Supporting Emphasized variants</strong>{supportingStyles.map((style) => <span key={style.id}>{style.lineHeight} · {style.isLegacyDuplicate ? "Legacy duplicate" : "Preferred"}</span>)}</div>}</SettingGroup>
  </div></div>;
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }): JSX.Element { return <section className="setting-group"><div className="section-eyebrow">{title}</div>{children}</section>; }
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }): JSX.Element { return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><i /></label>; }

export function App(): JSX.Element {
  const [initial, setInitial] = useState<InitialState | undefined>();
  const [target, setTarget] = useState<TargetSummary>({ target: "page", pageName: "Current page", layerCount: 0, hasSelection: false, message: "No layers selected. Scanning the current page." });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [result, setResult] = useState<ScanResult>();
  const [activeCategory, setActiveCategory] = useState<Category>("colors");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>();
  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<string, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [applyNotice, setApplyNotice] = useState<string>();

  const onMessage = useCallback((event: MessageEvent<{ pluginMessage?: PluginMessage }>) => {
    const message = event.data?.pluginMessage;
    if (!message) return;
    switch (message.type) {
      case "INITIAL_STATE": setInitial(message.payload); setTarget(message.payload.target); setSettings(message.payload.settings); setError(undefined); break;
      case "SELECTION_CHANGED": setTarget(message.payload); break;
      case "SCAN_STARTED": setBusy(true); setProgress(0); setError(undefined); break;
      case "SCAN_PROGRESS": setProgress(message.total ? Math.round(message.completed / message.total * 100) : 0); break;
      case "SCAN_COMPLETE": setResult(message.payload); setBusy(false); setProgress(100); setSelected(new Set()); break;
      case "SCAN_ERROR": setBusy(false); setError(message.message); break;
      case "APPLY_STARTED": setBusy(true); setApplyNotice(undefined); break;
      case "APPLY_COMPLETE": setApplyNotice(message.payload.failures.length ? `${message.payload.applied} applied · ${message.payload.failures.length} need review` : `${message.payload.applied} fixes applied`); break;
      case "LIBRARY_STATUS": setInitial((current) => current ? { ...current, libraryStatus: message.payload } : current); break;
    }
  }, []);
  useEffect(() => { window.addEventListener("message", onMessage); return () => window.removeEventListener("message", onMessage); }, [onMessage]);

  const visibleFindings = useMemo(() => result?.findings.filter((finding) => finding.category === activeCategory && finding.status !== "match") ?? [], [result, activeCategory]);
  const toggleSelected = (id: string, event: MouseEvent<HTMLButtonElement>) => setSelected((current) => {
    const index = visibleFindings.findIndex((finding) => finding.id === id);
    const next = new Set(current);
    if (event.shiftKey && lastSelectedIndex !== undefined && index >= 0) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      visibleFindings.slice(start, end + 1).forEach((finding) => next.add(finding.id));
    } else if (event.metaKey || event.ctrlKey) {
      if (next.has(id)) next.delete(id); else next.add(id);
    } else if (next.has(id)) next.delete(id); else next.add(id);
    setLastSelectedIndex(index);
    return next;
  });
  const updateSettings = (next: Settings) => { setSettings(next); send({ type: "SETTINGS_UPDATED", settings: next }); };
  const selectTarget = (next: "selection" | "page") => { const nextSettings = { ...settings, target: next }; setSettings(nextSettings); send({ type: "SETTINGS_UPDATED", settings: nextSettings }); setTarget((current) => ({ ...current, target: next })); };
  const check = () => send({ type: "SCAN", target: settings.target === "selection" && !target.hasSelection ? "page" : settings.target, filters: settings });
  const applySelected = () => send({ type: "APPLY_SELECTED", findingIds: [...selected], suggestionIds: selectedSuggestions });
  const applyOne = (findingId: string) => send({ type: "APPLY_SELECTED", findingIds: [findingId], suggestionIds: selectedSuggestions });
  const applyTab = () => send({ type: "APPLY_TAB", category: activeCategory, suggestionIds: selectedSuggestions });
  const preview = (finding: Finding, suggestionId: string) => { setSelectedSuggestions((current) => ({ ...current, [finding.id]: suggestionId })); send({ type: "PREVIEW_SUGGESTION", findingId: finding.id, suggestionId }); };
  const toggleAllVisible = () => setSelected((current) => { const next = new Set(current); const allSelected = visibleFindings.length > 0 && visibleFindings.every((finding) => next.has(finding.id)); visibleFindings.forEach((finding) => allSelected ? next.delete(finding.id) : next.add(finding.id)); return next; });
  const visibleCount = visibleFindings.length;

  if (settingsOpen) return <SettingsPanel settings={settings} libraryStatus={initial?.libraryStatus} textStyles={initial?.textStyles} onUpdate={updateSettings} onClose={() => setSettingsOpen(false)} />;
  return <main className="app-shell"><Header />
    <TargetSelector target={target} onTarget={selectTarget} onReload={() => send({ type: "RELOAD" })} onSettings={() => setSettingsOpen(true)} onCheck={check} />
    <LibraryBanner status={result?.libraryStatus ?? initial?.libraryStatus} />
    {busy && <div className="progress-line"><span style={{ width: `${progress}%` }} /></div>}
    {error && <div className="error-banner"><strong>Check paused</strong><span>{error}</span><button onClick={check}>Try again</button></div>}
    {result && <><Summary result={result} /><section className="results-section"><div className="results-toolbar"><button className="finding-heading" onClick={toggleAllVisible}><strong>Findings</strong><span>{result.durationMs} ms · {result.scannedLayerCount.toLocaleString()} layers scanned</span></button><div className="toolbar-actions"><button className="secondary-button" disabled={!selected.size || busy} onClick={applySelected}>Apply selected{selected.size ? ` (${selected.size})` : ""}</button><button className="secondary-button" disabled={!visibleCount || busy} onClick={applyTab}>Apply all in tab</button></div></div><nav className="tabs">{categories.map((category) => { const count = result.findings.filter((finding) => finding.category === category.id && finding.status !== "match").length; return <button key={category.id} className={activeCategory === category.id ? "active" : ""} onClick={() => setActiveCategory(category.id)}><span className="tab-icon">{category.icon}</span>{category.label}{settings.showRowCounts && <em>{count}</em>}</button>; })}</nav>{applyNotice && <div className="apply-notice">{applyNotice}</div>}<div className="finding-list">{visibleFindings.length ? visibleFindings.map((finding) => <FindingRow key={finding.id} finding={finding} selected={selected.has(finding.id)} onToggle={(event) => toggleSelected(finding.id, event)} onSelect={() => send({ type: "SELECT_NODE", nodeId: finding.nodeId })} onPreview={(id) => preview(finding, id)} onApply={() => applyOne(finding.id)} onClearPreview={() => send({ type: "CLEAR_PREVIEW" })} />) : <EmptyState category={categories.find((category) => category.id === activeCategory)?.label ?? activeCategory} matched={Boolean(result)} />}</div></section></>}
    {!result && <EmptyState category="your design" matched={false} />}
  </main>;
}
