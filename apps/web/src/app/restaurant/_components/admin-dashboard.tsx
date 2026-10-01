"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { RestaurantSessionActions } from "./restaurant-session-actions";

type Table = {
  id: string;
  name: string;
  code: string;
  waiterId?: string | null;
  waiter?: { id: string; name: string; email: string } | null;
  serviceChargeEnabled: boolean;
  kind: "DINING" | "BAR_SEAT" | "TAKEOUT_STATION";
};
type RestaurantRole = "RESTAURANT_ADMIN" | "KITCHEN" | "BAR" | "WAITER";
type RestaurantPayPeriod = "HOURLY" | "DAILY" | "MONTHLY";
type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantRole: RestaurantRole | null;
  restaurantAvailability:
    "AVAILABLE" | "BREAK" | "TEMPORARILY_UNAVAILABLE" | "OFF_SHIFT";
  active: boolean;
  restaurantPayPeriod?: RestaurantPayPeriod | null;
  restaurantPayRate?: number | null;
  restaurantStandardMinutesPerDay: number;
  restaurantWorkDaysPerMonth: number;
  restaurantCcssDeductionEnabled: boolean;
  restaurantCcssDeductionBps: number;
  staffAccessCode?: {
    active: boolean;
    updatedAt: string;
    lastUsedAt?: string | null;
  } | null;
};
type StaffAccessQr = {
  staffName: string;
  accessUrl: string;
  image: string;
};
type StaffHoursReport = {
  range: { from: string; to: string; timezone: string };
  summary: {
    employees: number;
    sessions: number;
    activeMs: number;
    outOfServiceMs: number;
    payableMs: number;
    deductedMs: number;
    payrollConfiguredEmployees: number;
    grossPay: number;
    ccssDeduction: number;
    netPay: number;
  };
  employees: Array<{
    userId: string;
    name: string;
    email: string;
    restaurantRole: RestaurantRole | null;
    sessions: number;
    activeMs: number;
    outOfServiceMs: number;
    breakMs: number;
    temporarilyUnavailableMs: number;
    offShiftMs: number;
    firstEntryAt: string;
    lastExitAt?: string | null;
    openSessions: number;
    payroll: {
      configured: boolean;
      payPeriod?: RestaurantPayPeriod | null;
      payRate?: number | null;
      standardMinutesPerDay: number;
      workDaysPerMonth: number;
      payableMs: number;
      deductedMs: number;
      hourlyRate?: number | null;
      grossPay?: number | null;
      ccssDeductionEnabled: boolean;
      ccssDeductionBps: number;
      ccssDeduction: number;
      netPay?: number | null;
    };
  }>;
  sessions: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    restaurantRole: RestaurantRole | null;
    entryAt: string;
    exitAt?: string | null;
    status: "OPEN" | "CLOSED" | "STALE";
    activeMs: number;
    outOfServiceMs: number;
    breakMs: number;
    temporarilyUnavailableMs: number;
    offShiftMs: number;
  }>;
};
type MenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  station: string;
  course: string;
  active: boolean;
  productType: string;
  categories: string[];
  origin: "HOUSE_MADE" | "THIRD_PARTY";
  prepMinutes?: number | null;
  alcoholic: boolean;
  imageData?: string | null;
};
type Promotion = {
  id: string;
  title: string;
  productType?: string | null;
  menuItemId?: string | null;
  creditAmount: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
};
type InvoiceRequest = {
  id: string;
  table: { name: string };
  invoiceRequestStatus: string;
  invoiceName: string;
  invoiceEmail: string;
  invoicePhone: string;
  invoiceTaxId: string;
  invoiceRequestedAt: string;
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
type ActiveVisit = {
  id: string;
  occupiesTable: boolean;
  table: { name: string };
  responsibleStaff?: { name: string; restaurantRole: string } | null;
  deliveryPhone?: string | null;
  deliveryAddress?: string | null;
  paymentStatus: "NOT_REQUIRED" | "PENDING" | "CONFIRMED" | "REJECTED";
  canHandoffDelivery: boolean;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
    status: string;
  }>;
  billing: {
    grossSubtotal: number;
    promotionCredit: number;
    subtotal: number;
    tax: number;
    service: number;
    total: number;
  };
};
type Station = "KITCHEN" | "BAR";
type BillingSettings = {
  restaurantTaxRateBps: number;
  restaurantTaxIncluded: boolean;
  restaurantServiceRateBps: number;
  restaurantOrderCorrectionMinutes: number;
};
type BrandingSettings = {
  name: string;
  restaurantDisplayName?: string | null;
  restaurantHeaderImageData?: string | null;
  restaurantUseHeaderImage: boolean;
  restaurantMenuBackgroundImageData?: string | null;
  restaurantMenuBackgroundEnabled: boolean;
  restaurantMenuBackgroundPosition: "center" | "top" | "bottom";
  restaurantMenuBackgroundSize: "cover" | "contain";
};
type LoyaltySummary = {
  enrolledCustomers: number;
  completedVisits: number;
  frequentCustomers: Array<{
    nickname: string;
    vipTier: string;
    visits: number;
  }>;
};
type RewardProgram = {
  id: string;
  sponsor: "RESTAURANT" | "ASSETTRACK";
  name: string;
  description?: string | null;
  pointsRequired: number;
  vipTier?: string | null;
  rewardType: "MENU_ITEM" | "DISCOUNT_PERCENT" | "CUSTOM";
  discountBps?: number | null;
  maxDiscountAmount?: number | null;
  menuItem?: { id: string; name: string } | null;
};
type OrderingAreaSettings = {
  restaurantLatitude: string | number | null;
  restaurantLongitude: string | number | null;
  restaurantOrderRadiusMeters: number;
};
type RestaurantAnalytics = {
  range: { from: string; to: string; timezone: string };
  qrAccesses: number;
  uniqueQrSessions: number;
  visitsOpened: number;
  visitsClosed: number;
  openVisits: number;
  orders: number;
  grossSubtotal: number;
  promotionCredit: number;
  subtotal: number;
  tax: number;
  service: number;
  total: number;
  itemsSold: number;
  itemsCancelled: number;
  daily: Array<{
    date: string;
    qrAccesses: number;
    orders: number;
    sales: number;
  }>;
  popularItems: Array<{ name: string; quantity: number }>;
};
type ClosedSale = {
  id: string;
  receiptNumber: string;
  openedAt: string;
  closedAt: string;
  expiresAt: string;
  table: { name: string; kind: string };
  responsibleStaff?: { name: string } | null;
  items: Array<{
    id: string;
    orderCreatedAt: string;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    status: string;
    fulfillment: string;
  }>;
  billing: {
    subtotal: number;
    tax: number;
    service: number;
    total: number;
  };
  invoice: {
    status: string;
    requestedAt?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    taxId?: string | null;
    reference?: string | null;
  };
};
type SalesHistory = {
  items: ClosedSale[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  range: { from: string; to: string; timezone: string };
  summary: {
    accounts: number;
    orders: number;
    items: number;
    billing: {
      grossSubtotal: number;
      promotionCredit: number;
      subtotal: number;
      tax: number;
      service: number;
      total: number;
    };
    byResponsible: Array<{
      name: string;
      accounts: number;
      orders: number;
      total: number;
    }>;
    byTable: Array<{
      name: string;
      accounts: number;
      orders: number;
      total: number;
    }>;
  };
  retentionDays: number;
  maximumRetentionDays: number;
};
export type RestaurantAdminSection =
  | "overview"
  | "analytics"
  | "sales-history"
  | "branding"
  | "tables"
  | "menu"
  | "promotions"
  | "invoices"
  | "loyalty"
  | "staff";

const adminSections: Array<{
  section: RestaurantAdminSection;
  label: string;
  href: string;
}> = [
  { section: "overview", label: "Resumen", href: "/restaurant/admin" },
  {
    section: "analytics",
    label: "Actividad y ventas",
    href: "/restaurant/admin/analytics",
  },
  {
    section: "sales-history",
    label: "Historial de ventas",
    href: "/restaurant/admin/sales-history",
  },
  {
    section: "branding",
    label: "Identidad visual",
    href: "/restaurant/admin/branding",
  },
  { section: "tables", label: "Mesas y QR", href: "/restaurant/admin/tables" },
  { section: "menu", label: "Menú", href: "/restaurant/admin/menu" },
  {
    section: "promotions",
    label: "Promociones",
    href: "/restaurant/admin/promotions",
  },
  {
    section: "invoices",
    label: "Factura electrónica",
    href: "/restaurant/admin/invoices",
  },
  {
    section: "loyalty",
    label: "Fidelidad y premios",
    href: "/restaurant/admin/loyalty",
  },
  {
    section: "staff",
    label: "Personal",
    href: "/restaurant/admin/staff",
  },
];

const sectionDataPaths: Record<RestaurantAdminSection, string[]> = {
  overview: ["orders", "visits", "billing-settings", "ordering-area-settings"],
  analytics: [],
  "sales-history": [],
  branding: ["branding-settings"],
  tables: ["tables", "staff-users"],
  menu: ["menu"],
  promotions: ["promotions", "menu"],
  invoices: ["invoice-requests"],
  loyalty: ["loyalty/summary", "loyalty/rewards", "menu"],
  staff: ["staff-users"],
};
const nextStatus: Record<string, string | null> = {
  RECEIVED: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
  READY: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};

function formatStaffDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${minutes.toString().padStart(2, "0")} min`;
}

function formatColones(value: number) {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(value);
}

function restaurantRoleLabel(role: RestaurantRole | null) {
  if (role === "RESTAURANT_ADMIN") return "Administración";
  if (role === "KITCHEN") return "Cocina";
  if (role === "BAR") return "Bar";
  if (role === "WAITER") return "Mesero";
  return "Sin puesto";
}

export default function RestaurantAdminDashboard({
  section = "overview",
}: {
  section?: RestaurantAdminSection;
}) {
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [visits, setVisits] = useState<ActiveVisit[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [station, setStation] = useState<Station>("KITCHEN");
  const [tableName, setTableName] = useState("");
  const [tableKind, setTableKind] = useState<
    "DINING" | "BAR_SEAT" | "TAKEOUT_STATION"
  >("DINING");
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [itemStation, setItemStation] = useState<Station>("KITCHEN");
  const [course, setCourse] = useState("MAIN");
  const [productType, setProductType] = useState("Platos fuertes");
  const [categories, setCategories] = useState("");
  const [origin, setOrigin] = useState<"HOUSE_MADE" | "THIRD_PARTY">(
    "HOUSE_MADE",
  );
  const [prepMinutes, setPrepMinutes] = useState("10");
  const [alcoholic, setAlcoholic] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [invoiceRequests, setInvoiceRequests] = useState<InvoiceRequest[]>([]);
  const [promotionTitle, setPromotionTitle] = useState("");
  const [promotionType, setPromotionType] = useState("");
  const [promotionItemId, setPromotionItemId] = useState("");
  const [promotionCredit, setPromotionCredit] = useState("0");
  const [promotionStart, setPromotionStart] = useState("");
  const [promotionEnd, setPromotionEnd] = useState("");
  const [qr, setQr] = useState<{
    tableName: string;
    tableKind: Table["kind"];
    url: string;
    image: string;
  } | null>(null);
  const [qrNotice, setQrNotice] = useState("");
  const [staffQr, setStaffQr] = useState<StaffAccessQr | null>(null);
  const [error, setError] = useState("");
  const [billing, setBilling] = useState<BillingSettings | null>(null);
  const [taxRate, setTaxRate] = useState("13");
  const [serviceRate, setServiceRate] = useState("10");
  const [orderCorrectionMinutes, setOrderCorrectionMinutes] = useState("2");
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [branding, setBranding] = useState<BrandingSettings | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [useHeaderImage, setUseHeaderImage] = useState(false);
  const [headerImageData, setHeaderImageData] = useState<string | null>(null);
  const [menuBackgroundImageData, setMenuBackgroundImageData] = useState<
    string | null
  >(null);
  const [menuBackgroundEnabled, setMenuBackgroundEnabled] = useState(false);
  const [menuBackgroundPosition, setMenuBackgroundPosition] = useState<
    "center" | "top" | "bottom"
  >("center");
  const [menuBackgroundSize, setMenuBackgroundSize] = useState<
    "cover" | "contain"
  >("cover");
  const [loyalty, setLoyalty] = useState<LoyaltySummary | null>(null);
  const [rewards, setRewards] = useState<RewardProgram[]>([]);
  const [rewardName, setRewardName] = useState("");
  const [rewardPoints, setRewardPoints] = useState("50");
  const [rewardType, setRewardType] = useState<
    "MENU_ITEM" | "DISCOUNT_PERCENT" | "CUSTOM"
  >("MENU_ITEM");
  const [rewardMenuItemId, setRewardMenuItemId] = useState("");
  const [rewardDiscount, setRewardDiscount] = useState("10");
  const [rewardDiscountCap, setRewardDiscountCap] = useState("");
  const [orderingArea, setOrderingArea] = useState<OrderingAreaSettings | null>(
    null,
  );
  const [restaurantLatitude, setRestaurantLatitude] = useState("");
  const [restaurantLongitude, setRestaurantLongitude] = useState("");
  const [restaurantRadius, setRestaurantRadius] = useState("150");
  const [analytics, setAnalytics] = useState<RestaurantAnalytics | null>(null);
  const [analyticsFrom, setAnalyticsFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return date.toISOString().slice(0, 10);
  });
  const [analyticsTo, setAnalyticsTo] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [salesHistory, setSalesHistory] = useState<SalesHistory | null>(null);
  const [salesSearch, setSalesSearch] = useState("");
  const [staffHours, setStaffHours] = useState<StaffHoursReport | null>(null);
  const [staffHoursFrom, setStaffHoursFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return date.toISOString().slice(0, 10);
  });
  const [staffHoursTo, setStaffHoursTo] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [staffHoursUserId, setStaffHoursUserId] = useState("");
  const [payrollUserId, setPayrollUserId] = useState("");
  const [payrollPeriod, setPayrollPeriod] =
    useState<RestaurantPayPeriod>("HOURLY");
  const [payrollRate, setPayrollRate] = useState("");
  const [payrollHoursPerDay, setPayrollHoursPerDay] = useState("8");
  const [payrollWorkDaysPerMonth, setPayrollWorkDaysPerMonth] = useState("26");
  const [payrollCcssEnabled, setPayrollCcssEnabled] = useState(false);
  const [payrollCcssPercent, setPayrollCcssPercent] = useState("0");
  const billingInitialized = useRef(false);
  const brandingInitialized = useRef(false);
  const orderingAreaInitialized = useRef(false);

  const load = useCallback(async () => {
    try {
      const paths = sectionDataPaths[section];
      const responses = await Promise.all(
        paths.map((path) =>
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
      const failedResponseIndex = responses.findIndex(
        (response) => !response.ok,
      );
      if (failedResponseIndex >= 0) {
        const failedResponse = responses[failedResponseIndex];
        throw new Error(
          `Unable to load restaurant workspace (${paths[failedResponseIndex]}: ${failedResponse.status})`,
        );
      }
      const dataEntries = await Promise.all(
        responses.map(
          async (response, index) =>
            [paths[index], await response.json()] as const,
        ),
      );
      const data = Object.fromEntries(dataEntries) as Record<string, unknown>;
      const tableData = data.tables as Table[] | undefined;
      const menuData = data.menu as MenuItem[] | undefined;
      const orderData = data.orders as Order[] | undefined;
      const visitData = data.visits as ActiveVisit[] | undefined;
      const staffData = data["staff-users"] as StaffUser[] | undefined;
      const billingData = data["billing-settings"] as
        BillingSettings | undefined;
      const brandingData = data["branding-settings"] as
        BrandingSettings | undefined;
      const promotionData = data.promotions as Promotion[] | undefined;
      const invoiceData = data["invoice-requests"] as
        InvoiceRequest[] | undefined;
      const loyaltyData = data["loyalty/summary"] as LoyaltySummary | undefined;
      const rewardData = data["loyalty/rewards"] as RewardProgram[] | undefined;
      const orderingAreaData = data["ordering-area-settings"] as
        OrderingAreaSettings | undefined;

      if (tableData) setTables(tableData);
      if (menuData) setMenu(menuData);
      if (orderData) setOrders(orderData);
      if (visitData) setVisits(visitData);
      if (staffData) setStaffUsers(staffData);
      if (billingData) setBilling(billingData);
      if (brandingData) setBranding(brandingData);
      if (promotionData) setPromotions(promotionData);
      if (invoiceData) setInvoiceRequests(invoiceData);
      if (loyaltyData) setLoyalty(loyaltyData);
      if (rewardData) setRewards(rewardData);
      if (orderingAreaData) setOrderingArea(orderingAreaData);
      if (billingData && !billingInitialized.current) {
        setTaxRate(String(billingData.restaurantTaxRateBps / 100));
        setServiceRate(String(billingData.restaurantServiceRateBps / 100));
        setTaxIncluded(billingData.restaurantTaxIncluded);
        setOrderCorrectionMinutes(
          String(billingData.restaurantOrderCorrectionMinutes),
        );
        billingInitialized.current = true;
      }
      if (brandingData && !brandingInitialized.current) {
        setDisplayName(brandingData.restaurantDisplayName ?? brandingData.name);
        setUseHeaderImage(brandingData.restaurantUseHeaderImage);
        setHeaderImageData(brandingData.restaurantHeaderImageData ?? null);
        setMenuBackgroundImageData(
          brandingData.restaurantMenuBackgroundImageData ?? null,
        );
        setMenuBackgroundEnabled(brandingData.restaurantMenuBackgroundEnabled);
        setMenuBackgroundPosition(
          brandingData.restaurantMenuBackgroundPosition,
        );
        setMenuBackgroundSize(brandingData.restaurantMenuBackgroundSize);
        brandingInitialized.current = true;
      }
      if (orderingAreaData && !orderingAreaInitialized.current) {
        setRestaurantLatitude(
          orderingAreaData.restaurantLatitude == null
            ? ""
            : String(orderingAreaData.restaurantLatitude),
        );
        setRestaurantLongitude(
          orderingAreaData.restaurantLongitude == null
            ? ""
            : String(orderingAreaData.restaurantLongitude),
        );
        setRestaurantRadius(
          String(orderingAreaData.restaurantOrderRadiusMeters),
        );
        orderingAreaInitialized.current = true;
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load orders");
    }
  }, [router, section]);

  const loadAnalytics = useCallback(async () => {
    const query = new URLSearchParams({
      from: analyticsFrom,
      to: analyticsTo,
    });
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/analytics?${query}`,
    );
    if (response.status === 401) {
      router.replace("/?next=/restaurant/admin");
      return;
    }
    if (response.status === 403) {
      router.replace("/restaurant/staff");
      return;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? "No se pudo cargar el análisis del restaurante");
      return;
    }
    setAnalytics(await response.json());
  }, [analyticsFrom, analyticsTo, router]);

  const loadSalesHistory = useCallback(async () => {
    if (analyticsFrom > analyticsTo) {
      setError("La fecha inicial no puede ser posterior a la fecha final");
      return;
    }
    const query = new URLSearchParams({
      from: analyticsFrom,
      to: analyticsTo,
      search: salesSearch,
      limit: "50",
    });
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/sales-history?${query}`,
    );
    if (response.status === 401) {
      router.replace("/?next=/restaurant/admin");
      return;
    }
    if (response.status === 403) {
      router.replace("/restaurant/staff");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.message ?? "No se pudo cargar el historial de ventas");
      return;
    }
    setSalesHistory(body as SalesHistory);
    setError("");
  }, [analyticsFrom, analyticsTo, router, salesSearch]);

  const loadStaffHours = useCallback(async () => {
    if (staffHoursFrom > staffHoursTo) {
      setError("La fecha inicial no puede ser posterior a la fecha final");
      return;
    }
    const query = new URLSearchParams({
      from: staffHoursFrom,
      to: staffHoursTo,
    });
    if (staffHoursUserId) query.set("userId", staffHoursUserId);
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/staff-hours?${query}`,
    );
    if (response.status === 401) {
      router.replace("/?next=/restaurant/admin/staff");
      return;
    }
    if (response.status === 403) {
      router.replace("/restaurant/staff");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.message ?? "No se pudo cargar el control horario");
      return;
    }
    setStaffHours(body as StaffHoursReport);
    setError("");
  }, [router, staffHoursFrom, staffHoursTo, staffHoursUserId]);

  useEffect(() => {
    if (!sessionStorage.getItem("assettrack_token")) {
      router.replace("/?next=/restaurant/admin");
      return;
    }
    void load();
    if (section !== "overview") return;
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load, router, section]);

  useEffect(() => {
    if (section !== "analytics") return;
    if (!sessionStorage.getItem("assettrack_token")) return;
    void loadAnalytics();
  }, [loadAnalytics, section]);

  useEffect(() => {
    if (section !== "sales-history") return;
    if (!sessionStorage.getItem("assettrack_token")) return;
    void loadSalesHistory();
  }, [loadSalesHistory, section]);

  useEffect(() => {
    if (section !== "staff") return;
    if (!sessionStorage.getItem("assettrack_token")) return;
    void loadStaffHours();
  }, [loadStaffHours, section]);

  async function downloadSalesHistory() {
    const query = new URLSearchParams({
      from: analyticsFrom,
      to: analyticsTo,
      search: salesSearch,
    });
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/sales-history/export?${query}`,
    );
    if (!response.ok) {
      setError("No se pudo exportar el historial de ventas");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `historial-ventas-${analyticsFrom}-${analyticsTo}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      return false;
    }
  }

  function selectPayrollUser(userId: string) {
    setPayrollUserId(userId);
    const user = staffUsers.find((candidate) => candidate.id === userId);
    if (!user) return;
    setPayrollPeriod(user.restaurantPayPeriod ?? "HOURLY");
    setPayrollRate(
      user.restaurantPayRate == null ? "" : String(user.restaurantPayRate),
    );
    setPayrollHoursPerDay(
      String((user.restaurantStandardMinutesPerDay || 480) / 60),
    );
    setPayrollWorkDaysPerMonth(String(user.restaurantWorkDaysPerMonth || 26));
    setPayrollCcssEnabled(user.restaurantCcssDeductionEnabled);
    setPayrollCcssPercent(String(user.restaurantCcssDeductionBps / 100));
  }

  async function savePayrollSettings() {
    const rate = Number(payrollRate);
    const hoursPerDay = Number(payrollHoursPerDay);
    const workDaysPerMonth = Number(payrollWorkDaysPerMonth);
    const ccssPercent = Number(payrollCcssPercent);
    if (
      !payrollUserId ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      !Number.isFinite(hoursPerDay) ||
      hoursPerDay < 1 ||
      hoursPerDay > 24 ||
      !Number.isInteger(workDaysPerMonth) ||
      workDaysPerMonth < 1 ||
      workDaysPerMonth > 31 ||
      !Number.isFinite(ccssPercent) ||
      ccssPercent < 0 ||
      ccssPercent > 100
    ) {
      setError("Revise los valores de la configuración salarial");
      return;
    }
    const saved = await post(
      `staff-users/${payrollUserId}/payroll`,
      {
        payPeriod: payrollPeriod,
        payRate: Math.round(rate),
        standardMinutesPerDay: Math.round(hoursPerDay * 60),
        workDaysPerMonth,
        ccssDeductionEnabled: payrollCcssEnabled,
        ccssDeductionBps: Math.round(ccssPercent * 100),
      },
      "PATCH",
    );
    if (saved) void loadStaffHours();
  }

  async function remove(path: string) {
    setError("");
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/${path}`,
        { method: "DELETE" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? "Delete failed");
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      return false;
    }
  }

  function resetMenuForm() {
    setEditingItemId(null);
    setItemName("");
    setItemDescription("");
    setPrice("");
    setItemStation("KITCHEN");
    setCourse("MAIN");
    setProductType("Platos fuertes");
    setCategories("");
    setOrigin("HOUSE_MADE");
    setPrepMinutes("10");
    setAlcoholic(false);
    setImageData(null);
  }

  function editMenuItem(item: MenuItem) {
    setEditingItemId(item.id);
    setItemName(item.name);
    setItemDescription(item.description ?? "");
    setPrice(String(item.price));
    setItemStation(item.station as Station);
    setCourse(item.course);
    setProductType(item.productType);
    setCategories(item.categories.join(", "));
    setOrigin(item.origin);
    setPrepMinutes(String(item.prepMinutes ?? 10));
    setAlcoholic(item.alcoholic);
    setImageData(item.imageData ?? null);
  }

  function setAnalyticsDays(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    setAnalyticsFrom(start.toISOString().slice(0, 10));
    setAnalyticsTo(end.toISOString().slice(0, 10));
  }

  function setAnalyticsCurrentMonth() {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    setAnalyticsFrom(start.toISOString().slice(0, 10));
    setAnalyticsTo(end.toISOString().slice(0, 10));
  }

  function useCurrentRestaurantLocation() {
    if (!navigator.geolocation) {
      setError("Este dispositivo no permite obtener la ubicación");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setRestaurantLatitude(position.coords.latitude.toFixed(7));
        setRestaurantLongitude(position.coords.longitude.toFixed(7));
        setError("");
      },
      () =>
        setError(
          "No se pudo obtener la ubicación. Autorice el acceso o ingrese las coordenadas.",
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  async function showQr(id: string) {
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/tables/${id}/qr`,
      );
      if (!response.ok) throw new Error("QR unavailable");
      setQr(await response.json());
      setQrNotice("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "QR unavailable");
    }
  }

  async function copyQrUrl() {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.url);
      setQrNotice("Enlace copiado.");
    } catch {
      setError("No fue posible copiar el enlace. Selecciónelo manualmente.");
    }
  }

  function printTableQr() {
    if (!qr) return;
    const printWindow = window.open("", "_blank", "width=650,height=800");
    if (!printWindow) {
      setError("El navegador bloqueó la ventana de impresión.");
      return;
    }
    const kindLabels: Record<Table["kind"], string> = {
      DINING: "Mesa de salón",
      BAR_SEAT: "Posición de barra",
      TAKEOUT_STATION: "Estación para llevar",
    };
    printWindow.document.title = `QR - ${qr.tableName}`;
    const container = printWindow.document.createElement("main");
    container.style.cssText =
      "font-family:Arial,sans-serif;text-align:center;padding:32px;color:#0f172a";
    const restaurant = printWindow.document.createElement("p");
    restaurant.textContent =
      branding?.restaurantDisplayName ?? branding?.name ?? "Restaurante";
    restaurant.style.cssText =
      "font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:1px";
    const heading = printWindow.document.createElement("h1");
    heading.textContent = qr.tableName;
    const kind = printWindow.document.createElement("p");
    kind.textContent = kindLabels[qr.tableKind];
    const image = printWindow.document.createElement("img");
    image.src = qr.image;
    image.alt = `QR de ${qr.tableName}`;
    image.style.cssText = "width:430px;max-width:100%;margin:24px auto";
    const note = printWindow.document.createElement("p");
    note.textContent = "Escanee para consultar el menú y realizar su pedido.";
    container.append(restaurant, heading, kind, image, note);
    printWindow.document.body.append(container);
    image.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }

  async function generateStaffQr(user: StaffUser) {
    if (
      user.staffAccessCode?.active &&
      !window.confirm(
        `¿Renovar el QR de ${user.name}? El código anterior dejará de funcionar.`,
      )
    ) {
      return;
    }
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/staff-users/${user.id}/access-qr`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.message ?? "No fue posible crear el QR del usuario");
      return;
    }
    setStaffQr(data as StaffAccessQr);
    await load();
  }

  async function revokeStaffQr(user: StaffUser) {
    if (!window.confirm(`¿Desactivar el QR de ${user.name}?`)) return;
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/staff-users/${user.id}/access-qr`,
      { method: "DELETE" },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.message ?? "No fue posible desactivar el QR del usuario");
      return;
    }
    setStaffQr(null);
    await load();
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

  async function selectProductImage(file?: File) {
    if (!file) {
      setImageData(null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("La imagen debe ser JPEG, PNG o WebP");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("La imagen supera el límite de 2 MB de la prueba gratuita");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new window.Image();
        image.onerror = () => reject(new Error("La imagen no es válida"));
        image.onload = () =>
          resolve({ width: image.width, height: image.height });
        image.src = dataUrl;
      },
    );
    if (dimensions.width > 1600 || dimensions.height > 1600) {
      setError("La resolución máxima es 1600 × 1600 píxeles");
      return;
    }
    setImageData(dataUrl);
    setError("");
  }

  async function selectBrandImage(
    file: File | undefined,
    target: "header" | "background",
  ) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("La imagen debe ser JPEG, PNG o WebP");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("La imagen supera el límite de 2 MB de la prueba gratuita");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      const dimensions = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const image = new window.Image();
          image.onerror = () => reject(new Error("La imagen no es válida"));
          image.onload = () =>
            resolve({ width: image.width, height: image.height });
          image.src = dataUrl;
        },
      );
      if (dimensions.width > 1600 || dimensions.height > 1600) {
        setError("La resolución máxima es 1600 × 1600 píxeles");
        return;
      }
      if (target === "header") {
        setHeaderImageData(dataUrl);
        setUseHeaderImage(true);
      } else {
        setMenuBackgroundImageData(dataUrl);
        setMenuBackgroundEnabled(true);
      }
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo leer la imagen",
      );
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
  const externalVisits = visits.filter((visit) => !visit.occupiesTable);
  const pendingExternalVisits = externalVisits.filter(
    (visit) => visit.paymentStatus === "PENDING",
  );
  const isAdmin = true;
  const waiters = staffUsers.filter((user) => user.restaurantRole === "WAITER");
  const availableWaiters = waiters.filter(
    (user) => user.restaurantAvailability === "AVAILABLE",
  );
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-slate-900">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold tracking-widest text-emerald-700">
            ASSETTRACK · PILOT
          </p>
          <h1 className="text-3xl font-bold">Administración del restaurante</h1>
        </div>
        <div className="rounded bg-slate-900 p-2 text-white">
          <RestaurantSessionActions admin />
        </div>
      </header>
      <nav
        aria-label="Secciones de administración del restaurante"
        className="mb-8 overflow-x-auto rounded-xl border bg-white p-2 shadow-sm"
      >
        <div className="flex min-w-max gap-2">
          {adminSections.map((item) => {
            const active = item.section === section;
            return (
              <Link
                key={item.section}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-slate-950 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-emerald-100 hover:text-emerald-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {error && (
        <p role="alert" className="my-4 rounded bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {section === "overview" && externalVisits.length > 0 && (
        <section
          className={`mb-8 rounded-xl border-4 p-5 shadow-lg ${pendingExternalVisits.length ? "border-red-500 bg-amber-50" : "border-violet-300 bg-violet-50"}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">
                Pedidos a domicilio pendientes de gestión
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                Los productos no ingresan a cocina o bar hasta validar el
                contacto y confirmar el pago.
              </p>
            </div>
            {pendingExternalVisits.length > 0 && (
              <span className="animate-pulse rounded-full bg-red-600 px-4 py-2 font-black text-white">
                {pendingExternalVisits.length} requieren acción
              </span>
            )}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {externalVisits.map((visit) => (
              <article
                key={visit.id}
                className="rounded-xl bg-white p-5 shadow"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-violet-800">
                      Código originado en {visit.table.name}
                    </p>
                    <p className="text-sm text-slate-600">
                      Responsable:{" "}
                      {visit.responsibleStaff?.name ?? "Sin asignar"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      visit.paymentStatus === "CONFIRMED"
                        ? "bg-emerald-100 text-emerald-900"
                        : visit.paymentStatus === "REJECTED"
                          ? "bg-red-100 text-red-900"
                          : "bg-amber-200 text-amber-950"
                    }`}
                  >
                    {visit.paymentStatus === "CONFIRMED"
                      ? "PAGO CONFIRMADO"
                      : visit.paymentStatus === "REJECTED"
                        ? "PAGO RECHAZADO"
                        : "PAGO PENDIENTE"}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="font-bold">Teléfono</dt>
                  <dd>{visit.deliveryPhone || "No informado"}</dd>
                  <dt className="font-bold">Dirección</dt>
                  <dd>{visit.deliveryAddress || "No informada"}</dd>
                </dl>
                <div className="mt-4 rounded-lg bg-slate-50 p-3">
                  <p className="font-bold">Orden recibida</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {visit.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3">
                        <span>
                          {item.quantity} × {item.name}
                        </span>
                        <span>
                          ₡{(item.price * item.quantity).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 flex justify-between border-t pt-2 text-lg font-black">
                    <span>Total</span>
                    <span>₡{visit.billing.total.toLocaleString()}</span>
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {visit.paymentStatus !== "CONFIRMED" && (
                    <button
                      className="rounded bg-emerald-700 px-4 py-3 font-black text-white"
                      onClick={() => {
                        if (
                          window.confirm(
                            `¿Confirma que se contactó al cliente ${visit.deliveryPhone ?? ""} y que el pago fue verificado?`,
                          )
                        ) {
                          void post(
                            `visits/${visit.id}/payment`,
                            { status: "CONFIRMED" },
                            "PATCH",
                          );
                        }
                      }}
                    >
                      Contacto validado y pago confirmado
                    </button>
                  )}
                  {visit.paymentStatus === "PENDING" && (
                    <button
                      className="rounded border-2 border-red-600 px-4 py-3 font-bold text-red-700"
                      onClick={() =>
                        void post(
                          `visits/${visit.id}/payment`,
                          { status: "REJECTED" },
                          "PATCH",
                        )
                      }
                    >
                      Rechazar pago
                    </button>
                  )}
                  {visit.paymentStatus === "CONFIRMED" && (
                    <button
                      disabled={!visit.canHandoffDelivery}
                      className="rounded bg-violet-800 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => {
                        if (
                          visit.canHandoffDelivery &&
                          window.confirm(
                            "¿Confirma la entrega completa a la persona repartidora?",
                          )
                        ) {
                          void post(
                            `visits/${visit.id}/delivery-handoff`,
                            {},
                            "PATCH",
                          );
                        }
                      }}
                    >
                      {visit.canHandoffDelivery
                        ? "Entregar a repartidor y cerrar"
                        : "Preparación o entrega pendiente"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className={section === "overview" ? "mb-5 flex gap-2" : "hidden"}>
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
      <section className={section === "overview" ? "space-y-3" : "hidden"}>
        <h2 className="text-xl font-bold">
          {station === "KITCHEN" ? "Kitchen" : "Bar"} queue · {visible.length}{" "}
          items
        </h2>
        {visible.length === 0 && (
          <p className="rounded border p-4">
            {pendingExternalVisits.length
              ? "No hay productos liberados para esta estación. Los pedidos externos permanecen bloqueados hasta confirmar el pago."
              : "No hay productos pendientes para esta estación."}
          </p>
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
                      className="rounded border border-red-300 px-3 py-2 text-red-700"
                      onClick={() => {
                        const reason = window.prompt(
                          "Motivo obligatorio para cancelar toda la orden",
                        );
                        if (reason?.trim()) {
                          void post(
                            `orders/${order.id}/cancel`,
                            { reason: reason.trim() },
                            "PATCH",
                          );
                        }
                      }}
                    >
                      Cancelar orden
                    </button>
                  )}
              </div>
            </div>
          </article>
        ))}
      </section>
      {isAdmin && (
        <>
          <section
            className={
              section === "overview"
                ? "mt-12 rounded-xl border bg-slate-50 p-5"
                : "hidden"
            }
          >
            <h2 className="text-xl font-bold">Configuración de facturación</h2>
            <p className="mt-1 text-sm text-slate-600">
              Define cómo se calcula el IVA y el servicio para las cuentas
              abiertas.
            </p>
            <form
              className="mt-4 grid gap-4 md:grid-cols-5 md:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                const taxRateBps = Math.round(Number(taxRate) * 100);
                const serviceRateBps = Math.round(Number(serviceRate) * 100);
                const correctionMinutes = Number(orderCorrectionMinutes);
                if (
                  !Number.isFinite(taxRateBps) ||
                  !Number.isFinite(serviceRateBps) ||
                  taxRateBps < 0 ||
                  serviceRateBps < 0 ||
                  !Number.isInteger(correctionMinutes) ||
                  correctionMinutes < 0 ||
                  correctionMinutes > 5
                ) {
                  setError("Ingrese porcentajes válidos");
                  return;
                }
                void post(
                  "billing-settings",
                  {
                    taxRateBps,
                    taxIncluded,
                    serviceRateBps,
                    orderCorrectionMinutes: correctionMinutes,
                  },
                  "PATCH",
                );
              }}
            >
              <label className="font-semibold">
                IVA (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={taxRate}
                  onChange={(event) => setTaxRate(event.target.value)}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Use 0 para desactivar y ocultar el IVA en la cuenta.
                </span>
              </label>
              <label className="font-semibold">
                Tratamiento del IVA
                <select
                  className="mt-1 w-full rounded border bg-white p-2"
                  disabled={Number(taxRate) === 0}
                  value={taxIncluded ? "included" : "added"}
                  onChange={(event) =>
                    setTaxIncluded(event.target.value === "included")
                  }
                >
                  <option value="added">Agregar al subtotal</option>
                  <option value="included">Incluido en los precios</option>
                </select>
              </label>
              <label className="font-semibold">
                Servicio de mesa (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={serviceRate}
                  onChange={(event) => setServiceRate(event.target.value)}
                />
              </label>
              <label className="font-semibold">
                Corrección del cliente
                <select
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={orderCorrectionMinutes}
                  onChange={(event) =>
                    setOrderCorrectionMinutes(event.target.value)
                  }
                >
                  <option value="0">Desactivada</option>
                  {Array.from({ length: 5 }, (_, index) => index + 1).map(
                    (minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} min
                      </option>
                    ),
                  )}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Se bloquea antes si el personal acepta un artículo.
                </span>
              </label>
              <button className="rounded bg-slate-900 px-4 py-3 font-semibold text-white">
                Guardar configuración
              </button>
            </form>
            {billing && (
              <p className="mt-3 text-sm text-emerald-800">
                Configuración activa:{" "}
                {billing.restaurantTaxRateBps === 0
                  ? "IVA desactivado"
                  : `IVA ${billing.restaurantTaxRateBps / 100}% ${
                      billing.restaurantTaxIncluded ? "incluido" : "agregado"
                    }`}
                ; servicio {billing.restaurantServiceRateBps / 100}%.
                {" "}Corrección: {billing.restaurantOrderCorrectionMinutes
                  ? `${billing.restaurantOrderCorrectionMinutes} min o hasta la aceptación`
                  : "desactivada"}.
              </p>
            )}
          </section>
          <section
            className={
              section === "analytics"
                ? "mt-8 rounded-xl border bg-white p-5"
                : "hidden"
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Actividad y ventas</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Las ventas se reconocen cuando se cierra la cuenta. Las
                  cuentas abiertas se muestran como consumo en curso. Los
                  accesos QR son anónimos y no almacenan coordenadas ni IP.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm font-semibold"
                  onClick={() => setAnalyticsDays(7)}
                >
                  7 días
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm font-semibold"
                  onClick={() => setAnalyticsDays(30)}
                >
                  30 días
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm font-semibold"
                  onClick={setAnalyticsCurrentMonth}
                >
                  Este mes
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-sm font-semibold">
                Desde
                <input
                  type="date"
                  className="mt-1 block rounded border p-2"
                  value={analyticsFrom}
                  onChange={(event) => setAnalyticsFrom(event.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                Hasta
                <input
                  type="date"
                  className="mt-1 block rounded border p-2"
                  value={analyticsTo}
                  onChange={(event) => setAnalyticsTo(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="rounded bg-slate-900 px-4 py-2 font-semibold text-white"
                onClick={() => void loadAnalytics()}
              >
                Actualizar
              </button>
              {analytics && (
                <span className="text-sm text-slate-500">
                  Zona horaria: {analytics.range.timezone}
                </span>
              )}
            </div>
            {analytics && (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Lecturas QR", analytics.qrAccesses],
                    ["Visitantes anónimos", analytics.uniqueQrSessions],
                    ["Visitas abiertas", analytics.visitsOpened],
                    ["Visitas cerradas", analytics.visitsClosed],
                    ["Cuentas en curso", analytics.openVisits],
                    ["Órdenes", analytics.orders],
                    ["Productos vendidos", analytics.itemsSold],
                    ["Productos cancelados", analytics.itemsCancelled],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-slate-50 p-4">
                      <p className="text-sm text-slate-600">{label}</p>
                      <strong className="text-2xl">{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["Subtotal bruto", analytics.grossSubtotal],
                    ["Créditos promocionales", analytics.promotionCredit],
                    ["Ventas netas", analytics.subtotal],
                    ["IVA registrado", analytics.tax],
                    ["Servicio registrado", analytics.service],
                    ["Total cobrado", analytics.total],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"
                    >
                      <p className="text-sm text-emerald-900">{label}</p>
                      <strong className="text-xl">
                        ₡{Number(value).toLocaleString()}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="p-2">Fecha</th>
                          <th className="p-2">QR</th>
                          <th className="p-2">Órdenes</th>
                          <th className="p-2">Venta neta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.daily.map((entry) => (
                          <tr key={entry.date} className="border-t">
                            <td className="p-2">{entry.date}</td>
                            <td className="p-2">{entry.qrAccesses}</td>
                            <td className="p-2">{entry.orders}</td>
                            <td className="p-2">
                              ₡{entry.sales.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-lg border p-4">
                    <h3 className="font-bold">Productos más vendidos</h3>
                    {analytics.popularItems.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-600">
                        No hay cuentas cerradas en este período.
                      </p>
                    ) : (
                      <ol className="mt-3 space-y-2">
                        {analytics.popularItems.map((item) => (
                          <li
                            key={item.name}
                            className="flex justify-between border-t pt-2"
                          >
                            <span>{item.name}</span>
                            <strong>{item.quantity}</strong>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
          <section
            className={
              section === "sales-history"
                ? "mt-8 rounded-xl border bg-white p-5"
                : "hidden"
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">
                  Historial de ventas cerradas
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Consulte comprobantes recientes para atender aclaraciones del
                  cliente. AssetTrack elimina automáticamente el detalle al
                  vencer la retención operativa.
                </p>
              </div>
              <button
                type="button"
                className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white"
                onClick={() => void downloadSalesHistory()}
              >
                Descargar CSV
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[180px_180px_1fr_auto] lg:items-end">
              <label className="text-sm font-semibold">
                Desde
                <input
                  type="date"
                  className="mt-1 w-full rounded border p-2"
                  value={analyticsFrom}
                  onChange={(event) => setAnalyticsFrom(event.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                Hasta
                <input
                  type="date"
                  className="mt-1 w-full rounded border p-2"
                  value={analyticsTo}
                  onChange={(event) => setAnalyticsTo(event.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                Buscar comprobante, mesa, responsable o dato fiscal
                <input
                  className="mt-1 w-full rounded border p-2"
                  value={salesSearch}
                  onChange={(event) => setSalesSearch(event.target.value)}
                  placeholder="Ej. AT-20260927, Mesa 2 o correo"
                />
              </label>
              <button
                type="button"
                className="rounded bg-slate-900 px-4 py-2.5 font-semibold text-white"
                onClick={() => void loadSalesHistory()}
              >
                Aplicar filtros
              </button>
            </div>
            {salesHistory && (
              <>
                {salesHistory.summary && (
                  <>
                    <section
                      aria-labelledby="sales-period-summary"
                      className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"
                    >
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div>
                          <h3
                            id="sales-period-summary"
                            className="text-lg font-bold"
                          >
                            Resumen del periodo
                          </h3>
                          <p className="text-sm text-slate-600">
                            Cuentas cerradas por fecha de cierre · zona horaria:{" "}
                            {salesHistory.range.timezone}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-emerald-900 shadow-sm">
                          {salesHistory.total} registros
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ["Cuentas cerradas", salesHistory.summary.accounts],
                          ["Órdenes", salesHistory.summary.orders],
                          ["Productos", salesHistory.summary.items],
                          [
                            "Total cobrado",
                            `₡${salesHistory.summary.billing.total.toLocaleString()}`,
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-lg bg-white p-4 shadow-sm"
                          >
                            <p className="text-sm text-slate-600">{label}</p>
                            <strong className="text-2xl">{value}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {[
                          [
                            "Subtotal bruto",
                            salesHistory.summary.billing.grossSubtotal,
                          ],
                          [
                            "Promociones",
                            -salesHistory.summary.billing.promotionCredit,
                          ],
                          ["Subtotal", salesHistory.summary.billing.subtotal],
                          ["IVA", salesHistory.summary.billing.tax],
                          ["Servicio", salesHistory.summary.billing.service],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-lg border bg-white p-3"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {label}
                            </p>
                            <strong>
                              {Number(value) < 0 ? "−" : ""}₡
                              {Math.abs(Number(value)).toLocaleString()}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </section>

                    <div className="mt-5 grid gap-5 lg:grid-cols-2">
                      <div className="overflow-x-auto rounded-xl border">
                        <h3 className="bg-slate-100 p-3 font-bold">
                          Responsables que atendieron
                        </h3>
                        <table className="w-full min-w-[480px] text-left text-sm">
                          <thead>
                            <tr className="border-t bg-slate-50">
                              <th className="p-2">Responsable</th>
                              <th className="p-2">Cuentas</th>
                              <th className="p-2">Órdenes</th>
                              <th className="p-2">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {salesHistory.summary.byResponsible.map((entry) => (
                              <tr key={entry.name} className="border-t">
                                <td className="p-2 font-semibold">
                                  {entry.name}
                                </td>
                                <td className="p-2">{entry.accounts}</td>
                                <td className="p-2">{entry.orders}</td>
                                <td className="p-2">
                                  ₡{entry.total.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="overflow-x-auto rounded-xl border">
                        <h3 className="bg-slate-100 p-3 font-bold">
                          Mesas y posiciones atendidas
                        </h3>
                        <table className="w-full min-w-[480px] text-left text-sm">
                          <thead>
                            <tr className="border-t bg-slate-50">
                              <th className="p-2">Mesa o posición</th>
                              <th className="p-2">Cuentas</th>
                              <th className="p-2">Órdenes</th>
                              <th className="p-2">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {salesHistory.summary.byTable.map((entry) => (
                              <tr key={entry.name} className="border-t">
                                <td className="p-2 font-semibold">
                                  {entry.name}
                                </td>
                                <td className="p-2">{entry.accounts}</td>
                                <td className="p-2">{entry.orders}</td>
                                <td className="p-2">
                                  ₡{entry.total.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}

                <p className="mt-5 rounded bg-amber-50 p-3 text-sm text-amber-900">
                  Se muestran {salesHistory.total} cuentas. El detalle permanece
                  disponible durante {salesHistory.retentionDays} días; el
                  máximo de AssetTrack es {salesHistory.maximumRetentionDays}{" "}
                  días.
                </p>
              </>
            )}
            <h3 className="mt-6 text-lg font-bold">Registros individuales</h3>
            <div className="mt-4 space-y-4">
              {salesHistory?.items.map((sale) => (
                <details key={sale.id} className="rounded-lg border p-4">
                  <summary className="cursor-pointer font-semibold">
                    {sale.receiptNumber} · {sale.table.name} · ₡
                    {sale.billing.total.toLocaleString()} ·{" "}
                    {new Date(sale.closedAt).toLocaleString("es-CR")}
                  </summary>
                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <p>
                      Responsable:{" "}
                      {sale.responsibleStaff?.name ?? "Sin asignar"}
                    </p>
                    <p>
                      Disponible hasta:{" "}
                      {new Date(sale.expiresAt).toLocaleString("es-CR")}
                    </p>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="p-2">Hora</th>
                          <th className="p-2">Producto</th>
                          <th className="p-2">Cantidad</th>
                          <th className="p-2">Modalidad</th>
                          <th className="p-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sale.items.map((item) => (
                          <tr key={item.id} className="border-t">
                            <td className="p-2">
                              {new Date(item.orderCreatedAt).toLocaleTimeString(
                                "es-CR",
                              )}
                            </td>
                            <td className="p-2">{item.name}</td>
                            <td className="p-2">{item.quantity}</td>
                            <td className="p-2">{item.fulfillment}</td>
                            <td className="p-2">
                              ₡{item.total.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 grid gap-2 rounded bg-slate-50 p-3 text-sm sm:grid-cols-4">
                    <span>
                      Subtotal: ₡{sale.billing.subtotal.toLocaleString()}
                    </span>
                    <span>IVA: ₡{sale.billing.tax.toLocaleString()}</span>
                    <span>
                      Servicio: ₡{sale.billing.service.toLocaleString()}
                    </span>
                    <strong>
                      Total: ₡{sale.billing.total.toLocaleString()}
                    </strong>
                  </div>
                  {sale.invoice.status !== "NOT_REQUESTED" && (
                    <div className="mt-3 rounded border border-indigo-200 bg-indigo-50 p-3 text-sm">
                      <strong>
                        Factura electrónica: {sale.invoice.status}
                      </strong>
                      <p>
                        {sale.invoice.name} · {sale.invoice.email} ·{" "}
                        {sale.invoice.phone} · ID {sale.invoice.taxId}
                      </p>
                      {sale.invoice.reference && (
                        <p>Referencia: {sale.invoice.reference}</p>
                      )}
                    </div>
                  )}
                </details>
              ))}
              {salesHistory?.items.length === 0 && (
                <p className="rounded bg-slate-50 p-4 text-slate-600">
                  No se encontraron ventas cerradas dentro de la ventana de
                  retención.
                </p>
              )}
            </div>
          </section>
          <section
            className={
              section === "overview"
                ? "mt-8 rounded-xl border bg-amber-50 p-5"
                : "hidden"
            }
          >
            <h2 className="text-xl font-bold">Alcance para pedidos por QR</h2>
            <p className="mt-1 text-sm text-slate-700">
              Configure el centro del local y el radio permitido. Fuera de este
              radio, los códigos de mesa, barra y para llevar ofrecerán
              únicamente entrega a domicilio.
            </p>
            <form
              className="mt-4 grid gap-3 md:grid-cols-4 md:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void post(
                  "ordering-area-settings",
                  {
                    latitude: Number(restaurantLatitude),
                    longitude: Number(restaurantLongitude),
                    radiusMeters: Number(restaurantRadius),
                  },
                  "PATCH",
                );
              }}
            >
              <label className="font-semibold">
                Latitud
                <input
                  required
                  type="number"
                  min="-90"
                  max="90"
                  step="0.0000001"
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={restaurantLatitude}
                  onChange={(event) =>
                    setRestaurantLatitude(event.target.value)
                  }
                />
              </label>
              <label className="font-semibold">
                Longitud
                <input
                  required
                  type="number"
                  min="-180"
                  max="180"
                  step="0.0000001"
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={restaurantLongitude}
                  onChange={(event) =>
                    setRestaurantLongitude(event.target.value)
                  }
                />
              </label>
              <label className="font-semibold">
                Radio (metros)
                <input
                  required
                  type="number"
                  min="25"
                  max="5000"
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={restaurantRadius}
                  onChange={(event) => setRestaurantRadius(event.target.value)}
                />
              </label>
              <button className="rounded bg-slate-900 px-4 py-3 font-semibold text-white">
                Guardar alcance
              </button>
            </form>
            <button
              type="button"
              className="mt-3 text-sm font-semibold text-amber-900 underline"
              onClick={useCurrentRestaurantLocation}
            >
              Usar la ubicación actual de este dispositivo
            </button>
            {orderingArea?.restaurantLatitude != null && (
              <p className="mt-3 text-sm text-emerald-800">
                Geocerca activa: {orderingArea.restaurantOrderRadiusMeters} m.
              </p>
            )}
          </section>
          <section
            className={
              section === "branding"
                ? "mt-8 rounded-xl border bg-slate-50 p-5"
                : "hidden"
            }
          >
            <h2 className="text-xl font-bold">
              Identidad visual del menú del cliente
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              El nombre elegido para el establecimiento aparece siempre como
              título. Puede agregar una imagen proporcional debajo y
              personalizar el fondo de la zona desplazable del menú.
            </p>
            <form
              className="mt-5 space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (!displayName.trim()) {
                  setError("Ingrese el nombre visible del establecimiento");
                  return;
                }
                void post(
                  "branding-settings",
                  {
                    displayName: displayName.trim(),
                    useHeaderImage,
                    headerImageData,
                    menuBackgroundEnabled,
                    menuBackgroundImageData,
                    menuBackgroundPosition,
                    menuBackgroundSize,
                  },
                  "PATCH",
                );
              }}
            >
              <fieldset className="rounded-xl border bg-white p-4">
                <legend className="px-2 font-bold">
                  Encabezado del establecimiento
                </legend>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <label className="block font-semibold">
                      Nombre visible
                      <input
                        required
                        maxLength={120}
                        className="mt-1 w-full rounded border p-2"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                      />
                    </label>
                    <label className="flex items-center gap-2 rounded border p-3">
                      <input
                        type="checkbox"
                        checked={useHeaderImage}
                        disabled={!headerImageData}
                        onChange={(event) =>
                          setUseHeaderImage(event.target.checked)
                        }
                      />
                      Mostrar una imagen debajo del título
                    </label>
                    <label className="block text-sm">
                      Imagen del encabezado (JPEG, PNG o WebP; máximo 2 MB y
                      1600 × 1600)
                      <input
                        className="mt-2 block w-full"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) =>
                          void selectBrandImage(
                            event.target.files?.[0],
                            "header",
                          )
                        }
                      />
                    </label>
                    {headerImageData && (
                      <button
                        type="button"
                        className="text-red-700 underline"
                        onClick={() => {
                          setHeaderImageData(null);
                          setUseHeaderImage(false);
                        }}
                      >
                        Quitar imagen del encabezado
                      </button>
                    )}
                  </div>
                  <div className="min-h-32 rounded-xl border bg-slate-100 p-4">
                    <strong className="block text-3xl">
                      {displayName || branding?.name || "Restaurante"}
                    </strong>
                    {useHeaderImage && headerImageData && (
                      <Image
                        src={headerImageData}
                        alt={displayName || "Vista previa del encabezado"}
                        width={1600}
                        height={1600}
                        unoptimized
                        className="mt-3 h-auto w-full object-contain"
                      />
                    )}
                  </div>
                </div>
              </fieldset>

              <fieldset className="rounded-xl border bg-white p-4">
                <legend className="px-2 font-bold">Fondo fijo del menú</legend>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={menuBackgroundEnabled}
                        disabled={!menuBackgroundImageData}
                        onChange={(event) =>
                          setMenuBackgroundEnabled(event.target.checked)
                        }
                      />
                      Mostrar la imagen como fondo
                    </label>
                    <label className="block text-sm">
                      Logotipo o imagen de fondo (JPEG, PNG o WebP; máximo 2 MB
                      y 1600 × 1600)
                      <input
                        className="mt-2 block w-full"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) =>
                          void selectBrandImage(
                            event.target.files?.[0],
                            "background",
                          )
                        }
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="font-semibold">
                        Posición
                        <select
                          className="mt-1 w-full rounded border bg-white p-2"
                          value={menuBackgroundPosition}
                          onChange={(event) =>
                            setMenuBackgroundPosition(
                              event.target.value as "center" | "top" | "bottom",
                            )
                          }
                        >
                          <option value="top">Superior</option>
                          <option value="center">Centro</option>
                          <option value="bottom">Inferior</option>
                        </select>
                      </label>
                      <label className="font-semibold">
                        Ajuste
                        <select
                          className="mt-1 w-full rounded border bg-white p-2"
                          value={menuBackgroundSize}
                          onChange={(event) =>
                            setMenuBackgroundSize(
                              event.target.value as "cover" | "contain",
                            )
                          }
                        >
                          <option value="cover">Cubrir el área</option>
                          <option value="contain">Mostrar completa</option>
                        </select>
                      </label>
                    </div>
                    {menuBackgroundImageData && (
                      <button
                        type="button"
                        className="text-red-700 underline"
                        onClick={() => {
                          setMenuBackgroundImageData(null);
                          setMenuBackgroundEnabled(false);
                        }}
                      >
                        Quitar imagen de fondo
                      </button>
                    )}
                  </div>
                  <div
                    className="min-h-52 rounded-xl border bg-slate-100 bg-no-repeat p-5"
                    style={
                      menuBackgroundImageData
                        ? {
                            backgroundImage: `linear-gradient(rgba(248, 250, 252, 0.82), rgba(248, 250, 252, 0.82)), url("${menuBackgroundImageData}")`,
                            backgroundPosition: `center ${menuBackgroundPosition}`,
                            backgroundSize: menuBackgroundSize,
                          }
                        : undefined
                    }
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      <span className="rounded-lg border bg-white/90 p-3 font-semibold">
                        Producto de muestra
                      </span>
                      <span className="rounded-lg border bg-white/90 p-3 font-semibold">
                        ₡0
                      </span>
                    </div>
                  </div>
                </div>
              </fieldset>
              <button className="w-full rounded bg-slate-900 px-5 py-3 font-semibold text-white sm:w-auto">
                Guardar identidad visual
              </button>
            </form>
          </section>
          <section
            className={
              section === "tables" || section === "menu"
                ? "mt-12 grid gap-8"
                : "hidden"
            }
          >
            <div className={section === "tables" ? "block" : "hidden"}>
              <h2 className="text-xl font-bold">Tables & QR codes</h2>
              <form
                className="my-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void post("tables", {
                    name: tableName,
                    kind: tableKind,
                  }).then(() => setTableName(""));
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
                <select
                  className="rounded border bg-white p-2"
                  value={tableKind}
                  onChange={(event) =>
                    setTableKind(
                      event.target.value as
                        "DINING" | "BAR_SEAT" | "TAKEOUT_STATION",
                    )
                  }
                >
                  <option value="DINING">Mesa de salón</option>
                  <option value="BAR_SEAT">
                    Posición de barra (sin servicio)
                  </option>
                  <option value="TAKEOUT_STATION">Estación para llevar</option>
                </select>
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
                  {table.kind === "DINING" ? (
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
                      {availableWaiters.map((waiter) => (
                        <option key={waiter.id} value={waiter.id}>
                          {waiter.name}
                        </option>
                      ))}
                    </select>
                  ) : table.kind === "BAR_SEAT" ? (
                    <span className="rounded bg-violet-50 p-2 text-sm font-semibold text-violet-900">
                      Barra · atención del bartender
                    </span>
                  ) : (
                    <span className="rounded bg-amber-50 p-2 text-sm font-semibold">
                      Pedidos para llevar
                    </span>
                  )}
                  <button
                    className="text-emerald-700 underline"
                    onClick={() => void showQr(table.id)}
                  >
                    Show QR
                  </button>
                  <label className="col-span-full flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={table.serviceChargeEnabled}
                      disabled={table.kind === "BAR_SEAT"}
                      onChange={(event) =>
                        void post(
                          `tables/${table.id}/billing`,
                          { serviceChargeEnabled: event.target.checked },
                          "PATCH",
                        )
                      }
                    />
                    Aplicar servicio de mesa
                  </label>
                </div>
              ))}
              {qr && (
                <div className="my-3 rounded border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{qr.tableName}</h3>
                      <p className="text-sm text-slate-600">
                        {qr.tableKind === "DINING"
                          ? "Mesa de salón"
                          : qr.tableKind === "BAR_SEAT"
                            ? "Posición de barra"
                            : "Estación para llevar"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQr(null)}
                      className="rounded border px-3 py-1 font-bold"
                      aria-label="Cerrar código QR"
                    >
                      ×
                    </button>
                  </div>
                  <Image
                    src={qr.image}
                    alt={`Código QR de ${qr.tableName}`}
                    width={260}
                    height={260}
                    unoptimized
                    className="mt-3"
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
                    Este código es permanente: descargarlo o imprimirlo no
                    cambia el acceso de la posición.
                  </p>
                  {qrNotice && (
                    <p className="mt-2 text-sm font-semibold text-emerald-700">
                      {qrNotice}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={qr.image}
                      download={`qr-${qr.tableName.replaceAll(" ", "-")}.png`}
                      className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white"
                    >
                      Descargar PNG
                    </a>
                    <button
                      type="button"
                      onClick={printTableQr}
                      className="rounded bg-slate-950 px-4 py-2 font-semibold text-white"
                    >
                      Imprimir
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyQrUrl()}
                      className="rounded border border-slate-300 px-4 py-2 font-semibold text-slate-700"
                    >
                      Copiar enlace
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className={section === "menu" ? "block" : "hidden"}>
              <h2 className="text-xl font-bold">
                {editingItemId ? "Editar producto" : "Menú"}
              </h2>
              <form
                className="my-3 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = Number(price);
                  if (!Number.isInteger(value) || value < 0) {
                    setError("Enter a valid price in colones");
                    return;
                  }
                  const payload = {
                    name: itemName,
                    description: itemDescription || undefined,
                    price: value,
                    station: itemStation,
                    course,
                    productType,
                    categories: categories
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                    origin,
                    prepMinutes:
                      origin === "HOUSE_MADE" ? Number(prepMinutes) : undefined,
                    alcoholic,
                    imageData,
                  };
                  void post(
                    editingItemId ? `menu/${editingItemId}` : "menu",
                    payload,
                    editingItemId ? "PATCH" : "POST",
                  ).then((saved) => {
                    if (saved) resetMenuForm();
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
                <textarea
                  maxLength={500}
                  className="w-full rounded border p-2"
                  placeholder="Descripción del producto"
                  value={itemDescription}
                  onChange={(event) => setItemDescription(event.target.value)}
                />
                <input
                  required
                  maxLength={60}
                  className="w-full rounded border p-2"
                  placeholder="Tipo de producto: Postres, Platos fuertes..."
                  value={productType}
                  onChange={(event) => setProductType(event.target.value)}
                />
                <input
                  className="w-full rounded border p-2"
                  placeholder="Categorías adicionales, separadas por coma"
                  value={categories}
                  onChange={(event) => setCategories(event.target.value)}
                />
                <div className="grid gap-2 sm:grid-cols-3">
                  <select
                    className="rounded border bg-white p-2"
                    value={origin}
                    onChange={(event) =>
                      setOrigin(
                        event.target.value as "HOUSE_MADE" | "THIRD_PARTY",
                      )
                    }
                  >
                    <option value="HOUSE_MADE">Hecho en casa</option>
                    <option value="THIRD_PARTY">De terceros</option>
                  </select>
                  <input
                    disabled={origin === "THIRD_PARTY"}
                    required={origin === "HOUSE_MADE"}
                    min="5"
                    max="15"
                    type="number"
                    className="rounded border p-2"
                    placeholder="Minutos de elaboración"
                    value={prepMinutes}
                    onChange={(event) => setPrepMinutes(event.target.value)}
                  />
                  <label className="flex items-center gap-2 rounded border p-2">
                    <input
                      type="checkbox"
                      checked={alcoholic}
                      onChange={(event) => setAlcoholic(event.target.checked)}
                    />{" "}
                    Contiene alcohol
                  </label>
                </div>
                <label className="block rounded border p-2 text-sm">
                  Imagen del producto (JPEG, PNG o WebP; máximo 2 MB y 1600 ×
                  1600)
                  <input
                    className="mt-2 block w-full"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      void selectProductImage(event.target.files?.[0])
                    }
                  />
                  {imageData && (
                    <button
                      type="button"
                      className="mt-2 text-red-700 underline"
                      onClick={() => setImageData(null)}
                    >
                      Quitar imagen
                    </button>
                  )}
                </label>
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
                  <button className="rounded bg-slate-900 px-3 py-2 text-white">
                    {editingItemId ? "Guardar cambios" : "Agregar producto"}
                  </button>
                  {editingItemId && (
                    <button
                      type="button"
                      className="rounded border px-3 py-2"
                      onClick={resetMenuForm}
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>
              </form>
              {menu.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 border-b py-2"
                >
                  <span>
                    {item.name} · ₡{item.price.toLocaleString()} ·{" "}
                    {item.productType} {item.active ? "" : "(unavailable)"}
                  </span>
                  <div className="flex flex-wrap justify-end gap-3 text-sm">
                    <button
                      className="text-sky-700 underline"
                      onClick={() => editMenuItem(item)}
                    >
                      Editar
                    </button>
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
                      {item.active ? "Archivar" : "Restaurar"}
                    </button>
                    <button
                      className="text-red-700 underline"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Solo se eliminará si el producto nunca se utilizó en una orden. ¿Continuar?",
                          )
                        ) {
                          void remove(`menu/${item.id}`);
                        }
                      }}
                    >
                      Eliminar definitivamente
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      <section
        className={
          section === "promotions" || section === "invoices"
            ? "mt-12 grid gap-8"
            : "hidden"
        }
      >
        <div
          className={
            section === "promotions"
              ? "rounded-xl border bg-white p-5"
              : "hidden"
          }
        >
          <h2 className="text-xl font-bold">Promociones</h2>
          <p className="mt-1 text-sm text-slate-600">
            Una promoción vigente podrá mostrarse al iniciar una orden
            adicional. El precio de catálogo no cambia; el beneficio se aplica
            como crédito.
          </p>
          <form
            className="mt-4 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void post("promotions", {
                title: promotionTitle,
                menuItemId: promotionItemId,
                productType:
                  menu.find((item) => item.id === promotionItemId)
                    ?.productType ?? promotionType,
                creditAmount: Number(promotionCredit),
                startsAt: new Date(promotionStart).toISOString(),
                endsAt: new Date(promotionEnd).toISOString(),
              }).then(() => {
                setPromotionTitle("");
                setPromotionItemId("");
                setPromotionCredit("0");
              });
            }}
          >
            <input
              required
              className="w-full rounded border p-2"
              placeholder="Nombre de la promoción"
              value={promotionTitle}
              onChange={(event) => setPromotionTitle(event.target.value)}
            />
            <select
              required
              className="w-full rounded border p-2"
              value={promotionItemId}
              onChange={(event) => {
                setPromotionItemId(event.target.value);
                setPromotionType(
                  menu.find((item) => item.id === event.target.value)
                    ?.productType ?? "",
                );
              }}
            >
              <option value="">Seleccione el producto promocionado</option>
              {menu
                .filter((item) => item.active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.productType}
                  </option>
                ))}
            </select>
            <input
              required
              min="0"
              type="number"
              className="w-full rounded border p-2"
              placeholder="Crédito en colones"
              value={promotionCredit}
              onChange={(event) => setPromotionCredit(event.target.value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                Inicio
                <input
                  required
                  type="datetime-local"
                  className="mt-1 w-full rounded border p-2"
                  value={promotionStart}
                  onChange={(event) => setPromotionStart(event.target.value)}
                />
              </label>
              <label className="text-sm">
                Final
                <input
                  required
                  type="datetime-local"
                  className="mt-1 w-full rounded border p-2"
                  value={promotionEnd}
                  onChange={(event) => setPromotionEnd(event.target.value)}
                />
              </label>
            </div>
            <button className="rounded bg-fuchsia-700 px-4 py-2 font-semibold text-white">
              Crear promoción
            </button>
          </form>
          <div className="mt-4 space-y-2">
            {promotions.map((promotion) => (
              <div key={promotion.id} className="rounded border p-3">
                <div className="flex items-center justify-between">
                  <strong>{promotion.title}</strong>
                  <button
                    className="text-emerald-700 underline"
                    onClick={() =>
                      void post(
                        `promotions/${promotion.id}`,
                        { active: !promotion.active },
                        "PATCH",
                      )
                    }
                  >
                    {promotion.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
                <p className="text-sm">
                  {menu.find((item) => item.id === promotion.menuItemId)
                    ?.name ?? promotion.productType}{" "}
                  · crédito ₡{promotion.creditAmount.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(promotion.startsAt).toLocaleString()} —{" "}
                  {new Date(promotion.endsAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div
          className={
            section === "invoices" ? "rounded-xl border bg-white p-5" : "hidden"
          }
        >
          <h2 className="text-xl font-bold">
            Solicitudes de factura electrónica
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            La aplicación recopila la solicitud; la emisión se realiza mediante
            el proceso externo del restaurante.
          </p>
          <div className="mt-4 space-y-3">
            {invoiceRequests.length === 0 && (
              <p>No hay solicitudes pendientes.</p>
            )}
            {invoiceRequests.map((request) => (
              <article key={request.id} className="rounded border p-3">
                <strong>
                  {request.table.name} · {request.invoiceName}
                </strong>
                <p className="text-sm">
                  {request.invoiceTaxId} · {request.invoiceEmail} ·{" "}
                  {request.invoicePhone}
                </p>
                <p className="text-sm">
                  Estado: {request.invoiceRequestStatus}
                </p>
                {request.invoiceRequestStatus === "PENDING" && (
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded bg-emerald-700 px-3 py-1 text-white"
                      onClick={() => {
                        const reference = window.prompt(
                          "Referencia de la factura emitida",
                        );
                        if (reference?.trim())
                          void post(
                            `invoice-requests/${request.id}`,
                            { status: "PROCESSED", reference },
                            "PATCH",
                          );
                      }}
                    >
                      Marcar procesada
                    </button>
                    <button
                      className="rounded border border-red-500 px-3 py-1 text-red-700"
                      onClick={() =>
                        void post(
                          `invoice-requests/${request.id}`,
                          { status: "REJECTED" },
                          "PATCH",
                        )
                      }
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className={section === "loyalty" ? "mt-12" : "hidden"}>
        <h2 className="text-xl font-bold">Fidelidad y premios</h2>
        <p className="mt-1 text-sm text-slate-600">
          Los datos visibles pertenecen únicamente a este restaurante.
          AssetTrack conserva las métricas globales de forma separada.
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border bg-white p-5">
            <h3 className="font-bold">Clientes frecuentes</h3>
            <p className="mt-2 text-2xl font-bold">
              {loyalty?.enrolledCustomers ?? 0} afiliados
            </p>
            <p className="text-sm text-slate-600">
              {loyalty?.completedVisits ?? 0} visitas verificadas
            </p>
            <div className="mt-3 space-y-2">
              {loyalty?.frequentCustomers.map((customer) => (
                <div
                  key={`${customer.nickname}-${customer.visits}`}
                  className="flex justify-between border-t pt-2"
                >
                  <span>
                    {customer.nickname} · {customer.vipTier}
                  </span>
                  <strong>{customer.visits} visitas</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border bg-white p-5">
            <h3 className="font-bold">Política de premios</h3>
            <div className="mt-3 grid gap-2">
              <select
                className="rounded border bg-white p-2"
                value={rewardType}
                onChange={(event) =>
                  setRewardType(event.target.value as typeof rewardType)
                }
              >
                <option value="MENU_ITEM">Producto del menú</option>
                <option value="DISCOUNT_PERCENT">
                  Porcentaje de descuento
                </option>
                <option value="CUSTOM">Premio personalizado</option>
              </select>
              {rewardType === "MENU_ITEM" && (
                <select
                  className="rounded border bg-white p-2"
                  value={rewardMenuItemId}
                  onChange={(event) => {
                    setRewardMenuItemId(event.target.value);
                    const item = menu.find(
                      (candidate) => candidate.id === event.target.value,
                    );
                    if (item) setRewardName(item.name);
                  }}
                >
                  <option value="">Seleccione un producto</option>
                  {menu
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              )}
              {rewardType === "DISCOUNT_PERCENT" && (
                <div className="flex gap-2">
                  <select
                    className="rounded border bg-white p-2"
                    value={rewardDiscount}
                    onChange={(event) => {
                      setRewardDiscount(event.target.value);
                      setRewardName(`${event.target.value}% de descuento`);
                    }}
                  >
                    {[5, 10, 15, 20, 25, 50].map((value) => (
                      <option key={value} value={value}>
                        {value}%
                      </option>
                    ))}
                  </select>
                  <input
                    className="min-w-44 flex-1 rounded border p-2"
                    type="number"
                    min="0"
                    placeholder="Tope máximo en colones (opcional)"
                    value={rewardDiscountCap}
                    onChange={(event) =>
                      setRewardDiscountCap(event.target.value)
                    }
                  />
                </div>
              )}
              <input
                className="rounded border p-2"
                placeholder="Nombre visible del premio"
                value={rewardName}
                onChange={(event) => setRewardName(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  className="w-28 rounded border p-2"
                  type="number"
                  min="1"
                  value={rewardPoints}
                  onChange={(event) => setRewardPoints(event.target.value)}
                />
                <button
                  className="rounded bg-indigo-700 px-4 py-2 font-semibold text-white"
                  onClick={async () => {
                    if (!rewardName.trim()) return;
                    const saved = await post("loyalty/rewards", {
                      name: rewardName,
                      pointsRequired: Number(rewardPoints),
                      rewardType,
                      menuItemId:
                        rewardType === "MENU_ITEM"
                          ? rewardMenuItemId
                          : undefined,
                      discountBps:
                        rewardType === "DISCOUNT_PERCENT"
                          ? Number(rewardDiscount) * 100
                          : undefined,
                      maxDiscountAmount:
                        rewardType === "DISCOUNT_PERCENT" && rewardDiscountCap
                          ? Number(rewardDiscountCap)
                          : undefined,
                    });
                    if (saved) setRewardName("");
                  }}
                >
                  Crear premio
                </button>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {rewards.map((reward) => (
                <div key={reward.id} className="rounded border p-3">
                  <strong>{reward.name}</strong>
                  <p className="text-sm">
                    {reward.pointsRequired} puntos{" "}
                    {reward.sponsor === "ASSETTRACK"
                      ? "globales · AssetTrack"
                      : "de este local · Restaurante"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className={section === "staff" ? "mt-12" : "hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Personal y estación de trabajo</h2>
          <a
            href="/users"
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          >
            Administrar usuarios y credenciales
          </a>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Los propietarios y administradores generales conservan acceso total.
        </p>
        <section className="mt-6 rounded-xl border bg-slate-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">
                Consulta de horas del personal
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Calcula la jornada desde el inicio de sesión. Los descansos son
                pagados; la indisponibilidad temporal y el tiempo fuera de turno
                no se incluyen en el salario.
              </p>
            </div>
            {staffHours && (
              <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm">
                Zona horaria: {staffHours.range.timezone}
              </span>
            )}
          </div>
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h4 className="font-bold text-emerald-950">
              Configuración salarial por empleado
            </h4>
            <p className="mt-1 text-sm text-emerald-900">
              El salario diario y mensual se convierten a una tarifa por hora
              mediante la jornada diaria y los días laborables configurados.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm font-semibold">
                Empleado
                <select
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={payrollUserId}
                  onChange={(event) => selectPayrollUser(event.target.value)}
                >
                  <option value="">Seleccione un empleado</option>
                  {staffUsers
                    .filter((user) => user.active)
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} · {restaurantRoleLabel(user.restaurantRole)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Modalidad
                <select
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={payrollPeriod}
                  onChange={(event) =>
                    setPayrollPeriod(event.target.value as RestaurantPayPeriod)
                  }
                  disabled={!payrollUserId}
                >
                  <option value="HOURLY">Por hora</option>
                  <option value="DAILY">Por día</option>
                  <option value="MONTHLY">Mensual</option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                {payrollPeriod === "HOURLY"
                  ? "Salario por hora (₡)"
                  : payrollPeriod === "DAILY"
                    ? "Salario por día (₡)"
                    : "Salario mensual (₡)"}
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={payrollRate}
                  onChange={(event) => setPayrollRate(event.target.value)}
                  disabled={!payrollUserId}
                />
              </label>
              <label className="text-sm font-semibold">
                Horas de jornada diaria
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="0.25"
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={payrollHoursPerDay}
                  onChange={(event) =>
                    setPayrollHoursPerDay(event.target.value)
                  }
                  disabled={!payrollUserId}
                />
              </label>
              <label className="text-sm font-semibold">
                Días laborables por mes
                <input
                  type="number"
                  min="1"
                  max="31"
                  step="1"
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={payrollWorkDaysPerMonth}
                  onChange={(event) =>
                    setPayrollWorkDaysPerMonth(event.target.value)
                  }
                  disabled={!payrollUserId}
                />
              </label>
              <label className="flex items-center gap-2 self-end rounded border bg-white p-2.5 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={payrollCcssEnabled}
                  onChange={(event) =>
                    setPayrollCcssEnabled(event.target.checked)
                  }
                  disabled={!payrollUserId}
                />
                Aplicar rebajo CCSS
              </label>
              <label className="text-sm font-semibold">
                Rebajo CCSS (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={payrollCcssPercent}
                  onChange={(event) =>
                    setPayrollCcssPercent(event.target.value)
                  }
                  disabled={!payrollUserId || !payrollCcssEnabled}
                />
              </label>
              <button
                type="button"
                className="self-end rounded bg-emerald-800 px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void savePayrollSettings()}
                disabled={!payrollUserId}
              >
                Guardar salario
              </button>
            </div>
            <p className="mt-3 text-xs text-emerald-900">
              La tasa CCSS queda desactivada por defecto. Verifique el
              porcentaje aplicable con su profesional contable y la normativa
              vigente.
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[180px_180px_1fr_auto] lg:items-end">
            <label className="text-sm font-semibold">
              Desde
              <input
                type="date"
                className="mt-1 w-full rounded border bg-white p-2"
                value={staffHoursFrom}
                onChange={(event) => setStaffHoursFrom(event.target.value)}
              />
            </label>
            <label className="text-sm font-semibold">
              Hasta
              <input
                type="date"
                className="mt-1 w-full rounded border bg-white p-2"
                value={staffHoursTo}
                onChange={(event) => setStaffHoursTo(event.target.value)}
              />
            </label>
            <label className="text-sm font-semibold">
              Empleado
              <select
                className="mt-1 w-full rounded border bg-white p-2"
                value={staffHoursUserId}
                onChange={(event) => setStaffHoursUserId(event.target.value)}
              >
                <option value="">Todos los empleados</option>
                {staffUsers
                  .filter(
                    (user) =>
                      user.restaurantRole ||
                      user.role === "OWNER" ||
                      user.role === "ADMIN",
                  )
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} · {restaurantRoleLabel(user.restaurantRole)}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded bg-slate-950 px-4 py-2.5 font-semibold text-white"
              onClick={() => void loadStaffHours()}
            >
              Consultar
            </button>
          </div>

          {staffHours && (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Funcionarios", staffHours.summary.employees],
                  ["Jornadas", staffHours.summary.sessions],
                  [
                    "Tiempo activo",
                    formatStaffDuration(staffHours.summary.activeMs),
                  ],
                  [
                    "Fuera de servicio (incluye descanso)",
                    formatStaffDuration(staffHours.summary.outOfServiceMs),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg bg-white p-4 shadow-sm"
                  >
                    <p className="text-sm text-slate-600">{label}</p>
                    <strong className="text-xl">{value}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [
                    "Tiempo pagable",
                    formatStaffDuration(staffHours.summary.payableMs),
                  ],
                  [
                    "Tiempo no pagado",
                    formatStaffDuration(staffHours.summary.deductedMs),
                  ],
                  ["Salario bruto", formatColones(staffHours.summary.grossPay)],
                  ["Neto estimado", formatColones(staffHours.summary.netPay)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-emerald-100 bg-emerald-50 p-4"
                  >
                    <p className="text-sm text-emerald-900">{label}</p>
                    <strong className="text-xl text-emerald-950">
                      {value}
                    </strong>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                CCSS estimada: {formatColones(staffHours.summary.ccssDeduction)}{" "}
                · empleados con salario configurado:{" "}
                {staffHours.summary.payrollConfiguredEmployees}
              </p>

              {staffHours.employees.length > 0 ? (
                <div className="mt-5 overflow-x-auto rounded-xl border bg-white">
                  <table className="w-full min-w-[1180px] text-left text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="p-3">Funcionario</th>
                        <th className="p-3">Puesto</th>
                        <th className="p-3">Primera entrada</th>
                        <th className="p-3">Última salida</th>
                        <th className="p-3">Tiempo activo</th>
                        <th className="p-3">Fuera de servicio</th>
                        <th className="p-3">Tiempo pagable</th>
                        <th className="p-3">Pago estimado</th>
                        <th className="p-3">Jornadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffHours.employees.map((employee) => (
                        <tr
                          key={employee.userId}
                          className="border-t align-top"
                        >
                          <td className="p-3">
                            <strong>{employee.name}</strong>
                            <span className="block text-xs text-slate-500">
                              {employee.email}
                            </span>
                          </td>
                          <td className="p-3">
                            {restaurantRoleLabel(employee.restaurantRole)}
                          </td>
                          <td className="p-3">
                            {new Date(employee.firstEntryAt).toLocaleString(
                              "es-CR",
                            )}
                          </td>
                          <td className="p-3">
                            {employee.openSessions > 0
                              ? "Sesión activa"
                              : employee.lastExitAt
                                ? new Date(employee.lastExitAt).toLocaleString(
                                    "es-CR",
                                  )
                                : "Sin salida registrada"}
                          </td>
                          <td className="p-3 font-semibold text-emerald-800">
                            {formatStaffDuration(employee.activeMs)}
                          </td>
                          <td className="p-3">
                            <strong>
                              {formatStaffDuration(employee.outOfServiceMs)}
                            </strong>
                            <span className="mt-1 block text-xs text-slate-500">
                              Descanso {formatStaffDuration(employee.breakMs)} ·
                              temporal{" "}
                              {formatStaffDuration(
                                employee.temporarilyUnavailableMs,
                              )}{" "}
                              · turno finalizado{" "}
                              {formatStaffDuration(employee.offShiftMs)}
                            </span>
                          </td>
                          <td className="p-3 font-semibold">
                            {formatStaffDuration(employee.payroll.payableMs)}
                            <span className="mt-1 block text-xs font-normal text-slate-500">
                              No pagado{" "}
                              {formatStaffDuration(employee.payroll.deductedMs)}
                            </span>
                          </td>
                          <td className="p-3">
                            {employee.payroll.configured ? (
                              <>
                                <strong className="text-emerald-800">
                                  Neto{" "}
                                  {formatColones(employee.payroll.netPay ?? 0)}
                                </strong>
                                <span className="mt-1 block text-xs text-slate-500">
                                  Bruto{" "}
                                  {formatColones(
                                    employee.payroll.grossPay ?? 0,
                                  )}
                                  {employee.payroll.ccssDeductionEnabled
                                    ? ` · CCSS ${formatColones(employee.payroll.ccssDeduction)}`
                                    : " · sin rebajo CCSS"}
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-500">
                                Sin salario configurado
                              </span>
                            )}
                          </td>
                          <td className="p-3">{employee.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-5 rounded-lg bg-white p-4 text-slate-600">
                  No hay jornadas registradas para los filtros seleccionados.
                </p>
              )}

              {staffHours.sessions.length > 0 && (
                <details className="mt-5 rounded-xl border bg-white p-4">
                  <summary className="cursor-pointer font-bold">
                    Ver entradas y salidas por jornada
                  </summary>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="p-2">Funcionario</th>
                          <th className="p-2">Entrada</th>
                          <th className="p-2">Salida</th>
                          <th className="p-2">Activo</th>
                          <th className="p-2">Fuera de servicio</th>
                          <th className="p-2">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffHours.sessions.map((workSession) => (
                          <tr key={workSession.id} className="border-t">
                            <td className="p-2 font-semibold">
                              {workSession.name}
                            </td>
                            <td className="p-2">
                              {new Date(workSession.entryAt).toLocaleString(
                                "es-CR",
                              )}
                            </td>
                            <td className="p-2">
                              {workSession.exitAt
                                ? new Date(workSession.exitAt).toLocaleString(
                                    "es-CR",
                                  )
                                : "En curso"}
                            </td>
                            <td className="p-2">
                              {formatStaffDuration(workSession.activeMs)}
                            </td>
                            <td className="p-2">
                              {formatStaffDuration(workSession.outOfServiceMs)}
                            </td>
                            <td className="p-2">
                              {workSession.status === "OPEN"
                                ? "Activa"
                                : workSession.status === "STALE"
                                  ? "Sin cierre confirmado"
                                  : "Cerrada"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Si no se registra una salida, la jornada deja de acumular tiempo
                doce horas después de la última confirmación de sesión. El
                registro comienza con los inicios de sesión posteriores a esta
                actualización.
              </p>
            </>
          )}
        </section>
        <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="p-3">Persona</th>
                <th className="p-3">Correo</th>
                <th className="p-3">Dashboard</th>
                <th className="p-3">Disponibilidad</th>
                <th className="p-3">Cuenta</th>
                <th className="p-3">QR de acceso</th>
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
                        disabled={!user.active}
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
                  <td className="p-3">
                    <select
                      className="rounded border p-2"
                      disabled={!user.active}
                      value={user.restaurantAvailability}
                      onChange={(event) => {
                        const availability = event.target.value;
                        const reason =
                          availability === "AVAILABLE"
                            ? "Reincorporación autorizada"
                            : window.prompt(
                                "Indique el motivo del cambio de disponibilidad",
                              );
                        if (!reason?.trim()) return;
                        void post(
                          `staff-users/${user.id}/availability`,
                          { availability, reason: reason.trim() },
                          "PATCH",
                        );
                      }}
                    >
                      <option value="AVAILABLE">Disponible</option>
                      <option value="BREAK">Descanso</option>
                      <option value="TEMPORARILY_UNAVAILABLE">
                        Fuera de servicio temporal
                      </option>
                      <option value="OFF_SHIFT">Turno finalizado</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        user.active
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {user.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="p-3">
                    {user.restaurantRole ||
                    user.role === "OWNER" ||
                    user.role === "ADMIN" ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!user.active}
                          onClick={() => void generateStaffQr(user)}
                          className="rounded border border-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"
                        >
                          {user.staffAccessCode?.active
                            ? "Renovar QR"
                            : "Crear QR"}
                        </button>
                        {user.staffAccessCode?.active && (
                          <button
                            type="button"
                            onClick={() => void revokeStaffQr(user)}
                            className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold"
                          >
                            Desactivar
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-500">
                        Asigne un puesto
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {staffQr && (
          <div className="mt-5 rounded-xl border bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">
                  Acceso rápido
                </p>
                <h3 className="text-xl font-black">{staffQr.staffName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setStaffQr(null)}
                className="rounded border px-3 py-1 font-bold"
              >
                ×
              </button>
            </div>
            <Image
              src={staffQr.image}
              alt={`QR de acceso de ${staffQr.staffName}`}
              width={320}
              height={320}
              unoptimized
              className="mt-4 rounded border"
            />
            <p className="mt-3 break-all text-xs text-slate-600">
              {staffQr.accessUrl}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={staffQr.image}
                download={`acceso-${staffQr.staffName.replaceAll(" ", "-")}.png`}
                className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white"
              >
                Descargar
              </a>
              <button
                type="button"
                onClick={printStaffQr}
                className="rounded bg-slate-950 px-4 py-2 font-semibold text-white"
              >
                Imprimir
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
