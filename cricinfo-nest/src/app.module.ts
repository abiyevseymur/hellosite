import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from './prisma.service';
import { ScraperService } from './scraper.service';

@Module({
  imports: [HttpModule],
  providers: [PrismaService, ScraperService],
})
export class AppModule {}
