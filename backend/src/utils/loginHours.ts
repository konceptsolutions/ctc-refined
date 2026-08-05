import { Prisma } from "@prisma/client";
import prisma from "../config/database";

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
    return {} as Record<string, { loginStartTime: string | null; loginEndTime: string | null }>;
  }
  const rows = await prisma.$queryRaw<
    Array<{ id: string; loginStartTime: string | null; loginEndTime: string | null }>
  >`
    SELECT id, "loginStartTime", "loginEndTime"
    FROM "User"
    WHERE id IN (${Prisma.join(ids)})
  `;
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      { loginStartTime: row.loginStartTime, loginEndTime: row.loginEndTime },
    ]),
  );
}

export async function getLoginHours(userId: string) {
  const rows = await prisma.$queryRaw<
    Array<{ loginStartTime: string | null; loginEndTime: string | null }>
  >`
    SELECT "loginStartTime", "loginEndTime"
    FROM "User"
    WHERE id = ${userId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function setLoginHours(
  userId: string,
  loginStartTime: string | null,
  loginEndTime: string | null,
) {
  await prisma.$executeRaw`
    UPDATE "User"
    SET "loginStartTime" = ${loginStartTime},
        "loginEndTime" = ${loginEndTime},
        "updatedAt" = NOW()
    WHERE id = ${userId}
  `;
}
