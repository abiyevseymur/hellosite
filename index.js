import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import { getLogoColorsFromUrl } from "./services/helpers.js";
import { sendOpenAIRequest } from "./services/openai.js";
import fs from "fs/promises";
import { questions, mainQuestions, skippableFields } from "./data.js";
import { sectionPrompt } from "./prompts.js";
import { generatePreviewImages } from "./services/helpers.js";
import {
  saveAndNext,
  showEditableSections,
  applyJsonToHTML,
} from "./editHTML.js";
import { loadSession, saveSession } from "./services/sessionStore.js";
import { generateRandomPageBasedOnInitialValues } from "./services/htmlBuilder.js";
import { askQuestion } from "./services/openai.js";
import { deployGitAndPreview } from "./deploy/gitPush.js";

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
              text: `✏️ Edit Current (${session.answers.projectName})`,
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

  // Handle editing text or link
  if (session.editing) {
    const currentKey = session.editing.keys[session.editing.currentIndex];
    const keyType = currentKey.split("-")[0];

    if (keyType === "text") {
      session.editing.content[currentKey] = input;
    } else if (keyType === "link") {
      session.editing.content[currentKey] = { href: input, text: input };
    }

    return saveAndNext(ctx, session);
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
      `🔧 Please configure your domain's DNS to point to:\nCNAME → hellosite.ai`
    );
    await ctx.reply(`✅ We'll map ${userDomain} to your project soon.`);
    session.customDomain = userDomain;
    delete session.expectingDomain;
    await saveSession(chatId, session);
    return;
  }
});

bot.on("photo", async (ctx) => {
  const chatId = ctx.chat.id;
  let session = userSessions.get(chatId);
  if (!session) {
    session = await loadSession(chatId);
    userSessions.set(chatId, session);
  }

  // If editing image
  if (session?.editing) {
    const currentKey = session.editing.keys[session.editing.currentIndex];
    const keyType = currentKey.split("-")[0];

    if (keyType === "img") {
      const fileId = ctx.message.photo.pop().file_id;
      const fileUrl = await ctx.telegram.getFileLink(fileId);
      session.editing.content[currentKey] = fileUrl.href;
      return saveAndNext(ctx, session);
    }
  }

  // Default logic if not editing
  const fileId = ctx.message.photo.pop().file_id;
  const fileUrl = await ctx.telegram.getFileLink(fileId);
  const colors = await getLogoColorsFromUrl(fileUrl);
  console.log("Extracted Colors:", colors);
  session.answers.logo = fileUrl.href;
  session.answers.colors = colors;

  await generateRandomPageBasedOnInitialValues(ctx, session);
  await saveSession(chatId, session);
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

  if (action === "skip_edit") {
    saveAndNext(ctx, session);
    return;
  }
  if (action === "generate_new") {
    await ctx.answerCbQuery();
    await generateRandomPageBasedOnInitialValues(ctx, session);
    session.generated++;
    await saveSession(chatId, session);
  }

  console.log("@@@ session", JSON.stringify(session));
  if (action === "edit_current") {
    await ctx.answerCbQuery();
    console.log("📝 Edit current template:", session);
    showEditableSections(ctx, session.config.sections);
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

  if (action.startsWith("edit_section_")) {
    const section = action.replace("edit_section_", "");
    const jsonPath = `./generated/${session.generatedFolder}/${session.answers.projectName}.json`;

    try {
      const json = JSON.parse(await fs.readFile(jsonPath, "utf8"));
      const sectionData = json[section];

      if (!sectionData) {
        await ctx.reply("❌ This section has no editable content.");
        return;
      }

      session.editing = {
        section,
        keys: Object.keys(sectionData),
        currentIndex: 0,
        content: sectionData,
      };
      saveAndNext(ctx, session);
      await saveSession(chatId, session);
    } catch (e) {
      console.error("❌ Failed to load JSON for editing", e);
      await ctx.reply("Something went wrong while loading the section.");
    }
  }

  if (action === "show_preview") {
    await ctx.reply("🖼️ Generating preview...");

    const folderPath = `./generated/${session.generatedFolder}`;
    const htmlPath = `${folderPath}/index.html`;
    const jsonPath = `${folderPath}/${session.answers.projectName}.json`;
    const html = await fs.readFile(htmlPath, "utf8");
    const json = JSON.parse(await fs.readFile(jsonPath, "utf8"));
    await applyJsonToHTML(html, json, htmlPath);
    const newHtml = await fs.readFile(htmlPath, "utf8");
    await generatePreviewImages(ctx, newHtml, `index`, folderPath);
    await ctx.reply("✅ Preview updated. What would you like to do next?", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✏️ Continue Editing", callback_data: "edit_current" },
            { text: "✅ Done Editing", callback_data: "editing_done" },
          ],
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

  if (action === "create_domain") {
    await ctx.answerCbQuery();
    await ctx.reply("🆕 Generating a custom subdomain for you...");
    const subdomain = `${session.answers.projectName
      .toLowerCase()
      .replace(/\s+/g, "-")}-${ctx.chat.id}.hellosite.ai`;

    session.liveUrl = `https://${subdomain}`;
    await ctx.reply(`✅ Your new domain: ${session.liveUrl}`);
    await saveSession(ctx.chat.id, session);
  }
});

bot.launch().then(() => {
  console.log("🤖 Bot is up and running.");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
