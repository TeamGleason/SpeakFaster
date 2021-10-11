/** Utilities related to date and time. */

export function secondsBeforeNow(seconds: number): Date {
  const now = new Date().getTime();
  return new Date(now - seconds * 1e3);
}

export function getAgoString(
    referenceTimestamp: Date, timestamp: Date): string {
  const diffSeconds = Math.round(
      Math.max(0, timestamp.getTime() - referenceTimestamp.getTime()) / 1e3);
  if (diffSeconds >= 60) {
    return `${Math.round(diffSeconds / 60)}m`;
  } else {
    return `${diffSeconds}s`;
  }
}
