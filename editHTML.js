import { JSDOM } from "jsdom";
import { sectionLabels } from "./data.js";
import fs from "fs/promises";

/**
 * Извлекает тексты, ссылки и изображения из HTML и группирует их по секциям.
 * @param {string} html - HTML-код страницы
 * @returns {Object} - JSON, сгруппированный по секциям
 */
export function extractContentFromHTML(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const result = {};

  const elementsWithId = document.querySelectorAll("[id]");

  elementsWithId.forEach((el) => {
    const id = el.id?.trim();
    const match = id.match(/^(text|img|link)-([a-z]+)-(\d+)$/i);
    if (!match) return;

    const [, type, section, index] = match;
    const sectionKey = section.toLowerCase();

    if (!result[sectionKey]) result[sectionKey] = {};

    if (type === "text") {
      result[sectionKey][id] = el.textContent.trim();
    } else if (type === "img") {
      const src = el.getAttribute("src")?.trim() || "";
      result[sectionKey][id] = src;
    } else if (type === "link") {
      result[sectionKey][id] = {
        href: el.getAttribute("href")?.trim() || "",
        text: el.textContent.trim(),
      };
    }
  });

  return result;
}

/**
 * Обновляет HTML-код значениями из JSON по ID и сохраняет в файл
 * @param {string} html - исходный HTML-код
 * @param {object} json - JSON вида { section: { id: value } }
 * @param {object} session - объект с путём к проекту (session.generatedFolder, session.answers.projectName)
 * @returns {Promise<void>}
 */
export async function applyJsonToHTML(html, json, htmlPath) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  Object.values(json).forEach((section) => {
    Object.entries(section).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (!el) return;

      const type = id.split("-")[0];

      if (type === "text") {
        el.textContent = value;
      } else if (type === "img") {
        el.setAttribute("src", value);
      } else if (type === "link") {
        el.setAttribute("href", value.href || "#");
        el.textContent = value.text || "";
      }
    });
  });

  const updatedHTML = dom.serialize();
  await fs.writeFile(htmlPath, updatedHTML, "utf8");
}

export const showEditableSections = (ctx, sections) => {
  const keyboard = sections.map((section) => {
    return [
      {
        text: sectionLabels[section] || section,
        callback_data: `edit_section_${section}`,
      },
    ];
  });
  keyboard.push([
    {
      text: "👀 Preview site",
      callback_data: `show_preview`,
    },
  ]);

  return ctx.reply("🧩 Choose the section you want to edit:", {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
};

export const saveAndNext = async (ctx, session) => {
  session.editing.currentIndex++;

  if (session.editing.currentIndex >= session.editing.keys.length) {
    await saveContent(ctx, session);
    return showEditableSections(ctx, session.config.sections);
  }
  handleEdit(ctx, session);
};

const saveContent = async (ctx, session) => {
  const jsonPath = `./generated/${session.generatedFolder}/${session.answers.projectName}.json`;
  const json = JSON.parse(await fs.readFile(jsonPath, "utf8"));

  json[session.editing.section] = session.editing.content;
  // Save updated JSON to file
  await fs.writeFile(jsonPath, JSON.stringify(json, null, 2), "utf8");

  session.editing = null;
  await ctx.reply("✅ All content updated and saved.");
  return;
};

export const handleEdit = async (ctx, session) => {
  const currentKey = session.editing.keys[session.editing.currentIndex];
  const currentValue = session.editing.content[currentKey];
  console.log(
    "📝 Editing content:",
    currentKey,
    " | ",
    currentValue,
    " | ",
    session.editing.currentIndex
  );
  const keyType = currentKey.split("-")[0];

  const typeLabelMap = {
    text: `✏️  Please enter new text for:\n\n💬 *"${
      currentValue.text || currentValue
    }"*\n\n👇 Or press Skip to leave it unchanged.`,
    img: "Image URL or upload an image",
    link: "Link (website, email or #section)",
  };

  const displayLabel = typeLabelMap[keyType] || "Edit content";
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  await ctx.reply(`${displayLabel}`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "⏭ Skip", callback_data: "skip_edit" }]],
    },
  });
};
