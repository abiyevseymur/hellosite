import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { promisify } from "util";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

export const deployGitAndPreview = async (ctx, session) => {
  const projectName = session.answers.projectName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
  session.repo = projectName;
  const folderPath = path.resolve(
    __dirname,
    `../generated`,
    session.generatedFolder
  );

  const deployCommand = `node "${path.resolve(
    __dirname,
    "deploy.js"
  )}" --token="${
    process.env.GITHUB_TOKEN
  }" --org="hellositeai" --repo="${projectName}" --dir="${folderPath}"`;

  try {
    const { stdout, stderr } = await execAsync(deployCommand);

    if (stderr && !stderr.includes("already enabled")) {
      console.error(`Deployment warning: ${stderr}`);
    }

    const siteUrl = `https://hellositeai.github.io/${projectName}/`;

    console.log(`✅ Successful deployment:\n${stdout}`);
    session.siteUrl = siteUrl;
    await ctx.reply(
      `🚀 <b>Deployment Successful!</b>\n\n🔗 <a href="${siteUrl}">Click here to view your website</a>\n\n<i>This is a preview link. Later, you will be able to connect a real custom domain!</i>\n\nIt may take a few seconds to appear globally.`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error(`❌ Error during deployment: ${error.message}`);
    await ctx.reply("❌ Deployment failed. Please try again later.");
  }
};
