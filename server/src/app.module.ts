import { Module } from '@nestjs/common';
import { RecordCategoryModule } from './record-category/record-category.module';
import { RecordTableModule } from './record-table/record-table.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [RecordCategoryModule, RecordTableModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
