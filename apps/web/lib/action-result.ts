import "server-only";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { ConflictError } from "./services/appointments";

export type ActionResult =
  | { ok: true; message: string; id?: string; data?: string }
  | { ok: false; error: string; conflict?: boolean };

/** Runs a service call and turns its outcome into something the browser can show. */
export async function toResult(fn: () => Promise<{ message: string; id?: string; data?: string }>, revalidate = true): Promise<ActionResult> {
  try {
    const res = await fn();
    if (revalidate) revalidatePath("/", "layout");
    return { ok: true, ...res };
  } catch (e) {
    // Let Next.js redirects and not-found pass through.
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_")) throw e;
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
    if (e instanceof ConflictError) return { ok: false, error: e.message, conflict: true };
    if (e instanceof Error) {
      console.error(e);
      return { ok: false, error: e.message };
    }
    return { ok: false, error: "Something went wrong." };
  }
}
