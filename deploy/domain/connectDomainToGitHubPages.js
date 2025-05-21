import axios from "axios";
import { Buffer } from "buffer";

const GITHUB_API = "https://api.github.com";
const GITHUB_OWNER = "hellositeai";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

/**
 * Привязывает кастомный домен к репозиторию GitHub Pages
 * @param {string} domain - Например: 'wooley.hellosite.app'
 * @param {string} repo - Название репозитория, например: 'landing-wooley'
 * @param {string} branch - Ветка для GitHub Pages (по умолчанию 'main')
 */
export async function connectDomainToGitHubPages(
  domain,
  repo,
  branch = "main"
) {
  const contentUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${repo}/contents/CNAME`;
  const pagesUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${repo}/pages`;

  let existingSha = null;

  // Шаг 1: Проверка — существует ли уже CNAME
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

  // Шаг 2: Загрузка нового CNAME файла
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

  console.log(`✅ Uploaded CNAME: ${domain}`);

  // Шаг 3: Включаем GitHub Pages (если ещё не включён)
  try {
    await axios.post(
      pagesUrl,
      {
        source: { branch, path: "/" },
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

  // Шаг 4: Устанавливаем кастомный домен и HTTPS
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
    console.log(`🌐 Domain "${domain}" attached to GitHub Pages`);
  } catch (err) {
    if (err.response?.status === 422) {
      console.log("ℹ️ Domain already attached");
    } else {
      console.error("❌ Failed to set domain:", err.message);
      throw err;
    }
  }
}
