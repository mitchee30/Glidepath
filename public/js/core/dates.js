// Date helpers. All dates in the app are local calendar dates as "YYYY-MM-DD"
// strings, decided by the user's device. The server never guesses "today".

const DAY_MS = 86400000;

export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function toUTC(s) {
  return Date.parse(s + 'T00:00:00Z');
}

export function fromUTC(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(s, n) {
  return fromUTC(toUTC(s) + n * DAY_MS);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** 0 = Monday ... 6 = Sunday */
export function weekday(s) {
  return (new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7;
}

/** Local "today" on the device running this code. */
export function localToday(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
