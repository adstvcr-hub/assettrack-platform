import { Module } from "@nestjs/common";
import {
  ServiceFeedbackAdminController,
  ServiceFeedbackPublicController,
} from "./service-feedback.controller";
import { ServiceFeedbackService } from "./service-feedback.service";

@Module({
  controllers: [
    ServiceFeedbackPublicController,
    ServiceFeedbackAdminController,
  ],
  providers: [ServiceFeedbackService],
})
export class ServiceFeedbackModule {}
