import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import { getLogoColorsFromUrl } from "./services/helpers.js";
import { sendOpenAIRequest } from "./services/openai.js";
import fs from "fs/promises";
import { questions, mainQuestions } from "./data.js";
import { sectionPrompt } from "./prompts.js";

import { loadSession, saveSession } from "./services/sessionStore.js";
import {
  generateRandomPageBasedOnInitialValues,
  embedHtmlBlock,
  assembleHtmlUsingOriginalTemplate,
} from "./services/htmlBuilder.js";
import { askQuestion } from "./services/openai.js";
import { deployGitAndPreview } from "./deploy/gitPush.js";
import { processHtmlFile } from "./embed_html.js";
import { searchClosestBlocks, applyEditToBlock } from "./editHTML.js";
import { v4 as uuid4 } from "uuid";
import { generatePreviewImages } from "./services/helpers.js";
import { filterAvailableDomains } from "./deploy/domain/checkDomain.js";
import { generateDomainIdeas } from "./deploy/domain/generateDomain.js";
import { connectDomainToGitHubPages } from "./deploy/domain/connectDomainToGitHubPages.js";

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

export const userSessions = new Map();

bot.start(async (ctx) => {
  const chatId = ctx.chat.id;

  let session = await loadSession(chatId);
  if (session && session.answers?.projectName) {
    return ctx.reply("Welcome back! What would you like to do?", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `✏️ Edit (${session.answers.projectName})`,
              callback_data: "edit_current",
            },
            { text: "🆕 Create New Website", callback_data: "start_new" },
          ],
        ],
      },
    });
  }

  session = {
    answers: {},
    config: {},
    step: 1,
  };
  userSessions.set(chatId, session);
  await ctx.reply(questions.type);
});
bot.action("start_new", async (ctx) => {
  const chatId = ctx.chat.id;
  const session = {
    answers: {},
    config: {},
    step: 1,
  };
  userSessions.set(chatId, session);
  await ctx.editMessageText(questions.type);
});

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  let session = userSessions.get(chatId);
  if (!session) {
    session = await loadSession(chatId);
    userSessions.set(chatId, session);
  }

  if (!session) return;
  const input = ctx.message.text.trim();

  if (session?.editing?.isActive) {
    const rawInput = session.pendingImage
      ? `${input}: ${session.pendingImage?.url}`
      : input;
    const chatId = ctx.chat.id;
    console.log(`📝 Raw user instruction: "${rawInput}" from chat ${chatId}`);

    await ctx.reply("🧠 Understanding your request...");

    // 1. Преобразуем обычный запрос в техническое описание
    const rephrasedPrompt = `
    You're a web developer assistant. The user said:
    "${rawInput}"
    
    Sections in the current landing page: ${
      Array.isArray(session.config?.sections)
        ? session.config.sections.join(", ")
        : "unknown"
    }
    
    Based on the context of editing a landing page, return a short technical task describing what should be changed (e.g., "Update the text in the header", "Replace the hero image", "Change button color in footer").
    
    Return only the task, no explanation.
    `.trim();
    const userInstruction = await sendOpenAIRequest(
      "You help interpret user intent into technical HTML edit instructions.",
      rephrasedPrompt,
      0.2
    );

    console.log(
      `📝 Received edit instruction: "${userInstruction}" from chat ${chatId}`
    );

    await ctx.reply("🔄 Applying your change...");

    try {
      // 1. Найти релевантный блок
      const blocks = await searchClosestBlocks(
        chatId,
        session.projectId,
        userInstruction
      );

      console.log(`🔍 Found ${blocks.length} matching blocks`, blocks);

      if (!blocks.length) {
        await ctx.reply("⚠️ I couldn't find a relevant block. Try rephrasing.");
        await saveSession(chatId, session);
        return;
      }

      const targetBlock = blocks[0];
      console.log(`🎯 Editing block ID: ${targetBlock.id}`);

      // 2. Отредактировать блок через GPT
      const updatedHtml = await applyEditToBlock(
        targetBlock.content,
        userInstruction
      );
      const folderPath = `./generated/${session.generatedFolder}`;
      const htmlPath = `${folderPath}/index.html`;

      console.log(
        `✅ GPT returned updated HTML for block ${targetBlock.content}`
      );
      // 3. Сохранить изменения в БД
      await embedHtmlBlock(
        chatId,
        session.projectId,
        targetBlock.id,
        updatedHtml
      );
      await assembleHtmlUsingOriginalTemplate(
        chatId,
        session.projectId,
        htmlPath
      );
      console.log(`💾 Saved updated block ${targetBlock.id} to DB`);

      await ctx.reply(
        "✅ Your change has been applied. Give more tasks to change or:",
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "👀 Preview site", callback_data: "show_preview" },
                { text: "🌎 Publish", callback_data: "editing_done" },
              ],
            ],
          },
        }
      );
      session.pendingImage = null;
      await saveSession(chatId, session);
      console.log(`💾 Session updated for chat ${chatId}`);
    } catch (err) {
      console.error("❌ Error applying edit:", err);
      await ctx.reply(
        "❌ Something went wrong while editing. Please try again later."
      );
      session.editing = null;
      await saveSession(chatId, session);
    }
  }
  // Handle main questions
  if (!session.answers.shortDescription) {
    session.answers.shortDescription = input;
    const user = `Based on the following project description:
    "${input}"
    Return a JSON object with the most relevant category as "main", and up to 3 other relevant categories as "related".
    Respond only with:
    {
      "main": "...",
      "related": ["...", "..."]
    }`;
    const system = "Only return JSON.";
    const typeStructure = await sendOpenAIRequest(system, user);
    const typeJSON = JSON.parse(typeStructure);
    session.config = { typeStructure: typeJSON };
    session.answers.typeStructure = typeJSON;
    await ctx.reply(`✅ Looks like your website type is: ${typeJSON?.main}`);
    const about = mainQuestions[session.step];
    askQuestion(ctx, about);
    return;
  }

  if (!session.answers.goal) {
    session.answers.goal = input;
    const sections = await sendOpenAIRequest(
      sectionPrompt,
      `Based on the following project description and goal, select only the necessary sections from the allowed list and return them as a list of section keys:${input}`,
      0
    );
    console.log("@@@ SECTIONS", sections);
    session.config.sections = JSON.parse(sections);
    const about = mainQuestions[session.step];
    askQuestion(ctx, about);
    return;
  }
  if (!session.answers.projectName) {
    session.answers.projectName = input;
    await ctx.reply("Please, upload your logo...");
    return;
  }
  if (session.expectingDomain === "connect") {
    const userDomain = input.replace(/^https?:\/\//, "").trim();
    // Здесь можно добавить верификацию или инструкции
    await ctx.reply(
      `🔧 Please configure your domain's DNS to point to:\nCNAME → ${userDomain}`
    );
    await ctx.reply(`✅ We'll map ${userDomain} to your project soon.`);
    session.customDomain = userDomain;
    delete session.expectingDomain;
    await connectDomainToGitHubPages(userDomain, session.repo);
    await saveSession(chatId, session);
    return;
  }
});

