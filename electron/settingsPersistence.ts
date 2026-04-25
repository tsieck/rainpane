import { app } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS, validateSettings, type WeatherSettings } from './settings.js';

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

export async function loadSettings() {
  try {
    const raw = await readFile(settingsPath(), 'utf8');
    return validateSettings(JSON.parse(raw), DEFAULT_SETTINGS);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: WeatherSettings) {
  const filePath = settingsPath();
  const tempPath = `${filePath}.tmp`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}
