import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const GODADDY_API_KEY = process.env.GODADDY_API_KEY;
const GODADDY_API_SECRET = process.env.GODADDY_API_SECRET;

const SUGGEST_SUFFIXES = [
  "com",
  "ai",
  "net",
  "org",
  "app",
  "tools",
  "online",
  "site",
  "web",
  "dev",
];

export async function checkAndSuggestDomains(bot, domain, chatId) {
  try {
    const mainCheck = await checkDomain(domain);

    if (mainCheck.available) {
      return await sendAvailableDomain(bot, domain, mainCheck.price, chatId);
    }

    await bot.sendMessage(
      chatId,
      `❌ Domain *${domain}* is already taken.\n🔎 Looking for alternatives...`,
      {
        parse_mode: "Markdown",
      }
    );

    const alternatives = await suggestAvailableDomains(domain);

    if (alternatives.length > 0) {
      return sendDomainSuggestions(bot, alternatives, chatId);
    } else {
      return await bot.sendMessage(
        chatId,
        `😕 Sorry, no similar domains found.`
      );
    }
  } catch (err) {
    console.error("❌ Domain check failed:", err.message);
    await bot.sendMessage(
      chatId,
      "⚠️ Error checking domain. Please try again later."
    );
  }
}

async function sendAvailableDomain(bot, domain, priceRaw, chatId) {
  const priceUSD = (priceRaw / 1_000_000).toFixed(2);
  const buyUrl = getBuyLink(domain);

  return bot.sendMessage(
    chatId,
    `✅ Domain *${domain}* is available!\n💵 Price: *$${priceUSD}*`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: `🌐 Buy now`, url: buyUrl }]],
      },
    }
  );
}

async function sendDomainSuggestions(bot, domains, chatId) {
  const keyboard = domains.map((d) => [
    {
      text: `${d.domain} ~$${d.price}`,
      callback_data: `check_${d.domain}`,
    },
  ]);

  return bot.sendMessage(chatId, `🧩 Available similar domains:`, {
    reply_markup: { inline_keyboard: keyboard },
  });
}

function getBuyLink(domain) {
  return `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${domain}`;
}

async function suggestAvailableDomains(baseDomain) {
  const name = baseDomain.split(".")[0].replace(/[^a-z0-9]/gi, "");
  const suggestions = [];

  for (const suffix of SUGGEST_SUFFIXES) {
    const altDomain = `${name}-${suffix}.app`;
    const check = await checkDomain(altDomain);
    if (check.available) {
      suggestions.push({
        domain: altDomain,
        price: (check.price / 1_000_000).toFixed(2),
      });
      if (suggestions.length >= 5) break;
    }
  }

  return suggestions;
}

export async function filterAvailableDomains(domains) {
  const results = [];

  for (let raw of domains) {
    const domain = raw.trim().toLowerCase();

    try {
      const check = await checkDomain(domain);
      if (check.available) {
        results.push({
          domain,
          price: (check.price / 1_000_000).toFixed(2),
        });
      }
    } catch (_) {
      // можно логировать, если нужно
    }

    if (results.length >= 5) break;
  }

  return results;
}

export async function checkDomain(domain) {
  const cleaned = domain.trim().toLowerCase();

  if (!/^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i.test(cleaned)) {
    throw new Error(`Invalid domain format: "${domain}"`);
  }

  const response = await axios.get(
    `https://api.godaddy.com/v1/domains/available?domain=${cleaned}`,
    {
      headers: {
        Authorization: `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
        Accept: "application/json",
      },
    }
  );

  console.log("GODADDY API response:", response);

  return response.data;
}
