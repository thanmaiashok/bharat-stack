import { describe, expect, it } from "vitest";
import {
  BharatInputError,
  compareDates,
  daysInMonth,
  formatIndianDate,
  fyOf,
  isInFY,
  isLeapYear,
  parseFY,
  parseIndianDate,
  quarterOf,
  toCalendarDate,
  toISODate,
} from "../src/index.js";

describe("dates", () => {
  it("parses Indian and ISO formats", () => {
    expect(parseIndianDate("04-11-2026")).toEqual({ year: 2026, month: 11, day: 4 });
    expect(parseIndianDate("4/1/2026")).toEqual({ year: 2026, month: 1, day: 4 });
    expect(parseIndianDate("31.03.2027")).toEqual({ year: 2027, month: 3, day: 31 });
    expect(parseIndianDate(" 2026-11-04 ")).toEqual({ year: 2026, month: 11, day: 4 });
  });

  it.each(["31-04-2026", "29-02-2026", "2026/11/04", "11-2026", "00-01-2026", "01-13-2026"])(
    "rejects %s",
    (bad) => {
      expect(() => parseIndianDate(bad)).toThrow(BharatInputError);
    },
  );

  it("handles leap years", () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(parseIndianDate("29-02-2028").day).toBe(29);
  });

  it("reads Date objects in IST", () => {
    // 2026-03-31 20:00 UTC is already 1 April 01:30 in India.
    expect(toCalendarDate(new Date("2026-03-31T20:00:00Z"))).toEqual({
      year: 2026,
      month: 4,
      day: 1,
    });
    expect(() => toCalendarDate(new Date("nope"))).toThrow(BharatInputError);
  });

  it("formats and compares", () => {
    expect(formatIndianDate("2026-11-04")).toBe("04-11-2026");
    expect(formatIndianDate({ year: 2026, month: 1, day: 9 }, "/")).toBe("09/01/2026");
    expect(toISODate("04-11-2026")).toBe("2026-11-04");
    expect(compareDates("01-04-2026", "31-03-2026")).toBeGreaterThan(0);
    expect(compareDates("01-04-2026", "2026-04-01")).toBe(0);
    expect(() => toCalendarDate({ year: 2026, month: 2, day: 30 })).toThrow(BharatInputError);
  });
});

describe("financial year", () => {
  it.each([
    ["01-04-2026", "2026-27"],
    ["31-03-2027", "2026-27"],
    ["15-03-2026", "2025-26"],
    ["31-12-2099", "2099-00"],
  ])("fyOf(%s) = %s", (d, fy) => {
    expect(fyOf(d)).toBe(fy);
  });

  it("parses FY labels", () => {
    expect(parseFY("2026-27")).toEqual({
      label: "2026-27",
      startYear: 2026,
      start: "2026-04-01",
      end: "2027-03-31",
    });
    expect(parseFY("FY 2026-2027").label).toBe("2026-27");
    expect(parseFY(2025).label).toBe("2025-26");
    expect(() => parseFY("2026-28")).toThrow(BharatInputError);
    expect(() => parseFY("26-27")).toThrow(BharatInputError);
    expect(() => parseFY(1800)).toThrow(BharatInputError);
    expect(isInFY("10-10-2026", "2026-27")).toBe(true);
    expect(isInFY("10-10-2026", "2025-26")).toBe(false);
  });

  it.each([
    ["01-04-2026", 1, [4, 5, 6]],
    ["30-09-2026", 2, [7, 8, 9]],
    ["04-11-2026", 3, [10, 11, 12]],
    ["31-03-2027", 4, [1, 2, 3]],
  ] as const)("quarterOf(%s) = Q%s", (d, q, months) => {
    const r = quarterOf(d);
    expect(r.quarter).toBe(q);
    expect(r.label).toBe(`Q${q}`);
    expect(r.months).toEqual(months);
    expect(r.fy).toBe("2026-27");
  });
});
