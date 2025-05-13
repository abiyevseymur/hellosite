import * as cheerio from "cheerio";
import { db } from "./database/db.js";
import { OpenAI } from "openai";
import { systemEditPrompt } from "./prompts.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Ищет похожие HTML-блоки по смыслу
 * @param {string} chatId - Telegram chat ID
 * @param {string} projectId - Идентификатор проекта
 * @param {string} userQuery - Текстовый запрос (например, "измени цвет кнопки")
 * @param {number} limit - Количество совпадений
 * @returns {Array} Массив подходящих HTML-блоков
 */
export async function searchClosestBlocks(
  chatId,
  projectId,
  userQuery,
  limit = 3
) {
  // 1. Получаем embedding для запроса
  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: userQuery,
  });
  const vector = `[${embeddingRes.data[0].embedding.join(",")}]`;

  // 2. SQL: поиск по косинусному расстоянию <-> (pgvector)
  const res = await db.query(
    `
      SELECT id, tag, content
      FROM html_blocks
      WHERE chat_id = $1 AND project_id = $2 
      ORDER BY embedding <-> $3
      LIMIT $4
    `,
    [chatId, projectId, vector, limit]
  );

  return res.rows;
}

export async function applyEditToBlock(htmlBlock, instruction) {
  const messages = [
    {
      role: "system",
      content: systemEditPrompt,
    },
    {
      role: "user",
      content: `
Edit the following HTML block according to the instruction:
"${instruction}"

HTML block:
${htmlBlock}
      `.trim(),
    },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages,
    temperature: 0,
  });

  const raw = completion.choices[0].message.content.trim();

  // Специальная обработка <style>
  if (raw.startsWith("<style") || raw.includes(":root")) {
    console.log("🎨 Edited <style> block");
    return raw;
  }

  // Обычный HTML-блок
  const $ = cheerio.load(raw, { xmlMode: false });
  const cleanedBlock =
    $("body").children().first().length > 0
      ? $("body").children().first()
      : $.root().children().first();

  const final = $.html(cleanedBlock);
  const blockId = cleanedBlock?.attr("id");

  if (!blockId) {
    console.warn("⚠️ GPT returned block without id — fallback may be needed.");
  }

  console.log("📝 Edited block:", final.slice(0, 200));
  return final;
}
