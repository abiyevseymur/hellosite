import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class RecordsService {
  private prisma = new PrismaClient();

  async categories() {
    return this.prisma.recordCategory.findMany({ include: { records: true } });
  }
}
