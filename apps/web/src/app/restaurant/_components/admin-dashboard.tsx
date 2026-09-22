"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

type Table = {
  id: string;
  name: string;
  code: string;
  waiterId?: string | null;
  waiter?: { id: string; name: string; email: string } | null;
};
type RestaurantRole = "RESTAURANT_ADMIN" | "KITCHEN" | "BAR" | "WAITER";
type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantRole: RestaurantRole | null;
};
type MenuItem = {
  id: string;
  name: string;
  price: number;
  station: string;
  course: string;
  active: boolean;
};
type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  station: string;
  course: string;
  status: string;
  acceptedAt?: string;
  readyAt?: string;
};
type Order = {
  id: string;
  createdAt: string;
  table: { name: string };
  items: OrderItem[];
};
type Station = "KITCHEN" | "BAR";
const nextStatus: Record<string, string | null> = {
  RECEIVED: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
  READY: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};

export default function RestaurantAdminDashboard() {
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [station, setStation] = useState<Station>("KITCHEN");
  const [tableName, setTableName] = useState("");
  const [itemName, setItemName] = useState("");
  const [price, setPrice] = useState("");
  const [itemStation, setItemStation] = useState<Station>("KITCHEN");
  const [course, setCourse] = useState("MAIN");
  const [qr, setQr] = useState<{ url: string; image: string } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const responses = await Promise.all(
        ["tables", "menu", "orders", "staff-users"].map((path) =>
          authenticatedFetch(`${API_URL}/api/v1/restaurant/${path}`),
        ),
      );
      if (responses.some((response) => response.status === 401)) {
        router.replace("/?next=/restaurant/admin");
        return;
      }
      if (responses.some((response) => response.status === 403)) {
        router.replace("/restaurant/staff");
        return;
      }
      if (responses.some((response) => !response.ok))
        throw new Error("Unable to load restaurant workspace");
      const [tableData, menuData, orderData, staffData] = await Promise.all(
        responses.map((response) => response.json()),
      );
      setTables(tableData);
      setMenu(menuData);
      setOrders(orderData);
      setStaffUsers(staffData);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load orders");
    }
  }, [router]);
  useEffect(() => {
    if (!sessionStorage.getItem("assettrack_token")) {
      router.replace("/?next=/restaurant/admin");
      return;
    }
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load, router]);

  async function post(path: string, payload: object, method = "POST") {
    setError("");
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/${path}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          Array.isArray(body.message)
            ? body.message.join(", ")
            : body.message || "Update failed",
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }
  async function showQr(id: string) {
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/tables/${id}/qr`,
      );
      if (!response.ok) throw new Error("QR unavailable");
      setQr(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "QR unavailable");
    }
  }

  const visible = orders.flatMap((order) =>
    order.items
      .filter(
        (item) =>
          item.station === station &&
          !["DELIVERED", "CANCELLED"].includes(item.status),
      )
      .map((item) => ({ order, item })),
  );
  const isAdmin = true;
  const waiters = staffUsers.filter((user) => user.restaurantRole === "WAITER");
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-slate-900">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold tracking-widest text-emerald-700">
            ASSETTRACK · PILOT
          </p>
          <h1 className="text-3xl font-bold">Administración del restaurante</h1>
        </div>
        <a
          className="rounded bg-slate-900 px-4 py-2 text-white"
          href="/dashboard"
        >
          Dashboard
        </a>
      </header>
      {error && (
        <p role="alert" className="my-4 rounded bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      <div className="mb-5 flex gap-2">
        {(["KITCHEN", "BAR"] as const).map((value) => (
          <button
            key={value}
            className={`rounded px-5 py-3 ${station === value ? "bg-emerald-600 text-white" : "bg-slate-100"}`}
            onClick={() => setStation(value)}
          >
            {value === "KITCHEN" ? "Kitchen" : "Bar"}
          </button>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          {station === "KITCHEN" ? "Kitchen" : "Bar"} queue · {visible.length}{" "}
          items
        </h2>
        {visible.length === 0 && (
          <p className="rounded border p-4">No open items for this station.</p>
        )}
        {visible.map(({ order, item }) => (
          <article
            key={item.id}
            className="rounded-xl border bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <strong>
                  {order.table.name} · {item.quantity} × {item.name}
                </strong>
                <p className="text-sm text-slate-600">
                  {item.course.toLowerCase()} · {item.status.toLowerCase()} ·
                  received {new Date(order.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex gap-2">
                {nextStatus[item.status] && (
                  <button
                    className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white"
                    onClick={() =>
                      void post(
                        `items/${item.id}/status`,
                        { status: nextStatus[item.status] },
                        "PATCH",
                      )
                    }
                  >
                    {nextStatus[item.status] === "DELIVERED"
                      ? "Mark delivered"
                      : nextStatus[item.status] === "READY"
                        ? "Mark ready"
                        : nextStatus[item.status] === "ACCEPTED"
                          ? "Accept"
                          : "Start"}
                  </button>
                )}
                {isAdmin &&
                  ["RECEIVED", "ACCEPTED", "PREPARING"].includes(
                    item.status,
                  ) && (
                    <button
                      className="rounded border px-3 py-2"
                      onClick={() =>
                        void post(
                          `items/${item.id}/status`,
                          { status: "CANCELLED" },
                          "PATCH",
                        )
                      }
                    >
                      Cancel
                    </button>
                  )}
              </div>
            </div>
          </article>
        ))}
      </section>
      {isAdmin && (
        <section className="mt-12 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold">Tables & QR codes</h2>
            <form
              className="my-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void post("tables", { name: tableName }).then(() =>
                  setTableName(""),
                );
              }}
            >
              <input
                required
                maxLength={60}
                className="min-w-0 flex-1 rounded border p-2"
                placeholder="Table name"
                value={tableName}
                onChange={(event) => setTableName(event.target.value)}
              />
              <button className="rounded bg-slate-900 px-3 text-white">
                Add table
              </button>
            </form>
            {tables.map((table) => (
              <div
                key={table.id}
                className="grid gap-2 border-b py-3 sm:grid-cols-[1fr_220px_auto] sm:items-center"
              >
                <span>{table.name}</span>
                <select
                  aria-label={`Mesero asignado a ${table.name}`}
                  className="rounded border p-2"
                  value={table.waiterId ?? ""}
                  onChange={(event) =>
                    void post(
                      `tables/${table.id}/waiter`,
                      { waiterId: event.target.value || null },
                      "PATCH",
                    )
                  }
                >
                  <option value="">Sin mesero asignado</option>
                  {waiters.map((waiter) => (
                    <option key={waiter.id} value={waiter.id}>
                      {waiter.name}
                    </option>
                  ))}
                </select>
                <button
                  className="text-emerald-700 underline"
                  onClick={() => void showQr(table.id)}
                >
                  Show QR
                </button>
              </div>
            ))}
            {qr && (
              <div className="my-3 rounded border p-4">
                <Image
                  src={qr.image}
                  alt="QR code for this table"
                  width={260}
                  height={260}
                  unoptimized
                />
                <a
                  className="break-all text-emerald-700 underline"
                  href={qr.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {qr.url}
                </a>
                <p className="mt-2 text-sm">
                  Print this QR and place it on the selected table.
                </p>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold">Menu</h2>
            <form
              className="my-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(price);
                if (!Number.isInteger(value) || value < 0) {
                  setError("Enter a valid price in colones");
                  return;
                }
                void post("menu", {
                  name: itemName,
                  price: value,
                  station: itemStation,
                  course,
                }).then(() => {
                  setItemName("");
                  setPrice("");
                });
              }}
            >
              <input
                required
                maxLength={100}
                className="w-full rounded border p-2"
                placeholder="Item name"
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
              />
              <input
                required
                min="0"
                step="1"
                type="number"
                className="w-full rounded border p-2"
                placeholder="Price in colones"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
              <div className="flex gap-2">
                <select
                  className="rounded border p-2"
                  value={itemStation}
                  onChange={(event) =>
                    setItemStation(event.target.value as Station)
                  }
                >
                  <option value="KITCHEN">Kitchen</option>
                  <option value="BAR">Bar</option>
                </select>
                <select
                  className="rounded border p-2"
                  value={course}
                  onChange={(event) => setCourse(event.target.value)}
                >
                  <option value="DRINK">Drink</option>
                  <option value="STARTER">Starter</option>
                  <option value="MAIN">Main</option>
                  <option value="OTHER">Other</option>
                </select>
                <button className="rounded bg-slate-900 px-3 text-white">
                  Add item
                </button>
              </div>
            </form>
            {menu.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 border-b py-2"
              >
                <span>
                  {item.name} · ₡{item.price.toLocaleString()}{" "}
                  {item.active ? "" : "(unavailable)"}
                </span>
                <button
                  className="text-emerald-700 underline"
                  onClick={() =>
                    void post(
                      `menu/${item.id}`,
                      { active: !item.active },
                      "PATCH",
                    )
                  }
                >
                  {item.active ? "Pause" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="mt-12">
        <h2 className="text-xl font-bold">Personal y estación de trabajo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Los propietarios y administradores generales conservan acceso total.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="p-3">Persona</th>
                <th className="p-3">Correo</th>
                <th className="p-3">Dashboard</th>
              </tr>
            </thead>
            <tbody>
              {staffUsers.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="p-3 font-semibold">{user.name}</td>
                  <td className="p-3">{user.email}</td>
                  <td className="p-3">
                    {user.role === "OWNER" || user.role === "ADMIN" ? (
                      <span className="font-semibold text-emerald-700">
                        Administración
                      </span>
                    ) : (
                      <select
                        className="rounded border p-2"
                        value={user.restaurantRole ?? ""}
                        onChange={(event) =>
                          void post(
                            `staff-users/${user.id}/role`,
                            { role: event.target.value || null },
                            "PATCH",
                          )
                        }
                      >
                        <option value="">Sin acceso al restaurante</option>
                        <option value="RESTAURANT_ADMIN">Administración</option>
                        <option value="KITCHEN">Cocina</option>
                        <option value="BAR">Bar</option>
                        <option value="WAITER">Mesero</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
