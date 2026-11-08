export type ThemeName = 'dark' | 'light';

/** Colours used inside the diagram itself (also used for SVG/PNG export). */
export interface CanvasTheme {
  name: ThemeName;
  bg: string;
  grid: string;
  gridStrong: string;
  zoneFill: string;
  zoneStroke: string;
  fg: string; // default text + link colour
  muted: string;
  panelFill: string; // legend / table background
  cellFill: string;
  cellText: string;
  selection: string;
  portFill: string;
}

export const canvasThemes: Record<ThemeName, CanvasTheme> = {
  dark: {
    name: 'dark',
    bg: '#2b2b2b',
    grid: '#333333',
    gridStrong: '#3b3b3b',
    zoneFill: '#393939',
    zoneStroke: 'none',
    fg: '#ffffff',
    muted: '#c9c9c9',
    panelFill: '#393939',
    cellFill: '#4a4a4a',
    cellText: '#e9e9e9',
    selection: '#0d99ff',
    portFill: '#2b2b2b',
  },
  light: {
    name: 'light',
    bg: '#f3f4f6',
    grid: '#e4e6ea',
    gridStrong: '#d9dce2',
    zoneFill: '#ffffff',
    zoneStroke: '#dcdfe5',
    fg: '#1c2028',
    muted: '#4f5664',
    panelFill: '#ffffff',
    cellFill: '#eef0f3',
    cellText: '#2a2f39',
    selection: '#0d99ff',
    portFill: '#ffffff',
  },
};

export const FONT = `'Inter Variable', Inter, 'Segoe UI', system-ui, -apple-system, sans-serif`;

/** link colours when "colour links by media" is on (ethernet keeps the theme foreground) */
export const LINK_MEDIA_COLORS: Record<string, string | undefined> = {
  ethernet: undefined,
  fiber: '#f5a524',
  wireless: '#22c55e',
  wan: '#a855f7',
  vpn: '#14b8a6',
  serial: '#c084fc',
  profinet: '#2dd4bf',
  iolink: '#eab308',
  logical: '#9aa3b2',
};

export const MEDIA_COLORS: Record<string, string> = {
  any: '#9aa3b2',
  ethernet: '#1a8fd8',
  fiber: '#f5a524',
  sfp: '#f5a524',
  wireless: '#22c55e',
  serial: '#a855f7',
  usb: '#64748b',
  profinet: '#14b8a6',
  iolink: '#eab308',
  power: '#ef4444',
  console: '#a855f7',
};
