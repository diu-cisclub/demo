/**
 * The one place dates are formatted. Content stores ISO dates (2026-12-26);
 * everything shown to visitors goes through these helpers so the format stays
 * consistent. Dates are treated as calendar days in Bangladesh time.
 */
const TZ = 'Asia/Dhaka';
// en-GB gives day-first order; its 'Sept' is shortened to 'Sep' to match the other months.
const fmt = (opts: Intl.DateTimeFormatOptions) => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts });
  return { format: (d: Date) => f.format(d).replace('Sept', 'Sep') };
};

const dayMonthYear = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const dayMonth = fmt({ day: 'numeric', month: 'short' });
const monthYear = fmt({ month: 'short', year: 'numeric' });
const dayOnly = fmt({ day: 'numeric' });
const monthOnly = fmt({ month: 'short' });
const yearOnly = fmt({ year: 'numeric' });

interface Dated {
  date: Date;
  endDate?: Date | undefined;
  approximate?: boolean | undefined;
}

const sameMonth = (a: Date, b: Date) => monthYear.format(a) === monthYear.format(b);

/** "26 Dec 2026", "13–14 Nov 2026", "21 Jun – 27 Jul 2025" or "Dec 2025" when approximate. */
export function formatEventDate({ date, endDate, approximate }: Dated): string {
  if (approximate) return monthYear.format(date);
  if (!endDate || dayMonthYear.format(endDate) === dayMonthYear.format(date)) return dayMonthYear.format(date);
  if (sameMonth(date, endDate)) return `${dayOnly.format(date)}–${dayMonthYear.format(endDate)}`;
  return `${dayMonth.format(date)} – ${dayMonthYear.format(endDate)}`;
}

/** Split parts for big typographic date blocks. */
export function dateParts({ date, approximate }: Dated) {
  return {
    day: approximate ? '' : dayOnly.format(date),
    month: monthOnly.format(date),
    year: yearOnly.format(date),
  };
}

export const yearOf = (date: Date): number => Number(yearOnly.format(date));

/** ISO date for <time datetime>. */
export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** Today at midnight, Dhaka time. Pages are static, so this is the build day. */
export function today(): Date {
  return new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())}T00:00:00Z`);
}
