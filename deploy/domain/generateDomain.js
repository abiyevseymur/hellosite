import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateDomainIdeas(description) {
  const prompt = `
  You are a startup branding assistant.

  Based on the following short project description, generate 10 creative and available domain name ideas. 
  Each idea should include a full domain (name + TLD), such as: "cryptoflow.ai", "taskmate.app", etc.

  Only return a plain list. Do NOT include explanations.

  Project description: "${description}"
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.choices[0].message.content;
  console.log("Prompt Generate Domain to OpenAI:", prompt, text);
  const domains = text
    .split(/\n/)
    .map((line) =>
      line
        .replace(/^[0-9\.\-\s]+/, "")
        .trim()
        .toLowerCase()
    )
    .filter((d) => /^[a-z0-9-]+\.[a-z]{2,}$/.test(d)); // only valid domain-looking strings

  return domains;
}