bot.on("photo", async (ctx) => {
  const chatId = ctx.chat.id;
  let session = userSessions.get(chatId);
  const fileId = ctx.message.photo.pop().file_id;
  const fileUrl = await ctx.telegram.getFileLink(fileId);
  const caption = ctx.message.caption?.trim();

  if (!session) {
    session = await loadSession(chatId);
    userSessions.set(chatId, session);
  }
  if (session.editing?.isActive) {
    if (caption) {
      // 📸 + ✍️ Одновременно
      await ctx.reply("🧠 Replacing image based on your caption...");

      const blocks = await searchClosestBlocks(
        chatId,
        session.projectId,
        caption
      );
      if (!blocks.length) {
        await ctx.reply("⚠️ No matching block found.");
        return;
      }

      const targetBlock = blocks[0];
      const imageUrl = fileUrl.href;
      const instruction = `Replace the image in this block with this new one: ${imageUrl}`;
      const updatedHtml = await applyEditToBlock(
        targetBlock.content,
        instruction
      );
      const htmlPath = `./generated/${session.generatedFolder}/index.html`;
      await embedHtmlBlock(
        chatId,
        session.projectId,
        targetBlock.id,
        updatedHtml
      );
      await assembleHtmlUsingOriginalTemplate(
        chatId,
        session.projectId,
        htmlPath
      );
      await ctx.reply("✅ Your change has been applied.", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✏️ Edit More", callback_data: "edit_current" },
              { text: "👀 Preview site", callback_data: "show_preview" },
              { text: "🌎 Publish", callback_data: "editing_done" },
            ],
          ],
        },
      });
    } else {
      // Только фото — ждём инструкцию
      await ctx.reply(
        "📤 Photo received. Now tell me what image you'd like to replace."
      );

      session.pendingImage = { url: fileUrl.href };
      await saveSession(chatId, session);
    }
  }

  // Default logic if not editing
  if (!session.editing?.isActive) {
    const colors = await getLogoColorsFromUrl(fileUrl);
    console.log("Extracted Colors:", colors);
    session.answers.logo = fileUrl.href;
    session.answers.colors = colors;

    await generateRandomPageBasedOnInitialValues(ctx, session);
    await saveSession(chatId, session);
  }
  console.log("@@@ final session", JSON.stringify(session));
});

