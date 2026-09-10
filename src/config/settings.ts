import { DEFAULT_SETTINGS, type Settings } from "../shared/types";

const STORAGE_KEY = "lumi-lens.settings.v1";

export async function loadSettings(): Promise<Settings> {
  const saved = await figma.clientStorage.getAsync(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) } as Settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEY, settings);
}

export const settingsStorageKey = STORAGE_KEY;
