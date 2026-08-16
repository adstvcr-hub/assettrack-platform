import { Module } from '@nestjs/common';
import { ScanController } from './scan.controller';
import { ScanEventsController } from './scan-events.controller';
import { ScanEventsService } from './scan-events.service';

@Module({
  controllers: [ScanEventsController, ScanController],
  providers: [ScanEventsService],
})
export class ScanEventsModule {}