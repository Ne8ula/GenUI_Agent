export function cellGeometry(cellSizeCss: number, dpr: number) {
  const pitch = Math.max(1, Math.round(cellSizeCss * dpr));
  const fill = Math.max(1, Math.round(pitch * 0.82));
  return { pitch, fill, inset: Math.floor((pitch - fill) / 2) };
}

export function cellStart(positionCss: number, dpr: number, pitch: number, inset: number): number {
  return Math.round(positionCss * dpr / pitch) * pitch + inset;
}
