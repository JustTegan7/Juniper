import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auditLog, workspaces } from "@evergreen/db";
import { parseSettings, workspaceSettingsSchema, type WorkspaceSettings } from "@evergreen/core";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { actorOf, requireManager, type Ctx } from "./ctx";
import { validTimeZone } from "./workspace";

const businessInput = z.object({
  name: z.string().trim().min(2, "Add the business name").max(80),
  timezone: z.string().trim(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #3E4C78"),
});

export async function updateBusiness(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const v = businessInput.parse(raw);
  if (!validTimeZone(v.timezone)) throw new Error("That time zone is not recognized.");
  const d = db();
  await batch([
    d.update(workspaces).set(v).where(eq(workspaces.id, ctx.workspace.id)),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "workspace", ctx.workspace.id, "updated", { name: ctx.workspace.name, timezone: ctx.workspace.timezone, brandColor: ctx.workspace.brandColor }, v)),
  ]);
  return { message: "Business details saved." };
}

const sections = ["booking", "time", "contact", "vocabulary", "shop"] as const;
type Section = (typeof sections)[number];

/** Saves one section of the business settings. Unknown fields are dropped; defaults fill gaps. */
export async function updateSettings(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const { section, values } = z.object({ section: z.enum(sections), values: z.record(z.string(), z.unknown()) }).parse(raw);
  const current = ctx.workspace.settings;
  const merged = { ...current, [section]: { ...(current[section as Section] as object), ...values } };
  const parsed = workspaceSettingsSchema.safeParse(merged);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the settings.");
  if (section === "time" && ctx.role !== "owner") throw new Error("Only an owner can change time clock rules.");
  const next: WorkspaceSettings = parseSettings(parsed.data);
  const d = db();
  await batch([
    d.update(workspaces).set({ settings: next }).where(eq(workspaces.id, ctx.workspace.id)),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "settings", ctx.workspace.id, `updated_${section}`, current[section as Section], next[section as Section])),
  ]);
  return { message: "Settings saved." };
}
