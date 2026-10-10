import { Module } from "@nestjs/common";
import {
  RestaurantGuestController,
  RestaurantStaffController,
} from "./restaurant.controller";
import { RestaurantService } from "./restaurant.service";
import { RestaurantCashService } from "./restaurant-cash.service";
import { RestaurantAccessGuard } from "./restaurant-access.guard";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [UsersModule],
  controllers: [RestaurantGuestController, RestaurantStaffController],
  providers: [RestaurantService, RestaurantCashService, RestaurantAccessGuard],
  exports: [RestaurantService, RestaurantCashService],
})
export class RestaurantModule {}
