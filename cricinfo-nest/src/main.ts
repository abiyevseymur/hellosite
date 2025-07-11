import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ScraperService } from './scraper.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const scraper = app.get(ScraperService);
  await scraper.scrape('https://www.espncricinfo.com/records');
  await app.close();
}

bootstrap();
