# HelloSite

This project contains a Telegram bot for generating landing pages and a separate NestJS + Prisma API server for managing record categories and tables.

## API Server

The NestJS server lives in the `server/` directory. It exposes endpoints for fetching record categories and tables stored in PostgreSQL using Prisma.

### Setup

1. Install dependencies (requires internet access):

```bash
cd server
npm install
```

2. Configure the database connection in `server/.env`:

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dbname"
```

3. Generate the Prisma client and run migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

4. Start the server in development mode:

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`.

### Endpoints

- `GET /categories` – list all root categories with their children
- `GET /categories/:id` – get a category by id with its children and tables
- `GET /tables/:id` – fetch a specific table

These endpoints can be consumed by a React front‑end to display nested categories. Parent categories can be clicked to reveal their children, while leaf categories return a table to render.

## Next.js Client (FSD)

The `client/` directory now contains a Next.js application organized using the [Feature Sliced Design](https://feature-sliced.design/) methodology. Pages live under `src/pages` with features, entities and shared utilities in their respective folders.

### Development

```bash
cd client
npm install
npm run dev
```

The client expects the API server to run on `http://localhost:3000`.
