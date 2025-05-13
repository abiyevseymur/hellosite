import pg from "pg";
const { Pool } = pg;

export const db = new Pool({
  user: "seymurabiyev",
  host: "localhost",
  database: "hellosite",
  password: "123123456",
  port: 5432,
});

// Создаём таблицу
await db.query(`
  CREATE TABLE IF NOT EXISTS html_blocks (
    id TEXT,
    chat_id BIGINT,
    project_id TEXT,
    tag TEXT,
    content TEXT,
    embedding VECTOR(1536),
    PRIMARY KEY (id, chat_id, project_id)
  );
  `);
