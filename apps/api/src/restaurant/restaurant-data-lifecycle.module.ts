import { Global, Module } from "@nestjs/common";
import { RestaurantDataLifecycleService } from "./restaurant-data-lifecycle.service";

@Global()
@Module({
  providers: [RestaurantDataLifecycleService],
  exports: [RestaurantDataLifecycleService],
})
export class RestaurantDataLifecycleModule {}
