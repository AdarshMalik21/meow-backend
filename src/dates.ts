export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isRideDateTimePast(date: string, time: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const rideAt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return rideAt.getTime() < Date.now();
}

/** True when the hourly slot has already started today (exclude in-progress hour). */
export function isHourSlotTooSoon(date: string, time: string): boolean {
  if (date !== todayISO()) return false;
  const startHour = Number(time.split(':')[0]);
  return startHour <= new Date().getHours();
}

/** Hourly slot has ended when start + 1 hour <= now. */
export function isHourSlotPast(date: string, time: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const [hh] = time.split(':').map(Number);
  const slotEnd = new Date(y, m - 1, d, hh + 1, 0, 0, 0);
  return slotEnd.getTime() <= Date.now();
}
