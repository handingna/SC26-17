import { DefaultEightCharProvider, SolarTime, type SixtyCycle } from "tyme4ts";
import { birthChartRequestSchema } from "./schemas";
import { ELEMENTS, type BirthChart, type BirthChartRequest, type ElementBand, type ElementType, type Pillar } from "./types";

export const BIRTH_CHART_ALGORITHM_VERSION = "visible-elements-v1" as const;

const STEM_ELEMENTS: Record<string, ElementType> = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土",
  己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水",
};

const BRANCH_ELEMENTS: Record<string, ElementType> = {
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火",
  午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水",
};

function elementBand(count: number): ElementBand {
  if (count <= 1) return "少";
  if (count === 2) return "适中";
  return "多";
}

function toPillar(cycle: SixtyCycle): Pillar {
  const stem = cycle.getHeavenStem().getName();
  const branch = cycle.getEarthBranch().getName();
  const stemElement = STEM_ELEMENTS[stem];
  const branchElement = BRANCH_ELEMENTS[branch];
  if (!stemElement || !branchElement) {
    throw new Error("tyme4ts 返回了无法识别的干支");
  }
  return { stem, branch, stemElement, branchElement };
}

export function calculateBirthChart(input: BirthChartRequest): BirthChart {
  const { birthDate, birthTime } = birthChartRequestSchema.parse(input);
  const [year, month, day] = birthDate.split("-").map(Number);
  const [hour, minute] = birthTime.split(":").map(Number);

  // Numeric wall-clock components deliberately avoid the host machine timezone.
  const lunarHour = SolarTime.fromYmdHms(year, month, day, hour, minute, 0).getLunarHour();
  const eightChar = new DefaultEightCharProvider().getEightChar(lunarHour);
  const pillars = {
    year: toPillar(eightChar.getYear()),
    month: toPillar(eightChar.getMonth()),
    day: toPillar(eightChar.getDay()),
    hour: toPillar(eightChar.getHour()),
  };

  const counts = Object.fromEntries(ELEMENTS.map((element) => [element, 0])) as Record<ElementType, number>;
  Object.values(pillars).forEach((pillar) => {
    counts[pillar.stemElement] += 1;
    counts[pillar.branchElement] += 1;
  });

  return {
    pillars,
    elements: ELEMENTS.map((element) => ({ element, count: counts[element], band: elementBand(counts[element]) })),
    timezone: "Asia/Shanghai",
    lateZiRule: "23:00-next-day",
    algorithmVersion: BIRTH_CHART_ALGORITHM_VERSION,
  };
}
