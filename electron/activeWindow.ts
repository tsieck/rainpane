import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAC_HELPER_DIR = path.join(os.tmpdir(), 'rainpane');
const MAC_HELPER_MODULE_CACHE = path.join(MAC_HELPER_DIR, 'clang-module-cache');
const MAC_HELPER_SOURCE = path.join(MAC_HELPER_DIR, 'active-window-macos.swift');
const MAC_HELPER_BINARY = path.join(MAC_HELPER_DIR, 'active-window-macos');
const CORE_GRAPHICS_SHADOW_INSET = 0;
const CORE_GRAPHICS_VERTICAL_OFFSET = -24;
let macHelperCompilePromise: Promise<string | null> | null = null;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowBounds extends Rect {
  title?: string;
  appName?: string;
  processName?: string;
  windowId?: number;
  source?: 'accessibility' | 'core-graphics' | 'win32';
}

export interface ActiveWindowState {
  bounds: WindowBounds | null;
  mask: Rect | null;
  error?: string;
  isMoving?: boolean;
}

const MAC_ACTIVE_WINDOW_SCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set processName to appName
  set windowTitle to ""

  set frontWindow to missing value
  try
    set frontWindow to value of attribute "AXFocusedWindow" of frontApp
  end try

  if frontWindow is missing value then
    try
      repeat with candidateWindow in windows of frontApp
        try
          if value of attribute "AXFocused" of candidateWindow is true then
            set frontWindow to candidateWindow
            exit repeat
          end if
        end try
      end repeat
    end try
  end if

  if frontWindow is missing value then
    try
      set frontWindow to value of attribute "AXMainWindow" of frontApp
    end try
  end if

  if frontWindow is missing value then
    try
      repeat with candidateWindow in windows of frontApp
        try
          if value of attribute "AXMinimized" of candidateWindow is false then
            set frontWindow to candidateWindow
            exit repeat
          end if
        end try
      end repeat
    end try
  end if

  if frontWindow is missing value then
    try
      set frontWindow to first window of frontApp
    end try
  end if

  if frontWindow is missing value then
    return appName & tab & processName & tab & windowTitle & tab & "" & tab & "" & tab & "" & tab & ""
  end if

  try
    set windowTitle to value of attribute "AXTitle" of frontWindow
  end try

  try
    if windowTitle is "" then set windowTitle to name of frontWindow
  end try

  try
    set windowPosition to value of attribute "AXPosition" of frontWindow
    set windowSize to value of attribute "AXSize" of frontWindow
  on error
    set windowPosition to position of frontWindow
    set windowSize to size of frontWindow
  end try

  set windowX to item 1 of windowPosition as integer
  set windowY to item 2 of windowPosition as integer
  set windowWidth to item 1 of windowSize as integer
  set windowHeight to item 2 of windowSize as integer
  return appName & tab & processName & tab & windowTitle & tab & windowX & tab & windowY & tab & windowWidth & tab & windowHeight & tab & "" & tab & "accessibility"
end tell
`;

const MAC_CORE_GRAPHICS_HELPER_SOURCE = `
import AppKit
import CoreGraphics
import Foundation

func field(_ value: String?) -> String {
  return (value ?? "").replacingOccurrences(of: "\\t", with: " ").replacingOccurrences(of: "\\n", with: " ")
}

guard let app = NSWorkspace.shared.frontmostApplication else {
  print("\\t\\t\\t\\t\\t\\t")
  exit(0)
}

let pid = app.processIdentifier
let appName = field(app.localizedName ?? app.bundleIdentifier)
let processName = field(app.localizedName ?? app.bundleIdentifier)
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]

guard let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
  print("\\(appName)\\t\\(processName)\\t\\t\\t\\t\\t")
  exit(0)
}

for window in windows {
  guard let ownerPID = window[kCGWindowOwnerPID as String] as? pid_t, ownerPID == pid else {
    continue
  }

  let layer = window[kCGWindowLayer as String] as? Int ?? 0
  guard layer == 0 else {
    continue
  }

  let alpha = window[kCGWindowAlpha as String] as? Double ?? 1
  guard alpha > 0 else {
    continue
  }

  guard let boundsDict = window[kCGWindowBounds as String] as? NSDictionary,
        let bounds = CGRect(dictionaryRepresentation: boundsDict) else {
    continue
  }

  guard bounds.width > 80, bounds.height > 80 else {
    continue
  }

  let title = field(window[kCGWindowName as String] as? String)
  let windowId = window[kCGWindowNumber as String] as? Int ?? 0
  print("\\(appName)\\t\\(processName)\\t\\(title)\\t\\(Int(bounds.origin.x))\\t\\(Int(bounds.origin.y))\\t\\(Int(bounds.width))\\t\\(Int(bounds.height))\\t\\(windowId)\\tcore-graphics")
  exit(0)
}

print("\\(appName)\\t\\(processName)\\t\\t\\t\\t\\t")
`;

const WINDOWS_ACTIVE_WINDOW_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class RainpaneWinApi {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

$hwnd = [RainpaneWinApi]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) {
  exit 0
}

$rect = New-Object RainpaneWinApi+RECT
if (-not [RainpaneWinApi]::GetWindowRect($hwnd, [ref]$rect)) {
  exit 0
}

$processId = 0
[RainpaneWinApi]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
$titleBuilder = New-Object System.Text.StringBuilder 512
[RainpaneWinApi]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null

$processName = ""
try {
  $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName
} catch {}

[PSCustomObject]@{
  appName = $processName
  processName = $processName
  title = $titleBuilder.ToString()
  x = [int]$rect.Left
  y = [int]$rect.Top
  width = [int]($rect.Right - $rect.Left)
  height = [int]($rect.Bottom - $rect.Top)
  windowId = [int64]$hwnd
  source = "win32"
} | ConvertTo-Json -Compress
`;

function parseNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapWindowToDisplayMask(bounds: WindowBounds | null, displayBounds: Rect): Rect | null {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const shadowInset = bounds.source === 'core-graphics' ? CORE_GRAPHICS_SHADOW_INSET : 0;
  const sourceLeft = bounds.x + shadowInset;
  const verticalOffset = bounds.source === 'core-graphics' ? CORE_GRAPHICS_VERTICAL_OFFSET : 0;
  const sourceTop = bounds.y + shadowInset + verticalOffset;
  const sourceRight = bounds.x + bounds.width - shadowInset;
  const sourceBottom = bounds.y + bounds.height - shadowInset + verticalOffset;

  const left = Math.max(sourceLeft, displayBounds.x);
  const top = Math.max(sourceTop, displayBounds.y);
  const right = Math.min(sourceRight, displayBounds.x + displayBounds.width);
  const bottom = Math.min(sourceBottom, displayBounds.y + displayBounds.height);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    x: left - displayBounds.x,
    y: top - displayBounds.y,
    width: right - left,
    height: bottom - top,
  };
}

export function parseMacActiveWindowOutput(output: string): WindowBounds | null {
  const fields = output.trim().split('\t');
  const [appName, processName, title, xValue, yValue, widthValue, heightValue] = fields;
  const maybeWindowId = fields.length >= 9 ? fields[7] : undefined;
  const sourceValue = fields.length >= 9 ? fields[8] : fields[7];
  const x = parseNumber(xValue);
  const y = parseNumber(yValue);
  const width = parseNumber(widthValue);
  const height = parseNumber(heightValue);
  const windowId = maybeWindowId ? parseNumber(maybeWindowId) : null;

  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }

  return {
    x,
    y,
    width,
    height,
    title: title || undefined,
    appName: appName || undefined,
    processName: processName || appName || undefined,
    windowId: windowId ?? undefined,
    source: sourceValue === 'core-graphics' || sourceValue === 'accessibility' ? sourceValue : undefined,
  };
}

export function parseWindowsActiveWindowOutput(output: string): WindowBounds | null {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Partial<WindowBounds>;
  const x = parseNumber(String(candidate.x));
  const y = parseNumber(String(candidate.y));
  const width = parseNumber(String(candidate.width));
  const height = parseNumber(String(candidate.height));
  const windowId = candidate.windowId === undefined ? null : parseNumber(String(candidate.windowId));

  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }

  return {
    x,
    y,
    width,
    height,
    title: typeof candidate.title === 'string' && candidate.title ? candidate.title : undefined,
    appName: typeof candidate.appName === 'string' && candidate.appName ? candidate.appName : undefined,
    processName:
      typeof candidate.processName === 'string' && candidate.processName
        ? candidate.processName
        : typeof candidate.appName === 'string' && candidate.appName
          ? candidate.appName
          : undefined,
    windowId: windowId ?? undefined,
    source: 'win32',
  };
}

async function compileMacCoreGraphicsHelper(): Promise<string | null> {
  if (macHelperCompilePromise) {
    return macHelperCompilePromise;
  }

  macHelperCompilePromise = (async () => {
    try {
      await mkdir(MAC_HELPER_DIR, { recursive: true });
      await mkdir(MAC_HELPER_MODULE_CACHE, { recursive: true });
      await writeFile(MAC_HELPER_SOURCE, MAC_CORE_GRAPHICS_HELPER_SOURCE);
      await execFileAsync('swiftc', [MAC_HELPER_SOURCE, '-o', MAC_HELPER_BINARY], {
        timeout: 10000,
        maxBuffer: 64 * 1024,
        env: {
          ...process.env,
          CLANG_MODULE_CACHE_PATH: MAC_HELPER_MODULE_CACHE,
        },
      });
      return MAC_HELPER_BINARY;
    } catch {
      return null;
    }
  })();

  return macHelperCompilePromise;
}

async function getMacCoreGraphicsWindowBounds(): Promise<WindowBounds | null> {
  const helperPath = await compileMacCoreGraphicsHelper();
  if (!helperPath) {
    return null;
  }

  const { stdout } = await execFileAsync(helperPath, [], {
    timeout: 1000,
    maxBuffer: 8 * 1024,
  });

  return parseMacActiveWindowOutput(stdout);
}

async function getMacAccessibilityWindowBounds(): Promise<WindowBounds | null> {
  const { stdout } = await execFileAsync('osascript', ['-e', MAC_ACTIVE_WINDOW_SCRIPT], {
    timeout: 1500,
    maxBuffer: 8 * 1024,
  });

  return parseMacActiveWindowOutput(stdout);
}

async function getMacActiveWindowBounds(): Promise<WindowBounds | null> {
  try {
    const coreGraphicsBounds = await getMacCoreGraphicsWindowBounds();
    if (coreGraphicsBounds) {
      return coreGraphicsBounds;
    }
  } catch {
    // Fall through to Accessibility. CoreGraphics can fail if Swift tooling is unavailable.
  }

  try {
    return await getMacAccessibilityWindowBounds();
  } catch {
    return null;
  }
}

async function getWindowsActiveWindowBounds(): Promise<WindowBounds | null> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_ACTIVE_WINDOW_SCRIPT],
    {
      timeout: 1200,
      maxBuffer: 16 * 1024,
      windowsHide: true,
    },
  );

  return parseWindowsActiveWindowOutput(stdout);
}

export async function getActiveWindowBounds(): Promise<WindowBounds | null> {
  if (process.platform === 'darwin') {
    return getMacActiveWindowBounds();
  }

  if (process.platform === 'win32') {
    return getWindowsActiveWindowBounds();
  }

  return null;
}
