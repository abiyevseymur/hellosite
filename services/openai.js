import { loadSession, saveSession } from "./sessionStore.js";
import { skippableFields } from "../data.js";
import { askQuestionPrompt } from "../prompts.js";
import { userSessions } from "../index.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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

export async function askQuestion(ctx, about) {
  const chatId = ctx.chat.id;
  let session = userSessions.get(chatId);
  if (!session) {
    session = await loadSession(chatId);
    userSessions.set(chatId, session);
  }
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
  await saveSession(chatId, session);
}
