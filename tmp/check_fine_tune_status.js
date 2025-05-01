import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function checkFineTuneStatus(fineTuneId) {
  try {
    const fineTune = await openai.fineTuning.jobs.retrieve(fineTuneId);
    console.log("✅ Fine-tune status:", fineTune.status);
    console.log("📊 Full details:", fineTune);
  } catch (error) {
    console.error("❌ Failed to get fine-tune status:", error.message);
  }
}

// Replace with your actual ID
checkFineTuneStatus("ftjob-ueChvsCnaOVof1CejTCiY7V8");
