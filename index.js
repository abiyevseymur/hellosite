import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import {
  searchImages,
  getLogoColorsFromUrl,
  generatePreviewImages,
  sendOpenAIRequest,
} from "./requests.js";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { questions, mainQuestions, skippableFields } from "./data.js";
import { fileURLToPath } from "url";
import { buildPatternPrompt, autoSelectPatterns } from "./patterns.js";
import {
  askQuestionPrompt,
  generatePagePrompt,
  sectionPrompt,
} from "./prompts.js";
import { exec } from "child_process";
import { extractContentFromHTML } from "./editHTML.js";

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const userSessions = new Map();

bot.start(async (ctx) => {
  userSessions.set(ctx.chat.id, {
    answers: {},
    step: 1,
    sectionStep: 0,
    globalHTML: "",
  });

  await ctx.reply(questions.type);
});

bot.on("text", async (ctx) => {
  const session = userSessions.get(ctx.chat.id);
  if (!session) return;
  const input = ctx.message.text.trim();

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
});

bot.on("photo", async (ctx) => {
  const session = userSessions.get(ctx.chat.id);
  const fileId = ctx.message.photo.pop().file_id;
  const fileUrl = await ctx.telegram.getFileLink(fileId);
  const colors = await getLogoColorsFromUrl(fileUrl);
  console.log("Extracted Colors:", colors);
  session.answers.logo = fileUrl.href;
  session.answers.colors = colors;

  await generateRandomPageBasedOnInitialValues(ctx, session);
  console.log("@@@ final session", JSON.stringify(session));
});

bot.on("callback_query", async (ctx) => {
  const session = userSessions.get(ctx.chat.id);
  const action = ctx.callbackQuery.data;

  if (!session) return;

  if (action === "generate_new") {
    await ctx.answerCbQuery();
    await generateRandomPageBasedOnInitialValues(ctx, session);
  }

  if (action === "edit_current") {
    await ctx.answerCbQuery();
    console.log("📝 Edit current template:", session);
    try {
      const htmlPath = `./generated/${session.generatedFolder}/index.html`;
      const outputPath = `./generated/${session.generatedFolder}/${session.answers.projectName}.json`;

      const html = await fs.readFile(htmlPath, "utf8");
      const content = extractContentFromHTML(html);
      console.log("📦 Extracted content:", content);

      await fs.writeFile(outputPath, JSON.stringify(content, null, 2), "utf8");
      console.log(`✅ Saved extracted JSON to ${outputPath}`);
    } catch (err) {
      console.error("❌ Failed to read or write file:", err);
    }
  }
  // deployGitAndPreview(ctx, session);

  if (action.startsWith("skip_")) {
    await ctx.answerCbQuery();
    const field = action.replace("skip_", "");
    session.answers[field] = { keywords: ["default"] }; // or generate via AI
    const next = mainQuestions[session.step];
    if (next === "Logo") {
      await ctx.reply("Please, upload your logo...");
      return;
    }
    askQuestion(ctx, next);
    return;
  }
});

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

    const html = await sendOpenAIRequest(generatePagePrompt, userMessage, 0);
    const filename = `index.html`;
    const folderName =
      projectName.toLowerCase().replace(/\s+/g, "-") + "__" + uuidv4();
    session.generatedFolder = folderName;
    const folderPath = path.resolve(__dirname, `generated`, folderName);
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
          [{ text: "✏️ Edit Current", callback_data: "edit_current" }],
        ],
      },
    });
  } catch (error) {
    console.error("generateRandomPageBasedOnInitialValues error:", error);
    await ctx.reply("❌ Failed to generate landing page.");
  }
}

async function askQuestion(ctx, about) {
  const session = userSessions.get(ctx.chat.id);
  const userPrompt = `Project information: "${JSON.stringify(
    session.answers
  )}".\nAsk a short question to learn about website ${about}`;

  const generatedQuestion = await sendOpenAIRequest(
    askQuestionPrompt,
    userPrompt,
    0.7
  );

  const isSkippable = skippableFields.some((field) => field === about);
  const skipKey = isSkippable && {
    reply_markup: {
      inline_keyboard: [[{ text: "⏭ Skip", callback_data: `skip_${about}` }]],
    },
  };

  await ctx.reply(generatedQuestion, skipKey);
  session.step++;
}

export const deployGitAndPreview = (ctx, session) => {
  const projectName = session.answers.projectName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, ""); // sanitize project name for repo

  const folderPath = path.resolve(
    __dirname,
    `generated`,
    session.generatedFolder
  );

  const deployCommand = `node "${path.resolve(
    __dirname,
    "deploy.js"
  )}" --token="${
    process.env.GITHUB_TOKEN
  }" --org="hellositeai" --repo="${projectName}" --dir="${folderPath}"`;

  exec(deployCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error running deploy.js: ${error.message}`);
      ctx.reply("❌ Deployment failed. Please try again later.");
      return;
    }
    if (stderr) {
      console.error(`Deployment warning: ${stderr}`);
      // optional: you can reply warning separately if you want
    }
    const siteUrl = `https://hellositeai.github.io/${projectName}/`;
    console.log(`✅ Successful deployment:\n${stdout}`);
    ctx.reply(
      `🚀 <b>Deployment Successful!</b>\n\n🔗 <a href="https://hellositeai.github.io/${projectName}/">Click here to view your website</a>\n\n<i>This is a preview link. Later, you will be able to connect a real custom domain!</i>\n\nIt may take a few seconds to appear globally.`,
      { parse_mode: "HTML" }
    );
  });
};

bot.launch().then(() => {
  console.log("🤖 Bot is up and running.");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
