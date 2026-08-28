import { format, isValid, parse } from "date-fns";

/**
 * Gets the current date in Pakistan timezone (Asia/Karachi) in YYYY-MM-DD format
 * This ensures the date is correct regardless of the user's local timezone
 * @returns string - Current date in YYYY-MM-DD format (Pakistan timezone)
 */
export function getCurrentDatePakistan(): string {
  try {
    const now = new Date();
    
    // Method 1: Try Intl.DateTimeFormat with en-CA locale (returns YYYY-MM-DD)
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const formatted = formatter.format(now);
        if (formatted && /^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
          return formatted;
        }
      } catch (e) {
        // Fall through to next method
      }
    }
    
    // Method 2: Use toLocaleString to get Pakistan time, then parse
    try {
      const pakistanStr = now.toLocaleString('en-US', { 
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      // Parse the string (format: "MM/DD/YYYY" or "M/D/YYYY")
      const parts = pakistanStr.split(/[/-]/);
      if (parts.length === 3) {
        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      // Fall through to next method
    }
    
    // Method 3: Calculate Pakistan time offset (UTC+5)
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const pakistanOffset = 5 * 60 * 60000; // UTC+5 in milliseconds
    const pakistanTime = new Date(utc + pakistanOffset);
    const year = pakistanTime.getUTCFullYear();
    const month = String(pakistanTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(pakistanTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) {
    // Ultimate fallback: use local date
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Gets the start of the current month in Pakistan timezone (Asia/Karachi) in YYYY-MM-DD format
 * @returns string - First day of current month in YYYY-MM-DD format (Pakistan timezone)
 */
export function getStartOfCurrentMonthPakistan(): string {
  try {
    const now = new Date();
    
    // Method 1: Try Intl.DateTimeFormat
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const formatted = formatter.format(now);
        if (formatted && /^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
          // Extract year and month, set day to 01
          const [year, month] = formatted.split('-');
          return `${year}-${month}-01`;
        }
      } catch (e) {
        // Fall through to next method
      }
    }
    
    // Method 2: Calculate Pakistan time offset (UTC+5)
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const pakistanOffset = 5 * 60 * 60000; // UTC+5 in milliseconds
    const pakistanTime = new Date(utc + pakistanOffset);
    const year = pakistanTime.getUTCFullYear();
    const month = String(pakistanTime.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  } catch (error) {
    // Fallback: use local date
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }
}

/** Standard display format for date inputs across the app */
export const UI_DATE_FORMAT = "MM-dd-yyyy";
export const UI_DATE_PLACEHOLDER = "MM-DD-YYYY";

/** Default year range for calendar pickers */
export const CALENDAR_FROM_YEAR = 1990;
export const CALENDAR_TO_YEAR = new Date().getFullYear() + 5;

/**
 * Formats a date string to YYYY-MM-DD format (API / storage)
 * @param date - Date string or Date object
 * @returns string - Formatted date in YYYY-MM-DD format
 */
export function formatDateYYYYMMDD(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (!isValid(dateObj)) return "";
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date for UI display (MM-dd-yyyy)
 */
export function formatUiDate(
  date: string | Date | undefined | null,
): string {
  if (date == null || date === "") return "";
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (!isValid(dateObj)) return "";
  return format(dateObj, UI_DATE_FORMAT);
}

/**
 * Parses a UI display date string (MM-dd-yyyy) to Date
 */
export function parseUiDate(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = parse(trimmed, UI_DATE_FORMAT, new Date());
  return isValid(parsed) ? parsed : undefined;
}

/**
 * Parse common display / legacy date strings to YYYY-MM-DD (API format).
 */
export function parseFlexibleDateToISO(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const uiParsed = parseUiDate(trimmed);
  if (uiParsed) return formatDateYYYYMMDD(uiParsed);

  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const [month, day, year] = trimmed.split("-");
    return `${year}-${month}-${day}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [month, day, year] = trimmed.split("/");
    return `${year}-${month}-${day}`;
  }

  const fallback = new Date(trimmed);
  return isValid(fallback) ? formatDateYYYYMMDD(fallback) : undefined;
}

/** Pakistan financial year: 1 July – 30 June */
export function getPakistanFinancialYearStartYear(
  asOfDate: string = getCurrentDatePakistan(),
): number {
  const [year, month] = asOfDate.split('-').map(Number);
  return month >= 7 ? year : year - 1;
}

export function getPakistanFinancialYearRange(options?: {
  fyStartYear?: number;
  throughToday?: boolean;
}): { from: string; to: string; label: string } {
  const today = getCurrentDatePakistan();
  const fyStartYear =
    options?.fyStartYear ?? getPakistanFinancialYearStartYear(today);
  const fyEndYear = fyStartYear + 1;
  const from = `${fyStartYear}-07-01`;
  const fyEnd = `${fyEndYear}-06-30`;
  const throughToday = options?.throughToday !== false;
  const to = throughToday && today < fyEnd ? today : fyEnd;
  const label = `FY ${fyStartYear}-${String(fyEndYear).slice(-2)} (1 Jul ${fyStartYear} – ${to})`;
  return { from, to, label };
}

export function getCurrentPakistanFinancialYearRange() {
  return getPakistanFinancialYearRange({ throughToday: true });
}

export function getPreviousPakistanFinancialYearRange() {
  const currentStart = getPakistanFinancialYearStartYear();
  return getPakistanFinancialYearRange({
    fyStartYear: currentStart - 1,
    throughToday: false,
  });
}

export function isDateInPakistanFinancialYear(
  dateStr: string | undefined | null,
  fyStartYear: number,
): boolean {
  if (!dateStr || !Number.isFinite(fyStartYear)) return false;
  const d = String(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const from = `${fyStartYear}-07-01`;
  const to = `${fyStartYear + 1}-06-30`;
  return d >= from && d <= to;
}

export function buildPakistanFinancialYearOptions(yearsBack = 12): Array<{
  value: string;
  label: string;
}> {
  const currentStart = getPakistanFinancialYearStartYear();
  const options: Array<{ value: string; label: string }> = [];
  for (let y = currentStart; y >= currentStart - yearsBack; y--) {
    options.push({
      value: String(y),
      label: `FY ${y}-${String(y + 1).slice(-2)}`,
    });
  }
  return options;
}

