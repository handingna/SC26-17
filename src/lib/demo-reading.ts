import { DailyReading } from "./types";

export const demoReading = (date = new Date().toLocaleDateString("zh-CN")): DailyReading => ({
  date,
  profileReading: {
    title: "基础五行倾向 · 演示参考",
    summary: "当前为未连接模型的演示内容。连接模型后，会根据你自填的八字或出生资料生成一份传统文化娱乐性倾向解读。",
    tendencies: [
      { element: "木", level: "均衡", note: "示例：可尝试用自然色与轻盈材质营造舒展感。" },
      { element: "火", level: "偏弱", note: "示例：用小面积暖色增添活力即可。" },
      { element: "土", level: "均衡", note: "示例：稳定色系适合做日常基底。" },
      { element: "金", level: "偏强", note: "示例：留白与简洁线条会更舒适。" },
      { element: "水", level: "均衡", note: "示例：雾蓝等柔和冷色可作为调和。" },
    ],
    reflectionQuestions: ["过去几年里，你是否经历过工作、学习或生活节奏的明显变化？", "你在高压阶段更倾向于独处整理，还是向身边人寻求支持？"],
    disclaimer: "此为传统文化娱乐性内容，不是自动排盘或专业命理结论。",
  },
  dailyStyle: {
    theme: "自然系色彩主题",
    headline: "向上生长，也留一点呼吸感",
    energy: "今天适合用清新的层次和自然材质，为日常节奏打开一点松弛空间。把注意力放在让自己感到舒展的细节上。",
    luckyColors: [{ name: "苔藓绿", hex: "#667A51", note: "轻盈、稳定，适合作为主色" }, { name: "玉白", hex: "#F5F2E8", note: "为整体留出呼吸感" }],
    supportingColors: [{ name: "雾蓝", hex: "#91A8B9", note: "为冷静感增加层次" }, { name: "茶褐", hex: "#8A6C4A", note: "用小面积平衡质感" }],
    mindfulColors: [{ name: "高饱和正红", hex: "#D84434", note: "今天可减少大面积使用" }],
    outfits: [
      { scene: "通勤", title: "清醒的自然层次", formula: "玉白衬衫 + 苔藓绿下装 + 茶褐配饰", reason: "浅色上装提亮精神，低饱和绿色让通勤造型保持从容。", alternative: "没有绿色下装时，用雾蓝替换，并保留茶褐小包或皮带。" },
      { scene: "休闲", title: "轻步慢行的周末感", formula: "苔藓绿针织 + 浅色牛仔 + 简洁运动鞋", reason: "自然色与浅色丹宁形成柔和对比，适合不费力的外出安排。", alternative: "将针织替换成同色系 T 恤，并加一件玉白外套。" },
      { scene: "约会", title: "柔和而有记忆点", formula: "玉白连衣裙 / 上装 + 雾蓝外套 + 金色小饰品", reason: "明净底色与雾蓝层次让整体显得温柔、有分寸。", alternative: "以茶褐鞋履替代金色饰品，增加更稳重的质感。" },
    ],
  },
  source: "demo", promptVersion: "style-v2", generatedAt: new Date().toISOString(),
});
