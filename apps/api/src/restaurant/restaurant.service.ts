import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as QRCode from "qrcode";
import { RestaurantItemStatus } from "../generated/prisma/enums";
import {
  CreateMenuItemDto,
  CreateTableDto,
  PlaceOrderDto,
  UpdateItemStatusDto,
  UpdateMenuItemDto,
} from "./dto/restaurant.dto";

const transitions: Record<RestaurantItemStatus, RestaurantItemStatus[]> = {
  RECEIVED: [RestaurantItemStatus.ACCEPTED, RestaurantItemStatus.CANCELLED],
  ACCEPTED: [RestaurantItemStatus.PREPARING, RestaurantItemStatus.CANCELLED],
  PREPARING: [RestaurantItemStatus.READY, RestaurantItemStatus.CANCELLED],
  READY: [RestaurantItemStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class RestaurantService {
  constructor(private readonly prisma: PrismaService) {}

  tables(organizationId: string) {
    return this.prisma.restaurantTable.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
  }

  async addTable(organizationId: string, dto: CreateTableDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("Table name required");
    const existing = await this.prisma.restaurantTable.findFirst({
      where: { organizationId, name },
    });
    if (existing) throw new ConflictException("Table already exists");
    return this.prisma.restaurantTable.create({
      data: { organizationId, name },
    });
  }

  async tableQr(organizationId: string, id: string) {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id, organizationId },
    });
    if (!table) throw new NotFoundException("Table not found");
    const base = (
      process.env.PUBLIC_WEB_URL ?? "http://localhost:3001"
    ).replace(/\/$/, "");
    const url = `${base}/restaurant/table/${table.code}`;
    return {
      url,
      image: await QRCode.toDataURL(url, { width: 400, margin: 2 }),
    };
  }

  menu(organizationId: string) {
    return this.prisma.restaurantMenuItem.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  addMenuItem(organizationId: string, dto: CreateMenuItemDto) {
    if (!dto.name.trim()) throw new BadRequestException("Item name required");
    return this.prisma.restaurantMenuItem.create({
      data: { ...dto, name: dto.name.trim(), organizationId },
    });
  }

  async updateMenuItem(
    organizationId: string,
    id: string,
    dto: UpdateMenuItemDto,
  ) {
    const result = await this.prisma.restaurantMenuItem.updateMany({
      where: { id, organizationId },
      data: dto,
    });
    if (!result.count) throw new NotFoundException("Menu item not found");
    return this.prisma.restaurantMenuItem.findUnique({ where: { id } });
  }

  async guestMenu(code: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { code },
      include: { organization: { select: { name: true } } },
    });
    if (!table?.active) throw new NotFoundException("Table not found");
    const menu = await this.prisma.restaurantMenuItem.findMany({
      where: { organizationId: table.organizationId, active: true },
      orderBy: { createdAt: "asc" },
    });
    return { restaurant: table.organization.name, table: table.name, menu };
  }

  async placeOrder(code: string, dto: PlaceOrderDto) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { code },
    });
    if (!table?.active) throw new NotFoundException("Table not found");
    const include = { items: true, table: { select: { name: true } } } as const;
    const previous = await this.prisma.restaurantOrder.findUnique({
      where: { requestId: dto.requestId },
      include,
    });
    if (previous) {
      if (previous.tableId !== table.id)
        throw new ConflictException("Request already used");
      return previous;
    }
    const ids = dto.items.map((item) => item.menuItemId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException("Duplicate menu item");
    const menu = await this.prisma.restaurantMenuItem.findMany({
      where: {
        id: { in: ids },
        organizationId: table.organizationId,
        active: true,
      },
    });
    if (menu.length !== ids.length)
      throw new BadRequestException("Menu item unavailable");
    const byId = new Map(menu.map((item) => [item.id, item]));
    const open = await this.prisma.restaurantOrder.count({
      where: {
        tableId: table.id,
        items: {
          some: {
            status: { in: ["RECEIVED", "ACCEPTED", "PREPARING", "READY"] },
          },
        },
      },
    });
    if (open >= 3)
      throw new ConflictException(
        "Please contact the staff before placing another order",
      );
    try {
      return await this.prisma.restaurantOrder.create({
        data: {
          organizationId: table.organizationId,
          tableId: table.id,
          requestId: dto.requestId,
          items: {
            create: dto.items.map(({ menuItemId, quantity }) => {
              const item = byId.get(menuItemId)!;
              return {
                menuItemId,
                quantity,
                name: item.name,
                price: item.price,
                station: item.station,
                course: item.course,
                events: { create: { status: RestaurantItemStatus.RECEIVED } },
              };
            }),
          },
        },
        include,
      });
    } catch (error) {
      const existing = await this.prisma.restaurantOrder.findUnique({
        where: { requestId: dto.requestId },
        include,
      });
      if (existing?.tableId === table.id) return existing;
      throw error;
    }
  }

  async guestOrder(accessCode: string) {
    const order = await this.prisma.restaurantOrder.findUnique({
      where: { accessCode },
      include: {
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            station: true,
            course: true,
            status: true,
            acceptedAt: true,
            readyAt: true,
            deliveredAt: true,
          },
        },
        table: { select: { name: true } },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  orders(organizationId: string) {
    return this.prisma.restaurantOrder.findMany({
      where: { organizationId },
      include: { items: true, table: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async updateStatus(
    organizationId: string,
    actorId: string,
    id: string,
    dto: UpdateItemStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.restaurantOrderItem.findFirst({
        where: { id, order: { organizationId } },
      });
      if (!item) throw new NotFoundException("Order item not found");
      if (!transitions[item.status].includes(dto.status))
        throw new BadRequestException("Invalid status change");
      const now = new Date();
      const result = await tx.restaurantOrderItem.updateMany({
        where: { id, status: item.status },
        data: {
          status: dto.status,
          ...(dto.status === "ACCEPTED" ? { acceptedAt: now } : {}),
          ...(dto.status === "READY" ? { readyAt: now } : {}),
          ...(dto.status === "DELIVERED" ? { deliveredAt: now } : {}),
        },
      });
      if (!result.count)
        throw new ConflictException("Item was updated by someone else");
      await tx.restaurantItemEvent.create({
        data: { itemId: id, actorId, status: dto.status },
      });
      return tx.restaurantOrderItem.findUnique({ where: { id } });
    });
  }
}
