export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, context } = req.body || {};
    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    const instructions =
      "你是 META YI 的对话内核。语气克制、清晰、有边界。不确定时要追问澄清，不要编造事实。";

    const input = Array.isArray(context) && context.length
      ? context
      : [{ role: "user", content: text }];

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

    return res.status(200).json({
      text: data.output_text || "",
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      detail: String(err),
    });
  }
}
