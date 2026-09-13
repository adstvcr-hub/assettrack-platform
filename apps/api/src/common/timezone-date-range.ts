export function normalizeTimezone(timezone?: string) {
  const candidate = timezone || "UTC";

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: candidate,
    }).format();

    return candidate;
  } catch {
    return "UTC";
  }
}

export function getUtcForLocalTime(
  localDate: string,
  timezone?: string,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
) {
  const effectiveTimezone = normalizeTimezone(timezone);

  const [year, month, day] = localDate.split("-").map(Number);

  const utcGuess = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond),
  );

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: effectiveTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utcGuess);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const interpretedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  const offset = interpretedAsUtc - utcGuess.getTime();

  return new Date(utcGuess.getTime() - offset);
}

export function getUtcDateRangeForLocalDate(
  localDate: string,
  timezone?: string,
) {
  const effectiveTimezone = normalizeTimezone(timezone);

  const start = getUtcForLocalTime(localDate, effectiveTimezone);

  const nextDay = new Date(`${localDate}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const nextDayString = nextDay.toISOString().slice(0, 10);

  const end = getUtcForLocalTime(nextDayString, effectiveTimezone);

  return {
    start,
    end,
    timezone: effectiveTimezone,
  };
}
export function getTimezoneOffsetMinutes(date: Date, timezone?: string) {
  const effectiveTimezone = normalizeTimezone(timezone);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: effectiveTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return Math.round((date.getTime() - localAsUtc) / 60000);
}
