const TIME_RE = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/;

export function parseHhMmToMinutes(value: string | null | undefined): number | null {
  if (value == null || !String(value).trim()) return null;
  const match = String(value).trim().match(TIME_RE);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23) return null;
  return hours * 60 + minutes;
}

export function isWithinLoginWindow(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  date: Date = new Date(),
): boolean {
  const startMinutes = parseHhMmToMinutes(startTime);
  const endMinutes = parseHhMmToMinutes(endTime);
  if (startMinutes == null || endMinutes == null) return true;
  if (startMinutes === endMinutes) return false;

  const nowMinutes = pakistanMinutesNow(date);
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export function pakistanMinutesNow(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hourRaw = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const hour = hourRaw === 24 ? 0 : hourRaw;
  return hour * 60 + minute;
}

export function msUntilLoginWindowEnd(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  date: Date = new Date(),
): number | null {
  const startMinutes = parseHhMmToMinutes(startTime);
  const endMinutes = parseHhMmToMinutes(endTime);
  if (startMinutes == null || endMinutes == null) return null;
  if (!isWithinLoginWindow(startTime, endTime, date)) return 0;

  const nowMinutes = pakistanMinutesNow(date);
  const seconds = date.getSeconds();
  const ms = date.getMilliseconds();
  const elapsedInMinute = seconds * 1000 + ms;
  const minutesUntilEnd =
    endMinutes > nowMinutes
      ? endMinutes - nowMinutes
      : 24 * 60 - nowMinutes + endMinutes;
  return Math.max(0, minutesUntilEnd * 60 * 1000 - elapsedInMinute);
}
