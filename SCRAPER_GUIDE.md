# ESPN Cricinfo Records Scraper

This example demonstrates a scalable approach for collecting cricket records from the ESPN Cricinfo website. The goal is to fetch the **Test Matches** records section and store the tables in a PostgreSQL database using Prisma.

## Overview
1. **Prisma Schema** – located in `prisma/schema.prisma`. It defines two models:
   - `RecordCategory` – represents each record category on the site (e.g. "Most runs", "Highest averages").
   - `Record` – stores individual rows from the tables. The contents of each row are stored as JSON so that different table structures can be supported.
2. **Scraper** – `scraper/espnScraper.js` fetches the main Test Matches page, collects the category links and then processes each table. Data is inserted via the Prisma client.

This approach is independent of the exact table layout and can be extended to any other page on `espncricinfo.com/records`.

## Running
```bash
# install dependencies (requires network access)
npm install

# generate prisma client
npx prisma generate

# start scraping
node scraper/espnScraper.js
```

`DATABASE_URL` should be set in the environment or in a `.env` file so Prisma can connect to PostgreSQL.

The scraper uses Axios and Cheerio to parse HTML. If ESPN Cricinfo exposes a JSON API, the `fetchHtml` function can be replaced to call the API endpoints, which would reduce the amount of HTML parsing and speed up the process.

```
DATABASE_URL="postgresql://user:password@localhost:5432/hellosite"
```

This is a minimal example for demonstration purposes. In a real project, you can integrate the Prisma client into a NestJS backend and expose the data through an API, while Next.js can provide a frontend for browsing the stored records.
