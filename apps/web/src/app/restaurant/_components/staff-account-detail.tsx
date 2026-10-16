"use client";

type AccountDetail = {
  items: Array<{
    id: string;
    orderCreatedAt: string;
    name: string;
    quantity: number;
    price: number;
    status: string;
    fulfillment: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  }>;
  billing: {
    grossSubtotal: number;
    promotionCredit: number;
    subtotal: number;
    tax: number;
    service: number;
    total: number;
    taxIncluded: boolean;
    taxRateBps: number;
    serviceRateBps: number;
    serviceChargeEnabled: boolean;
  };
};

const statusLabel: Record<string, string> = {
  RECEIVED: "Recibido", ACCEPTED: "Aceptado", PREPARING: "En preparación",
  READY: "Listo", DELIVERED: "Entregado", CANCELLED: "Cancelado",
};

export function StaffAccountDetail({ visit }: { visit: AccountDetail }) {
  return (
    <>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b bg-slate-50">
                        <tr>
                          <th className="p-2">Hora</th>
                          <th className="p-2">Consumo</th>
                          <th className="p-2">Cantidad</th>
                          <th className="p-2">Importe</th>
                          <th className="p-2">Estado</th>
                          <th className="p-2">Modalidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visit.items.map((item) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="p-2 whitespace-nowrap">
                              {new Date(
                                item.orderCreatedAt,
                              ).toLocaleTimeString()}
                            </td>
                            <td className="p-2 font-medium">{item.name}</td>
                            <td className="p-2">{item.quantity}</td>
                            <td className="p-2 whitespace-nowrap">
                              ₡{(item.price * item.quantity).toLocaleString()}
                            </td>
                            <td className="p-2">
                              {statusLabel[item.status] ?? item.status}
                            </td>
                            <td className="p-2">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-sm font-black ${
                                  item.fulfillment === "DELIVERY"
                                    ? "bg-violet-100 text-violet-900 ring-1 ring-violet-300"
                                    : item.fulfillment === "TAKEOUT"
                                      ? "bg-fuchsia-100 text-fuchsia-900 ring-1 ring-fuchsia-300"
                                      : "bg-sky-100 text-sky-900 ring-1 ring-sky-300"
                                }`}
                              >
                                {item.fulfillment === "DELIVERY"
                                  ? "ENTREGA A DOMICILIO"
                                  : item.fulfillment === "TAKEOUT"
                                    ? "PARA LLEVAR"
                                    : "CONSUMO EN EL LOCAL"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <dl className="mt-4 ml-auto grid max-w-md grid-cols-2 gap-x-5 gap-y-1 rounded-lg bg-slate-50 p-4 text-sm">
                    <dt>
                      {visit.billing.promotionCredit > 0
                        ? "Subtotal de productos"
                        : "Subtotal"}
                    </dt>
                    <dd className="text-right">
                      ₡{visit.billing.grossSubtotal.toLocaleString()}
                    </dd>
                    {visit.billing.promotionCredit > 0 && (
                      <>
                        <dt className="text-emerald-700">
                          Crédito promocional
                        </dt>
                        <dd className="text-right text-emerald-700">
                          − ₡{visit.billing.promotionCredit.toLocaleString()}
                        </dd>
                      </>
                    )}
                    {visit.billing.promotionCredit > 0 && (
                      <>
                        <dt>Subtotal neto</dt>
                        <dd className="text-right">
                          ₡{visit.billing.subtotal.toLocaleString()}
                        </dd>
                      </>
                    )}
                    {visit.billing.taxRateBps > 0 && (
                      <>
                        <dt>
                          IVA {visit.billing.taxRateBps / 100}%
                          {visit.billing.taxIncluded ? " (incluido)" : ""}
                        </dt>
                        <dd className="text-right">
                          ₡{visit.billing.tax.toLocaleString()}
                        </dd>
                      </>
                    )}
                    {visit.billing.serviceChargeEnabled && (
                      <>
                        <dt>Servicio {visit.billing.serviceRateBps / 100}%</dt>
                        <dd className="text-right">
                          ₡{visit.billing.service.toLocaleString()}
                        </dd>
                      </>
                    )}
                    <dt className="border-t pt-2 text-base font-black">
                      Total a pagar
                    </dt>
                    <dd className="border-t pt-2 text-right text-base font-black">
                      ₡{visit.billing.total.toLocaleString()}
                    </dd>
                  </dl>
    </>
  );
}
