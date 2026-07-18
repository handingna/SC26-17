import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateBirthChart } from "@/lib/birth-chart";

afterEach(() => vi.unstubAllEnvs());

describe("deterministic birth chart", () => {
  it("matches the official golden example for 1992-02-02 12:00", () => {
    const chart = calculateBirthChart({ birthDate: "1992-02-02", birthTime: "12:00" });
    expect(Object.values(chart.pillars).map((pillar) => `${pillar.stem}${pillar.branch}`)).toEqual([
      "辛未",
      "辛丑",
      "戊申",
      "戊午",
    ]);
    expect(chart).toMatchObject({
      timezone: "Asia/Shanghai",
      lateZiRule: "23:00-next-day",
      algorithmVersion: "visible-elements-v1",
    });
  });

  it("counts only the four visible stems and four visible branches", () => {
    const chart = calculateBirthChart({ birthDate: "1992-02-02", birthTime: "12:00" });
    expect(chart.elements).toHaveLength(5);
    expect(new Set(chart.elements.map((item) => item.element)).size).toBe(5);
    expect(chart.elements.reduce((total, item) => total + item.count, 0)).toBe(8);
    chart.elements.forEach((item) => {
      expect(item.band).toBe(item.count <= 1 ? "少" : item.count === 2 ? "适中" : "多");
    });
  });

  it("switches the day pillar at 23:00, not at 22:59", () => {
    const before = calculateBirthChart({ birthDate: "1992-02-02", birthTime: "22:59" });
    const lateZi = calculateBirthChart({ birthDate: "1992-02-02", birthTime: "23:00" });
    const nextDay = calculateBirthChart({ birthDate: "1992-02-03", birthTime: "00:00" });
    expect(lateZi.pillars.day).not.toEqual(before.pillars.day);
    expect(lateZi.pillars.day).toEqual(nextDay.pillars.day);
  });

  it("uses solar-term boundaries for the month pillar", () => {
    const beforeLichun = calculateBirthChart({ birthDate: "1992-02-03", birthTime: "12:00" });
    const afterLichun = calculateBirthChart({ birthDate: "1992-02-05", birthTime: "12:00" });
    expect(afterLichun.pillars.month).not.toEqual(beforeLichun.pillars.month);
  });

  it("is independent of the host timezone setting", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    const losAngelesHost = calculateBirthChart({ birthDate: "1992-02-02", birthTime: "23:00" });
    vi.stubEnv("TZ", "Pacific/Auckland");
    const aucklandHost = calculateBirthChart({ birthDate: "1992-02-02", birthTime: "23:00" });
    expect(aucklandHost).toEqual(losAngelesHost);
  });

  it.each([
    { birthDate: "1992-02-30", birthTime: "12:00" },
    { birthDate: "1899-12-31", birthTime: "12:00" },
    { birthDate: "2999-01-01", birthTime: "12:00" },
    { birthDate: "1992-02-02", birthTime: "24:00" },
    { birthDate: "1992-02-02", birthTime: "" },
  ])("rejects an invalid or unsupported input: $birthDate $birthTime", (input) => {
    expect(() => calculateBirthChart(input)).toThrow();
  });
});
