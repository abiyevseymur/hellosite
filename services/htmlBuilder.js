import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { buildPatternPrompt, autoSelectPatterns } from "../patterns.js";
import { generatePagePrompt } from "../prompts.js";
import { sendOpenAIRequest } from "./openai.js";
import { generatePreviewImages, searchImages } from "./helpers.js";
import { db } from "../database/db.js";
import * as cheerio from "cheerio";
import { openai } from "./openai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateRandomPageBasedOnInitialValues(ctx, session) {
  try {
    await ctx.reply(
      "I’ll start by generating a site brief and the first version of your site. Once they’re ready, you’ll be able to edit the site brief to generate new versions until you have a design you love..."
    );

    const projectName = session.answers.projectName;
    const type = session.answers.typeStructure?.main;

    // 🖼️ Search for related Unsplash images
    const images = await searchImages(type);

    const colors = session.answers.colors;

    const patterns = autoSelectPatterns(
      session.patterns,
      session.config.sections
    );

    const userMessage = buildPatternPrompt({
      description: session.answers.shortDescription,
      goal: session.answers.goal,
      projectName,
      websiteType: type,
      logoUrl: session.answers.logo,
      imageList: images,
      goal: session.answers.goal,
      colors,
      patterns,
      sections: session.config.sections,
    });
    session.patterns = patterns;

    const html = await sendOpenAIRequest(generatePagePrompt, userMessage, 0.2);
    const filename = `index.html`;
    const folderName = `${ctx.chat.id}__${projectName
      .toLowerCase()
      .replace(/\s+/g, "-")}`;
    session.generatedFolder = folderName;
    const folderPath = path.resolve(__dirname, `../generated`, folderName);
    await fs.mkdir(folderPath, { recursive: true });
    const filePath = path.resolve(folderPath, filename);
    await fs.writeFile(filePath, html, "utf8");

    await generatePreviewImages(
      ctx,
      html,
      filename.replace(/\.html$/, ""),
      folderPath
    );

    await ctx.reply("✅ Landing page generated with real images.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Generate New", callback_data: "generate_new" }],
          [{ text: "👍 I like this!", callback_data: "like_current" }],
        ],
      },
    });
  } catch (error) {
    console.error("generateRandomPageBasedOnInitialValues error:", error);
    await ctx.reply("❌ Failed to generate landing page.");
  }
}

export async function embedHtmlBlock(chatId, projectId, blockId, newHtml) {
  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: newHtml,
  });
  const embedding = `[${embeddingRes.data[0].embedding.join(",")}]`;

  await db.query(
    `
    UPDATE html_blocks
    SET content = $1, embedding = $2
    WHERE chat_id = $3 AND project_id = $4 AND id = $5
  `,
    [newHtml, embedding, chatId, projectId, blockId]
  );
  console.log(
    "🔁 Updating block",
    blockId,
    "with content:",
    newHtml.slice(0, 100)
  );
}

/**
 * Заменяет блоки в index.html на обновлённые версии из PG
 * @param {number} chatId - Telegram chat ID
 * @param {string} projectId - название проекта
 * @param {string} htmlPath - путь к index.html (по умолчанию заменяет сам себя)
 */
export async function assembleHtmlUsingOriginalTemplate(
  chatId,
  projectId,
  htmlPath
) {
  console.log(
    `🛠 Updating ${htmlPath} for chat ${chatId} / project ${projectId}`
  );
  let originalHtml;
  try {
    originalHtml = await fs.readFile(htmlPath, "utf-8");
  } catch (err) {
    console.error("❌ Failed to read index.html:", err.message);
    throw err;
  }

  const $ = cheerio.load(originalHtml, { decodeEntities: false });

  const blocksRes = await db.query(
    `
    SELECT id, content FROM html_blocks
    WHERE chat_id = $1 AND project_id = $2
    ORDER BY id ASC
  `,
    [chatId, projectId]
  );

  if (!blocksRes.rows.length) {
    throw new Error("❌ No HTML blocks found in database for this project.");
  }

  console.log(`📦 Replacing ${blocksRes.rows.length} blocks in DOM...`);
  let replacedCount = 0;

  for (const row of blocksRes.rows) {
    let newNode;
    if (row.id === "head-style") {
      // ⛔ Не парсим — просто используем как строку
      const styleHtml = row.content.trim();
      const headStyle = $("head style").first();
      if (headStyle.length > 0) {
        headStyle.replaceWith(styleHtml);
        replacedCount++;
        console.log("🎨 Replaced <style> in <head>");
      } else {
        $("head").append(styleHtml);
        replacedCount++;
        console.log("➕ Inserted new <style> into <head>");
      }
      continue;
    } else {
      const updated = cheerio.load(row.content, { xmlMode: false });
      newNode = updated("body").length
        ? updated("body").children().first()
        : updated.root().children().first();
    }
    // 🔁 Обновляем <style> в <head>
    if (row.id === "head-style") {
      const headStyle = $("head style").first();
      if (headStyle.length > 0) {
        headStyle.replaceWith(newNode);
        replacedCount++;
        console.log("🎨 Replaced <style> in <head>");
      } else {
        $("head").append(newNode); // если style не найден — добавим
        replacedCount++;
        console.log("➕ Inserted new <style> into <head>");
      }
      continue; // пропускаем дальнейшие шаги
    }
    if (!newNode) {
      console.warn(
        "⚠️ Block content has no root node:",
        row.content.slice(0, 100)
      );
      continue;
    }

    const blockId = newNode.attr("id") || updated("[id]").first().attr("id");

    if (!blockId) {
      console.warn(
        "⚠️ Could not extract ID from block:",
        row.content.slice(0, 100)
      );
      continue;
    }
    console.log("🔎 Looking for block ID:", blockId, "in HTML");

    const existing = $(`[id="${blockId}"]`);
    if (existing.length > 0) {
      existing.replaceWith(newNode);
      replacedCount++;
      console.log(`✅ Replaced block ID: ${blockId}`);
    } else {
      console.warn(`⚠️ Block ID not found in original HTML: ${blockId}`);
    }
  }

  const finalHtml = $.html({ decodeEntities: false });

  try {
    await fs.writeFile(htmlPath, finalHtml, "utf-8");
    console.log(
      `✅ index.html updated in place. Blocks replaced: ${replacedCount}/${blocksRes.rows.length}`
    );
  } catch (err) {
    console.error("❌ Failed to overwrite index.html:", err.message);
    throw err;
  }

  return finalHtml;
}
