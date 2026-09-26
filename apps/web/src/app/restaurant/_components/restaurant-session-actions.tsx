"use client";

import { API_URL } from "@/lib/api";
import { useRouter } from "next/navigation";

export function RestaurantSessionActions({
  admin = false,
}: {
  admin?: boolean;
}) {
  const router = useRouter();

  async function logout() {
    try {
      await fetch(`${API_URL}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      sessionStorage.removeItem("assettrack_token");
      sessionStorage.removeItem("assettrack_user");
      router.replace("/");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {admin && (
        <button
          className="rounded border border-current px-4 py-2 font-semibold"
          onClick={() => router.push("/dashboard")}
        >
          Dashboard principal
        </button>
      )}
      <button
        className="rounded bg-white px-4 py-2 font-semibold text-slate-950"
        onClick={() => void logout()}
      >
        Cerrar sesión
      </button>
    </div>
  );
}
