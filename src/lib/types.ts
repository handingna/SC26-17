export type ElementType = "木" | "火" | "土" | "金" | "水";
export type Scene = "通勤" | "休闲" | "约会";
export type Category = "上装" | "下装" | "连衣裙" | "外套" | "鞋履" | "配饰";

export interface ColorToken { name: string; hex: string; note: string; }
export interface ElementTendency { element: ElementType; level: "偏弱" | "均衡" | "偏强"; note: string; }

export interface UserProfile {
  birthDate: string;
  lunarBirthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  gender?: "女" | "男" | "不透露";
  bazi?: string;
  reflectionAnswers?: string[];
  scenes: Scene[];
  styles: string[];
  favoriteColors: string[];
  avoidColors: string[];
}

export interface WardrobeItem { id: string; name: string; category: Category; primaryColor: string; secondaryColor?: string; scenes: Scene[]; seasons: string[]; tags: string[]; imageUrl?: string; enabled: boolean; }
export interface OutfitSuggestion { scene: Scene; title: string; formula: string; reason: string; alternative: string; }

export interface ProfileReading {
  title: string;
  summary: string;
  tendencies: ElementTendency[];
  reflectionQuestions: string[];
  disclaimer: string;
}

export interface DailyStyleReading {
  theme: string;
  headline: string;
  energy: string;
  luckyColors: ColorToken[];
  supportingColors: ColorToken[];
  mindfulColors: ColorToken[];
  outfits: OutfitSuggestion[];
}

export interface DailyReading {
  date: string;
  profileReading: ProfileReading;
  dailyStyle: DailyStyleReading;
  source: "demo" | "deepseek";
  promptVersion: string;
  generatedAt: string;
}

export interface DailyReadingRequest { profile?: UserProfile; wardrobe: WardrobeItem[]; date?: string; }
export interface ModelStatus { configured: boolean; provider: "DeepSeek"; model: string; baseURL: string; promptVersion: string; }
