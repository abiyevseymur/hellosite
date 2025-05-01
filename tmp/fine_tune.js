import { OpenAI } from "openai";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 1. Загрузка файла
const file = await openai.files.create({
  file: fs.createReadStream("tmp/fine_tune_landing.jsonl"),
  purpose: "fine-tune",
});
console.log("📂 File uploaded:", file.id);

// 2. Запуск обучения
const fineTune = await openai.fineTuning.jobs.create({
  training_file: file.id,
  model: "gpt-3.5-turbo",
});
console.log("🚀 Fine-tuning started:", fineTune.id);
