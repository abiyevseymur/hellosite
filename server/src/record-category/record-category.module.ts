import { Module } from '@nestjs/common';
import { RecordCategoryService } from './record-category.service';
import { RecordCategoryController } from './record-category.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [RecordCategoryController],
  providers: [RecordCategoryService, PrismaService],
})
export class RecordCategoryModule {}
