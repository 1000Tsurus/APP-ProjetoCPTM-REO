// Do not take over vertical scrolling, taps, or leftward movements in a panel.
export function isDismissDrag(dx: number, dy: number): boolean {
  return dx > 14 && dx > Math.abs(dy) * 1.5;
}

export function shouldDismiss(dx: number, velocityX: number, width: number): boolean {
  return dx > width * 0.3 || (dx > 32 && velocityX > 0.65);
}
