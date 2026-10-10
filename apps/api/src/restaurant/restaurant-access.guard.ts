import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RestaurantAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const organizationId = request.user?.organizationId;
    if (!organizationId) return false;
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { restaurantAccessEnabled: true },
    });
    if (!organization?.restaurantAccessEnabled) {
      throw new ForbiddenException("Restaurant module access is suspended");
    }
    return true;
  }
}
