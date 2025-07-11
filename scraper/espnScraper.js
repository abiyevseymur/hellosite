import axios from 'axios';
import cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';

const BASE_URL = 'https://www.espncricinfo.com';
const TEST_MATCHES_URL = `${BASE_URL}/records/format/test-matches-1`;

const prisma = new PrismaClient();

async function fetchHtml(url) {
  const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  return data;
}

async function parseCategories() {
  const html = await fetchHtml(TEST_MATCHES_URL);
  const $ = cheerio.load(html);
  const categories = [];
  $('a.ds-block.ds-py-3').each((_, el) => {
    const name = $(el).find('h5').text().trim();
    const href = $(el).attr('href');
    if (href) {
      categories.push({ name, url: BASE_URL + href });
    }
  });
  return categories;
}

async function saveCategory(cat) {
  return prisma.recordCategory.upsert({
    where: { url: cat.url },
    update: { name: cat.name },
    create: { name: cat.name, url: cat.url },
  });
}

async function parseTable(pageUrl) {
  const html = await fetchHtml(pageUrl);
  const $ = cheerio.load(html);
  const records = [];

  $('table').each((_, table) => {
    const headers = [];
    $(table)
      .find('thead tr th')
      .each((_, th) => headers.push($(th).text().trim()));

    $(table)
      .find('tbody tr')
      .each((_, row) => {
        const entry = {};
        $(row)
          .find('td')
          .each((i, cell) => {
            const header = headers[i] || `col_${i}`;
            entry[header] = $(cell).text().trim();
          });
        records.push(entry);
      });
  });
  return records;
}

async function scrape() {
  const cats = await parseCategories();
  for (const cat of cats) {
    const category = await saveCategory(cat);
    console.log(`Saved category: ${category.name}`);
    const rows = await parseTable(cat.url);
    for (const row of rows) {
      await prisma.record.create({
        data: { categoryId: category.id, data: row },
      });
    }
    console.log(`Added ${rows.length} records for ${category.name}`);
  }
}

scrape()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
