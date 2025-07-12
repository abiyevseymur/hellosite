import { Controller, Get, Param } from '@nestjs/common';
import { RecordTableService } from './record-table.service';

@Controller('tables')
export class RecordTableController {
  constructor(private service: RecordTableService) {}

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(Number(id));
  }
}
