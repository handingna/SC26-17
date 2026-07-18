import { z } from "zod";
import {
  CATEGORIES,
  ELEMENTS,
  SCENES,
  SEASONS,
  type DailyReadingRequestV4,
  type Scene,
  type Season,
  type WardrobeItemV3,
} from "./types";

export const DAILY_READING_SCHEMA_VERSION = "daily-reading-v4";
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_WARDROBE_ITEMS = 60;

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "颜色必须是 #RRGGBB 格式");
const shortText = (max: number) => z.string().trim().min(1).max(max);

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function shanghaiDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, "日期无效");
export const birthDateSchema = isoDateSchema.superRefine((value, context) => {
  if (value < "1900-01-01") {
    context.addIssue({ code: "custom", message: "出生日期不能早于 1900-01-01" });
  }
  if (value > shanghaiDateKey()) {
    context.addIssue({ code: "custom", message: "出生日期不能晚于今天" });
  }
});
export const birthTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "时间必须是 HH:mm 格式");

const uniqueStrings = (values: string[]) => new Set(values.map((value) => value.trim().toLocaleLowerCase("zh-CN"))).size === values.length;

function normalizedColorName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("zh-CN").replace(/色$/u, "");
}

const COLOR_FAMILY_ALIASES = {
  红: ["红", "朱砂", "朱红", "绯红", "酒红", "胭脂", "赤", "枣红", "玫红", "猩红", "砖红"],
  粉: ["粉", "藕粉", "樱花粉", "桃粉", "裸粉", "烟粉", "玫瑰粉"],
  橙: ["橙", "橘", "柑橘", "杏橙", "琥珀", "陶土橙"],
  黄: ["黄", "金黄", "姜黄", "鹅黄", "柠檬黄", "米黄", "芥末黄"],
  绿: ["绿", "青绿", "翠", "碧绿", "苔藓", "橄榄", "鼠尾草", "松针", "薄荷"],
  蓝: ["蓝", "靛", "藏青", "海军蓝", "天蓝", "湖蓝", "月岩蓝", "雾蓝"],
  紫: ["紫", "藤紫", "薰衣草", "葡萄紫", "藕紫"],
  棕: ["棕", "褐", "咖啡", "驼", "焦糖", "茶褐", "烟粉棕"],
  黑: ["黑", "墨黑", "乌黑", "玄黑"],
  白: ["白", "象牙", "乳白", "雪白", "玉白", "米白"],
  灰: ["灰", "石墨", "银灰", "炭灰", "雾灰"],
} as const;

function colorFamilies(value: string): Set<string> {
  const normalized = normalizedColorName(value);
  const families = new Set<string>();
  Object.entries(COLOR_FAMILY_ALIASES).forEach(([family, aliases]) => {
    if (aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))) families.add(family);
  });
  return families;
}

export function isAvoidedColor(
  color: { name: string; hex: string },
  avoidColors: readonly string[] = [],
): boolean {
  const name = normalizedColorName(color.name);
  const hex = color.hex.trim().toLocaleLowerCase("en-US");
  return avoidColors.some((rawReference) => {
    const reference = rawReference.trim();
    if (!reference) return false;
    if (reference.startsWith("#")) return reference.toLocaleLowerCase("en-US") === hex;
    const avoidedName = normalizedColorName(reference);
    if (!avoidedName) return false;
    if (name.includes(avoidedName) || avoidedName.includes(name)) return true;
    const avoidedFamilies = colorFamilies(avoidedName);
    return [...colorFamilies(name)].some((family) => avoidedFamilies.has(family));
  });
}

function textMentionsAvoidedColor(text: string, avoidColors: readonly string[] = []): boolean {
  const normalizedText = normalizedColorName(text);
  return avoidColors.some((rawReference) => {
    const reference = rawReference.trim();
    if (!reference || reference.startsWith("#")) return false;
    const avoidedName = normalizedColorName(reference);
    if (!avoidedName) return false;
    const avoidedFamilies = colorFamilies(avoidedName);
    if (avoidedFamilies.size === 0) return false;
    if (avoidedName.length >= 2 && normalizedText.includes(avoidedName)) return true;
    return [...avoidedFamilies].some((family) => {
      const aliases = COLOR_FAMILY_ALIASES[family as keyof typeof COLOR_FAMILY_ALIASES];
      if (aliases.some((alias) => alias.length >= 2 && normalizedText.includes(alias))) return true;
      return new RegExp(`(?:正|浅|深|亮|暗|暖|冷|少量|一抹)${family}|${family}(?:色|调|系|作为|作|搭配|点缀|配色|主色|辅色)`, "u")
        .test(normalizedText);
    });
  });
}

