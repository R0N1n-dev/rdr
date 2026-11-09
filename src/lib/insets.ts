/** True when the WebView reaches the physical screen edges on both axes. */
export function isEdgeToEdge(w: number, h: number, screenW: number, screenH: number): boolean {
  // Screen reports the display in CSS px; use the edge that is vertical now.
  const full = w > h ? Math.min(screenW, screenH) : Math.max(screenW, screenH)
  return h >= full - 8
}
