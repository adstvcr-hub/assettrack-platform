import { Module } from "@nestjs/common";
import {
  RestaurantGuestController,
  RestaurantStaffController,
} from "./restaurant.controller";
import { RestaurantService } from "./restaurant.service";
import { RestaurantAccessGuard } from "./restaurant-access.guard";

@Module({
  controllers: [RestaurantGuestController, RestaurantStaffController],
  providers: [RestaurantService, RestaurantAccessGuard],
})
export class RestaurantModule {}
