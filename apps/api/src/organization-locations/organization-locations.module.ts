import { Module } from "@nestjs/common";
import { OrganizationLocationsController } from "./organization-locations.controller";
import { OrganizationLocationsService } from "./organization-locations.service";

@Module({
  controllers: [OrganizationLocationsController],
  providers: [OrganizationLocationsService],
})
export class OrganizationLocationsModule {}