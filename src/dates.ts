export function isRideDateTimePast(date: string, time: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const rideAt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return rideAt.getTime() < Date.now();
}

/** Hourly slot has ended when start + 1 hour <= now. */
export function isHourSlotPast(date: string, time: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const [hh] = time.split(':').map(Number);
  const slotEnd = new Date(y, m - 1, d, hh + 1, 0, 0, 0);
  return slotEnd.getTime() <= Date.now();
}