export function seasonForShanghaiDate(date = shanghaiDateKey()): Exclude<Season, "四季"> {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(date);
  const month = match ? Number(match[1]) : Number.NaN;
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
}

export function isWardrobeItemEligible(
  item: WardrobeItemV3,
  scene: Scene,
  season: Exclude<Season, "四季">,
  avoidColors: readonly string[] = [],
): boolean {
  return item.enabled
    && item.scenes.includes(scene)
    && (item.seasons.includes(season) || item.seasons.includes("四季"))
    && !isAvoidedColor(item.primaryColor, avoidColors)
    && (!item.secondaryColor || !isAvoidedColor(item.secondaryColor, avoidColors));
}

export function hasCompleteOutfit(items: readonly WardrobeItemV3[]): boolean {
  return items.some((item) => item.category === "连衣裙")
    || (items.some((item) => item.category === "上装") && items.some((item) => item.category === "下装"));
}

const uniqueStringArray = (minimum: number, maximum: number, itemMaximum: number) =>
  z.array(shortText(itemMaximum)).min(minimum).max(maximum).refine(uniqueStrings, "不能包含重复项");

export const userProfileV3Schema = z.object({
  birthDate: birthDateSchema,
  birthTime: birthTimeSchema,
  scenes: z.array(z.enum(SCENES)).min(1).max(SCENES.length).refine(uniqueStrings, "场景不能重复"),
  styles: uniqueStringArray(1, 6, 30),
  favoriteColors: uniqueStringArray(0, 12, 30).optional().default([]),
  avoidColors: uniqueStringArray(0, 12, 30).optional().default([]),
}).strict().superRefine((profile, context) => {
  const favorites = new Set(profile.favoriteColors.map((color) => color.toLocaleLowerCase("zh-CN")));
  profile.avoidColors.forEach((color, index) => {
    if (favorites.has(color.toLocaleLowerCase("zh-CN"))) {
      context.addIssue({ code: "custom", path: ["avoidColors", index], message: "喜欢色与避用色不能重复" });
    }
  });
});

export const wardrobeColorSchema = z.object({
  name: shortText(30),
  hex: hexColorSchema,
}).strict();

export const wardrobeItemV3Schema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "衣物 ID 只能包含字母、数字、下划线和连字符"),
  name: shortText(80),
  category: z.enum(CATEGORIES),
  primaryColor: wardrobeColorSchema,
  secondaryColor: wardrobeColorSchema.optional(),
  scenes: z.array(z.enum(SCENES)).min(1).max(SCENES.length).refine(uniqueStrings, "场景不能重复"),
  seasons: z.array(z.enum(SEASONS)).min(1).max(SEASONS.length).refine(uniqueStrings, "季节不能重复"),
  tags: uniqueStringArray(0, 8, 30),
  enabled: z.boolean(),
}).strict();

export const wardrobeV3Schema = z.array(wardrobeItemV3Schema).max(MAX_WARDROBE_ITEMS).refine(
  (items) => new Set(items.map((item) => item.id)).size === items.length,
  "衣物 ID 不能重复",
);

export const birthChartRequestSchema = z.object({
  birthDate: birthDateSchema,
  birthTime: birthTimeSchema,
}).strict();

export const dailyReadingRequestV4Schema = z.object({
  profile: userProfileV3Schema,
  wardrobe: wardrobeV3Schema,
}).strict();

export const elementSchema = z.enum(ELEMENTS);
export const elementBandSchema = z.enum(["少", "适中", "多"]);

export const pillarSchema = z.object({
  stem: z.string().length(1),
  branch: z.string().length(1),
  stemElement: elementSchema,
  branchElement: elementSchema,
}).strict();

