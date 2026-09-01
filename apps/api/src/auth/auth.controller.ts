import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
private validateOrigin(request: Request) {
  const origin = request.headers.origin;

  const allowedOrigins = [
    process.env.WEB_ORIGIN ?? 'http://localhost:3001',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];

  if (origin && !allowedOrigins.includes(origin)) {
    throw new ForbiddenException('Invalid request origin');
  }
}
 @Post('login')
async login(
  @Body() dto: LoginDto,
  @Res({ passthrough: true }) response: Response,
) {
  const result = await this.authService.login(dto);

  response.cookie('assettrack_refresh_token', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return {
    accessToken: result.accessToken,
    user: result.user,
  };
}

@Post('refresh')
async refresh(
  @Req() request: Request,
  @Res({ passthrough: true }) response: Response,
) {
  this.validateOrigin(request);
  const refreshToken = request.cookies?.assettrack_refresh_token;

  if (!refreshToken) {
    throw new UnauthorizedException('Refresh token missing');
  }

  const result = await this.authService.refresh(refreshToken);

 response.cookie('assettrack_refresh_token', result.refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
});

  return {
    accessToken: result.accessToken,
  };
}
@Post('logout')
async logout(
  @Req() request: Request,
  @Res({ passthrough: true }) response: Response,
) {
  this.validateOrigin(request);
  const refreshToken = request.cookies?.assettrack_refresh_token;

  if (refreshToken) {
    await this.authService.logout(refreshToken);
  }

  response.clearCookie('assettrack_refresh_token', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/api/v1/auth',
});

  return {
    success: true,
  };
}
}
