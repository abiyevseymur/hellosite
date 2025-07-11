# Cricinfo Parser

This module uses Nest.js together with Prisma to recursively scrape tables from `https://www.espncricinfo.com/records` and store them in PostgreSQL.

## Setup

1. Configure a PostgreSQL database and set the `DATABASE_URL` environment variable. Example:

   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cricinfo"
   ```

2. Install dependencies, generate the Prisma client and build the project:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
```

3. Run the scraper:

```bash
npm start
```

Tables are stored generically so that any table structure can be captured. Pages and tables are related through `page_id` and `parent_id` fields, enabling navigation of the hierarchy.