export const birthChartSchema = z.object({
  pillars: z.object({
    year: pillarSchema,
    month: pillarSchema,
    day: pillarSchema,
    hour: pillarSchema,
  }).strict(),
  elements: z.array(z.object({
    element: elementSchema,
    count: z.number().int().min(0).max(8),
    band: elementBandSchema,
  }).strict()).length(ELEMENTS.length),
  timezone: z.literal("Asia/Shanghai"),
  lateZiRule: z.literal("23:00-next-day"),
  algorithmVersion: z.literal("visible-elements-v1"),
}).strict().superRefine((chart, context) => {
  const elementSet = new Set(chart.elements.map((item) => item.element));
  if (elementSet.size !== ELEMENTS.length) {
    context.addIssue({ code: "custom", path: ["elements"], message: "五行项目必须完整且唯一" });
  }
  const total = chart.elements.reduce((sum, item) => sum + item.count, 0);
  if (total !== 8) {
    context.addIssue({ code: "custom", path: ["elements"], message: "可见五行计数总和必须为 8" });
  }
  chart.elements.forEach((item, index) => {
    const expected = item.count <= 1 ? "少" : item.count === 2 ? "适中" : "多";
    if (item.band !== expected) {
      context.addIssue({ code: "custom", path: ["elements", index, "band"], message: "五行分档与计数不一致" });
    }
  });
});

const colorTokenSchema = z.object({
  name: shortText(30),
  hex: hexColorSchema,
  note: shortText(120),
}).strict();

const elementNoteSchema = z.object({
  element: elementSchema,
  note: shortText(180),
}).strict();

const modelProfileNarrativeSchema = z.object({
  title: shortText(60),
  summary: shortText(360),
  reflectionQuestions: z.array(shortText(120)).min(1).max(2),
}).strict();

const publicProfileNarrativeSchema = modelProfileNarrativeSchema.safeExtend({
  elementNotes: z.array(elementNoteSchema).length(ELEMENTS.length),
}).superRefine((profile, context) => {
  if (new Set(profile.elementNotes.map((item) => item.element)).size !== ELEMENTS.length) {
    context.addIssue({ code: "custom", path: ["elementNotes"], message: "五行说明必须完整且唯一" });
  }
});

const outfitSuggestionV4Schema = z.object({
  scene: z.enum(SCENES),
  title: shortText(60),
  wardrobeItemIds: z.array(z.string().min(1).max(64)).max(6).refine(uniqueStrings, "衣物 ID 不能重复"),
  missingPieces: z.array(shortText(60)).max(4).refine(uniqueStrings, "缺少单品不能重复"),
  formula: shortText(180),
  reason: shortText(260),
  alternative: shortText(180),
}).strict();

const FORBIDDEN_ASSERTIONS = [
  "注定", "预示", "转运", "旺财", "化解", "招财", "开运", "旺运", "增运",
  "命格", "命理", "旺衰", "偏强", "偏弱", "强弱", "身强", "身弱", "喜用神",
  "大运", "流年", "流日", "吉凶", "运势", "财运", "事业运", "健康运", "姻缘",
  "升职", "升迁", "加薪", "中奖", "发财", "破财", "脱单", "面试成功",
  "求职成功", "录取", "上岸", "康复", "长寿", "避灾", "消灾",
];
const FORBIDDEN_PREDICTION_PATTERNS = [
  /(?:(?:招|旺|增|催)[^。！？]{0,2}桃花|桃花(?:运|缘|姻缘|运势))/,
  /(?:(?:前任|感情|恋情|恋爱|婚恋)[^。！？]{0,8}(?:复合|重归于好)|(?:复合|重归于好)[^。！？]{0,8}(?:前任|感情|恋情|恋爱|婚恋))/,
  /(?:预测|推断|判断)[^。！？]{0,12}(?:健康|财富|财运|灾祸|婚恋|感情|姻缘|职业|事业)/,
  /(?:健康|财富|财运|灾祸|婚恋|感情|姻缘|职业|事业)[^。！？]{0,12}(?:(?<!不)会|将|必定|一定|必然|可能|改善|恶化|成功|失败)/,
  /(?:(?<!不)会|将|必定|一定|必然|预示|带来|导致|决定)[^。！？]{0,12}(?:健康|财富|财运|灾祸|婚恋|感情|姻缘|职业|事业)/,
  /[木火土金水](?:元素)?[^。！？]{0,4}(?:过旺|过衰|旺盛|衰弱)/,
];
const FORBIDDEN_REFERENCE_PATTERNS = [
  /《[^》\r\n]{1,80}》/u,
  /(?:古籍|古人|典籍)[^。！？\r\n]{0,12}(?:记载|有云|云曰|认为|指出|称)/u,
];
const FORBIDDEN_BRAND_PATTERNS = [
  /(?:品牌|牌子|联名款|联名系列)/u,
  /(?:耐克|阿迪达斯|香奈儿|古驰|普拉达|优衣库|无印良品|路易威登|爱马仕|迪奥|博柏利|始祖鸟|李宁|安踏|波司登)/u,
  /(?:\bNike\b|\bAdidas\b|\bChanel\b|\bGucci\b|\bPrada\b|\bUniqlo\b|\bMUJI\b|\bZARA\b|H&M|\bLululemon\b|New Balance)/iu,
];
const MATERIAL_FAMILIES = {
  cotton: ["纯棉", "棉质", "棉布", "府绸"],
  cottonLinen: ["棉麻"],
  linen: ["亚麻", "麻质"],
  silk: ["真丝", "丝绸", "桑蚕丝"],
  wool: ["羊毛", "毛呢", "呢料"],
  cashmere: ["羊绒"],
  mohair: ["马海毛"],
  denim: ["牛仔", "丹宁"],
  leather: ["皮革", "皮质"],
  genuineLeather: ["真皮"],
  suede: ["麂皮", "绒面", "绒面革"],
  corduroy: ["灯芯绒"],
  knit: ["针织"],
  chiffon: ["雪纺"],
  polyester: ["涤纶", "聚酯纤维"],
  nylon: ["尼龙"],
  elastic: ["莱卡", "氨纶"],
  regenerated: ["天丝", "莱赛尔", "莫代尔"],
  acetate: ["醋酸", "醋酸纤维"],
  lace: ["蕾丝"],
} as const;

