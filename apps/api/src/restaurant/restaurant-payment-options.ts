import { RestaurantPaymentMethod } from "../generated/prisma/enums";

// A gateway transaction must be confirmed through its own verified flow.
// It must never be accepted as an unverified manual checkout method.
export const REGULAR_RESTAURANT_PAYMENT_METHODS = [
  RestaurantPaymentMethod.CASH,
  RestaurantPaymentMethod.SINPE,
  RestaurantPaymentMethod.CARD,
  RestaurantPaymentMethod.OTHER,
] as const;

export function restaurantPaymentOptions() {
  return {
    regular: [
      { code: RestaurantPaymentMethod.CASH, label: "Efectivo" },
      { code: RestaurantPaymentMethod.SINPE, label: "SINPE" },
      { code: RestaurantPaymentMethod.CARD, label: "Tarjeta" },
      { code: RestaurantPaymentMethod.OTHER, label: "Otro" },
    ],
    platforms: [
      {
        code: "TILOPAY",
        label: "Tilopay",
        status: "PENDING_MERCHANT",
        canInitiatePayment: false,
        message: "Pendiente de activar la cuenta de comercio de Tilopay.",
      },
    ],
  };
}
