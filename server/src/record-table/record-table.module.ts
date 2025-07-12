import { Module } from '@nestjs/common';
import { RecordTableService } from './record-table.service';
import { RecordTableController } from './record-table.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [RecordTableController],
  providers: [RecordTableService, PrismaService],
})
export class RecordTableModule {}
