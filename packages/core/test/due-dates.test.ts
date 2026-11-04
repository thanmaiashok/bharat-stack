import { describe, expect, it } from "vitest";
import { BharatInputError, gstReturnDueDates, TAX_DISCLAIMER } from "../src/index.js";

const forms = (r: ReturnType<typeof gstReturnDueDates>) =>
  r.dueDates.map((d) => `${d.form}@${d.dueDate}`);

describe("gstReturnDueDates", () => {
  it("monthly filer: GSTR-1 on the 11th, GSTR-3B on the 20th", () => {
    const r = gstReturnDueDates({ period: "2026-10" });
    expect(forms(r)).toEqual(["GSTR-1@2026-11-11", "GSTR-3B@2026-11-20"]);
    expect(r.dueDates[0]?.dueDateIndian).toBe("11-11-2026");
    expect(r.disclaimer).toBe(TAX_DISCLAIMER);
  });

  it("rolls December into the next year", () => {
    expect(forms(gstReturnDueDates({ period: "2026-12" }))).toEqual([
      "GSTR-1@2027-01-11",
      "GSTR-3B@2027-01-20",
    ]);
  });

  it("QRMP month 1/2: IFF and PMT-06", () => {
    const r = gstReturnDueDates({ period: "2026-10", scheme: "qrmp", stateCode: "29" });
    expect(forms(r)).toEqual(["IFF@2026-11-13", "PMT-06@2026-11-25"]);
  });

  it("QRMP quarter end: GSTR-3B on the 22nd or 24th depending on state", () => {
    const ka = gstReturnDueDates({ period: "2026-12", scheme: "qrmp", stateCode: "29" });
    expect(forms(ka)).toEqual(["GSTR-1@2027-01-13", "GSTR-3B@2027-01-22"]);
    expect(ka.dueDates[0]?.period).toBe("2026-27 Q3");
    const dl = gstReturnDueDates({ period: "2027-03", scheme: "qrmp", stateCode: "7" });
    expect(forms(dl)).toEqual(["GSTR-1@2027-04-13", "GSTR-3B@2027-04-24"]);
  });

  it("asks for a state when QRMP GSTR-3B depends on it", () => {
    const r = gstReturnDueDates({ period: "2026-06", scheme: "qrmp" });
    expect(r.warnings.map((w) => w.code)).toContain("STATE_REQUIRED");
    const bad = gstReturnDueDates({ period: "2026-06", scheme: "qrmp", stateCode: "88" });
    expect(bad.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["STATE_UNKNOWN", "STATE_REQUIRED"]),
    );
  });

  it("flags unverified data", () => {
    expect(gstReturnDueDates({ period: "2026-10" }).warnings.map((w) => w.code)).toContain(
      "DATA_UNVERIFIED",
    );
  });

  it.each(["2026-13", "10-2026", "2026/10"])("rejects period %s", (p) => {
    expect(() => gstReturnDueDates({ period: p })).toThrow(BharatInputError);
  });
});
