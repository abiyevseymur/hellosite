import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class RecordCategoryService {
  constructor(private prisma: PrismaService) {}

  async findRoots() {
    return this.prisma.recordCategory.findMany({
      where: { parentId: null },
      include: { children: true }
    });
  }

  async findById(id: number) {
    return this.prisma.recordCategory.findUnique({
      where: { id },
      include: { children: true, tables: true }
    });
  }
}
