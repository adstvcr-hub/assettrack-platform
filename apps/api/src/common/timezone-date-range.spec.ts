import { describe, expect, it } from "vitest";
import {
  getTimezoneOffsetMinutes,
  getUtcDateRangeForLocalDate,
  normalizeTimezone,
} from "./timezone-date-range";

describe("normalizeTimezone", () => {
  it("keeps a valid timezone", () => {
    expect(normalizeTimezone("America/Costa_Rica")).toBe("America/Costa_Rica");
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(normalizeTimezone("ABC")).toBe("UTC");
  });

  it("falls back to UTC when timezone is missing", () => {
    expect(normalizeTimezone()).toBe("UTC");
  });
});

describe("getUtcDateRangeForLocalDate", () => {
  it("converts a Costa Rica local day to UTC", () => {
    const range = getUtcDateRangeForLocalDate(
      "2026-09-13",
      "America/Costa_Rica",
    );

    expect(range.start.toISOString()).toBe("2026-09-13T06:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-14T06:00:00.000Z");
  });

  it("keeps UTC dates aligned with UTC midnight", () => {
    const range = getUtcDateRangeForLocalDate("2026-09-13", "UTC");

    expect(range.start.toISOString()).toBe("2026-09-13T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });

  it("handles a positive UTC offset timezone", () => {
    const range = getUtcDateRangeForLocalDate("2026-09-13", "Asia/Tokyo");

    expect(range.start.toISOString()).toBe("2026-09-12T15:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-13T15:00:00.000Z");
  });

  it("handles the spring DST transition", () => {
    const range = getUtcDateRangeForLocalDate("2026-03-08", "America/New_York");

    expect(range.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");

    expect(range.end.getTime() - range.start.getTime()).toBe(
      23 * 60 * 60 * 1000,
    );
  });

  it("handles the fall DST transition", () => {
    const range = getUtcDateRangeForLocalDate("2026-11-01", "America/New_York");

    expect(range.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");

    expect(range.end.getTime() - range.start.getTime()).toBe(
      25 * 60 * 60 * 1000,
    );
  });

  it("uses UTC when an invalid timezone is provided", () => {
    const range = getUtcDateRangeForLocalDate("2026-09-13", "INVALID_ZONE");

    expect(range.timezone).toBe("UTC");
    expect(range.start.toISOString()).toBe("2026-09-13T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });
});
describe("getTimezoneOffsetMinutes", () => {
  it("returns Costa Rica offset", () => {
    const date = new Date("2026-09-13T12:00:00.000Z");

    expect(getTimezoneOffsetMinutes(date, "America/Costa_Rica")).toBe(360);
  });

  it("handles New York daylight saving time", () => {
    expect(
      getTimezoneOffsetMinutes(
        new Date("2026-07-01T12:00:00.000Z"),
        "America/New_York",
      ),
    ).toBe(240);

    expect(
      getTimezoneOffsetMinutes(
        new Date("2026-01-01T12:00:00.000Z"),
        "America/New_York",
      ),
    ).toBe(300);
  });

  it("returns a negative offset for Tokyo", () => {
    const date = new Date("2026-09-13T12:00:00.000Z");

    expect(getTimezoneOffsetMinutes(date, "Asia/Tokyo")).toBe(-540);
  });
});
