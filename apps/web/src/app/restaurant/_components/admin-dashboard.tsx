"use client";

import { getSessionValue } from "@/lib/session";

import { API_URL, authenticatedFetch } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { RestaurantSessionActions } from "./restaurant-session-actions";
import {
  ClosedReceiptDialog,
  fetchClosedRestaurantReceipt,
} from "./closed-receipt-dialog";
import type { ClosedRestaurantReceipt } from "@/lib/restaurant-receipt";
import {
  PaymentMethodDialog,
  type RestaurantPaymentDetails,
} from "./payment-method-dialog";

type Table = {
  id: string;
  name: string;
  code: string;
  waiterId?: string | null;
  waiter?: { id: string; name: string; email: string } | null;
  serviceChargeEnabled: boolean;
  kind: "DINING" | "BAR_SEAT" | "TAKEOUT_STATION";
};
type RestaurantRole =
  "RESTAURANT_ADMIN" | "KITCHEN" | "BAR" | "WAITER" | "CASHIER";
type InventoryAlert = {
  productId: string;
  name: string;
  quantity: number;
  minimumQuantity: number;
  presentation: string;
};
type RestaurantPayPeriod = "HOURLY" | "DAILY" | "MONTHLY";
type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantRole: RestaurantRole | null;
  restaurantAvailability:
    "AVAILABLE" | "BREAK" | "TEMPORARILY_UNAVAILABLE" | "OFF_SHIFT";
  restaurantCashAuthorized: boolean;
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
  imageData?: string | null;
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
  correctionCount: number;
  correctionSource?: "CUSTOMER" | "EMPLOYEE" | null;
};
type ActiveVisit = {
  id: string;
  occupiesTable: boolean;
  table: {
    name: string;
    kind: "DINING" | "BAR_SEAT" | "TAKEOUT_STATION";
  };
  responsibleStaff?: { name: string; restaurantRole: string } | null;
  deliveryPhone?: string | null;
  deliveryAddress?: string | null;
  paymentStatus: "NOT_REQUIRED" | "PENDING" | "CONFIRMED" | "REJECTED";
  canHandoffDelivery: boolean;
  canClose: boolean;
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
  corrections: Array<{
    orderId: string;
    orderCreatedAt: string;
    correctionCount: number;
    correctedAt?: string | null;
    source: "CUSTOMER" | "EMPLOYEE";
    correctedBy?: { id: string; name: string } | null;
    reason?: string | null;
    originalItems: Array<{
      id: string;
      name: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    finalItems: Array<{
      id: string;
      name: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
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
type OrphanRecordKind =
  | "DETACHED_ORDER"
  | "EMPTY_OPEN_ACCOUNT"
  | "COMPLETED_OPEN_ACCOUNT"
  | "UNASSIGNED_ACTIVE_ACCOUNT";
type OrphanRecord = {
  id: string;
  kind: OrphanRecordKind;
  title: string;
  explanation: string;
  detectedAt: string;
  lastActivityAt: string;
  table: { id: string; name: string; kind: Table["kind"] };
  responsibleStaff?: {
    id: string;
    name: string;
    active: boolean;
    restaurantRole: RestaurantRole | null;
    restaurantAvailability: StaffUser["restaurantAvailability"];
  } | null;
  orders: number;
  items: number;
  openItems: number;
  cancelledItems: number;
  grossSubtotal: number;
  total: number;
  allowedActions: Array<"DELETE" | "CLOSE" | "REASSIGN">;
};
type OrphanReport = {
  generatedAt: string;
  summary: {
    total: number;
    detachedOrders: number;
    emptyAccounts: number;
    completedAccounts: number;
    unassignedAccounts: number;
  };
  records: OrphanRecord[];
};
export type RestaurantAdminSection =
  | "overview"
  | "analytics"
  | "sales-history"
  | "branding"
  | "tables"
  | "menu"
  | "inventory"
  | "promotions"
  | "invoices"
  | "loyalty"
  | "staff"
  | "data-quality";

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
    section: "inventory",
    label: "Control de inventario",
    href: "/restaurant/admin/inventory",
  },
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
  {
    section: "data-quality",
    label: "Datos huérfanos",
    href: "/restaurant/admin/data-quality",
  },
];

const sectionDataPaths: Record<RestaurantAdminSection, string[]> = {
  overview: [
    "orders",
    "visits",
    "billing-settings",
    "ordering-area-settings",
    "inventory",
  ],
  analytics: [],
  "sales-history": [],
  branding: ["branding-settings"],
  tables: ["tables", "staff-users"],
  menu: ["menu"],
  inventory: [],
  promotions: ["promotions", "menu"],
  invoices: ["invoice-requests"],
  loyalty: ["loyalty/summary", "loyalty/rewards", "menu"],
  staff: ["staff-users"],
  "data-quality": ["maintenance/orphans"],
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
  if (role === "CASHIER") return "Cajero";
  return "Sin puesto";
}

export default function RestaurantAdminDashboard({
  section = "overview",
}: {
  section?: RestaurantAdminSection;
}) {
  const router = useRouter();
  const [closingVisitId, setClosingVisitId] = useState<string | null>(null);
  const [closedReceipt, setClosedReceipt] = useState<ClosedRestaurantReceipt | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [visits, setVisits] = useState<ActiveVisit[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([]);
  const [station, setStation] = useState<Station>("KITCHEN");
  const [tableName, setTableName] = useState("");
  const [tableKind, setTableKind] = useState<
    "DINING" | "BAR_SEAT" | "TAKEOUT_STATION"
  >("DINING");
  const [tableSearch, setTableSearch] = useState("");
  const [tableKindFilter, setTableKindFilter] = useState<
    "ALL" | Table["kind"]
  >("ALL");
  const [tableAction, setTableAction] = useState<string | null>(null);
  const [tableNotice, setTableNotice] = useState<{
    tone: "success" | "info";
    message: string;
  } | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [itemStation, setItemStation] = useState<Station>("KITCHEN");
  const [course, setCourse] = useState("MAIN");
  const [productType, setProductType] = useState("Platos fuertes");
  const [creatingProductType, setCreatingProductType] = useState(false);
  const [categories, setCategories] = useState("");
  const [origin, setOrigin] = useState<"HOUSE_MADE" | "THIRD_PARTY">(
    "HOUSE_MADE",
  );
  const [prepMinutes, setPrepMinutes] = useState("10");
  const [alcoholic, setAlcoholic] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuStatusFilter, setMenuStatusFilter] = useState<
    "ALL" | "ACTIVE" | "SUSPENDED"
  >("ALL");
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [invoiceRequests, setInvoiceRequests] = useState<InvoiceRequest[]>([]);
  const [promotionTitle, setPromotionTitle] = useState("");
  const [promotionType, setPromotionType] = useState("");
  const [promotionItemId, setPromotionItemId] = useState("");
  const [promotionCredit, setPromotionCredit] = useState("0");
  const [promotionStart, setPromotionStart] = useState("");
  const [promotionEnd, setPromotionEnd] = useState("");
  const [promotionImageData, setPromotionImageData] = useState<string | null>(
    null,
  );
  const [promotionAction, setPromotionAction] = useState<string | null>(null);
  const [promotionNotice, setPromotionNotice] = useState("");
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
  const [orphanReport, setOrphanReport] = useState<OrphanReport | null>(null);
  const [orphanSearch, setOrphanSearch] = useState("");
  const [orphanAction, setOrphanAction] = useState<string | null>(null);
  const [orphanNotice, setOrphanNotice] = useState("");
  const [orphanPaymentMethods, setOrphanPaymentMethods] = useState<
    Record<string, "CASH" | "SINPE" | "CARD" | "OTHER">
  >({});
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
      const inventoryData = data.inventory as
        { alerts: InventoryAlert[] } | undefined;
      const orphanData = data["maintenance/orphans"] as
        | OrphanReport
        | undefined;

      if (tableData) setTables(tableData);
      if (menuData) setMenu(menuData);
      if (orderData) setOrders(orderData);
      if (visitData) setVisits(visitData);
      if (staffData) setStaffUsers(staffData);
      if (inventoryData) setInventoryAlerts(inventoryData.alerts);
      if (orphanData) setOrphanReport(orphanData);
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
    if (!getSessionValue("assettrack_token")) {
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
    if (!getSessionValue("assettrack_token")) return;
    void loadAnalytics();
  }, [loadAnalytics, section]);

  useEffect(() => {
    if (section !== "sales-history") return;
    if (!getSessionValue("assettrack_token")) return;
    void loadSalesHistory();
  }, [loadSalesHistory, section]);

  useEffect(() => {
    if (section !== "staff") return;
    if (!getSessionValue("assettrack_token")) return;
    void loadStaffHours();
  }, [loadStaffHours, section]);

  useEffect(() => {
    if (
      section !== "menu" ||
      editingItemId ||
      creatingProductType ||
      menu.length === 0
    ) {
      return;
    }
    const matchesExistingType = menu.some(
      (item) =>
        item.productType.trim().toLocaleLowerCase() ===
        productType.trim().toLocaleLowerCase(),
    );
    if (!matchesExistingType) setProductType(menu[0].productType);
  }, [creatingProductType, editingItemId, menu, productType, section]);

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

  async function showClosedReceipt(visitId: string) {
    try {
      setClosedReceipt(await fetchClosedRestaurantReceipt(visitId));
    } catch {
      setError("La cuenta quedó cerrada, pero no se pudo recuperar el recibo para imprimir.");
    }
  }

  async function handoffDeliveryForReceipt(visitId: string) {
    if (await post(`visits/${visitId}/delivery-handoff`, {}, "PATCH")) {
      await showClosedReceipt(visitId);
    }
  }

  async function closeVisit(
    visitId: string,
    payment: RestaurantPaymentDetails,
  ) {
    if (await post(`visits/${visitId}/close`, payment, "PATCH")) {
      setClosingVisitId(null);
      await showClosedReceipt(visitId);
    }
  }

  async function resolveOrphan(
    record: OrphanRecord,
    action: "DELETE" | "CLOSE" | "REASSIGN",
  ) {
    if (action === "DELETE") {
      const confirmation = window.prompt(
        "Esta acción elimina únicamente el registro indicado. Escriba ELIMINAR para continuar.",
      );
      if (confirmation !== "ELIMINAR") return;
    } else if (
      !window.confirm(
        action === "CLOSE"
          ? "¿Confirma el cierre de esta cuenta? La venta se conservará en el historial."
          : "¿Desea intentar la reasignación automática de esta cuenta?",
      )
    ) {
      return;
    }
    const reason = window.prompt(
      "Indique brevemente el motivo de esta resolución administrativa:",
    );
    if (!reason || reason.trim().length < 3) {
      setError("Debe indicar un motivo de al menos 3 caracteres");
      return;
    }
    setError("");
    setOrphanNotice("");
    setOrphanAction(`${record.kind}:${record.id}`);
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/maintenance/orphans/${encodeURIComponent(record.kind)}/${encodeURIComponent(record.id)}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            reason: reason.trim(),
            ...(action === "CLOSE"
              ? {
                  paymentMethod:
                    orphanPaymentMethods[record.id] ?? "CASH",
                }
              : {}),
          }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          Array.isArray(body.message)
            ? body.message.join(", ")
            : body.message || "No fue posible resolver el registro",
        );
      }
      setOrphanNotice(
        action === "DELETE"
          ? "El registro huérfano fue eliminado y la acción quedó auditada."
          : action === "CLOSE"
            ? "La cuenta fue cerrada sin eliminar la venta."
            : "La cuenta fue reasignada a personal disponible.",
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No fue posible resolver el registro",
      );
    } finally {
      setOrphanAction(null);
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
    const firstExistingType = menu.find((item) => item.productType.trim())
      ?.productType;
    setEditingItemId(null);
    setItemName("");
    setItemDescription("");
    setPrice("");
    setItemStation("KITCHEN");
    setCourse("MAIN");
    setProductType(firstExistingType ?? "");
    setCreatingProductType(!firstExistingType);
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
    setCreatingProductType(false);
    setCategories(item.categories.join(", "));
    setOrigin(item.origin);
    setPrepMinutes(String(item.prepMinutes ?? 10));
    setAlcoholic(item.alcoholic);
    setImageData(item.imageData ?? null);
  }

  function toggleSuggestedCategory(category: string) {
    const values = categories
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const contains = values.some(
      (value) => value.toLocaleLowerCase() === category.toLocaleLowerCase(),
    );
    setCategories(
      (contains
        ? values.filter(
            (value) =>
              value.toLocaleLowerCase() !== category.toLocaleLowerCase(),
          )
        : [...values, category]
      ).join(", "),
    );
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
    setTableAction(`qr:${id}`);
    setTableNotice(null);
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/tables/${id}/qr`,
      );
      if (!response.ok) throw new Error("Código QR no disponible");
      setQr(await response.json());
      setQrNotice("");
      setTableNotice({
        tone: "info",
        message: "Código QR cargado y listo para descargar o imprimir.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código QR no disponible");
    } finally {
      setTableAction(null);
    }
  }

  async function createTablePosition() {
    const created = await runTableAction(
      "create",
      "tables",
      { name: tableName, kind: tableKind },
      "POST",
      `${tableName} fue creada correctamente.`,
    );
    if (created) setTableName("");
  }

  async function runTableAction(
    action: string,
    path: string,
    payload: object,
    method: string,
    successMessage: string,
  ) {
    setTableAction(action);
    setTableNotice(null);
    const succeeded = await post(path, payload, method);
    if (succeeded) {
      setTableNotice({ tone: "success", message: successMessage });
    }
    setTableAction(null);
    return succeeded;
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
    setQrNotice("Ventana de impresión abierta.");
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

  async function readPromotionImage(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("La imagen debe ser JPEG, PNG o WebP");
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new Error("La imagen supera el límite de 2 MB");
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
      throw new Error("La resolución máxima es 1600 × 1600 píxeles");
    }
    return dataUrl;
  }

  async function selectPromotionImage(file?: File) {
    if (!file) return;
    try {
      setPromotionImageData(await readPromotionImage(file));
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo leer la imagen",
      );
    }
  }

  async function replacePromotionImage(promotion: Promotion, file?: File) {
    if (!file) return;
    const action = `image:${promotion.id}`;
    setPromotionAction(action);
    setPromotionNotice("");
    try {
      const nextImage = await readPromotionImage(file);
      if (
        await post(
          `promotions/${promotion.id}`,
          { imageData: nextImage },
          "PATCH",
        )
      ) {
        setPromotionNotice(`Imagen de ${promotion.title} actualizada.`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo leer la imagen",
      );
    } finally {
      setPromotionAction(null);
    }
  }

  async function deletePromotion(promotion: Promotion) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente “${promotion.title}”? Esta acción elimina también su imagen y no se puede deshacer.`,
      )
    ) {
      return;
    }
    const action = `delete:${promotion.id}`;
    setPromotionAction(action);
    setPromotionNotice("");
    if (await post(`promotions/${promotion.id}`, {}, "DELETE")) {
      setPromotionNotice(`${promotion.title} fue eliminada definitivamente.`);
    }
    setPromotionAction(null);
  }

  async function togglePromotion(promotion: Promotion) {
    const action = `toggle:${promotion.id}`;
    setPromotionAction(action);
    setPromotionNotice("");
    if (
      await post(
        `promotions/${promotion.id}`,
        { active: !promotion.active },
        "PATCH",
      )
    ) {
      setPromotionNotice(
        `${promotion.title} fue ${promotion.active ? "desactivada" : "activada"}.`,
      );
    }
    setPromotionAction(null);
  }

  async function removePromotionImage(promotion: Promotion) {
    const action = `image:${promotion.id}`;
    setPromotionAction(action);
    setPromotionNotice("");
    if (
      await post(
        `promotions/${promotion.id}`,
        { imageData: null },
        "PATCH",
      )
    ) {
      setPromotionNotice(`Imagen de ${promotion.title} eliminada.`);
    }
    setPromotionAction(null);
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
  const onsiteVisits = visits.filter((visit) => visit.occupiesTable);
  const pendingExternalVisits = externalVisits.filter(
    (visit) => visit.paymentStatus === "PENDING",
  );
  const normalizedOrphanSearch = orphanSearch.trim().toLocaleLowerCase();
  const filteredOrphanRecords = (orphanReport?.records ?? []).filter(
    (record) =>
      !normalizedOrphanSearch ||
      record.id.toLocaleLowerCase().includes(normalizedOrphanSearch) ||
      record.table.name.toLocaleLowerCase().includes(normalizedOrphanSearch) ||
      record.title.toLocaleLowerCase().includes(normalizedOrphanSearch) ||
      record.responsibleStaff?.name
        .toLocaleLowerCase()
        .includes(normalizedOrphanSearch),
  );
  const isAdmin = true;
  const waiters = staffUsers.filter((user) => user.restaurantRole === "WAITER");
  const availableWaiters = waiters.filter(
    (user) => user.restaurantAvailability === "AVAILABLE",
  );
  const normalizedTableSearch = tableSearch.trim().toLocaleLowerCase();
  const filteredTables = tables.filter(
    (table) =>
      (tableKindFilter === "ALL" || table.kind === tableKindFilter) &&
      (!normalizedTableSearch ||
        table.name.toLocaleLowerCase().includes(normalizedTableSearch) ||
        table.waiter?.name
          .toLocaleLowerCase()
          .includes(normalizedTableSearch)),
  );
  const diningTableCount = tables.filter(
    (table) => table.kind === "DINING",
  ).length;
  const barSeatCount = tables.filter(
    (table) => table.kind === "BAR_SEAT",
  ).length;
  const takeoutStationCount = tables.filter(
    (table) => table.kind === "TAKEOUT_STATION",
  ).length;
  const promotionNow = Date.now();
  const currentPromotionCount = promotions.filter(
    (promotion) =>
      promotion.active &&
      new Date(promotion.startsAt).getTime() <= promotionNow &&
      new Date(promotion.endsAt).getTime() > promotionNow,
  ).length;
  const scheduledPromotionCount = promotions.filter(
    (promotion) =>
      promotion.active && new Date(promotion.startsAt).getTime() > promotionNow,
  ).length;
  const expiredPromotionCount = promotions.filter(
    (promotion) => new Date(promotion.endsAt).getTime() <= promotionNow,
  ).length;
  const normalizedMenuSearch = menuSearch.trim().toLocaleLowerCase();
  const filteredMenu = menu.filter((item) => {
    const matchesSearch =
      !normalizedMenuSearch ||
      [item.name, item.description ?? "", item.productType, ...item.categories]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedMenuSearch);
    const matchesStatus =
      menuStatusFilter === "ALL" ||
      (menuStatusFilter === "ACTIVE" && item.active) ||
      (menuStatusFilter === "SUSPENDED" && !item.active);
    return matchesSearch && matchesStatus;
  });
  const selectedCategories = categories
    .split(",")
    .map((value) => value.trim().toLocaleLowerCase())
    .filter(Boolean);
  const suggestedCategories = [
    "Favoritos",
    "Promoción",
    "Vegetariano",
    "Sin gluten",
    "Menú rápido",
  ];
  const existingProductTypes = Array.from(
    new Map(
      menu
        .map((item) => item.productType.trim())
        .filter(Boolean)
        .map((type) => [type.toLocaleLowerCase(), type]),
    ).values(),
  ).sort((left, right) => left.localeCompare(right, "es"));
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
      {section === "data-quality" && (
        <section className="space-y-6">
          <div className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-xl">
            <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-300">
                  Integridad operativa
                </p>
                <h2 className="mt-2 text-3xl font-black">
                  Localizar y resolver datos huérfanos
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                  Este diagnóstico separa órdenes sin cuenta, cuentas vacías,
                  cuentas entregadas sin cierre y cuentas activas sin
                  responsable. Cada acción se vuelve a validar en el servidor y
                  deja una auditoría administrativa.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-emerald-400 px-5 py-3 font-black text-slate-950 transition hover:bg-emerald-300"
                onClick={() => void load()}
              >
                Ejecutar diagnóstico
              </button>
            </div>
          </div>

          {orphanReport && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ["Hallazgos", orphanReport.summary.total, "bg-slate-950 text-white"],
                  [
                    "Órdenes sin cuenta",
                    orphanReport.summary.detachedOrders,
                    "bg-red-100 text-red-950",
                  ],
                  [
                    "Cuentas vacías",
                    orphanReport.summary.emptyAccounts,
                    "bg-amber-100 text-amber-950",
                  ],
                  [
                    "Sin cierre",
                    orphanReport.summary.completedAccounts,
                    "bg-sky-100 text-sky-950",
                  ],
                  [
                    "Sin responsable",
                    orphanReport.summary.unassignedAccounts,
                    "bg-violet-100 text-violet-950",
                  ],
                ].map(([label, value, colors]) => (
                  <article
                    key={String(label)}
                    className={`rounded-xl p-4 shadow-sm ${colors}`}
                  >
                    <p className="text-xs font-bold uppercase tracking-wide opacity-75">
                      {label}
                    </p>
                    <p className="mt-2 text-3xl font-black">{value}</p>
                  </article>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
                <label className="min-w-64 flex-1">
                  <span className="mb-1 block text-sm font-bold">
                    Buscar por mesa, responsable, tipo o identificador
                  </span>
                  <input
                    value={orphanSearch}
                    onChange={(event) => setOrphanSearch(event.target.value)}
                    placeholder="Ejemplo: Mesa 7"
                    className="w-full rounded-lg border px-4 py-3"
                  />
                </label>
                <p className="self-end pb-3 text-xs text-slate-500">
                  Diagnóstico: {new Date(orphanReport.generatedAt).toLocaleString()}
                </p>
              </div>

              {orphanNotice && (
                <p
                  role="status"
                  className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 font-bold text-emerald-900"
                >
                  {orphanNotice}
                </p>
              )}

              {filteredOrphanRecords.length === 0 ? (
                <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-8 text-center">
                  <p className="text-2xl font-black text-emerald-950">
                    No hay registros huérfanos que coincidan
                  </p>
                  <p className="mt-2 text-sm text-emerald-800">
                    Las cuentas válidas y las ventas cerradas no aparecen en esta
                    herramienta.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {filteredOrphanRecords.map((record) => {
                    const busy =
                      orphanAction === `${record.kind}:${record.id}`;
                    const tone =
                      record.kind === "DETACHED_ORDER"
                        ? "border-red-300 bg-red-50"
                        : record.kind === "EMPTY_OPEN_ACCOUNT"
                          ? "border-amber-300 bg-amber-50"
                          : record.kind === "COMPLETED_OPEN_ACCOUNT"
                            ? "border-sky-300 bg-sky-50"
                            : "border-violet-300 bg-violet-50";
                    return (
                      <article
                        key={`${record.kind}:${record.id}`}
                        className={`rounded-2xl border-2 p-5 shadow-sm ${tone}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-wider opacity-70">
                              {record.kind.replaceAll("_", " ")}
                            </p>
                            <h3 className="mt-1 text-xl font-black">
                              {record.title}
                            </h3>
                            <p className="mt-1 font-bold">
                              {record.table.name}
                            </p>
                          </div>
                          <p className="rounded-full bg-white px-3 py-1 text-sm font-black shadow-sm">
                            ₡{record.total.toLocaleString()}
                          </p>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-slate-700">
                          {record.explanation}
                        </p>
                        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-white/80 p-4 text-sm">
                          <div>
                            <dt className="font-bold text-slate-500">Órdenes</dt>
                            <dd className="text-lg font-black">{record.orders}</dd>
                          </div>
                          <div>
                            <dt className="font-bold text-slate-500">Productos</dt>
                            <dd className="text-lg font-black">{record.items}</dd>
                          </div>
                          <div>
                            <dt className="font-bold text-slate-500">Pendientes</dt>
                            <dd className="text-lg font-black">{record.openItems}</dd>
                          </div>
                          <div>
                            <dt className="font-bold text-slate-500">Cancelados</dt>
                            <dd className="text-lg font-black">
                              {record.cancelledItems}
                            </dd>
                          </div>
                        </dl>
                        <p className="mt-3 text-xs text-slate-600">
                          Responsable: {record.responsibleStaff?.name ?? "Sin asignar"}
                          {" · "}Última actividad:{" "}
                          {new Date(record.lastActivityAt).toLocaleString()}
                        </p>
                        <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                          ID: {record.id}
                        </p>

                        {record.allowedActions.includes("CLOSE") && (
                          <label className="mt-4 block text-sm font-bold">
                            Método de pago para el cierre
                            <select
                              className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
                              value={orphanPaymentMethods[record.id] ?? "CASH"}
                              onChange={(event) =>
                                setOrphanPaymentMethods((current) => ({
                                  ...current,
                                  [record.id]: event.target.value as
                                    | "CASH"
                                    | "SINPE"
                                    | "CARD"
                                    | "OTHER",
                                }))
                              }
                            >
                              <option value="CASH">Efectivo</option>
                              <option value="SINPE">SINPE</option>
                              <option value="CARD">Tarjeta</option>
                              <option value="OTHER">Otro</option>
                            </select>
                          </label>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2">
                          {record.allowedActions.includes("DELETE") && (
                            <button
                              type="button"
                              disabled={busy}
                              className="rounded-lg bg-red-700 px-4 py-3 font-black text-white disabled:opacity-50"
                              onClick={() =>
                                void resolveOrphan(record, "DELETE")
                              }
                            >
                              {busy ? "Procesando…" : "Eliminar registro huérfano"}
                            </button>
                          )}
                          {record.allowedActions.includes("CLOSE") && (
                            <button
                              type="button"
                              disabled={busy}
                              className="rounded-lg bg-sky-800 px-4 py-3 font-black text-white disabled:opacity-50"
                              onClick={() => void resolveOrphan(record, "CLOSE")}
                            >
                              {busy ? "Procesando…" : "Cerrar y conservar venta"}
                            </button>
                          )}
                          {record.allowedActions.includes("REASSIGN") && (
                            <button
                              type="button"
                              disabled={busy}
                              className="rounded-lg bg-violet-800 px-4 py-3 font-black text-white disabled:opacity-50"
                              onClick={() =>
                                void resolveOrphan(record, "REASSIGN")
                              }
                            >
                              {busy ? "Procesando…" : "Reasignar responsable"}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      )}
      {section === "overview" && inventoryAlerts.length > 0 && (
        <section className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border-4 border-red-500 bg-amber-50 p-5 shadow-lg">
          <div>
            <h2 className="text-2xl font-black text-red-800">
              Inventario en nivel mínimo
            </h2>
            <p className="mt-1 text-slate-700">
              {inventoryAlerts.length} producto
              {inventoryAlerts.length === 1 ? " requiere" : "s requieren"}{" "}
              reposición o revisión administrativa.
            </p>
          </div>
          <Link
            href="/restaurant/admin/inventory"
            className="rounded-lg bg-red-700 px-5 py-3 font-black text-white"
          >
            Revisar inventario
          </Link>
        </section>
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
                      onClick={() =>
                        void post(
                          `visits/${visit.id}/payment`,
                          { status: "CONFIRMED" },
                          "PATCH",
                        )
                      }
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
                      onClick={() =>
                        visit.canHandoffDelivery &&
                        void handoffDeliveryForReceipt(visit.id)
                      }
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
      {section === "overview" && onsiteVisits.length > 0 && (
        <section className="mb-8 rounded-xl border-2 border-sky-300 bg-sky-50 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-sky-950">
                Cuentas presenciales abiertas
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                Respaldo administrativo para cuentas entregadas que todavía no
                han sido cerradas por su responsable.
              </p>
            </div>
            <span className="rounded-full bg-sky-800 px-4 py-2 font-black text-white">
              {onsiteVisits.length} abiertas
            </span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {onsiteVisits.map((visit) => (
              <article
                key={visit.id}
                className="rounded-xl bg-white p-4 shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black">{visit.table.name}</p>
                    <p className="text-sm text-slate-600">
                      Responsable:{" "}
                      {visit.responsibleStaff?.name ?? "Sin asignar"}
                    </p>
                    {visit.table.kind === "DINING" &&
                      visit.responsibleStaff?.restaurantRole === "BAR" && (
                        <p className="mt-1 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900">
                          COBERTURA TEMPORAL DE SALÓN
                        </p>
                      )}
                  </div>
                  <p className="text-lg font-black">
                    ₡{visit.billing.total.toLocaleString()}
                  </p>
                </div>
                <p className="mt-3 text-sm font-semibold">
                  {visit.canClose
                    ? "Todos los productos fueron entregados."
                    : "Todavía existen entregas pendientes."}
                </p>
                <button
                  type="button"
                  disabled={!visit.canClose}
                  className="mt-3 rounded-lg bg-slate-900 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => visit.canClose && setClosingVisitId(visit.id)}
                >
                  {visit.canClose ? "Cerrar cuenta" : "Entregas pendientes"}
                </button>
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
                {order.correctionCount > 0 && (
                  <span className="ml-2 inline-flex rounded-full bg-fuchsia-100 px-2 py-1 text-xs font-black text-fuchsia-900 ring-1 ring-fuchsia-300">
                    {order.correctionSource === "EMPLOYEE"
                      ? "CORREGIDA POR EL PERSONAL"
                      : "CORREGIDA POR EL CLIENTE"}{" "}
                    · {order.correctionCount}
                  </span>
                )}
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
                ; servicio {billing.restaurantServiceRateBps / 100}%.{" "}
                Corrección:{" "}
                {billing.restaurantOrderCorrectionMinutes
                  ? `${billing.restaurantOrderCorrectionMinutes} min o hasta la aceptación`
                  : "desactivada"}
                .
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
                    {sale.corrections.length > 0 && (
                      <span className="ml-2 inline-flex rounded-full bg-fuchsia-100 px-2 py-1 text-xs font-black text-fuchsia-900 ring-1 ring-fuchsia-300">
                        PEDIDO CORREGIDO
                      </span>
                    )}
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
                  {sale.corrections.length > 0 && (
                    <div className="mt-4 rounded-xl border-2 border-fuchsia-300 bg-fuchsia-50 p-4">
                      <h4 className="font-black text-fuchsia-950">
                        Auditoría de correcciones
                      </h4>
                      <p className="text-sm text-fuchsia-900">
                        El consumo y el total anteriores muestran únicamente los
                        productos efectivos. Los reemplazados se conservan aquí
                        como evidencia durante la retención operativa.
                      </p>
                      <div className="mt-3 space-y-3">
                        {sale.corrections.map((correction) => (
                          <details
                            key={correction.orderId}
                            className="rounded-lg border border-fuchsia-200 bg-white p-3"
                          >
                            <summary className="cursor-pointer font-bold">
                              Orden de las{" "}
                              {new Date(
                                correction.orderCreatedAt,
                              ).toLocaleTimeString("es-CR")}{" "}
                              · {correction.correctionCount} cambio(s)
                            </summary>
                            <p className="mt-2 text-sm">
                              Último cambio:{" "}
                              {correction.correctedAt
                                ? new Date(
                                    correction.correctedAt,
                                  ).toLocaleString("es-CR")
                                : "fecha no disponible"}
                              {" · "}
                              {correction.source === "CUSTOMER"
                                ? "Cliente"
                                : (correction.correctedBy?.name ?? "Empleado")}
                            </p>
                            {correction.reason && (
                              <p className="text-sm">
                                Nota: {correction.reason}
                              </p>
                            )}
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <div className="rounded bg-red-50 p-3">
                                <p className="font-bold text-red-900">
                                  Productos reemplazados
                                </p>
                                {correction.originalItems.map((item) => (
                                  <p key={item.id} className="text-sm">
                                    {item.quantity} × {item.name} · ₡
                                    {item.total.toLocaleString()}
                                  </p>
                                ))}
                              </div>
                              <div className="rounded bg-emerald-50 p-3">
                                <p className="font-bold text-emerald-900">
                                  Pedido final
                                </p>
                                {correction.finalItems.map((item) => (
                                  <p key={item.id} className="text-sm">
                                    {item.quantity} × {item.name} · ₡
                                    {item.total.toLocaleString()}
                                  </p>
                                ))}
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  )}
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
                  <button
                    type="button"
                    onClick={() => void showClosedReceipt(sale.id)}
                    className="mt-3 rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white"
                  >
                    Reimprimir recibo
                  </button>
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
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
                <div className="border-b border-slate-200 bg-white px-5 py-6 sm:px-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                        Organización del salón
                      </p>
                      <h2 className="mt-1 text-2xl font-black text-slate-950">
                        Mesas, posiciones y códigos QR
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm text-slate-600">
                        Cree cada punto de atención, asigne responsables y
                        prepare sus códigos de acceso para impresión.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      {tables.length} posiciones configuradas
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      ["Total", tables.length, "bg-slate-950 text-white"],
                      ["Mesas", diningTableCount, "bg-emerald-50 text-emerald-950"],
                      ["Barra", barSeatCount, "bg-violet-50 text-violet-950"],
                      [
                        "Para llevar",
                        takeoutStationCount,
                        "bg-amber-50 text-amber-950",
                      ],
                    ].map(([label, value, color]) => (
                      <div
                        key={String(label)}
                        className={`rounded-2xl p-4 ${String(color)}`}
                      >
                        <p className="text-xs font-bold uppercase tracking-wider opacity-70">
                          {label}
                        </p>
                        <p className="mt-1 text-3xl font-black">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(280px,360px)_1fr]">
                  <form
                    className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createTablePosition();
                    }}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-xl">
                      ＋
                    </div>
                    <h3 className="mt-4 text-lg font-black text-slate-950">
                      Crear una nueva posición
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Seleccione el tipo y asígnele un nombre fácil de
                      reconocer.
                    </p>

                    <label className="mt-5 block text-sm font-bold text-slate-800">
                      Nombre visible
                      <input
                        required
                        maxLength={60}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                        placeholder="Ejemplo: Mesa 08"
                        value={tableName}
                        onChange={(event) => setTableName(event.target.value)}
                      />
                    </label>

                    <fieldset className="mt-5">
                      <legend className="text-sm font-bold text-slate-800">
                        Tipo de posición
                      </legend>
                      <div className="mt-2 grid gap-2">
                        {[
                          ["DINING", "🍽️", "Mesa de salón", "Con mesero y servicio configurable"],
                          ["BAR_SEAT", "🍸", "Posición de barra", "Atendida por bartender, sin servicio"],
                          ["TAKEOUT_STATION", "🛍️", "Estación para llevar", "Retiro de pedidos sin ocupar mesa"],
                        ].map(([value, icon, label, description]) => {
                          const selected = tableKind === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={selected}
                              onClick={() =>
                                setTableKind(value as Table["kind"])
                              }
                              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                                selected
                                  ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100"
                                  : "border-slate-200 hover:border-slate-400 hover:bg-slate-50"
                              }`}
                            >
                              <span className="text-xl" aria-hidden="true">
                                {icon}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-black text-slate-900">
                                  {label}
                                </span>
                                <span className="block text-xs text-slate-500">
                                  {description}
                                </span>
                              </span>
                              <span
                                className={`h-4 w-4 rounded-full border-4 ${
                                  selected
                                    ? "border-emerald-600 bg-white"
                                    : "border-slate-300 bg-white"
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>

                    <button
                      disabled={tableAction === "create"}
                      className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
                    >
                      {tableAction === "create"
                        ? "Creando posición…"
                        : "Crear posición y generar QR"}
                    </button>
                  </form>

                  <div className="min-w-0">
                    {tableNotice && (
                      <div
                        aria-live="polite"
                        className={`mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                          tableNotice.tone === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-blue-200 bg-blue-50 text-blue-900"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-white ${
                            tableNotice.tone === "success"
                              ? "bg-emerald-600"
                              : "bg-blue-600"
                          }`}
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                        <span>{tableNotice.message}</span>
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 lg:flex-row">
                        <label className="relative min-w-0 flex-1">
                          <span className="sr-only">Buscar posición</span>
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                            ⌕
                          </span>
                          <input
                            type="search"
                            value={tableSearch}
                            onChange={(event) =>
                              setTableSearch(event.target.value)
                            }
                            placeholder="Buscar por nombre o mesero…"
                            className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                          />
                        </label>
                        <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                          {[
                            ["ALL", "Todas"],
                            ["DINING", "Mesas"],
                            ["BAR_SEAT", "Barra"],
                            ["TAKEOUT_STATION", "Para llevar"],
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() =>
                                setTableKindFilter(
                                  value as "ALL" | Table["kind"],
                                )
                              }
                              className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold transition ${
                                tableKindFilter === value
                                  ? "bg-slate-950 text-white"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      {filteredTables.map((table) => {
                        const isDining = table.kind === "DINING";
                        const isBar = table.kind === "BAR_SEAT";
                        const typeLabel = isDining
                          ? "Mesa de salón"
                          : isBar
                            ? "Posición de barra"
                            : "Estación para llevar";
                        const typeIcon = isDining ? "🍽️" : isBar ? "🍸" : "🛍️";
                        const accentClass = isDining
                          ? "border-t-emerald-500"
                          : isBar
                            ? "border-t-violet-500"
                            : "border-t-amber-500";
                        const badgeClass = isDining
                          ? "bg-emerald-50 text-emerald-800"
                          : isBar
                            ? "bg-violet-50 text-violet-800"
                            : "bg-amber-50 text-amber-800";
                        const waiterAction = `waiter:${table.id}`;
                        const billingAction = `billing:${table.id}`;
                        const qrAction = `qr:${table.id}`;
                        return (
                          <article
                            key={table.id}
                            className={`overflow-hidden rounded-2xl border border-t-4 border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${accentClass}`}
                          >
                            <div className="p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${badgeClass}`}
                                  >
                                    <span aria-hidden="true">{typeIcon}</span>
                                    {typeLabel}
                                  </span>
                                  <h3 className="mt-3 truncate text-xl font-black text-slate-950">
                                    {table.name}
                                  </h3>
                                </div>
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                  Activa
                                </span>
                              </div>

                              <div className="mt-5 min-h-20 rounded-xl bg-slate-50 p-3">
                                {isDining ? (
                                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Mesero responsable
                                    <select
                                      aria-label={`Mesero asignado a ${table.name}`}
                                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600"
                                      value={table.waiterId ?? ""}
                                      disabled={tableAction === waiterAction}
                                      onChange={(event) => {
                                        const waiterId = event.target.value;
                                        const waiterName = waiters.find(
                                          (candidate) =>
                                            candidate.id === waiterId,
                                        )?.name;
                                        void runTableAction(
                                          waiterAction,
                                          `tables/${table.id}/waiter`,
                                          { waiterId: waiterId || null },
                                          "PATCH",
                                          waiterName
                                            ? `${waiterName} quedó a cargo de ${table.name}.`
                                            : `${table.name} quedó sin mesero asignado.`,
                                        );
                                      }}
                                    >
                                      <option value="">
                                        Sin mesero asignado
                                      </option>
                                      {availableWaiters.map((waiter) => (
                                        <option key={waiter.id} value={waiter.id}>
                                          {waiter.name}
                                        </option>
                                      ))}
                                    </select>
                                    {tableAction === waiterAction && (
                                      <span className="mt-2 block normal-case text-emerald-700">
                                        Guardando asignación…
                                      </span>
                                    )}
                                  </label>
                                ) : (
                                  <div className="flex items-center gap-3 text-sm">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm">
                                      {isBar ? "B" : "R"}
                                    </span>
                                    <div>
                                      <p className="font-black text-slate-900">
                                        {isBar
                                          ? "Atención del bartender"
                                          : "Punto de retiro"}
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        {isBar
                                          ? "No requiere asignación de mesero"
                                          : "Preparado para pedidos para llevar"}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                                <div>
                                  <p className="text-sm font-bold text-slate-900">
                                    Servicio de mesa
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {isBar
                                      ? "No aplica en barra"
                                      : table.serviceChargeEnabled
                                        ? "Se incluye en la cuenta"
                                        : "No se cobra en esta posición"}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={table.serviceChargeEnabled}
                                  aria-label={`Servicio de mesa para ${table.name}`}
                                  disabled={isBar || tableAction === billingAction}
                                  onClick={() =>
                                    void runTableAction(
                                      billingAction,
                                      `tables/${table.id}/billing`,
                                      {
                                        serviceChargeEnabled:
                                          !table.serviceChargeEnabled,
                                      },
                                      "PATCH",
                                      `Servicio de mesa ${
                                        table.serviceChargeEnabled
                                          ? "desactivado"
                                          : "activado"
                                      } para ${table.name}.`,
                                    )
                                  }
                                  className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                    table.serviceChargeEnabled
                                      ? "bg-emerald-600"
                                      : "bg-slate-300"
                                  }`}
                                >
                                  <span
                                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                                      table.serviceChargeEnabled
                                        ? "left-6"
                                        : "left-1"
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={tableAction === qrAction}
                              className="flex w-full items-center justify-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-black text-slate-800 transition hover:bg-slate-950 hover:text-white disabled:cursor-wait disabled:opacity-60"
                              onClick={() => void showQr(table.id)}
                            >
                              <span aria-hidden="true">▦</span>
                              {tableAction === qrAction
                                ? "Preparando QR…"
                                : "Ver, descargar o imprimir QR"}
                            </button>
                          </article>
                        );
                      })}
                    </div>

                    {filteredTables.length === 0 && (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                        <div className="text-4xl" aria-hidden="true">
                          ⌕
                        </div>
                        <h3 className="mt-3 font-black text-slate-900">
                          No se encontraron posiciones
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Cambie el filtro o escriba otro término de búsqueda.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setTableSearch("");
                            setTableKindFilter("ALL");
                          }}
                          className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold"
                        >
                          Limpiar filtros
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {qr && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="table-qr-title"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setQr(null);
                  }}
                >
                  <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-emerald-700">
                          Código de acceso permanente
                        </p>
                        <h3
                          id="table-qr-title"
                          className="mt-1 text-xl font-black text-slate-950"
                        >
                          {qr.tableName}
                        </h3>
                        <p className="text-sm text-slate-500">
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
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-bold text-slate-700 transition hover:bg-slate-200"
                        aria-label="Cerrar código QR"
                      >
                        ×
                      </button>
                    </div>

                    <div className="p-5 sm:p-6">
                      <div className="mx-auto w-fit rounded-3xl border border-slate-200 bg-white p-4 shadow-sm ring-8 ring-slate-50">
                        <Image
                          src={qr.image}
                          alt={`Código QR de ${qr.tableName}`}
                          width={280}
                          height={280}
                          unoptimized
                          className="h-auto w-full max-w-70"
                        />
                      </div>
                      <p className="mx-auto mt-5 max-w-sm text-center text-sm text-slate-600">
                        Este QR es permanente. Puede descargarlo o imprimirlo
                        sin cambiar el acceso de la posición.
                      </p>
                      <a
                        className="mt-3 block truncate rounded-xl bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700 underline"
                        href={qr.url}
                        target="_blank"
                        rel="noreferrer"
                        title={qr.url}
                      >
                        {qr.url}
                      </a>
                      {qrNotice && (
                        <p
                          aria-live="polite"
                          className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-bold text-emerald-800"
                        >
                          ✓ {qrNotice}
                        </p>
                      )}
                      <div className="mt-5 grid gap-2 sm:grid-cols-2">
                        <a
                          href={qr.image}
                          download={`qr-${qr.tableName.replaceAll(" ", "-")}.png`}
                          onClick={() => setQrNotice("Descarga iniciada.")}
                          className="rounded-xl bg-emerald-700 px-4 py-3 text-center font-black text-white transition hover:bg-emerald-800"
                        >
                          Descargar PNG
                        </a>
                        <button
                          type="button"
                          onClick={printTableQr}
                          className="rounded-xl bg-slate-950 px-4 py-3 font-black text-white transition hover:bg-slate-800"
                        >
                          Imprimir código
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyQrUrl()}
                          className="rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 transition hover:bg-slate-50"
                        >
                          Copiar enlace
                        </button>
                        <a
                          href={qr.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-slate-300 px-4 py-3 text-center font-bold text-slate-700 transition hover:bg-slate-50"
                        >
                          Probar acceso ↗
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className={section === "menu" ? "block" : "hidden"}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                    Catálogo del restaurante
                  </p>
                  <h2 className="mt-1 text-2xl font-black">
                    Productos del menú
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Agregue, edite, suspenda o retire productos sin perder el
                    historial de ventas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetMenuForm}
                  className="rounded-xl bg-emerald-700 px-5 py-3 font-black text-white shadow-sm"
                >
                  + Nuevo producto
                </button>
              </div>

              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)]">
                <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
                    <div>
                      <h3 className="text-lg font-black">Catálogo actual</h3>
                      <p className="text-sm text-slate-500">
                        Seleccione un producto para editarlo.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                      {menu.length} producto(s)
                    </span>
                  </div>
                  <div className="grid gap-3 border-b bg-slate-50 p-4 sm:grid-cols-[1fr_auto]">
                    <input
                      className="w-full rounded-xl border bg-white p-3"
                      placeholder="Buscar por nombre, tipo o categoría…"
                      value={menuSearch}
                      onChange={(event) => setMenuSearch(event.target.value)}
                    />
                    <select
                      className="rounded-xl border bg-white p-3 font-semibold"
                      value={menuStatusFilter}
                      onChange={(event) =>
                        setMenuStatusFilter(
                          event.target.value as "ALL" | "ACTIVE" | "SUSPENDED",
                        )
                      }
                    >
                      <option value="ALL">Todos</option>
                      <option value="ACTIVE">Disponibles</option>
                      <option value="SUSPENDED">Suspendidos</option>
                    </select>
                  </div>
                  <div className="max-h-[900px] space-y-3 overflow-y-auto p-4">
                    {filteredMenu.map((item) => (
                      <article
                        key={item.id}
                        className={`grid grid-cols-[88px_1fr] gap-3 rounded-2xl border p-3 transition ${
                          editingItemId === item.id
                            ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600"
                            : "bg-white hover:border-slate-400 hover:shadow-sm"
                        } ${item.active ? "" : "opacity-70"}`}
                      >
                        <div className="relative grid h-28 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-100 to-rose-100 text-3xl">
                          {item.imageData ? (
                            <Image
                              src={item.imageData}
                              alt={item.name}
                              fill
                              sizes="88px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <span aria-hidden="true">🍽️</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-black leading-tight">
                              {item.name}
                            </h4>
                            <strong className="whitespace-nowrap text-emerald-800">
                              ₡{item.price.toLocaleString()}
                            </strong>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                            {item.description || "Sin descripción"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
                            <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">
                              {item.productType}
                            </span>
                            <span
                              className={`rounded-full px-2 py-1 ${item.active ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
                            >
                              {item.active ? "Disponible" : "Suspendido"}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                              {item.station === "KITCHEN" ? "Cocina" : "Bar"}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs font-black">
                            <button
                              type="button"
                              className="text-sky-700"
                              onClick={() => editMenuItem(item)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className={
                                item.active
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                              }
                              onClick={() =>
                                void post(
                                  `menu/${item.id}`,
                                  { active: !item.active },
                                  "PATCH",
                                )
                              }
                            >
                              {item.active ? "Suspender" : "Restaurar"}
                            </button>
                            <button
                              type="button"
                              className="text-red-700"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `¿Eliminar definitivamente “${item.name}” del catálogo? Dejará de aparecer en el menú y no podrá restaurarse. Las órdenes y ventas anteriores se conservarán.`,
                                  )
                                ) {
                                  void remove(`menu/${item.id}`).then(
                                    (deleted) => {
                                      if (deleted && editingItemId === item.id)
                                        resetMenuForm();
                                    },
                                  );
                                }
                              }}
                            >
                              Eliminar definitivamente
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                    {filteredMenu.length === 0 && (
                      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
                        No se encontraron productos con esos filtros.
                      </p>
                    )}
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl border bg-white shadow-sm xl:sticky xl:top-4">
                  <div className="flex items-start justify-between gap-3 bg-slate-950 p-5 text-white">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-400">
                        Editor guiado
                      </p>
                      <h3 className="mt-1 text-xl font-black">
                        {editingItemId ? "Editar producto" : "Nuevo producto"}
                      </h3>
                      <p className="mt-1 text-sm text-slate-300">
                        Complete los datos y revise cómo lo verá el cliente.
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-900">
                      {editingItemId ? "EDITANDO" : "CREANDO"}
                    </span>
                  </div>

                  <form
                    className="space-y-5 p-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = Number(price);
                      if (!Number.isInteger(value) || value < 0) {
                        setError("Ingrese un precio válido en colones");
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
                          .map((category) => category.trim())
                          .filter(Boolean),
                        origin,
                        prepMinutes:
                          origin === "HOUSE_MADE"
                            ? Number(prepMinutes)
                            : undefined,
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
                    <fieldset className="rounded-2xl border">
                      <legend className="ml-3 px-2 text-sm font-black">
                        1 · Información principal
                      </legend>
                      <div className="grid gap-3 p-4 sm:grid-cols-2">
                        <label className="font-semibold">
                          Nombre del producto
                          <input
                            required
                            maxLength={100}
                            className="mt-1 w-full rounded-xl border p-3"
                            placeholder="Ej. Pizza Margarita"
                            value={itemName}
                            onChange={(event) =>
                              setItemName(event.target.value)
                            }
                          />
                        </label>
                        <label className="font-semibold">
                          Precio en colones
                          <input
                            required
                            min="0"
                            step="1"
                            type="number"
                            className="mt-1 w-full rounded-xl border p-3"
                            placeholder="4500"
                            value={price}
                            onChange={(event) => setPrice(event.target.value)}
                          />
                        </label>
                        <label className="font-semibold sm:col-span-2">
                          Descripción
                          <textarea
                            maxLength={500}
                            className="mt-1 min-h-24 w-full rounded-xl border p-3"
                            placeholder="Ingredientes, presentación o características…"
                            value={itemDescription}
                            onChange={(event) =>
                              setItemDescription(event.target.value)
                            }
                          />
                          <span className="mt-1 block text-xs font-normal text-slate-500">
                            Esta información aparece en el menú del cliente.
                          </span>
                        </label>
                      </div>
                    </fieldset>

                    <fieldset className="rounded-2xl border">
                      <legend className="ml-3 px-2 text-sm font-black">
                        2 · Clasificación y ubicación
                      </legend>
                      <div className="space-y-3 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="font-semibold">
                            Tipo de producto
                            <select
                              required
                              className="mt-1 w-full rounded-xl border bg-white p-3"
                              value={creatingProductType ? "__NEW__" : productType}
                              onChange={(event) => {
                                if (event.target.value === "__NEW__") {
                                  setCreatingProductType(true);
                                  setProductType("");
                                  return;
                                }
                                setCreatingProductType(false);
                                setProductType(event.target.value);
                              }}
                            >
                              {existingProductTypes.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                              <option value="__NEW__">+ Crear un tipo nuevo</option>
                            </select>
                            {creatingProductType && (
                              <input
                                required
                                autoFocus
                                maxLength={60}
                                className="mt-2 w-full rounded-xl border border-emerald-500 p-3"
                                placeholder="Nombre del nuevo tipo"
                                value={productType}
                                onChange={(event) =>
                                  setProductType(event.target.value)
                                }
                              />
                            )}
                            <span className="mt-1 block text-xs font-normal text-slate-500">
                              Reutilice un tipo existente o cree uno solo cuando sea necesario.
                            </span>
                          </label>
                          <label className="font-semibold">
                            Estación responsable
                            <select
                              className="mt-1 w-full rounded-xl border bg-white p-3"
                              value={itemStation}
                              onChange={(event) =>
                                setItemStation(event.target.value as Station)
                              }
                            >
                              <option value="KITCHEN">Cocina</option>
                              <option value="BAR">Bar</option>
                            </select>
                          </label>
                        </div>
                        <label className="block font-semibold">
                          Categorías adicionales
                          <input
                            className="mt-1 w-full rounded-xl border p-3"
                            placeholder="Separadas por coma"
                            value={categories}
                            onChange={(event) =>
                              setCategories(event.target.value)
                            }
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {suggestedCategories.map((category) => {
                            const selected = selectedCategories.includes(
                              category.toLocaleLowerCase(),
                            );
                            return (
                              <button
                                key={category}
                                type="button"
                                onClick={() =>
                                  toggleSuggestedCategory(category)
                                }
                                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selected ? "border-violet-400 bg-violet-100 text-violet-800" : "bg-white text-slate-600"}`}
                              >
                                {category}
                              </button>
                            );
                          })}
                        </div>
                        <label className="block font-semibold">
                          Orden de servicio
                          <select
                            className="mt-1 w-full rounded-xl border bg-white p-3"
                            value={course}
                            onChange={(event) => setCourse(event.target.value)}
                          >
                            <option value="DRINK">Bebida</option>
                            <option value="STARTER">Entrada</option>
                            <option value="MAIN">Plato principal</option>
                            <option value="OTHER">Otro</option>
                          </select>
                        </label>
                      </div>
                    </fieldset>

                    <fieldset className="rounded-2xl border">
                      <legend className="ml-3 px-2 text-sm font-black">
                        3 · Preparación y condiciones
                      </legend>
                      <div className="space-y-3 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label
                            className={`cursor-pointer rounded-xl border p-3 ${origin === "HOUSE_MADE" ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : ""}`}
                          >
                            <span className="flex items-start gap-2">
                              <input
                                type="radio"
                                checked={origin === "HOUSE_MADE"}
                                onChange={() => setOrigin("HOUSE_MADE")}
                              />
                              <span>
                                <strong className="block">Hecho en casa</strong>
                                <small className="font-normal text-slate-500">
                                  Se prepara en el restaurante.
                                </small>
                              </span>
                            </span>
                          </label>
                          <label
                            className={`cursor-pointer rounded-xl border p-3 ${origin === "THIRD_PARTY" ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : ""}`}
                          >
                            <span className="flex items-start gap-2">
                              <input
                                type="radio"
                                checked={origin === "THIRD_PARTY"}
                                onChange={() => setOrigin("THIRD_PARTY")}
                              />
                              <span>
                                <strong className="block">
                                  Producto de terceros
                                </strong>
                                <small className="font-normal text-slate-500">
                                  Se recibe listo para vender.
                                </small>
                              </span>
                            </span>
                          </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="font-semibold">
                            Minutos de preparación
                            <input
                              disabled={origin === "THIRD_PARTY"}
                              required={origin === "HOUSE_MADE"}
                              min="5"
                              max="15"
                              type="number"
                              className="mt-1 w-full rounded-xl border p-3 disabled:bg-slate-100 disabled:text-slate-400"
                              value={prepMinutes}
                              onChange={(event) =>
                                setPrepMinutes(event.target.value)
                              }
                            />
                          </label>
                          <label className="flex items-center gap-3 rounded-xl border bg-slate-50 p-3 font-semibold">
                            <input
                              type="checkbox"
                              checked={alcoholic}
                              onChange={(event) =>
                                setAlcoholic(event.target.checked)
                              }
                            />
                            Contiene alcohol
                          </label>
                        </div>
                      </div>
                    </fieldset>

                    <fieldset className="rounded-2xl border">
                      <legend className="ml-3 px-2 text-sm font-black">
                        4 · Imagen del producto
                      </legend>
                      <div className="grid gap-4 p-4 sm:grid-cols-[190px_1fr]">
                        <div className="relative grid min-h-52 place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-gradient-to-br from-slate-50 to-indigo-50 text-center text-slate-400">
                          {imageData ? (
                            <Image
                              src={imageData}
                              alt="Vista previa del producto"
                              fill
                              sizes="190px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <span>
                              <span className="block text-4xl">🖼️</span>
                              <strong className="mt-2 block text-sm">
                                Vista previa
                              </strong>
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col justify-center gap-3 rounded-2xl border p-4">
                          <div>
                            <strong>Seleccione una imagen clara</strong>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">
                              JPEG, PNG o WebP; máximo 2 MB y 1600 × 1600. En
                              móviles se recorta proporcionalmente.
                            </p>
                          </div>
                          <input
                            className="block w-full text-sm"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(event) =>
                              void selectProductImage(event.target.files?.[0])
                            }
                          />
                          {imageData && (
                            <button
                              type="button"
                              className="self-start text-sm font-bold text-red-700"
                              onClick={() => setImageData(null)}
                            >
                              Quitar imagen
                            </button>
                          )}
                        </div>
                      </div>
                    </fieldset>

                    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">
                        Vista previa para el cliente
                      </p>
                      <div className="mx-auto mt-3 grid max-w-md grid-cols-[110px_1fr] overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
                        <div className="relative grid min-h-40 place-items-center overflow-hidden bg-gradient-to-br from-amber-200 to-rose-300 text-4xl">
                          {imageData ? (
                            <Image
                              src={imageData}
                              alt=""
                              fill
                              sizes="110px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <span aria-hidden="true">🍽️</span>
                          )}
                        </div>
                        <div className="p-4">
                          <h4 className="font-black">
                            {itemName.trim() || "Nombre del producto"}
                          </h4>
                          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-600">
                            {itemDescription.trim() ||
                              "La descripción del producto aparecerá en este espacio."}
                          </p>
                          <span className="mt-2 inline-block rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700">
                            {productType || "Tipo de producto"}
                          </span>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <strong className="text-lg">
                              ₡{Number(price || 0).toLocaleString()}
                            </strong>
                            <span className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">
                              Agregar
                            </span>
                          </div>
                        </div>
                      </div>
                    </section>

                    <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                      {editingItemId && (
                        <button
                          type="button"
                          className="rounded-xl border px-4 py-3 font-bold"
                          onClick={resetMenuForm}
                        >
                          Cancelar edición
                        </button>
                      )}
                      <button className="rounded-xl bg-emerald-700 px-5 py-3 font-black text-white">
                        {editingItemId ? "Guardar cambios" : "Agregar producto"}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
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
              ? "overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm"
              : "hidden"
          }
        >
          <div className="border-b border-slate-200 bg-gradient-to-r from-fuchsia-950 via-fuchsia-800 to-violet-800 px-5 py-7 text-white sm:px-7">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-200">
              Campañas del restaurante
            </p>
            <h2 className="mt-1 text-3xl font-black">Promociones</h2>
            <p className="mt-2 max-w-2xl text-sm text-fuchsia-100">
              Cree ofertas con vigencia controlada. Las promociones con imagen
              también podrán mostrarse aleatoriamente al finalizar una visita.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Total", promotions.length],
                ["Vigentes", currentPromotionCount],
                ["Programadas", scheduledPromotionCount],
                ["Vencidas", expiredPromotionCount],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-100">
                    {label}
                  </p>
                  <p className="mt-1 text-3xl font-black">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {promotionNotice && (
            <p
              aria-live="polite"
              className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-semibold text-emerald-900 sm:mx-6"
            >
              ✓ {promotionNotice}
            </p>
          )}

          <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[380px_1fr]">
            <form
              className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-4"
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  setPromotionAction("create");
                  setPromotionNotice("");
                  const created = await post("promotions", {
                    title: promotionTitle,
                    imageData: promotionImageData,
                    menuItemId: promotionItemId,
                    productType:
                      menu.find((item) => item.id === promotionItemId)
                        ?.productType ?? promotionType,
                    creditAmount: Number(promotionCredit),
                    startsAt: new Date(promotionStart).toISOString(),
                    endsAt: new Date(promotionEnd).toISOString(),
                  });
                  if (created) {
                    setPromotionNotice(
                      `${promotionTitle} fue creada correctamente.`,
                    );
                    setPromotionTitle("");
                    setPromotionItemId("");
                    setPromotionType("");
                    setPromotionCredit("0");
                    setPromotionStart("");
                    setPromotionEnd("");
                    setPromotionImageData(null);
                  }
                  setPromotionAction(null);
                })();
              }}
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-700">
                Nueva campaña
              </p>
              <h3 className="mt-1 text-xl font-black text-slate-950">
                Crear promoción
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                El precio de catálogo no cambia; el beneficio se registra como
                crédito en la cuenta.
              </p>

              <label className="mt-5 block text-sm font-bold text-slate-800">
                Nombre de la promoción
                <input
                  required
                  maxLength={100}
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-fuchsia-600 focus:ring-4 focus:ring-fuchsia-100"
                  placeholder="Ejemplo: Hora feliz"
                  value={promotionTitle}
                  onChange={(event) => setPromotionTitle(event.target.value)}
                />
              </label>

              <label className="mt-4 block text-sm font-bold text-slate-800">
                Producto promocionado
                <select
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-fuchsia-600"
                  value={promotionItemId}
                  onChange={(event) => {
                    setPromotionItemId(event.target.value);
                    setPromotionType(
                      menu.find((item) => item.id === event.target.value)
                        ?.productType ?? "",
                    );
                  }}
                >
                  <option value="">Seleccione un producto</option>
                  {menu
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.productType}
                      </option>
                    ))}
                </select>
              </label>

              <label className="mt-4 block text-sm font-bold text-slate-800">
                Crédito a favor del cliente
                <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-300 focus-within:border-fuchsia-600">
                  <span className="flex items-center bg-slate-100 px-4 font-black text-slate-600">
                    ₡
                  </span>
                  <input
                    required
                    min="0"
                    max="10000000"
                    type="number"
                    className="min-w-0 flex-1 p-3 outline-none"
                    placeholder="0"
                    value={promotionCredit}
                    onChange={(event) =>
                      setPromotionCredit(event.target.value)
                    }
                  />
                </div>
              </label>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="text-sm font-bold text-slate-800">
                  Fecha de inicio
                  <input
                    required
                    type="datetime-local"
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-fuchsia-600"
                    value={promotionStart}
                    onChange={(event) => setPromotionStart(event.target.value)}
                  />
                </label>
                <label className="text-sm font-bold text-slate-800">
                  Fecha de finalización
                  <input
                    required
                    type="datetime-local"
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-fuchsia-600"
                    value={promotionEnd}
                    onChange={(event) => setPromotionEnd(event.target.value)}
                  />
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-dashed border-fuchsia-300 bg-fuchsia-50 p-3">
                {promotionImageData ? (
                  <div>
                    <Image
                      src={promotionImageData}
                      alt="Vista previa de la promoción"
                      width={800}
                      height={500}
                      unoptimized
                      className="aspect-[16/10] w-full rounded-xl object-cover"
                    />
                    <div className="mt-3 flex gap-2">
                      <label className="flex-1 cursor-pointer rounded-xl bg-fuchsia-700 px-3 py-2 text-center text-sm font-bold text-white">
                        Cambiar imagen
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(event) =>
                            void selectPromotionImage(event.target.files?.[0])
                          }
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setPromotionImageData(null)}
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-700"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center px-4 py-8 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-sm">
                      ▧
                    </span>
                    <span className="mt-3 font-black text-fuchsia-950">
                      Agregar imagen promocional
                    </span>
                    <span className="mt-1 text-xs text-fuchsia-700">
                      JPEG, PNG o WebP · máximo 2 MB y 1600 × 1600
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(event) =>
                        void selectPromotionImage(event.target.files?.[0])
                      }
                    />
                  </label>
                )}
              </div>

              <button
                disabled={promotionAction === "create"}
                className="mt-5 w-full rounded-xl bg-fuchsia-700 px-4 py-3 font-black text-white transition hover:bg-fuchsia-800 disabled:cursor-wait disabled:opacity-60"
              >
                {promotionAction === "create"
                  ? "Creando promoción…"
                  : "Crear promoción"}
              </button>
            </form>

            <div className="min-w-0">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-slate-950">
                    Promociones configuradas
                  </h3>
                  <p className="text-sm text-slate-500">
                    Administre su vigencia, imagen y permanencia.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-600 shadow-sm">
                  {promotions.length} registros
                </span>
              </div>

              {promotions.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
                  <p className="text-4xl" aria-hidden="true">
                    ✦
                  </p>
                  <h4 className="mt-3 font-black text-slate-900">
                    Aún no hay promociones
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Cree la primera campaña desde el formulario.
                  </p>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                {promotions.map((promotion) => {
                  const startsAt = new Date(promotion.startsAt);
                  const endsAt = new Date(promotion.endsAt);
                  const isExpired = endsAt.getTime() <= promotionNow;
                  const isScheduled = startsAt.getTime() > promotionNow;
                  const status = !promotion.active
                    ? "Desactivada"
                    : isExpired
                      ? "Vencida"
                      : isScheduled
                        ? "Programada"
                        : "Vigente";
                  const statusClass =
                    status === "Vigente"
                      ? "bg-emerald-100 text-emerald-800"
                      : status === "Programada"
                        ? "bg-blue-100 text-blue-800"
                        : status === "Vencida"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-200 text-slate-700";
                  const imageAction = `image:${promotion.id}`;
                  const toggleAction = `toggle:${promotion.id}`;
                  const deleteAction = `delete:${promotion.id}`;
                  return (
                    <article
                      key={promotion.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                    >
                      {promotion.imageData ? (
                        <Image
                          src={promotion.imageData}
                          alt={promotion.title}
                          width={800}
                          height={500}
                          unoptimized
                          className="aspect-[16/10] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-fuchsia-100 to-violet-100 p-5 text-center">
                          <div>
                            <span className="text-4xl" aria-hidden="true">
                              ✦
                            </span>
                            <p className="mt-2 text-sm font-black text-fuchsia-900">
                              Sin imagen de salida
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="truncate text-lg font-black text-slate-950">
                              {promotion.title}
                            </h4>
                            <p className="mt-1 text-sm text-slate-600">
                              {menu.find(
                                (item) => item.id === promotion.menuItemId,
                              )?.name ?? promotion.productType}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${statusClass}`}
                          >
                            {status}
                          </span>
                        </div>
                        <p className="mt-3 text-2xl font-black text-fuchsia-800">
                          ₡{promotion.creditAmount.toLocaleString()}
                          <span className="ml-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                            de crédito
                          </span>
                        </p>
                        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                          <p>
                            <strong>Inicia:</strong> {startsAt.toLocaleString()}
                          </p>
                          <p className="mt-1">
                            <strong>Finaliza:</strong> {endsAt.toLocaleString()}
                          </p>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={promotionAction === toggleAction}
                            onClick={() => void togglePromotion(promotion)}
                            className={`rounded-xl px-3 py-2.5 text-sm font-black transition disabled:cursor-wait disabled:opacity-60 ${
                              promotion.active
                                ? "border border-slate-300 text-slate-700 hover:bg-slate-50"
                                : "bg-emerald-700 text-white hover:bg-emerald-800"
                            }`}
                          >
                            {promotionAction === toggleAction
                              ? "Guardando…"
                              : promotion.active
                                ? "Desactivar"
                                : "Activar"}
                          </button>
                          <label className="cursor-pointer rounded-xl border border-fuchsia-200 px-3 py-2.5 text-center text-sm font-black text-fuchsia-800 transition hover:bg-fuchsia-50">
                            {promotionAction === imageAction
                              ? "Cargando…"
                              : promotion.imageData
                                ? "Cambiar imagen"
                                : "Agregar imagen"}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              disabled={promotionAction === imageAction}
                              onChange={(event) =>
                                void replacePromotionImage(
                                  promotion,
                                  event.target.files?.[0],
                                )
                              }
                            />
                          </label>
                          {promotion.imageData && (
                            <button
                              type="button"
                              disabled={promotionAction === imageAction}
                              onClick={() =>
                                void removePromotionImage(promotion)
                              }
                              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Quitar imagen
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={promotionAction === deleteAction}
                            onClick={() => void deletePromotion(promotion)}
                            className={`rounded-xl border border-red-200 px-3 py-2.5 text-sm font-black text-red-700 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60 ${
                              promotion.imageData ? "" : "col-span-2"
                            }`}
                          >
                            {promotionAction === deleteAction
                              ? "Eliminando…"
                              : "Eliminar definitivamente"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
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
                <th className="p-3">Puede asumir caja</th>
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
                        <option value="CASHIER">Cajero</option>
                      </select>
                    )}
                  </td>
                  <td className="p-3">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={
                          user.restaurantRole === "CASHIER" ||
                          user.restaurantCashAuthorized
                        }
                        disabled={
                          !user.active || user.restaurantRole === "CASHIER"
                        }
                        onChange={(event) =>
                          void post(
                            `staff-users/${user.id}/cash-authorization`,
                            { authorized: event.target.checked },
                            "PATCH",
                          )
                        }
                      />
                      {user.restaurantRole === "CASHIER"
                        ? "Incluido por rol"
                        : "Autorizado"}
                    </label>
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
      <ClosedReceiptDialog
        key={closedReceipt?.receiptNumber ?? "empty"}
        receipt={closedReceipt}
        onDismiss={() => setClosedReceipt(null)}
      />
      <PaymentMethodDialog
        open={Boolean(closingVisitId)}
        onCancel={() => setClosingVisitId(null)}
        onConfirm={(payment) => {
          if (closingVisitId) return closeVisit(closingVisitId, payment);
        }}
      />
    </main>
  );
}
