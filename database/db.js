import pg from "pg";
const { Pool } = pg;

export const db = new Pool({
  user: "seymurabiyev",
  host: "localhost",
  database: "hellosite",
  password: "123123456",
  port: 5432,
});
