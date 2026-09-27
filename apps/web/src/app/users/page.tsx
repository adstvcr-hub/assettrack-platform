"use client";
import { API_URL, authenticatedFetch } from "@/lib/api";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type User = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: "OWNER" | "ADMIN" | "USER" | "VIEWER";
  restaurantRole: "RESTAURANT_ADMIN" | "KITCHEN" | "BAR" | "WAITER" | null;
  restaurantAvailability:
    "AVAILABLE" | "BREAK" | "TEMPORARILY_UNAVAILABLE" | "OFF_SHIFT";
  active: boolean;
  deactivatedAt: string | null;
  staffAccessCode: {
    active: boolean;
    updatedAt: string;
    lastUsedAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};
type CurrentUser = {
  id: string;
  role: "OWNER" | "ADMIN" | "USER" | "VIEWER";
};
type StaffQr = {
  staffName: string;
  accessUrl: string;
  image: string;
};

export default function UsersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<User["role"]>("USER");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [staffQr, setStaffQr] = useState<StaffQr | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  function getToken() {
    const token = sessionStorage.getItem("assettrack_token");

    if (!token) {
      router.replace("/?next=/users");
      return null;
    }

    return token;
  }

  async function loadUsers() {
    const token = getToken();

    if (!token) return;

    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/users?page=${page}&limit=5`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.status === 401) {
        sessionStorage.clear();
        router.replace("/?next=/users");
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load users");
      }

      const data = await response.json();

      setUsers(Array.isArray(data) ? data : data.items);

      if (!Array.isArray(data)) {
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedUser = sessionStorage.getItem("assettrack_user");

    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }

    loadUsers();
  }, [page]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();

    if (!token) return;

    setSaving(true);
    setError("");

    try {
      const response = await authenticatedFetch(`${API_URL}/api/v1/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : (data.message ?? "Unable to create user"),
        );
      }

      setName("");
      setEmail("");
      setPassword("");
      setRole("USER");

      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create user");
    } finally {
      setSaving(false);
    }
  }

  async function userAction(
    user: User,
    action: "edit" | "password" | "status" | "delete",
  ) {
    const token = getToken();
    if (!token) return;

    let path = user.id;
    let method: "PATCH" | "DELETE" = "PATCH";
    let body: Record<string, unknown> | undefined;

    if (action === "edit") {
      const nextName = window.prompt("Nombre del usuario", user.name)?.trim();
      if (!nextName) return;
      const nextEmail = window.prompt("Correo del usuario", user.email)?.trim();
      if (!nextEmail) return;
      body = { name: nextName, email: nextEmail };
    } else if (action === "password") {
      const nextPassword = window.prompt(
        "Nueva contraseña temporal (mínimo 8 caracteres)",
      );
      if (!nextPassword) return;
      if (nextPassword.length < 8) {
        setError("La contraseña debe tener al menos 8 caracteres.");
        return;
      }
      const confirmation = window.prompt("Repita la nueva contraseña");
      if (confirmation !== nextPassword) {
        setError("Las contraseñas no coinciden.");
        return;
      }
      path = `${user.id}/password`;
      body = { password: nextPassword };
    } else if (action === "status") {
      const label = user.active ? "desactivar" : "reactivar";
      if (!window.confirm(`¿Desea ${label} a ${user.name}?`)) return;
      path = `${user.id}/status`;
      body = { active: !user.active };
    } else {
      if (
        !window.confirm(
          `¿Eliminar a ${user.name}? Si tiene historial operativo se conservará como usuario inactivo.`,
        )
      ) {
        return;
      }
      method = "DELETE";
    }

    setActionUserId(user.id);
    setError("");
    setNotice("");
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/users/${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : (data.message ?? "No fue posible actualizar el usuario"),
        );
      }
      const messages = {
        edit: "Nombre y correo actualizados.",
        password: "Contraseña restablecida y sesiones anteriores cerradas.",
        status: user.active
          ? "Usuario desactivado y trabajo reasignado."
          : "Usuario reactivado.",
        delete:
          data.mode === "ARCHIVED"
            ? "El usuario conserva historial y quedó archivado como inactivo."
            : "Usuario eliminado definitivamente.",
      };
      setNotice(messages[action]);
      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No fue posible actualizar el usuario",
      );
    } finally {
      setActionUserId(null);
    }
  }

  async function generateStaffQr(user: User) {
    const token = getToken();
    if (!token) return;
    if (
      user.staffAccessCode?.active &&
      !window.confirm(
        `¿Renovar el QR de ${user.name}? El código impreso anteriormente dejará de funcionar.`,
      )
    ) {
      return;
    }
    setActionUserId(user.id);
    setError("");
    setNotice("");
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/users/${user.id}/staff-access-qr`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message ?? "No fue posible crear el código QR");
      }
      setStaffQr(data as StaffQr);
      setNotice("Código QR creado. Descárguelo o imprímalo antes de cerrar.");
      await loadUsers();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No fue posible crear el QR",
      );
    } finally {
      setActionUserId(null);
    }
  }

  async function revokeStaffQr(user: User) {
    const token = getToken();
    if (!token || !window.confirm(`¿Desactivar el QR de ${user.name}?`)) return;
    setActionUserId(user.id);
    setError("");
    setNotice("");
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/users/${user.id}/staff-access-qr`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message ?? "No fue posible desactivar el QR");
      }
      setNotice("Código QR desactivado.");
      await loadUsers();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible desactivar el QR",
      );
    } finally {
      setActionUserId(null);
    }
  }

  function printStaffQr() {
    if (!staffQr) return;
    const printWindow = window.open("", "_blank", "width=650,height=760");
    if (!printWindow) {
      setError("El navegador bloqueó la ventana de impresión.");
      return;
    }
    printWindow.document.title = `QR de acceso - ${staffQr.staffName}`;
    const container = printWindow.document.createElement("main");
    container.style.cssText =
      "font-family:Arial,sans-serif;text-align:center;padding:32px;color:#0f172a";
    const heading = printWindow.document.createElement("h1");
    heading.textContent = "Acceso de personal";
    const name = printWindow.document.createElement("h2");
    name.textContent = staffQr.staffName;
    const image = printWindow.document.createElement("img");
    image.src = staffQr.image;
    image.alt = `QR de ${staffQr.staffName}`;
    image.style.cssText = "width:420px;max-width:100%;margin:24px auto";
    const note = printWindow.document.createElement("p");
    note.textContent = "Escanee el código e ingrese únicamente su contraseña.";
    container.append(heading, name, image, note);
    printWindow.document.body.append(container);
    image.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }
  const canManageUsers =
    currentUser?.role === "OWNER" || currentUser?.role === "ADMIN";
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
              AssetTrack
            </p>

            <h1 className="text-2xl font-bold text-white">Users</h1>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          {canManageUsers && (
            <form
              onSubmit={createUser}
              className="rounded-xl bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-bold text-slate-900">Add user</h2>

              <div className="mt-6 space-y-4">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
                  required
                />

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
                  required
                />

                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Temporary password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
                  minLength={8}
                  required
                />

                <select
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as User["role"])
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
                >
                  <option value="USER">User</option>
                  <option value="VIEWER">Viewer</option>
                  <option value="ADMIN">Admin</option>
                  <option value="OWNER">Owner</option>
                </select>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Creating..." : "Create user"}
                </button>
              </div>
            </form>
          )}

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Organization users
            </h2>

            {loading && <p className="mt-6 text-slate-500">Loading...</p>}

            {error && (
              <p className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">
                {error}
              </p>
            )}

            {notice && (
              <p className="mt-6 rounded-lg bg-emerald-50 p-4 text-emerald-800">
                {notice}
              </p>
            )}

            {!loading && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Email</th>
                      <th className="py-3 pr-4">Role</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3">Created</th>
                      {canManageUsers && <th className="py-3">Actions</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b last:border-0">
                        <td className="py-4 pr-4 font-medium text-slate-900">
                          {user.name}
                        </td>
                        <td className="py-4 pr-4 text-slate-600">
                          {user.email}
                        </td>

                        <td className="py-4 pr-4 text-slate-600">
                          {user.role}
                        </td>

                        <td className="py-4 pr-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              user.active
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {user.active ? "Activo" : "Inactivo"}
                          </span>
                        </td>

                        <td className="py-4 text-slate-600">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        {canManageUsers && (
                          <td className="py-4 pl-3">
                            <div className="flex min-w-52 flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={actionUserId === user.id}
                                onClick={() => void userAction(user, "edit")}
                                className="rounded border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 disabled:opacity-50"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                disabled={actionUserId === user.id}
                                onClick={() =>
                                  void userAction(user, "password")
                                }
                                className="rounded border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 disabled:opacity-50"
                              >
                                Contraseña
                              </button>
                              {(user.restaurantRole ||
                                user.role === "OWNER" ||
                                user.role === "ADMIN") && (
                                <button
                                  type="button"
                                  disabled={
                                    actionUserId === user.id || !user.active
                                  }
                                  onClick={() => void generateStaffQr(user)}
                                  className="rounded border border-emerald-400 px-2.5 py-1.5 font-semibold text-emerald-800 disabled:opacity-50"
                                >
                                  {user.staffAccessCode?.active
                                    ? "Renovar QR"
                                    : "Crear QR"}
                                </button>
                              )}
                              {user.staffAccessCode?.active && (
                                <button
                                  type="button"
                                  disabled={actionUserId === user.id}
                                  onClick={() => void revokeStaffQr(user)}
                                  className="rounded border border-slate-400 px-2.5 py-1.5 font-semibold text-slate-700 disabled:opacity-50"
                                >
                                  Desactivar QR
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={
                                  actionUserId === user.id ||
                                  (currentUser?.id === user.id && user.active)
                                }
                                onClick={() => void userAction(user, "status")}
                                className="rounded border border-amber-400 px-2.5 py-1.5 font-semibold text-amber-800 disabled:opacity-50"
                              >
                                {user.active ? "Desactivar" : "Reactivar"}
                              </button>
                              <button
                                type="button"
                                disabled={
                                  actionUserId === user.id ||
                                  currentUser?.id === user.id
                                }
                                onClick={() => void userAction(user, "delete")}
                                className="rounded border border-red-300 px-2.5 py-1.5 font-semibold text-red-700 disabled:opacity-50"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-6 flex items-center justify-between">
                  <button
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                    disabled={page <= 1}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>

                  <p className="text-sm text-slate-500">
                    Page {page} of {totalPages} · {total} total users
                  </p>

                  <button
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                    disabled={page >= totalPages}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {staffQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <section className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-slate-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">
                  Acceso rápido
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  {staffQr.staffName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setStaffQr(null)}
                className="rounded-lg border px-3 py-2 font-bold"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <Image
              src={staffQr.image}
              alt={`QR de acceso de ${staffQr.staffName}`}
              width={500}
              height={500}
              unoptimized
              className="mx-auto mt-5 w-full max-w-sm rounded-xl border"
            />
            <p className="mt-4 break-all rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
              {staffQr.accessUrl}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Este QR identifica la cuenta. La contraseña no está incluida y
              siempre será solicitada.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <a
                href={staffQr.image}
                download={`acceso-${staffQr.staffName.replaceAll(" ", "-")}.png`}
                className="rounded-lg bg-emerald-700 px-4 py-3 text-center font-bold text-white"
              >
                Descargar
              </a>
              <button
                type="button"
                onClick={printStaffQr}
                className="rounded-lg bg-slate-950 px-4 py-3 font-bold text-white"
              >
                Imprimir
              </button>
              <button
                type="button"
                onClick={() => setStaffQr(null)}
                className="rounded-lg border border-slate-300 px-4 py-3 font-bold text-slate-700"
              >
                Cerrar
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
