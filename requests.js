import axios from "axios";
import dotenv from "dotenv";
import getColors from "get-image-colors";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

dotenv.config();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function sendOpenAIRequest(
  systemPrompt,
  userPrompt,
  temperature = 0,
  model = "gpt-4.1-mini"
) {
  console.log(
    "@@@ REQUEST OPENAI: ",
    "system prompt - ",
    systemPrompt,
    " | user prompt - ",
    userPrompt,
    " | temperature - ",
    temperature
  );
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: model || "gpt-4.1-mini",
      temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.choices[0].message.content.trim();
}

export async function searchImages(keyword) {
  const response = await axios.get("https://api.unsplash.com/search/photos", {
    params: {
      query: keyword, // e.g. "tacos", "startup", "fitness"
      per_page: 5,
    },
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
    },
  });

  const imageUrls = response.data.results.map((photo) => photo.urls.regular);
  return imageUrls;
}

export async function getLogoColorsFromUrl(logoUrl) {
  try {
    const tempFile = path.resolve("./tmp", `${uuidv4()}.jpg`);

    // Download the logo image
    const response = await axios.get(logoUrl, { responseType: "arraybuffer" });
    fs.mkdirSync("./tmp", { recursive: true });
    fs.writeFileSync(tempFile, response.data);
    // Extract colors from the downloaded image
    const colors = await getColors(tempFile);

    // Clean up
    fs.unlinkSync(tempFile);

    // Return HEX colors
    return colors.map((color) => color.hex());
  } catch (error) {
    console.error("Failed to extract logo colors:", error.message);
    return [];
  }
}

export async function generatePreviewImages(
  ctx,
  htmlContent,
  outputName = "index",
  outputFolder = null
) {
  const outputDir = outputFolder || path.resolve(__dirname, "screenshots");
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  const fullHtml = htmlContent.includes("<html")
    ? htmlContent
    : `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
     <link href="https://cdn.jsdelivr.net/npm/Tailwind@5.3.5/dist/css/Tailwind.min.css" rel="stylesheet" integrity="sha384-SgOJa3DmI69IUzQ2PVdRZhwQ+dy64/BUtbMJw1MZ8t5HZApcHrRKUc4W0kG879m7" crossorigin="anonymous">
        <style>body { margin: 0; }</style>
      </head>
      <body>${htmlContent}</body>
      </html>`;
  // Desktop
  await page.setViewport({ width: 1200, height: 800 });
  await page.setContent(fullHtml, { waitUntil: "networkidle0" });
  const desktopPath = path.join(outputDir, `${outputName}-desktop.png`);
  await page.screenshot({ path: desktopPath, fullPage: true });
  await ctx.reply("🖥️ Desktop version!");
  await ctx.replyWithPhoto({ source: desktopPath });

  // Mobile
  await page.setViewport({ width: 375, height: 812, isMobile: true });
  await page.setContent(fullHtml, { waitUntil: "networkidle0" });
  const mobilePath = path.join(outputDir, `${outputName}-mobile.png`);
  await page.screenshot({ path: mobilePath, fullPage: true });
  await ctx.reply("📱 Mobile version!");
  await ctx.replyWithPhoto({ source: mobilePath });

  await browser.close();
}