bot.on("callback_query", async (ctx) => {
  const chatId = ctx.chat.id;
  let session = userSessions.get(chatId);
  if (!session) {
    session = await loadSession(chatId);
    userSessions.set(chatId, session);
  }
  const action = ctx.callbackQuery.data;

  if (!session) return;

  // if (action === "skip_edit") {
  //   saveAndNext(ctx, session);
  //   return;
  // }
  if (action === "generate_new") {
    await ctx.answerCbQuery();
    await generateRandomPageBasedOnInitialValues(ctx, session);
    session.generated++;
    await saveSession(chatId, session);
  }

  console.log("@@@ session", JSON.stringify(session));
  if (action === "like_current") {
    await ctx.answerCbQuery();
    console.log("📝 Edit current template:", session);
    ctx.reply(`Great! Processing your website...`);
    const htmlPath = `./generated/${session.generatedFolder}/index.html`;
    try {
      const projectId = uuid4();
      session.projectId = projectId;
      await processHtmlFile(htmlPath, chatId, projectId);
      await saveSession(chatId, session);
    } catch (error) {
      console.error("Error processing HTML file:", error);
      await ctx.reply("❌ Failed to process HTML file.");
      return;
    }
    await ctx.reply(
      "✅ Your website is ready! You can now edit it or deploy it.",
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✏️ Edit", callback_data: "edit_current" },
              { text: "✅ Deploy Website", callback_data: "editing_done" },
            ],
          ],
        },
      }
    );
    await saveSession(chatId, session);
  }
  if (action === "edit_current") {
    await ctx.answerCbQuery();
    //message  - now edit the current template type the task what you want to edit
    await ctx.reply(
      `📝 Please type a task what you want to edit in the current template.\nFor example: 'Change the logo', 'Add a new section', 'Update the text in the header'.`
    );
    console.log("📝 Edit current template:", session);

    session.editing = {
      isActive: true,
    };
    await saveSession(chatId, session);
  }

  if (action === "editing_done") {
    await ctx.answerCbQuery();
    await ctx.reply("🚀 Deploying your website...");

    await deployGitAndPreview(ctx, session);
    await ctx.reply(
      `✅ Now we need to connect a domain (e.g. yoursite.com – this is the web address where people will find your site)`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🌍 Connect my domain", callback_data: "connect_domain" },
              {
                text: "🆕 Create a new domain",
                callback_data: "create_domain",
              },
            ],
          ],
        },
      }
    );
    session.editing = null;
    await saveSession(ctx.chat.id, session);
  }

  if (action === "create_domain") {
    await ctx.answerCbQuery();

    await ctx.reply(`✍️ Send your domain or generate with AI`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔮 Generate with AI",
              callback_data: "generate_ai_domain",
            },
          ],
        ],
      },
    });
  }
  if (action === "generate_ai_domain") {
    const rawIdeas = await generateDomainIdeas(
      session.answers.projectName + " " + session.answers.shortDescription
    );
    const available = await filterAvailableDomains(rawIdeas);
    console.log("Available domains:", available);
  }
  if (action === "show_preview") {
    await ctx.reply("🖼️ Generating preview...");

    const folderPath = `./generated/${session.generatedFolder}`;
    const htmlPath = `${folderPath}/index.html`;
    const html = await fs.readFile(htmlPath, "utf8");

    await generatePreviewImages(ctx, html, `index`, folderPath);
    await ctx.reply("✅ Preview updated. Give more tasks or:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🌎 Publish", callback_data: "editing_done" }],
        ],
      },
    });
  }

  if (action === "connect_domain") {
    await ctx.answerCbQuery();
    await ctx.reply(
      "🔗 Please send the domain you want to connect (e.g. `yourdomain.com`). We'll guide you to set it up."
    );
    session.expectingDomain = "connect";
  }
});

bot.launch().then(() => {
  console.log("🤖 Bot is up and running.");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
