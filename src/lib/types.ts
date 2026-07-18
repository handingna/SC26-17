export const ELEMENTS = ["木", "火", "土", "金", "水"] as const;
export const SCENES = ["通勤", "休闲", "约会"] as const;
export const CATEGORIES = ["上装", "下装", "连衣裙", "外套", "鞋履", "配饰"] as const;
export const SEASONS = ["春", "夏", "秋", "冬", "四季"] as const;

export type ElementType = (typeof ELEMENTS)[number];
export type Scene = (typeof SCENES)[number];
export type Category = (typeof CATEGORIES)[number];
export type Season = (typeof SEASONS)[number];
export type ElementBand = "少" | "适中" | "多";

export interface WardrobeColor {
  name: string;
  hex: string;
}

export interface ColorToken extends WardrobeColor {
  note: string;
}

export interface UserProfileV3 {
  birthDate: string;
  birthTime: string;
  scenes: Scene[];
  styles: string[];
  favoriteColors?: string[];
  avoidColors?: string[];
}

export interface WardrobeItemV3 {
  id: string;
  name: string;
  category: Category;
  primaryColor: WardrobeColor;
  secondaryColor?: WardrobeColor;
  scenes: Scene[];
  seasons: Season[];
  tags: string[];
  enabled: boolean;
}

export interface Pillar {
  stem: string;
  branch: string;
  stemElement: ElementType;
  branchElement: ElementType;
}

export interface ElementCount {
  element: ElementType;
  count: number;
  band: ElementBand;
}

export interface BirthChart {
  pillars: {
    year: Pillar;
    month: Pillar;
    day: Pillar;
    hour: Pillar;
  };
  elements: ElementCount[];
  timezone: "Asia/Shanghai";
  lateZiRule: "23:00-next-day";
  algorithmVersion: "visible-elements-v1";
}

export interface ElementNote {
  element: ElementType;
  note: string;
}

export interface ProfileNarrative {
  title: string;
  summary: string;
  elementNotes: ElementNote[];
  reflectionQuestions: string[];
}

export interface OutfitSuggestionV4 {
  scene: Scene;
  title: string;
  wardrobeItemIds: string[];
  missingPieces: string[];
  formula: string;
  reason: string;
  alternative: string;
}

export interface DailyStyleV4 {
  theme: string;
  title: string;
  energy: string;
  primaryColors: ColorToken[];
  supportingColors: ColorToken[];
  useSparinglyColors: ColorToken[];
  outfits: OutfitSuggestionV4[];
}

export interface DailyReadingV4 {
  date: string;
  birthChart: BirthChart;
  profileNarrative: ProfileNarrative;
  dailyStyle: DailyStyleV4;
  source: "demo" | "model";
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  generatedAt: string;
}

export interface DailyReadingRequestV4 {
  profile: UserProfileV3;
  wardrobe: WardrobeItemV3[];
}

export interface BirthChartRequest {
  birthDate: string;
  birthTime: string;
}

export interface ModelStatus {
  state: "ready" | "unconfigured" | "invalid";
  configured: boolean;
  issueCode?: "MISSING_REQUIRED_FIELDS" | "INVALID_BASE_URL";
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

// Transitional aliases keep imports stable while the UI and storage move to v4.
export type UserProfile = UserProfileV3;
export type WardrobeItem = WardrobeItemV3;
export type OutfitSuggestion = OutfitSuggestionV4;
export type DailyStyleReading = DailyStyleV4;
export type DailyReading = DailyReadingV4;
export type DailyReadingRequest = DailyReadingRequestV4;
