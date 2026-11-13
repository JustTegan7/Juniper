import "server-only";
import { and, asc, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLog, products, stockMovements } from "@evergreen/db";
import { parsePrice } from "@evergreen/core";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { actorOf, requireManager, type Ctx } from "./ctx";

export type Product = typeof products.$inferSelect;
export type ProductWithStock = Product & { onHand: number };

const onHandExpr = sql<number>`(select coalesce(sum(sm.delta), 0)::int from stock_movements sm where sm.product_id = "products"."id")`;

/** Everyone on the team can see products and stock (the register needs it). Only managers change them. */
export async function listProducts(ctx: Ctx, opts: { includeInactive?: boolean } = {}): Promise<ProductWithStock[]> {
  const rows = await db()
    .select({ ...getTableColumns(products), onHand: onHandExpr })
    .from(products)
    .where(and(eq(products.workspaceId, ctx.workspace.id), isNull(products.deletedAt), ...(opts.includeInactive ? [] : [eq(products.active, true)])))
    .orderBy(asc(products.sortOrder), asc(products.name));
  return rows.map((r) => ({ ...r, onHand: Number(r.onHand) }));
}

/** On hand for a set of products in one business. Products with no movements count as 0. */
export async function onHandFor(workspaceId: string, productIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = Object.fromEntries(productIds.map((id) => [id, 0]));
  if (!productIds.length) return out;
  const rows = await db()
    .select({ id: products.id, onHand: onHandExpr })
    .from(products)
    .where(and(eq(products.workspaceId, workspaceId), sql`${products.id} in ${productIds}`));
  for (const r of rows) out[r.id] = Number(r.onHand);
  return out;
}

const productInput = z.object({
  id: z.uuid().optional(),
  sku: z
    .string()
    .trim()
    .min(1, "Give the product a SKU")
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "SKU can use letters, numbers, dots, dashes and underscores")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Name the product").max(120),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  price: z.string().default("0"),
  active: z.coerce.boolean().default(true),
  shippingAllowed: z.coerce.boolean().default(true),
  pickupAllowed: z.coerce.boolean().default(true),
  images: z.array(z.url()).max(8).default([]),
  /** Only used when creating. Later changes go through adjustStock so the history stays honest. */
  startingStock: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export async function saveProduct(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const input = productInput.parse(raw);
  const priceCents = parsePrice(input.price);
  if (priceCents == null) throw new Error("Check the price.");
  if (!input.shippingAllowed && !input.pickupAllowed && input.active) throw new Error("Allow shipping or pickup, or mark the product inactive.");

  const d = db();
  const ws = ctx.workspace.id;
  const [sameSku] = await d.select({ id: products.id, deletedAt: products.deletedAt }).from(products).where(and(eq(products.workspaceId, ws), eq(products.sku, input.sku))).limit(1);
  if (sameSku && sameSku.id !== input.id) throw new Error(sameSku.deletedAt ? "That SKU belongs to a removed product. Use a different one." : "Another product already uses that SKU.");

  const values = {
    workspaceId: ws,
    sku: input.sku,
    name: input.name,
    description: input.description,
    priceCents,
    active: input.active,
    shippingAllowed: input.shippingAllowed,
    pickupAllowed: input.pickupAllowed,
    images: input.images,
  };

  if (input.id) {
    const [before] = await d.select().from(products).where(and(eq(products.id, input.id), eq(products.workspaceId, ws), isNull(products.deletedAt)));
    if (!before) throw new Error("That product was not found.");
    await batch([d.update(products).set(values).where(eq(products.id, input.id)), d.insert(auditLog).values(auditRow(actorOf(ctx), "product", input.id, "updated", before, values))]);
    return { message: "Product saved.", id: input.id };
  }

  const [{ n }] = await d.select({ n: sql<number>`coalesce(max(${products.sortOrder}), 0)` }).from(products).where(eq(products.workspaceId, ws));
  const [row] = await d.insert(products).values({ ...values, sortOrder: Number(n) + 1 }).returning({ id: products.id });
  await batch([
    ...(input.startingStock > 0
      ? [d.insert(stockMovements).values({ workspaceId: ws, productId: row!.id, delta: input.startingStock, reason: "receive", note: "Starting stock", createdByUserId: ctx.userId })]
      : []),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "product", row!.id, "created", undefined, { ...values, startingStock: input.startingStock })),
  ]);
  return { message: "Product added.", id: row!.id };
}

/** Removes a product from the shop. Past orders keep their copied name, SKU and price, and the stock history stays. */
export async function archiveProduct(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  const d = db();
  const [before] = await d.select().from(products).where(and(eq(products.id, id), eq(products.workspaceId, ctx.workspace.id), isNull(products.deletedAt)));
  if (!before) throw new Error("That product was not found.");
  await batch([
    d.update(products).set({ deletedAt: new Date(), active: false }).where(eq(products.id, id)),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "product", id, "archived", { active: before.active }, { active: false })),
  ]);
  return { message: "Product removed. Past orders keep their details." };
}

const stockInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("receive"), productId: z.uuid(), quantity: z.coerce.number().int().min(1, "Enter how many arrived").max(1_000_000), note: z.string().trim().max(300).optional() }),
  z.object({
    kind: z.literal("adjust"),
    productId: z.uuid(),
    /** Positive adds, negative removes (damage, count correction, loss). */
    quantity: z.coerce.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, "Enter a change other than zero"),
    note: z.string().trim().min(1, "Say why you are adjusting stock").max(300),
  }),
]);

export async function adjustStock(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const input = stockInput.parse(raw);
  const d = db();
  const ws = ctx.workspace.id;
  const [p] = await d.select({ id: products.id, onHand: onHandExpr }).from(products).where(and(eq(products.id, input.productId), eq(products.workspaceId, ws), isNull(products.deletedAt)));
  if (!p) throw new Error("That product was not found.");
  const before = Number(p.onHand);
  const after = before + input.quantity;
  if (after < 0) throw new Error(`Only ${before} in stock, so you cannot remove ${Math.abs(input.quantity)}.`);
  await batch([
    d.insert(stockMovements).values({ workspaceId: ws, productId: p.id, delta: input.quantity, reason: input.kind, note: input.note || null, createdByUserId: ctx.userId }),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "product", p.id, `stock_${input.kind}`, { onHand: before }, { onHand: after, note: input.note ?? null })),
  ]);
  return { message: "Stock updated.", onHand: after };
}

/** Newest first. Lets a manager see where every unit went. */
export async function stockHistory(ctx: Ctx, raw: unknown) {
  const { productId, limit } = z.object({ productId: z.uuid(), limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(raw);
  return db()
    .select()
    .from(stockMovements)
    .where(and(eq(stockMovements.workspaceId, ctx.workspace.id), eq(stockMovements.productId, productId)))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(limit);
}
