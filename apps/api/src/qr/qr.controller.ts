import { Controller, Get, Param, Req, Res, UseGuards } from "@nestjs/common";
import { QrService } from "./qr.service";
import { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
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
@Controller("assets")
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Get(":id/qr")
  getQr(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.qrService.getOrCreateForAsset(req.user.organizationId, id);
  }

  @Get(":id/qr/image")
  getQrImage(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.qrService.generateImageForAsset(req.user.organizationId, id);
  }

  @Get(":id/qr/png")
  async getQrPng(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const png = await this.qrService.generatePngForAsset(
      req.user.organizationId,
      id,
    );
    res.setHeader("Content-Type", "image/png");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="asset-${id}-qr.png"`,
    );
    res.send(png);
  }
}
