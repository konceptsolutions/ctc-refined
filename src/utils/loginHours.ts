const TIME_RE = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/;
const WEEKDAY_MAP: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

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

export function normalizeLoginDays(value: unknown): number[] | null {
  if (value == null) return null;
  let parsed: unknown = value;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw.includes(",") ? raw.split(",").map((v) => v.trim()) : [raw];
    }
  }
  if (!Array.isArray(parsed)) return null;
  const out: number[] = [];
  for (const item of parsed) {
    if (typeof item === "number" && Number.isInteger(item) && item >= 0 && item <= 6) {
      out.push(item);
      continue;
    }
    if (typeof item === "string") {
      const t = item.trim().toLowerCase();
      if (/^\d+$/.test(t)) {
        const n = Number(t);
        if (n >= 0 && n <= 6) {
          out.push(n);
          continue;
        }
      }
      const mapped = WEEKDAY_MAP[t];
      if (mapped !== undefined) {
        out.push(mapped);
      }
    }
  }
  const unique = [...new Set(out)].sort((a, b) => a - b);
  return unique.length ? unique : null;
}

function pakistanWeekday(date: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    weekday: "short",
  })
    .format(date)
    .toLowerCase();
  return WEEKDAY_MAP[weekday] ?? date.getDay();
}

export function isWithinLoginSchedule(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  allowedDays: number[] | null | undefined,
  date: Date = new Date(),
): boolean {
  if (Array.isArray(allowedDays) && allowedDays.length > 0) {
    const day = pakistanWeekday(date);
    if (!allowedDays.includes(day)) return false;
  }
  return isWithinLoginWindow(startTime, endTime, date);
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
