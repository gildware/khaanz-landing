/** Simple local-time open check: 11:00–23:00 */
export function isRestaurantOpen(now: Date = new Date()): boolean {
  const h = now.getHours();
  const m = now.getMinutes();
  const minutes = h * 60 + m;
  const open = 11 * 60;
  const close = 23 * 60;
  return minutes >= open && minutes < close;
}

export function getEstimatedDeliveryMinutes(): number {
  return 35;
}
