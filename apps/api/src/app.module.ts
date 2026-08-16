import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AssetsModule } from './assets/assets.module';
import { QrModule } from './qr/qr.module';
import { ScanEventsModule } from './scan-events/scan-events.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    OrganizationsModule,
    UsersModule,
    AssetsModule,
    QrModule,
    ScanEventsModule,
    AuthModule,	
  ],
})
export class AppModule {}
