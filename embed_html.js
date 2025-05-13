import fs from "fs";
import * as cheerio from "cheerio";
import { OpenAI } from "openai";
import pg from "pg";
import dotenv from "dotenv";
import crypto from "crypto";
import { db } from "./database/db.js";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export async function processHtmlFile(htmlPath, chatId, projectId) {
  const html = fs.readFileSync(htmlPath, "utf-8");
  const $ = cheerio.load(html);
  const tags = ["header", "section", "footer", "article"];
  const blocks = [];

  // ✅ Добавим <style> в <head>
  const styleTag = $("head style").first();
  if (styleTag.length > 0) {
    const styleId = "head-style";
    const content = $.html(styleTag);

    blocks.push({
      id: styleId,
      tag: "style",
      content,
    });

    console.log(`🎨 Extracted <style> block with id="${styleId}"`);
  }

  // ✅ Обычные теги
  $(tags.join(",")).each((_, el) => {
    const tag = $(el);
    const tagName = el.tagName;
    const tagId =
      tag.attr("id") ||
      `block-${crypto
        .createHash("md5")
        .update(tag.html())
        .digest("hex")
        .slice(0, 6)}`;

    tag.attr("id", tagId); // гарантируем ID

    const content = $.html(tag); // Чистый HTML блока
    blocks.push({ id: tagId, tag: tagName, content });

    console.log(`📦 Extracted <${tagName}> block with id="${tagId}"`);
  });

  // ✅ Сохраняем в базу
  for (const block of blocks) {
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: block.content,
    });

    const embedding = `[${embeddingRes.data[0].embedding.join(",")}]`;

    await db.query(
      `
      INSERT INTO html_blocks (id, chat_id, project_id, tag, content, embedding)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id, chat_id, project_id) DO UPDATE
      SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
      `,
      [block.id, chatId, projectId, block.tag, block.content, embedding]
    );

    console.log(`✅ Saved block ${block.id} to database`);
  }

  console.log(
    `🎯 Finished processing ${blocks.length} blocks from ${htmlPath}`
  );
}
