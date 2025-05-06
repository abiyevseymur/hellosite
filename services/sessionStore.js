import { db } from "../database/db.js";

export async function loadSession(chatId) {
  const res = await db.query(
    "SELECT session FROM sessions WHERE chat_id = $1",
    [chatId]
  );
  return res.rows[0]?.session || {};
}

export async function saveSession(chatId, session) {
  console.log("Saving session for chatId:", chatId, session);
  await db.query(
    `INSERT INTO sessions (chat_id, session, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (chat_id)
     DO UPDATE SET session = $2, updated_at = NOW()`,
    [chatId, session]
  );
}
