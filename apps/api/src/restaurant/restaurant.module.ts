import { Module } from "@nestjs/common";
import {
  RestaurantGuestController,
  RestaurantStaffController,
} from "./restaurant.controller";
import { RestaurantService } from "./restaurant.service";

@Module({
  controllers: [RestaurantGuestController, RestaurantStaffController],
  providers: [RestaurantService],
})
export class RestaurantModule {}
