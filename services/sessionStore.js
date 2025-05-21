import { db } from "../database/db.js";

export async function loadSession(chatId) {
  const res = await db.query(
    "SELECT session FROM sessions WHERE chat_id = $1",
    [chatId]
  );
  return res.rows[0]?.session || {};
}

export async function saveSession(chatId, currentProject) {
  console.log("💾 Saving current project for chatId:", chatId, currentProject);

  // 1. Загружаем текущую сессию из базы
  const existingRes = await db.query(
    `SELECT session FROM sessions WHERE chat_id = $1`,
    [chatId]
  );

  let updatedSession = { projects: [], currentProjectIndex: 0 };

  if (existingRes.rows.length) {
    updatedSession = existingRes.rows[0].session;

    const index = updatedSession.projects.findIndex(
      (p) => p.projectId === currentProject.projectId
    );

    if (index >= 0) {
      updatedSession.projects[index] = currentProject;
      updatedSession.currentProjectIndex = index;
    } else {
      updatedSession.projects.push(currentProject);
      updatedSession.currentProjectIndex = updatedSession.projects.length - 1;
    }
  } else {
    // Новый чат
    updatedSession.projects = [currentProject];
    updatedSession.currentProjectIndex = 0;
  }

  // 2. Сохраняем обновлённую сессию
  await db.query(
    `INSERT INTO sessions (chat_id, session, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (chat_id)
     DO UPDATE SET session = $2, updated_at = NOW()`,
    [chatId, updatedSession]
  );
}
