"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useEffect, useState } from "react";

type Fulfillment = "DINE_IN" | "TAKEOUT" | "DELIVERY";

export type StaffCorrection = {
  orderId: string;
  canCorrect: boolean;
  blockedReason?: string | null;
  correctionCount: number;
  lastCorrectedAt?: string | null;
  items: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    fulfillment: Fulfillment;
  }>;
  menu: Array<{
    id: string;
    name: string;
    price: number;
    station: "KITCHEN" | "BAR";
  }>;
};

type DraftLine = {
  menuItemId: string;
  quantity: number;
  fulfillment: Fulfillment;
};

export function StaffOrderCorrection({
  correction,
  onSaved,
}: {
  correction?: StaffCorrection | null;
  onSaved: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setOpen(false);
    setReason("");
    setMessage("");
    setLines(
      correction?.items.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        fulfillment: item.fulfillment,
      })) ?? [],
    );
  }, [correction?.orderId, correction?.correctionCount]);

  if (!correction) return null;

  const save = async () => {
    if (!lines.length) {
      setMessage("El pedido debe conservar al menos un producto.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/orders/${correction.orderId}/correction`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            reason: reason.trim() || undefined,
            items: lines,
          }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          Array.isArray(body?.message)
            ? body.message.join(". ")
            : body?.message || "No fue posible modificar el pedido",
        );
      }
      setMessage("Pedido actualizado y registrado en el historial.");
      setOpen(false);
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-sky-300 bg-sky-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-black text-sky-950">Control de cambios del pedido</p>
          {correction.correctionCount > 0 && (
            <p className="text-xs font-semibold text-sky-800">
              CORREGIDA {correction.correctionCount} vez/veces
              {correction.lastCorrectedAt
                ? ` · ${new Date(correction.lastCorrectedAt).toLocaleString("es-CR")}`
                : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={!correction.canCorrect}
          className="rounded-lg bg-sky-800 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Cerrar editor" : "Modificar último pedido"}
        </button>
      </div>
      {!correction.canCorrect && correction.blockedReason && (
        <p className="mt-2 text-sm font-semibold text-amber-900">
          {correction.blockedReason}
        </p>
      )}
      {open && correction.canCorrect && (
        <div className="mt-3 space-y-3 border-t border-sky-200 pt-3">
          {lines.map((line, index) => (
            <div
              key={`${line.menuItemId}-${index}`}
              className="grid gap-2 rounded-lg bg-white p-3 sm:grid-cols-[1fr_90px_auto]"
            >
              <select
                className="rounded border p-2"
                value={line.menuItemId}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? { ...entry, menuItemId: event.target.value }
                        : entry,
                    ),
                  )
                }
              >
                {correction.menu.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    disabled={lines.some(
                      (entry, position) =>
                        position !== index && entry.menuItemId === item.id,
                    )}
                  >
                    {item.name} · ₡{item.price.toLocaleString()}
                  </option>
                ))}
              </select>
              <input
                aria-label="Cantidad"
                className="rounded border p-2"
                type="number"
                min={1}
                max={10}
                value={line.quantity}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? {
                            ...entry,
                            quantity: Math.max(
                              1,
                              Math.min(10, Number(event.target.value) || 1),
                            ),
                          }
                        : entry,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="rounded border border-red-400 px-3 py-2 font-bold text-red-700"
                onClick={() =>
                  setLines((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={!correction.menu.length || lines.length >= 20}
            className="rounded border border-sky-700 px-3 py-2 font-bold text-sky-800 disabled:opacity-40"
            onClick={() => {
              const candidate = correction.menu.find(
                (item) => !lines.some((line) => line.menuItemId === item.id),
              );
              if (candidate) {
                setLines((current) => [
                  ...current,
                  {
                    menuItemId: candidate.id,
                    quantity: 1,
                    fulfillment:
                      correction.items[0]?.fulfillment ?? "DINE_IN",
                  },
                ]);
              }
            }}
          >
            Agregar producto
          </button>
          <label className="block text-sm font-semibold">
            Nota del cambio (opcional)
            <input
              className="mt-1 w-full rounded border bg-white p-2"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={240}
              placeholder="Ej.: cliente cambió el producto"
            />
          </label>
          <button
            type="button"
            disabled={saving || !lines.length}
            className="rounded-lg bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-40"
            onClick={() => void save()}
          >
            {saving ? "Guardando…" : "Confirmar cambio"}
          </button>
        </div>
      )}
      {message && <p className="mt-2 text-sm font-semibold">{message}</p>}
    </div>
  );
}
