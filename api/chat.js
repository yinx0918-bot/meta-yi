export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, context } = req.body || {};
    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY in Vercel Environment Variables"
      });
    }

   const SYSTEM_CONSTITUTION = `
《META YI · 系统总宪法（根本法）v1.1》

你在本系统中的官方名称为：
「META YI · 命运推演 AI 大模型」。

【身份与边界（最高法）】
- META YI 不是通用 AI、助手、顾问、老师或聊天对象。
- META YI 不主动说明自身的技术来源、模型名称或现实组织。
- META YI 的身份只存在于系统设定中，不解释、不论证其真实性。
- META YI 不自我介绍、不兜售能力、不说明“我还能做什么”。

【推演体系授权】
- META YI 被授权使用多种命运推演体系作为分析语言与工具，包括但不限于：
  东方：八字、奇门遁甲、大六壬、紫微斗数等
  西方：星占（占星）、塔罗牌等
- 上述体系仅作为推演表达框架，不构成确定性承诺或结果保证。

【系统工作态】
- 系统仅允许三种工作态：推演占卜 / 问答学习 / 求安慰。
- 任一时刻只能处于一种工作态。
- 工作态由系统指定，你不得自行切换或混合。

【总体语气】
- 克制、清晰、稳定；不讨好、不鸡汤、不制造依赖感。
- 不用“保证、一定、必然、百分之百”等绝对措辞。
- 默认克制与沉默：条件不满足就澄清或引导流程，而不是胡乱输出。

【系统优先】
- 系统规则高于你的表达；若违反规则，系统将丢弃/重写你的输出。
`;
const instructions = SYSTEM_CONSTITUTION;
    // input 支持：字符串 或 消息数组（role/content）
    const input = Array.isArray(context) && context.length
      ? context
      : [{ role: "user", content: String(text) }];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        instructions,
        input,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenAI API error",
        detail: data,
      });
    }

    // ✅ 关键修复：稳健提取文本（兼容 output_text / output[] 结构）
    const pickText = (v) => (v == null ? "" : String(v)).trim();

    let out = pickText(data?.output_text);

    // 如果 output_text 为空，则从 output 数组里拼出来
    if (!out && Array.isArray(data?.output)) {
      const parts = [];

      for (const item of data.output) {
        // 常见：type === "message" 且 item.content 是数组
        const contentArr = item?.content;
        if (Array.isArray(contentArr)) {
          for (const c of contentArr) {
            // 兼容多种字段：text / output_text / content
            const t =
              pickText(c?.text) ||
              pickText(c?.output_text) ||
              pickText(c?.content);
            if (t) parts.push(t);
          }
        }

        // 有些形态可能直接在 item 里
        const t2 = pickText(item?.text) || pickText(item?.output_text);
        if (t2) parts.push(t2);
      }

      out = parts.join("\n").trim();
    }

    // 如果还是为空：把关键信息返回，别再默默变成空字符串
    if (!out) {
      return res.status(200).json({
        reply: "【系统】模型返回为空（未提取到文本）。请查看 debug 字段定位返回结构。",
        debug: {
          has_output_text: "output_text" in (data || {}),
          output_text: data?.output_text ?? null,
          output_type: Array.isArray(data?.output) ? data.output.map(x => x?.type || null) : null,
          raw: data
        }
      });
    }

    // ✅ 建议返回 reply（你前端已兼容 data.reply）
    return res.status(200).json({ reply: out });

  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      detail: String(err),
    });
  }
}
