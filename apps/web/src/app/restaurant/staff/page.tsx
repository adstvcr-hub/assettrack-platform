"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const destination: Record<string, string> = {
  RESTAURANT_ADMIN: "/restaurant/admin",
  KITCHEN: "/restaurant/kitchen",
  BAR: "/restaurant/bar",
  WAITER: "/restaurant/waiter",
};

export default function RestaurantStaffPage() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      if (!sessionStorage.getItem("assettrack_token")) {
        router.replace("/?next=/restaurant/staff");
        return;
      }
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/profile`,
      );
      if (response.status === 401) {
        router.replace("/?next=/restaurant/staff");
        return;
      }
      if (!response.ok) {
        router.replace("/dashboard");
        return;
      }
      const profile = await response.json();
      router.replace(destination[profile.restaurantRole] ?? "/dashboard");
    }
    void redirect();
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
      <p>Abriendo tu estación de trabajo…</p>
    </main>
  );
}
