"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getCtx, type Ctx } from "../../lib/services/ctx";
import * as team from "../../lib/services/team";

// Thin wrappers: build ctx, call a service, refresh the pages.
export type ActionResult = { ok: true; message: string; id?: string } | { ok: false; error: string };

async function run(fn: (ctx: Ctx) => Promise<{ message: string; id?: string }>): Promise<ActionResult> {
  const ctx = await getCtx();
  try {
    const res = await fn(ctx);
    revalidatePath("/", "layout");
    return { ok: true, ...res };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
    if (e instanceof Error) return { ok: false, error: e.message };
    return { ok: false, error: "Something went wrong." };
  }
}

const formObj = (f: FormData) => Object.fromEntries([...f.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));

export async function setTemporaryPasswordAction(f: FormData) {
  return run((ctx) => team.setTemporaryPassword(ctx, formObj(f)));
}
