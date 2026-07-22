const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Validate and return YYYY-MM-DD for DB storage and search. */
export function normalizeRideDate(iso: string): string {
  if (!ISO_DATE.test(iso)) {
    throw new Error('Invalid ride date');
  }
  return iso;
}

/** API serialization for ride.date (string or legacy Date from old rows). */
export function formatRideDate(date: string | Date): string {
  if (typeof date === 'string') {
    return date.slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

/** Local wall-clock datetime for reminders and slot checks. */
export function parseRideDateTime(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
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
