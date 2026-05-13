export function toTimestamp(value?: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function isExpired(endDate?: string, nowMs = Date.now()): boolean {
  const ts = toTimestamp(endDate);
  if (ts === null) return false;
  return ts < nowMs;
}
