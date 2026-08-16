import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    console.log('[AUTH] login start');

    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
      },
    });

    console.log('[AUTH] user found:', !!user);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    console.log('[AUTH] hash length:', user.passwordHash.length);

    const passwordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    console.log('[AUTH] password valid:', passwordValid);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
    };

    console.log('[AUTH] signing token');

    const accessToken = await this.jwtService.signAsync(payload);

    console.log('[AUTH] token created');

    return {
      accessToken,
      user: {
        id: user.id,
        organizationId: user.organizationId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}