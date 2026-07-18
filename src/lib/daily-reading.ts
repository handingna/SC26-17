import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { demoReading } from "./demo-reading";
import { DailyReading, DailyReadingRequest } from "./types";
import { getModelConfig } from "./model-config";

export const PROMPT_VERSION = "style-v2";
const colorSchema = z.object({ name: z.string(), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/), note: z.string() });
const readingSchema = z.object({
  profileReading: z.object({ title: z.string(), summary: z.string(), tendencies: z.array(z.object({ element: z.enum(["木", "火", "土", "金", "水"]), level: z.enum(["偏弱", "均衡", "偏强"]), note: z.string() })).length(5), reflectionQuestions: z.array(z.string()).max(3), disclaimer: z.string() }),
  dailyStyle: z.object({ theme: z.string(), headline: z.string(), energy: z.string(), luckyColors: z.array(colorSchema).min(1).max(3), supportingColors: z.array(colorSchema).min(1).max(3), mindfulColors: z.array(colorSchema).min(1).max(2), outfits: z.array(z.object({ scene: z.enum(["通勤", "休闲", "约会"]), title: z.string(), formula: z.string(), reason: z.string(), alternative: z.string() })).length(3) }),
});

const systemPrompt = `你为“传统文化娱乐与生活方式”产品撰写内容。可参考用户提到的八字命理文化传统、排大运的叙事方式和《穷通宝典》《三命通会》《滴天髓》《渊海子平》等作为文化素材，但绝不声称你真实研读这些书籍、具备专业资质或能精确排盘。

必须遵守：
- 内容是娱乐性、非确定性的自我反思与穿搭灵感；不得做未来预测，也不得把用户过去发生过的事当作事实陈述。
- 不提供健康、金融、法律、关系或重大人生决定建议；避免灾祸、疾病、财富、婚恋成败等判断。
- profileReading 仅为“基础五行倾向（娱乐参考）”，清楚写明不等同自动排盘或专业结论；五行按 木、火、土、金、水 五项输出。
- reflectionQuestions 只能是最多三个可跳过的中性自我回顾问题，不得写成“你曾经发生过某事”。
- dailyStyle 是独立于命盘的“今日生活主题”，不能称为“今日五行”或用户命理结论。色彩和穿搭用“可以尝试、适合考虑”等温和措辞。
- 严格只输出能被 JSON.parse 解析的 JSON 对象，不要使用 Markdown 代码块或补充说明。必须使用如下英文 key 和嵌套结构：
{
  "profileReading": { "title": "string", "summary": "string", "tendencies": [{ "element": "木", "level": "偏弱", "note": "string" }, { "element": "火", "level": "均衡", "note": "string" }, { "element": "土", "level": "均衡", "note": "string" }, { "element": "金", "level": "偏强", "note": "string" }, { "element": "水", "level": "均衡", "note": "string" }], "reflectionQuestions": ["string"], "disclaimer": "string" },
  "dailyStyle": { "theme": "string", "headline": "string", "energy": "string", "luckyColors": [{ "name": "string", "hex": "#667A51", "note": "string" }], "supportingColors": [{ "name": "string", "hex": "#91A8B9", "note": "string" }], "mindfulColors": [{ "name": "string", "hex": "#D84434", "note": "string" }], "outfits": [{ "scene": "通勤", "title": "string", "formula": "string", "reason": "string", "alternative": "string" }, { "scene": "休闲", "title": "string", "formula": "string", "reason": "string", "alternative": "string" }, { "scene": "约会", "title": "string", "formula": "string", "reason": "string", "alternative": "string" }] }
}`;;

export async function createDailyReading(request: DailyReadingRequest): Promise<DailyReading> {
  const date = request.date ?? new Date().toLocaleDateString("zh-CN");
  const config = getModelConfig();
  if (!config.configured || !config.apiKey) return demoReading(date);

  const wardrobeSummary = request.wardrobe.filter((item) => item.enabled).map((item) => `${item.category}:${item.primaryColor}:${item.scenes.join("/")}`).join("；");
  const profile = request.profile;
  const profileInput = profile ? [`公历生日：${profile.birthDate || "未提供"}`, `农历生日：${profile.lunarBirthDate || "未提供"}`, `性别：${profile.gender || "未提供"}`, `出生时间：${profile.birthTime || "未提供"}`, `出生地：${profile.birthPlace || "未提供"}`, `用户自填八字：${profile.bazi || "未提供（不要自行排盘）"}`, `自我回顾：${profile.reflectionAnswers?.filter(Boolean).join("；") || "未提供"}`].join("\n") : "未填写个人资料";
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  const response = await client.chat.completions.create({
    model: config.model,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `请为日期 ${date} 生成分层内容。\n\n个人资料（仅作娱乐性个性化输入）：\n${profileInput}\n\n常用场景：${profile?.scenes.join("、") || "通勤、休闲、约会"}\n衣橱摘要：${wardrobeSummary || "暂无衣物"}\n\n先生成 profileReading，再生成 dailyStyle。` }],
  });
  const content = response.choices[0]?.message.content;
  if (!content) throw new Error("模型未返回内容");
  const payload = JSON.parse(content) as Record<string, unknown>;
  if (Array.isArray(payload.reflectionQuestions) && payload.profileReading && typeof payload.profileReading === "object") {
    (payload.profileReading as Record<string, unknown>).reflectionQuestions = payload.reflectionQuestions;
  }
  const parsed = readingSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("DeepSeek JSON 未通过 Schema", parsed.error.issues.map((issue) => issue.path.join(".")).join(", "));
    throw new Error("模型返回格式不符合预期");
  }
  return { ...parsed.data, date, source: "deepseek", promptVersion: PROMPT_VERSION, generatedAt: new Date().toISOString() };
}
