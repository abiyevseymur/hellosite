import axios from "axios";
import { Buffer } from "buffer";

// Конфигурация — укажи один раз
const GITHUB_API = "https://api.github.com";
const GITHUB_OWNER = "hellositeai";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
/**
 * Привязывает кастомный домен к GitHub Pages
 * @param {string} domain - Пример: 'hello-site.hellosite.app'
 * @param {string} repo - Пример: 'hello-site'
 * @param {string} branch - Ветка, по умолчанию 'main'
 */
export async function connectDomainToGitHubPages(
  domain,
  repo,
  branch = "main"
) {
  const contentUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${repo}/contents/CNAME`;
  const pagesUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${repo}/pages`;

  // Шаг 1: Загрузка CNAME файла
  let existingSha = null;

  try {
    const res = await axios.get(contentUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      params: { ref: branch },
    });
    existingSha = res.data.sha;
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error("❌ Failed to check existing CNAME:", err.message);
      throw err;
    }
  }

  const encodedContent = Buffer.from(domain).toString("base64");

  await axios.put(
    contentUrl,
    {
      message: `Set CNAME to ${domain}`,
      content: encodedContent,
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    },
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  console.log(`✅ CNAME uploaded: ${domain}`);

  // Шаг 2: Включаем GitHub Pages (если нужно)
  try {
    await axios.post(
      pagesUrl,
      {
        source: {
          branch,
          path: "/",
        },
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    console.log("✅ GitHub Pages enabled");
  } catch (err) {
    if (err.response?.status === 409) {
      console.log("ℹ️ GitHub Pages already enabled");
    } else {
      console.error("❌ Failed to enable GitHub Pages:", err.message);
      throw err;
    }
  }

  // Шаг 3: Устанавливаем кастомный домен и включаем HTTPS
  try {
    await axios.patch(
      pagesUrl,
      {
        cname: domain,
        https_enforced: true,
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
  } catch (error) {
    if (error.response?.status === 422) {
      console.log("ℹ️ Custom domain already set");
    } else {
      console.error("❌ Failed to set custom domain:", error.message);
      throw error;
    }
  }

  console.log(`🌍 Domain "${domain}" connected to GitHub Pages`);
}
