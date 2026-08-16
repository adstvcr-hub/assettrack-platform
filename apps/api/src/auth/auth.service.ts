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

    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
      },
    });


    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }


    const passwordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );


    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
    };


    const accessToken = await this.jwtService.signAsync(payload);


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