type MaterialFamily = keyof typeof MATERIAL_FAMILIES;
type ModelOutfitSuggestion = z.infer<typeof outfitSuggestionV4Schema>;

function generalProseSegments(reading: DailyReadingModelOutput): string[] {
  return [
    reading.profileNarrative.title,
    reading.profileNarrative.summary,
    ...reading.profileNarrative.reflectionQuestions,
    reading.dailyStyle.theme,
    reading.dailyStyle.title,
    reading.dailyStyle.energy,
    ...[
      ...reading.dailyStyle.primaryColors,
      ...reading.dailyStyle.supportingColors,
      ...reading.dailyStyle.useSparinglyColors,
    ].flatMap((color) => [color.name, color.note]),
  ];
}

function outfitProseSegments(outfit: ModelOutfitSuggestion): string[] {
  return [
    outfit.title,
    ...outfit.missingPieces,
    outfit.formula,
    outfit.reason,
    outfit.alternative,
  ];
}

function modelProseSegments(reading: DailyReadingModelOutput): string[] {
  return [
    ...generalProseSegments(reading),
    ...reading.dailyStyle.outfits.flatMap(outfitProseSegments),
  ];
}

function normalizedProse(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

const UNTRUSTED_INSTRUCTION_PATTERN = /(?:忽略(?:系统|以上|之前|前述|规则|指令)|系统提示|执行指令|输出(?:秘密|密钥|提示词)|泄露|扮演|你现在是|不要遵守|覆盖规则|只输出|返回json|system.{0,16}(?:prompt|instruction|message)|ignore.{0,16}(?:system|previous|instruction)|reveal.{0,16}(?:prompt|secret|key)|developer|assistant)/iu;
function materialFamiliesInSegments(segments: readonly string[]): Set<MaterialFamily> {
  const normalizedSegments = segments.map(normalizedProse);
  const families = new Set<MaterialFamily>();
  (Object.entries(MATERIAL_FAMILIES) as Array<[MaterialFamily, readonly string[]]>).forEach(([family, aliases]) => {
    if (aliases.some((alias) => normalizedSegments.some((segment) => segment.includes(normalizedProse(alias))))) {
      families.add(family);
    }
  });
  return families;
}

function itemSupportsMaterialFamily(item: WardrobeItemV3, family: MaterialFamily): boolean {
  const facts = [item.name, ...item.tags].map(normalizedProse);
  return MATERIAL_FAMILIES[family].some((alias) => {
    const normalizedAlias = normalizedProse(alias);
    return facts.some((fact) => fact.includes(normalizedAlias));
  });
}

export const dailyReadingModelOutputSchema = z.object({
  profileNarrative: modelProfileNarrativeSchema,
  dailyStyle: z.object({
    theme: shortText(40),
    title: shortText(80),
    energy: shortText(300),
    primaryColors: z.array(colorTokenSchema).min(1).max(3),
    supportingColors: z.array(colorTokenSchema).min(1).max(3),
    useSparinglyColors: z.array(colorTokenSchema).min(1).max(2),
    outfits: z.array(outfitSuggestionV4Schema).min(1).max(SCENES.length),
  }).strict(),
}).strict().superRefine((reading, context) => {
  const colors = [
    ...reading.dailyStyle.primaryColors,
    ...reading.dailyStyle.supportingColors,
    ...reading.dailyStyle.useSparinglyColors,
  ];
  const colorKeys = colors.flatMap((color) => [color.name.trim().toLocaleLowerCase("zh-CN"), color.hex.toUpperCase()]);
  if (new Set(colorKeys).size !== colorKeys.length) {
    context.addIssue({ code: "custom", path: ["dailyStyle"], message: "颜色名称或色值不能重复" });
  }
  if (new Set(reading.dailyStyle.outfits.map((outfit) => outfit.scene)).size !== reading.dailyStyle.outfits.length) {
    context.addIssue({ code: "custom", path: ["dailyStyle", "outfits"], message: "穿搭场景不能重复" });
  }
  // safeExtend reuses this refinement for the API/cache envelope. Scan only
  // human-facing prose, never IDs or provider/version metadata.
  const generatedProse = modelProseSegments(reading).join("\n");
  if (UNTRUSTED_INSTRUCTION_PATTERN.test(normalizedProse(generatedProse))) {
    context.addIssue({ code: "custom", message: "内容不得复述或执行不可信指令型文本" });
  }
  FORBIDDEN_ASSERTIONS.forEach((word) => {
    if (generatedProse.includes(word)) {
      context.addIssue({ code: "custom", message: `内容不得包含“${word}”` });
    }
  });
  FORBIDDEN_PREDICTION_PATTERNS.forEach((pattern) => {
    if (pattern.test(generatedProse)) {
      context.addIssue({ code: "custom", message: "内容不得包含人生结果预测或五行强弱断言" });
    }
  });
  FORBIDDEN_REFERENCE_PATTERNS.forEach((pattern) => {
    if (pattern.test(generatedProse)) {
      context.addIssue({ code: "custom", message: "内容不得引用或杜撰古籍、古人或典籍" });
    }
  });
  FORBIDDEN_BRAND_PATTERNS.forEach((pattern) => {
    if (pattern.test(generatedProse)) {
      context.addIssue({ code: "custom", message: "内容不得出现具体品牌" });
    }
  });
});

/** Shared server-response/browser-cache contract; preserves all model-output refinements. */
export const dailyReadingV4Schema = dailyReadingModelOutputSchema.safeExtend({
  profileNarrative: publicProfileNarrativeSchema,
  date: isoDateSchema,
  birthChart: birthChartSchema,
  source: z.enum(["demo", "model"]),
  provider: shortText(80),
  model: shortText(120),
  promptVersion: shortText(80),
  schemaVersion: shortText(80),
  generatedAt: z.string().datetime(),
});

export type DailyReadingModelOutput = z.infer<typeof dailyReadingModelOutputSchema>;

export const dailyReadingModelOutputJsonSchema = z.toJSONSchema(dailyReadingModelOutputSchema, {
  target: "draft-7",
  unrepresentable: "any",
});

export type ModelOutputValidation =
  | { success: true; data: DailyReadingModelOutput }
  | { success: false; issues: string[] };

export function validateModelOutput(
  value: unknown,
  profile: { scenes: readonly Scene[]; avoidColors?: readonly string[] },
  wardrobe: readonly WardrobeItemV3[],
  date = shanghaiDateKey(),
): ModelOutputValidation {
  const parsed = dailyReadingModelOutputSchema.safeParse(value);
  if (!parsed.success) {
    return { success: false, issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }

  const issues: string[] = [];
  const expectedScenes = new Set(profile.scenes);
  const actualScenes = new Set(parsed.data.dailyStyle.outfits.map((outfit) => outfit.scene));
  if (expectedScenes.size !== actualScenes.size || [...expectedScenes].some((scene) => !actualScenes.has(scene))) {
    issues.push("dailyStyle.outfits: 必须为每个已选场景各生成一套穿搭");
  }

  const currentSeason = seasonForShanghaiDate(date);
  const selectedItemsById = new Map<string, WardrobeItemV3>();
  parsed.data.dailyStyle.outfits.forEach((outfit, outfitIndex) => {
    const eligibleItems = wardrobe.filter((item) => isWardrobeItemEligible(
      item,
      outfit.scene,
      currentSeason,
      profile.avoidColors,
    ));
    const eligibleById = new Map(eligibleItems.map((item) => [item.id, item]));
    const selectedItems: WardrobeItemV3[] = [];
    outfit.wardrobeItemIds.forEach((id) => {
      const item = eligibleById.get(id);
      if (!item) {
        issues.push(`dailyStyle.outfits.${outfitIndex}.wardrobeItemIds: ${id} 不属于当前场景与季节的可用衣物`);
      } else {
        selectedItems.push(item);
        selectedItemsById.set(item.id, item);
      }
    });
    const completeCombinationAvailable = hasCompleteOutfit(eligibleItems);
    if (completeCombinationAvailable && !hasCompleteOutfit(selectedItems)) {
      issues.push(`dailyStyle.outfits.${outfitIndex}.wardrobeItemIds: 有完整组合时必须选择连衣裙，或同时选择上装与下装`);
    }
    if (!completeCombinationAvailable && outfit.missingPieces.length === 0) {
      issues.push(`dailyStyle.outfits.${outfitIndex}.missingPieces: 当前场景与季节没有完整组合时必须明确列出缺少单品`);
    }
    materialFamiliesInSegments([outfit.reason]).forEach((family) => {
      if (!selectedItems.some((item) => itemSupportsMaterialFamily(item, family))) {
        issues.push(`dailyStyle.outfits.${outfitIndex}.reason: 具体材质没有当前穿搭所选衣物的名称或标签作为依据`);
      }
    });
  });

  const outputColors = [
    ...parsed.data.dailyStyle.primaryColors,
    ...parsed.data.dailyStyle.supportingColors,
    ...parsed.data.dailyStyle.useSparinglyColors,
  ];
  outputColors.forEach((color) => {
    if (isAvoidedColor(color, profile.avoidColors) || textMentionsAvoidedColor(color.note, profile.avoidColors)) {
      issues.push(`dailyStyle: 避用颜色 ${color.name} 不能出现在任何配色组`);
    }
  });

  const proseSegments = modelProseSegments(parsed.data);
  const normalizedSegments = proseSegments.map(normalizedProse);
  const visibleWardrobe = wardrobe.filter((item) => profile.scenes.some((scene) => isWardrobeItemEligible(
    item,
    scene,
    currentSeason,
    profile.avoidColors,
  )));
  visibleWardrobe.forEach((item) => {
    const normalizedName = normalizedProse(item.name);
    const nameReplayed = normalizedName.length >= 6
      && normalizedSegments.some((segment) => segment.includes(normalizedName));
    const selected = selectedItemsById.has(item.id);
    const unsafeSelectedName = selected && UNTRUSTED_INSTRUCTION_PATTERN.test(normalizedName);
    const unsafeTagReplayed = item.tags.some((tag) => {
      const normalizedTag = normalizedProse(tag);
      const replayed = normalizedTag.length >= 6
        && normalizedSegments.some((segment) => segment.includes(normalizedTag));
      return replayed && (!selected || UNTRUSTED_INSTRUCTION_PATTERN.test(normalizedTag));
    });
    if ((nameReplayed && (!selected || unsafeSelectedName)) || unsafeTagReplayed) {
      issues.push(`正文不得复述衣物 ${item.id} 的名称或标签；服装事实只能通过衣物 ID 关联`);
    }
  });

  return issues.length > 0 ? { success: false, issues } : { success: true, data: parsed.data };
}

export type DailyReadingSemanticValidation =
  | { success: true; data: z.infer<typeof dailyReadingV4Schema> }
  | { success: false; issues: string[] };

export function validateDailyReadingSemantics(
  value: unknown,
  profile: { scenes: readonly Scene[]; avoidColors?: readonly string[] },
  wardrobe: readonly WardrobeItemV3[],
  date?: string,
): DailyReadingSemanticValidation {
  const parsed = dailyReadingV4Schema.safeParse(value);
  if (!parsed.success) {
    return { success: false, issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }
  const issues: string[] = [];
  if (date && parsed.data.date !== date) issues.push(`date: 应为 ${date}`);
  const modelOutput = {
    profileNarrative: {
      title: parsed.data.profileNarrative.title,
      summary: parsed.data.profileNarrative.summary,
      reflectionQuestions: parsed.data.profileNarrative.reflectionQuestions,
    },
    dailyStyle: parsed.data.dailyStyle,
  };
  const modelValidation = validateModelOutput(modelOutput, profile, wardrobe, date ?? parsed.data.date);
  if (!modelValidation.success) issues.push(...modelValidation.issues);
  return issues.length > 0 ? { success: false, issues } : { success: true, data: parsed.data };
}

export function parseDailyReadingRequest(value: unknown): DailyReadingRequestV4 {
  return dailyReadingRequestV4Schema.parse(value) as DailyReadingRequestV4;
}
