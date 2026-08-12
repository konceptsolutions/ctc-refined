import { Prisma } from "@prisma/client";
import prisma from "../config/database";

const TIME_RE = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/;
const WEEKDAY_SET = new Set([0, 1, 2, 3, 4, 5, 6]);
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

export function normalizeLoginTime(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") return null;
  const minutes = parseHhMmToMinutes(String(value));
  if (minutes == null) return undefined;
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
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

export function normalizeLoginDays(
  value: unknown,
): number[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw.includes(",")
        ? raw.split(",").map((v) => v.trim())
        : [raw];
    }
  }
  if (!Array.isArray(parsed)) return undefined;
  const days: number[] = [];
  for (const item of parsed) {
    if (typeof item === "number" && Number.isInteger(item) && WEEKDAY_SET.has(item)) {
      days.push(item);
      continue;
    }
    if (typeof item === "string") {
      const t = item.trim().toLowerCase();
      if (t === "") continue;
      if (/^\d+$/.test(t)) {
        const n = Number(t);
        if (WEEKDAY_SET.has(n)) {
          days.push(n);
          continue;
        }
      }
      const mapped = WEEKDAY_MAP[t];
      if (mapped !== undefined) {
        days.push(mapped);
        continue;
      }
    }
    return undefined;
  }
  return [...new Set(days)].sort((a, b) => a - b);
}

export function serializeLoginDays(
  value: number[] | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.length === 0) return null;
  return JSON.stringify(value);
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

export function formatLoginWindowLabel(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string | null {
  const start = normalizeLoginTime(startTime ?? null);
  const end = normalizeLoginTime(endTime ?? null);
  if (!start || !end) return null;
  return `${start} – ${end}`;
}

export async function getLoginHoursMap(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) {
    return {} as Record<
      string,
      { loginStartTime: string | null; loginEndTime: string | null; loginAllowedDays: number[] | null }
    >;
  }
  const rows = await prisma.$queryRaw<
    Array<{ id: string; loginStartTime: string | null; loginEndTime: string | null; loginAllowedDays: string | null }>
  >`
    SELECT id, "loginStartTime", "loginEndTime", "loginAllowedDays"
    FROM "User"
    WHERE id IN (${Prisma.join(ids)})
  `;
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        loginStartTime: row.loginStartTime,
        loginEndTime: row.loginEndTime,
        loginAllowedDays: normalizeLoginDays(row.loginAllowedDays ?? null) ?? null,
      },
    ]),
  );
}

export async function getLoginHours(userId: string) {
  const rows = await prisma.$queryRaw<
    Array<{ loginStartTime: string | null; loginEndTime: string | null; loginAllowedDays: string | null }>
  >`
    SELECT "loginStartTime", "loginEndTime", "loginAllowedDays"
    FROM "User"
    WHERE id = ${userId}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    loginStartTime: rows[0].loginStartTime,
    loginEndTime: rows[0].loginEndTime,
    loginAllowedDays: normalizeLoginDays(rows[0].loginAllowedDays ?? null) ?? null,
  };
}

export async function setLoginHours(
  userId: string,
  loginStartTime: string | null,
  loginEndTime: string | null,
  loginAllowedDays?: number[] | null,
) {
  if (loginAllowedDays === undefined) {
    await prisma.$executeRaw`
      UPDATE "User"
      SET "loginStartTime" = ${loginStartTime},
          "loginEndTime" = ${loginEndTime},
          "updatedAt" = NOW()
      WHERE id = ${userId}
    `;
    return;
  }
  const daysSerialized = serializeLoginDays(loginAllowedDays) ?? null;
  await prisma.$executeRaw`
    UPDATE "User"
    SET "loginStartTime" = ${loginStartTime},
        "loginEndTime" = ${loginEndTime},
        "loginAllowedDays" = ${daysSerialized},
        "updatedAt" = NOW()
    WHERE id = ${userId}
  `;
}
