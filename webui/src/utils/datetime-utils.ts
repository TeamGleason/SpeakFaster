/** Utilities related to date and time. */

export function secondsBeforeNow(seconds: number): Date {
  const now = new Date().getTime();
  return new Date(now - seconds * 1e3);
}
