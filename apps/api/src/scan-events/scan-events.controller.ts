import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateScanEventDto } from './dto/create-scan-event.dto';
import { ScanEventsService } from './scan-events.service';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    organizationId: string;
    email: string;
    name: string;
    role: string;
  };
};

@UseGuards(JwtAuthGuard)
@Controller('scan-events')
export class ScanEventsController {
  constructor(private readonly scanEventsService: ScanEventsService) {}

  @Post()
  create(
    @Body() dto: CreateScanEventDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scanEventsService.create(
      req.user.organizationId,
      req.user.id,
      dto,
    );
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.scanEventsService.findAll(
      req.user.organizationId,
    );
  }
}