"use client";

import { API_URL } from "@/lib/api";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Order = {
  id: string;
  createdAt: string;
  table: {
    name: string;
    waiter: { id: string; name: string } | null;
  };
  items: {
    id: string;
    name: string;
    quantity: number;
    status: string;
    course: string;
    station: string;
  }[];
};
const labels: Record<string, string> = {
  RECEIVED: "Received",
  ACCEPTED: "Accepted",
  PREPARING: "Being prepared",
  READY: "Ready!",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};
export default function RestaurantOrderPage() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/restaurant/guest/orders/${encodeURIComponent(accessCode)}`,
        { cache: "no-store" },
      );
      if (!response.ok)
        throw new Error("Order unavailable. Please ask the staff.");
      setOrder(await response.json());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update order");
    }
  }, [accessCode]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);
  const allFinished =
    order?.items.length &&
    order.items.every(
      (item) =>
        item.status === "READY" ||
        item.status === "DELIVERED" ||
        item.status === "CANCELLED",
    );
  const delivered =
    allFinished &&
    order?.items.every(
      (item) => item.status === "DELIVERED" || item.status === "CANCELLED",
    );
  const ready =
    allFinished &&
    !delivered &&
    order?.items.some((item) => item.status === "READY");
  const cancelled =
    allFinished && order?.items.every((item) => item.status === "CANCELLED");
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-slate-900">
      <p className="font-semibold tracking-widest text-emerald-700">
        ASSETTRACK · RESTAURANT
      </p>
      <h1 className="text-3xl font-bold">Your order · {order?.table.name}</h1>
      {order && (
        <p className="mt-3 rounded-lg bg-sky-50 px-4 py-3 font-semibold text-sky-900">
          {order.table.waiter
            ? `Mesero a cargo: ${order.table.waiter.name}`
            : "Mesero por asignar. Consulte a cualquier empleado."}
        </p>
      )}
      <p className="my-4 text-slate-600">
        Your order updates automatically while this page is open.
      </p>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {cancelled ? (
        <p role="status" className="my-5 rounded-xl bg-red-50 p-5 text-red-900">
          Your order was cancelled. Please ask the staff for assistance.
        </p>
      ) : delivered ? (
        <p
          role="status"
          className="my-5 rounded-xl bg-emerald-100 p-5 text-emerald-900"
        >
          Your order has been delivered.
        </p>
      ) : ready ? (
        <p
          role="status"
          className="my-5 rounded-xl bg-emerald-100 p-5 text-xl font-bold text-emerald-900"
        >
          Your order is ready! Please follow staff instructions for collection.
        </p>
      ) : (
        <p role="status" className="my-5 rounded-xl bg-blue-50 p-4">
          Your order is being handled. We will show each item&apos;s progress
          here.
        </p>
      )}
      <div className="space-y-3">
        {order?.items.map((item) => (
          <div
            key={item.id}
            className="flex justify-between rounded border bg-white p-4"
          >
            <span>
              {item.quantity} × {item.name}
            </span>
            <strong>{labels[item.status]}</strong>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-500">
        If you need to change your order, please ask a staff member.
      </p>
    </main>
  );
}
