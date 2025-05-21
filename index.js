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
import { connectDomainToGitHubPages } from "./deploy/domain/connectDomainToGitHubPages.js";

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

export const userSessions = new Map();

bot.start(async (ctx) => {
  const chatId = ctx.chat.id;

  let session = await loadSession(chatId);
  if (session?.projects?.length) {
    const buttons = session.projects.map((proj, i) => [
      {
        text: `📁 ${
          proj.answers.projectName || "Untitled Project #" + (i + 1)
        }`,
        callback_data: `select_project_${i}`,
      },
    ]);

    await ctx.reply(
      "Welcome back! Which project do you want to continue editing?",
      {
        reply_markup: {
          inline_keyboard: [
            ...buttons,
            [{ text: "🆕 Create New Website", callback_data: "start_new" }],
          ],
        },
      }
    );
    return;
  }

  session = {
    projects: [
      {
        name: "",
        answers: {},
        config: {},
        step: 1,
      },
    ],
    currentProjectIndex: 0,
  };
  userSessions.set(chatId, session);
  await ctx.reply(questions.type);
});
bot.action("start_new", async (ctx) => {
  const chatId = ctx.chat.id;
  const session = {
    projects: [
      {
        name: "",
        answers: {},
        config: {},
        step: 1,
      },
    ],
    currentProjectIndex: 0,
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
  const currentProject = session.projects[session.currentProjectIndex];

  const input = ctx.message.text.trim();

  if (currentProject?.editing?.isActive) {
    const rawInput = currentProject.pendingImage
      ? `${input}: ${currentProject.pendingImage?.url}`
      : input;
    const chatId = ctx.chat.id;
    console.log(`📝 Raw user instruction: "${rawInput}" from chat ${chatId}`);

    await ctx.reply("🧠 Understanding your request...");

    // 1. Преобразуем обычный запрос в техническое описание
    const rephrasedPrompt = `
    You're a web developer assistant. The user said:
    "${rawInput}"
    
    Sections in the current landing page: ${
      Array.isArray(currentProject.config?.sections)
        ? currentProject.config.sections.join(", ")
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
        currentProject.projectId,
        userInstruction
      );

      console.log(`🔍 Found ${blocks.length} matching blocks`, blocks);

      if (!blocks.length) {
        await ctx.reply("⚠️ I couldn't find a relevant block. Try rephrasing.");
        await saveSession(chatId, currentProject);
        return;
      }

      const targetBlock = blocks[0];
      console.log(`🎯 Editing block ID: ${targetBlock.id}`);

      // 2. Отредактировать блок через GPT
      const updatedHtml = await applyEditToBlock(
        targetBlock.content,
        userInstruction
      );
      const folderPath = `./generated/${currentProject.generatedFolder}`;
      const htmlPath = `${folderPath}/index.html`;

      console.log(
        `✅ GPT returned updated HTML for block ${targetBlock.content}`
      );
      // 3. Сохранить изменения в БД
      await embedHtmlBlock(
        chatId,
        currentProject.projectId,
        targetBlock.id,
        updatedHtml
      );
      await assembleHtmlUsingOriginalTemplate(
        chatId,
        currentProject.projectId,
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
      currentProject.pendingImage = null;
      await saveSession(chatId, currentProject);
      console.log(`💾 Session updated for chat ${chatId}`);
    } catch (err) {
      console.error("❌ Error applying edit:", err);
      await ctx.reply(
        "❌ Something went wrong while editing. Please try again later."
      );
      currentProject.editing = null;
      await saveSession(chatId, currentProject);
    }
  }
  // Handle main questions
  if (!currentProject.answers.shortDescription) {
    currentProject.answers.shortDescription = input;
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
    currentProject.config = { typeStructure: typeJSON };
    currentProject.answers.typeStructure = typeJSON;
    await ctx.reply(`✅ Looks like your website type is: ${typeJSON?.main}`);
    const about = mainQuestions[currentProject.step];
    askQuestion(ctx, about);
    return;
  }

  if (!currentProject.answers.goal) {
    currentProject.answers.goal = input;
    const sections = await sendOpenAIRequest(
      sectionPrompt,
      `Based on the following project description and goal, select only the necessary sections from the allowed list and return them as a list of section keys:${input}`,
      0
    );
    console.log("@@@ SECTIONS", sections);
    currentProject.config.sections = JSON.parse(sections);
    const about = mainQuestions[currentProject.step];
    askQuestion(ctx, about);
    return;
  }
  if (!currentProject.answers.projectName) {
    currentProject.answers.projectName = input;
    await ctx.reply("Please, upload your logo...");
    return;
  }
  if (currentProject.expectingDomain === "connect") {
    const userDomain = input.replace(/^https?:\/\//, "").trim();

    await ctx.reply(
      `🔧 To connect your domain, please go to your domain provider's DNS settings and add the following record:\n\n` +
        `➡️ Type: CNAME\n` +
        `➡️ Name: www\n` +
        `➡️ Value: ${currentProject.siteUrl}\n\n` +
        `📌 This tells your domain to point to our server.`
    );

    await ctx.reply(`✅ We'll map ${userDomain} to your project soon.`);
    currentProject.customDomain = userDomain;
    delete currentProject.expectingDomain;
    connectDomainToGitHubPages(
      currentProject.customDomain,
      currentProject.repo
    );
    await saveSession(chatId, currentProject);
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
  const currentProject = session.projects[session.currentProjectIndex];

  if (currentProject.editing?.isActive) {
    if (caption) {
      // 📸 + ✍️ Одновременно
      await ctx.reply("🧠 Replacing image based on your caption...");

      const blocks = await searchClosestBlocks(
        chatId,
        currentProject.projectId,
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
      const htmlPath = `./generated/${currentProject.generatedFolder}/index.html`;
      await embedHtmlBlock(
        chatId,
        currentProject.projectId,
        targetBlock.id,
        updatedHtml
      );
      await assembleHtmlUsingOriginalTemplate(
        chatId,
        currentProject.projectId,
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

      currentProject.pendingImage = { url: fileUrl.href };
      await saveSession(chatId, currentProject);
    }
  }

  // Default logic if not editing
  if (!currentProject.editing?.isActive) {
    const colors = await getLogoColorsFromUrl(fileUrl);
    console.log("Extracted Colors:", colors);
    currentProject.answers.logo = fileUrl.href;
    currentProject.answers.colors = colors;

    await generateRandomPageBasedOnInitialValues(ctx, currentProject);
    await saveSession(chatId, currentProject);
  }
  console.log("@@@ final session", JSON.stringify(currentProject));
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
  const currentProject = session.projects[session.currentProjectIndex];

  if (action.startsWith("select_project_")) {
    const index = parseInt(action.split("_").pop());
    currentProject.currentProjectIndex = index;
    await ctx.answerCbQuery();

    await saveSession(chatId, currentProject);

    return ctx.reply(
      `Project - ${currentProject.answers.projectName}. What would you like to do?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `✏️ Edit (${currentProject.answers.projectName})`,
                callback_data: "edit_current",
              },
              { text: "🌍 Publish", callback_data: "editing_done" },
            ],
          ],
        },
      }
    );
  }
  if (action === "generate_new") {
    await ctx.answerCbQuery();
    await generateRandomPageBasedOnInitialValues(ctx, currentProject);
    currentProject.generated++;
    await saveSession(chatId, currentProject);
  }

  if (action === "like_current") {
    await ctx.answerCbQuery();
    console.log("📝 Edit current template:", currentProject);
    ctx.reply(`Great! Processing your website...`);
    const htmlPath = `./generated/${currentProject.generatedFolder}/index.html`;
    try {
      const projectId = uuid4();
      currentProject.projectId = projectId;
      await processHtmlFile(htmlPath, chatId, projectId);
      await saveSession(chatId, currentProject);
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
    await saveSession(chatId, currentProject);
  }
  if (action === "edit_current") {
    await ctx.answerCbQuery();
    //message  - now edit the current template type the task what you want to edit
    await ctx.reply(
      `📝 Please type a task what you want to edit in the current template.\nFor example: 'Change the logo', 'Add a new section', 'Update the text in the header'.`
    );
    console.log("📝 Edit current template:", currentProject);

    currentProject.editing = {
      isActive: true,
    };
    await saveSession(chatId, currentProject);
  }

  if (action === "editing_done") {
    await ctx.answerCbQuery();
    await ctx.reply("🚀 Deploying your website...");

    await deployGitAndPreview(ctx, currentProject);
    await ctx.reply(
      `✅ Now we need to connect a domain (e.g. yoursite.com – this is the web address where people will find your site)`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🌍 Connect my domain", callback_data: "connect_domain" }],
          ],
        },
      }
    );
    currentProject.editing = null;
    await saveSession(ctx.chat.id, currentProject);
  }

  if (action === "show_preview") {
    await ctx.reply("🖼️ Generating preview...");

    const folderPath = `./generated/${currentProject.generatedFolder}`;
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
    currentProject.expectingDomain = "connect";
  }
});

bot.launch().then(() => {
  console.log("🤖 Bot is up and running.");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
