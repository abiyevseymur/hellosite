import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { buildPatternPrompt, autoSelectPatterns } from "../patterns.js";
import { generatePagePrompt } from "../prompts.js";
import { sendOpenAIRequest } from "./openai.js";
import { generatePreviewImages, searchImages } from "./helpers.js";
import { extractContentFromHTML } from "../editHTML.js";

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

    const html = await sendOpenAIRequest(generatePagePrompt, userMessage, 0);
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
    const outputPath = `./generated/${session.generatedFolder}/${session.answers.projectName}.json`;

    const content = extractContentFromHTML(html);
    console.log("📦 Extracted content:", content);

    await fs.writeFile(outputPath, JSON.stringify(content, null, 2), "utf8");
    console.log(`✅ Saved extracted JSON to ${outputPath}`);

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
