import { Controller, Get, Param } from '@nestjs/common';
import { RecordCategoryService } from './record-category.service';

@Controller('categories')
export class RecordCategoryController {
  constructor(private service: RecordCategoryService) {}

  @Get()
  findRoots() {
    return this.service.findRoots();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(Number(id));
  }
}
