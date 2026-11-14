import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auditLog, helcimConnections, helcimDevices } from "@evergreen/db";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { encryptSecret } from "../helcim/crypto";
import { ForbiddenError, actorOf, type Ctx } from "./ctx";

/** Tokens are secrets, so only owners can connect or change the Helcim account. */
function requireOwner(ctx: Ctx) {
  if (ctx.role !== "owner") throw new ForbiddenError("Only an owner can change the card payment connection.");
}

export type HelcimSettings = {
  connected: boolean;
  connectionKey: string | null;
  hasVerifierToken: boolean;
  currency: string;
  devices: { id: string; code: string; kind: "smart_terminal" | "card_reader"; label: string; location: string | null; active: boolean }[];
};

/** Never returns the tokens themselves, only whether they are set. */
export async function loadHelcimSettings(ctx: Ctx): Promise<HelcimSettings> {
  const d = db();
  const [c] = await d.select().from(helcimConnections).where(eq(helcimConnections.workspaceId, ctx.workspace.id)).limit(1);
  if (!c) return { connected: false, connectionKey: null, hasVerifierToken: false, currency: "USD", devices: [] };
  const devices = await d
    .select({ id: helcimDevices.id, code: helcimDevices.code, kind: helcimDevices.kind, label: helcimDevices.label, location: helcimDevices.location, active: helcimDevices.active })
    .from(helcimDevices)
    .where(and(eq(helcimDevices.workspaceId, ctx.workspace.id), eq(helcimDevices.connectionId, c.id)))
    .orderBy(asc(helcimDevices.label));
  return { connected: true, connectionKey: c.connectionKey, hasVerifierToken: !!c.verifierTokenEnc, currency: c.currency, devices };
}

const token = (what: string) => z.string().trim().min(8, `Paste the ${what}`).max(500).regex(/^\S+$/, `The ${what} has no spaces`);

const connectionInput = z.object({
  // Blank means keep the saved one (once connected).
  apiToken: z.string().trim().max(500).optional().transform((v) => v || undefined),
  verifierToken: z.string().trim().max(500).optional().transform((v) => v || undefined),
  currency: z.enum(["USD", "CAD"]).default("USD"),
});

export async function saveHelcimConnection(ctx: Ctx, raw: unknown) {
  requireOwner(ctx);
  const input = connectionInput.parse(raw);
  const apiToken = input.apiToken ? token("API token").parse(input.apiToken) : undefined;
  const verifierToken = input.verifierToken ? token("verifier token").parse(input.verifierToken) : undefined;
  const d = db();
  const ws = ctx.workspace.id;
  const [existing] = await d.select().from(helcimConnections).where(eq(helcimConnections.workspaceId, ws)).limit(1);

  if (!existing) {
    if (!apiToken) throw new Error("Paste the Helcim API token to connect.");
    const connectionKey = randomBytes(18).toString("base64url");
    const [row] = await d
      .insert(helcimConnections)
      .values({ workspaceId: ws, connectionKey, apiTokenEnc: encryptSecret(apiToken), verifierTokenEnc: verifierToken ? encryptSecret(verifierToken) : null, currency: input.currency })
      .returning({ id: helcimConnections.id });
    await d.insert(auditLog).values(auditRow(actorOf(ctx), "helcim_connection", row!.id, "connected", undefined, { currency: input.currency, verifierSet: !!verifierToken }));
    return { message: "Helcim connected. Next, add the webhook URL in Helcim, then register your devices." };
  }

  const set: Partial<typeof helcimConnections.$inferInsert> = { currency: input.currency };
  if (apiToken) set.apiTokenEnc = encryptSecret(apiToken);
  if (verifierToken) set.verifierTokenEnc = encryptSecret(verifierToken);
  await batch([
    d.update(helcimConnections).set(set).where(eq(helcimConnections.id, existing.id)),
    // Secrets never go in the audit trail, only which fields changed.
    d.insert(auditLog).values(auditRow(actorOf(ctx), "helcim_connection", existing.id, "updated", { currency: existing.currency }, { currency: input.currency, apiTokenChanged: !!apiToken, verifierChanged: !!verifierToken })),
  ]);
  return { message: "Helcim settings saved." };
}

const deviceInput = z.object({
  id: z.uuid().optional(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4}$/, "The device code is the 4 characters shown on the device")
    .transform((v) => v.toUpperCase()),
  kind: z.enum(["smart_terminal", "card_reader"]),
  label: z.string().trim().min(1, "Name the device, like Front counter").max(60),
  location: z.string().trim().max(80).optional().transform((v) => v || null),
  active: z.coerce.boolean().default(true),
});

/** Devices are never deleted, only turned off, so old payments keep their device. */
export async function saveHelcimDevice(ctx: Ctx, raw: unknown) {
  requireOwner(ctx);
  const input = deviceInput.parse(raw);
  const d = db();
  const ws = ctx.workspace.id;
  const [c] = await d.select({ id: helcimConnections.id }).from(helcimConnections).where(eq(helcimConnections.workspaceId, ws)).limit(1);
  if (!c) throw new Error("Connect Helcim first.");
  const [same] = await d.select({ id: helcimDevices.id }).from(helcimDevices).where(and(eq(helcimDevices.connectionId, c.id), eq(helcimDevices.code, input.code))).limit(1);
  if (same && same.id !== input.id) throw new Error("That device code is already added.");
  const values = { code: input.code, kind: input.kind, label: input.label, location: input.location, active: input.active };

  if (input.id) {
    const [before] = await d.select().from(helcimDevices).where(and(eq(helcimDevices.id, input.id), eq(helcimDevices.workspaceId, ws)));
    if (!before) throw new Error("That device was not found.");
    await batch([d.update(helcimDevices).set(values).where(eq(helcimDevices.id, input.id)), d.insert(auditLog).values(auditRow(actorOf(ctx), "helcim_device", input.id, "updated", before, values))]);
    return { message: "Device saved.", id: input.id };
  }
  const [row] = await d.insert(helcimDevices).values({ ...values, workspaceId: ws, connectionId: c.id }).returning({ id: helcimDevices.id });
  await d.insert(auditLog).values(auditRow(actorOf(ctx), "helcim_device", row!.id, "created", undefined, values));
  return { message: "Device added.", id: row!.id };
}

/** Active devices only, for the register. Open to the whole team and never includes tokens. */
export async function loadHelcimSettingsForRegister(ctx: Ctx) {
  const s = await loadHelcimSettings(ctx);
  return s.devices.filter((x) => x.active).map((x) => ({ id: x.id, label: x.label, kind: x.kind }));
}
