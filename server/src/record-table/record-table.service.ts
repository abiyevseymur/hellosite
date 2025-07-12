import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class RecordTableService {
  constructor(private prisma: PrismaService) {}

  async findById(id: number) {
    return this.prisma.recordTable.findUnique({ where: { id } });
  }
}
