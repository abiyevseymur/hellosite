import { JSDOM } from "jsdom";

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
