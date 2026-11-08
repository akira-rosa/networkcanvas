// Imperative handle to the live canvas, used by toolbar buttons and shortcuts.
export const canvasApi = {
  fit: () => {},
  zoomBy: (_f: number) => {},
  zoomTo: (_z: number) => {},
  center: (): { x: number; y: number } => ({ x: 0, y: 0 }),
  editLabel: (_id: string) => {},
  /** pan (and zoom out if needed) so these nodes/links are visible */
  reveal: (_ids: string[]) => {},
  /** zoom to fit the given ids (or the selection) */
  fitTo: (_ids: string[]) => {},
};
