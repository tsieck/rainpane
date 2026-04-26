import { describe, expect, it } from 'vitest';
import { mapWindowToDisplayMask, parseMacActiveWindowOutput } from './activeWindow.js';

describe('active window detection helpers', () => {
  it('parses macOS active window output', () => {
    expect(parseMacActiveWindowOutput('Safari\tSafari\tDocs\t20\t40\t900\t700\t42\tcore-graphics')).toEqual({
      appName: 'Safari',
      processName: 'Safari',
      title: 'Docs',
      x: 20,
      y: 40,
      width: 900,
      height: 700,
      windowId: 42,
      source: 'core-graphics',
    });
  });

  it('returns null when macOS output has no window bounds', () => {
    expect(parseMacActiveWindowOutput('Finder\tFinder\t\t\t\t\t')).toBeNull();
  });

  it('maps screen bounds into overlay-local display coordinates', () => {
    expect(
      mapWindowToDisplayMask(
        { x: 120, y: 80, width: 400, height: 300 },
        { x: 100, y: 50, width: 1000, height: 800 },
      ),
    ).toEqual({ x: 20, y: 30, width: 400, height: 300 });
  });

  it('clips masks to the overlay display bounds', () => {
    expect(
      mapWindowToDisplayMask(
        { x: 50, y: 20, width: 200, height: 120 },
        { x: 100, y: 50, width: 1000, height: 800 },
      ),
    ).toEqual({ x: 0, y: 0, width: 150, height: 90 });
  });

  it('trims CoreGraphics shadow bounds before mapping', () => {
    expect(
      mapWindowToDisplayMask(
        { x: 120, y: 80, width: 400, height: 300, source: 'core-graphics' },
        { x: 100, y: 50, width: 1000, height: 800 },
      ),
    ).toEqual({ x: 20, y: 6, width: 400, height: 300 });
  });

  it('ignores windows outside the overlay display', () => {
    expect(
      mapWindowToDisplayMask(
        { x: -500, y: 20, width: 200, height: 120 },
        { x: 100, y: 50, width: 1000, height: 800 },
      ),
    ).toBeNull();
  });
});
