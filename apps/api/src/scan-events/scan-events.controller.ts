import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateScanEventDto } from './dto/create-scan-event.dto';
import { ScanEventsService } from './scan-events.service';

@Controller('scan-events')
export class ScanEventsController {
  constructor(private readonly scanEventsService: ScanEventsService) {}

  @Post()
  create(@Body() dto: CreateScanEventDto) {
    return this.scanEventsService.create(dto);
  }

  @Get()
  findAll() {
    return this.scanEventsService.findAll();
  }
}
