import simpleGit from "simple-git";
import fetch from "node-fetch";
import path from "path";
import minimist from "minimist";
import fs from "fs-extra";

const args = minimist(process.argv.slice(2));

const GITHUB_TOKEN = args.token;
const ORG_NAME = args.org;
const REPO_NAME = args.repo;
const PROJECT_DIR = path.resolve(args.dir);
const GITHUB_API = "https://api.github.com";

if (!GITHUB_TOKEN || !ORG_NAME || !REPO_NAME || !PROJECT_DIR) {
  console.error(
    "❌ Missing required arguments. Please provide --token, --org, --repo, and --dir."
  );
  process.exit(1);
}

(async () => {
  try {
    const checkRepoResponse = await fetch(
      `${GITHUB_API}/repos/${ORG_NAME}/${REPO_NAME}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (checkRepoResponse.status === 404) {
      console.log("ℹ️ Repository not found. Creating new repository...");

      const createRepoResponse = await fetch(
        `${GITHUB_API}/orgs/${ORG_NAME}/repos`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
          },
          body: JSON.stringify({
            name: REPO_NAME,
            private: false,
          }),
        }
      );

      if (!createRepoResponse.ok) {
        const error = await createRepoResponse.json();
        throw new Error(`Error creating repository: ${error.message}`);
      }

      console.log("✅ Repository created successfully.");
    } else if (checkRepoResponse.ok) {
      console.log("✅ Repository already exists. Proceeding to deploy...");
    } else {
      const error = await checkRepoResponse.json();
      throw new Error(`Error checking repository: ${error.message}`);
    }

    // 2. initial local git-repo
    try {
      const gitFolderExists = fs.existsSync(path.join(PROJECT_DIR, ".git"));
      const git = simpleGit(PROJECT_DIR);

      if (!gitFolderExists) {
        console.log("📂 No Git repo found. Initializing new repository...");
        await git.init();
        await git.addRemote(
          "origin",
          `https://github.com/${ORG_NAME}/${REPO_NAME}.git`
        );
        await git.branch(["-M", "main"]);
      } else {
        console.log("📂 Git repo already exists. Skipping init.");
      }

      // ⚡ ADD THIS NEW LINE:
      await git.raw(["config", "http.postBuffer", "524288000"]);
      await git.add(".");
      await git.commit(`Update ${new Date().toISOString()}`);
      await git.push("origin", "main", ["--force"]);

      console.log("🚀 Project files pushed to GitHub!");
    } catch (error) {
      console.error("Error when add", error);
    }

    console.log("Git pushed. Activate GitHub Pages...");
    console.log(
      "⏳ Waiting a few seconds for GitHub to register the branch..."
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
    // 3. Turn on GitHub Pages from API
    const enablePagesResponse = await fetch(
      `${GITHUB_API}/repos/${ORG_NAME}/${REPO_NAME}/pages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          source: {
            branch: "main",
            path: "/",
          },
        }),
      }
    );

    if (!enablePagesResponse.ok) {
      const error = await enablePagesResponse.json();
      throw new Error(`Error in activation Pages: ${error.message}`);
    }

    console.log(`✅ Success: the site will be available in few seconds on:
https://${ORG_NAME}.github.io/${REPO_NAME}/`);
  } catch (error) {
    console.error("❌ error:", error.message);
  }
})();
