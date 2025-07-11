import { Controller, Get } from '@nestjs/common';
import { RecordsService } from './records.service';

@Controller('records')
export class RecordsController {
  constructor(private readonly service: RecordsService) {}

  @Get()
  async getAll() {
    return this.service.categories();
  }
}
