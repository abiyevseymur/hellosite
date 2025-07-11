import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaService } from './prisma.service';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private visited = new Set<string>();

  constructor(private db: PrismaService) {}

  async scrape(url: string, parentId: number | null = null) {
    if (this.visited.has(url)) {
      return;
    }
    this.visited.add(url);
    this.logger.log(`Scraping ${url}`);

    const page = await this.db.page.upsert({
      where: { url },
      update: { parentId },
      create: { url, parentId },
    });
    const pageId = page.id;

    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      const tables = $('table');
      tables.each(async (_, elem) => {
        const title = $(elem).prev('h2, h3').first().text() || null;
        const headers: string[] = [];
        $(elem)
          .find('thead tr th')
          .each((_, th) => headers.push($(th).text().trim()));
        const rows: any[] = [];
        $(elem)
          .find('tbody tr')
          .each((_, tr) => {
            const row: any = {};
            $(tr)
              .find('td')
              .each((i, td) => {
                const header = headers[i] || `col${i + 1}`;
                row[header] = $(td).text().trim();
              });
            rows.push(row);
          });
        await this.db.table.create({
          data: {
            pageId,
            title,
            headers,
            rows,
          },
        });
      });

      // find links to other pages under the same domain
      const links = $('a')
        .map((_, a) => $(a).attr('href'))
        .get()
        .filter((href) => href && href.startsWith('/records'));

      for (const link of links) {
        const absolute = new URL(link, url).toString();
        await this.scrape(absolute, pageId);
      }
    } catch (e) {
      this.logger.error(`Failed to scrape ${url}: ${e}`);
    }
  }
}
