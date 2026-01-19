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

    const instructions =
      "你是 META YI 的对话内核。语气克制、清晰、有边界。不确定时要追问澄清，不要编造事实。";

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
