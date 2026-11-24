// Pure date helpers on ISO `YYYY-MM-DD` strings. No clock access.

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parts(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y as number, m as number, d as number];
}

/** Completed years between `birth` and `on`. Negative when `on` is before `birth`. */
export function completedYears(birth: string, on: string): number {
  const [by, bm, bd] = parts(birth);
  const [oy, om, od] = parts(on);
  let years = oy - by;
  if (om < bm || (om === bm && od < bd)) years -= 1;
  return years;
}

/**
 * True when `on` is on or before the first March 31 that falls on or after the
 * `age`-th birthday of `birth` (the school-year end after reaching that age).
 * Callers must exclude April 1 birthdays: the legal "day of attaining age" is the day
 * before the birthday, which changes the result for that date only.
 */
export function throughMarch31After(birth: string, on: string, age: number): boolean {
  const [by, bm] = parts(birth);
  const target = by + age;
  const endYear = bm <= 3 ? target : target + 1;
  return on <= `${String(endYear).padStart(4, "0")}-03-31`;
}

/** `MM-DD` of an ISO date. */
export function monthDay(s: string): string {
  return s.slice(5);
}
