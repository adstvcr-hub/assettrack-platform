export type RegularRestaurantPaymentMethod =
  "CASH" | "SINPE" | "CARD" | "OTHER";

export const regularRestaurantPaymentOptions: ReadonlyArray<{
  code: RegularRestaurantPaymentMethod;
  label: string;
}> = [
  { code: "CASH", label: "Efectivo" },
  { code: "SINPE", label: "SINPE" },
  { code: "CARD", label: "Tarjeta" },
  { code: "OTHER", label: "Otro" },
];

export function isRegularRestaurantPaymentMethod(
  value: string,
): value is RegularRestaurantPaymentMethod {
  return regularRestaurantPaymentOptions.some(
    (option) => option.code === value,
  );
}

// There is no configured merchant or verified provider adapter yet. Even if a
// newer API advertises Tilopay, this release must not turn it into a manual pay.
export function tilopayPreparationMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "platforms" in body &&
    Array.isArray(body.platforms) &&
    body.platforms.some(
      (platform: unknown) =>
        typeof platform === "object" &&
        platform !== null &&
        "code" in platform &&
        platform.code === "TILOPAY" &&
        "status" in platform &&
        platform.status === "PENDING_MERCHANT",
    )
  ) {
    return "Pendiente de activar la cuenta de comercio de Tilopay. Puede cobrar con los métodos regulares.";
  }
  return "Tilopay no está disponible para iniciar cobros. Puede cobrar con los métodos regulares.";
}
