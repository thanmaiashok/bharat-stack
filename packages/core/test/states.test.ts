import { describe, expect, it } from "vitest";
import { findStateByName, getState, listStates, STATE_CODES_VERSION } from "../src/index.js";

describe("state codes", () => {
  it("includes the special and merged codes", () => {
    expect(getState("26")?.name).toBe("Dadra and Nagar Haveli and Daman and Diu");
    expect(getState("38")?.name).toBe("Ladakh");
    expect(getState("97")?.name).toBe("Other Territory");
    expect(getState(29)?.name).toBe("Karnataka");
    expect(getState("7")?.name).toBe("Delhi");
    expect(getState("40")).toBeUndefined();
  });

  it("hides legacy codes unless asked", () => {
    expect(listStates().some((s) => s.code === "25")).toBe(false);
    expect(listStates({ includeLegacy: true }).some((s) => s.code === "25")).toBe(true);
    expect(listStates().length).toBe(39);
    expect(STATE_CODES_VERSION).toMatch(/^\d{4}\.\d+\.\d+$/);
  });

  it.each([
    ["Karnataka", "29"],
    ["tamil nadu", "33"],
    ["Maharashtra", "27"],
    ["Andhra Pradesh", "37"],
    ["New Delhi", "07"],
    ["Orissa", "21"],
    ["Andaman & Nicobar Islands", "35"],
    ["J&K", "01"],
  ])("finds %s → %s", (name, code) => {
    expect(findStateByName(name)?.code).toBe(code);
  });

  it("returns undefined for unknown names", () => {
    expect(findStateByName("Atlantis")).toBeUndefined();
    expect(findStateByName("")).toBeUndefined();
  });
});
