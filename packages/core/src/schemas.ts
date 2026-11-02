import { z } from "zod";

// Reusable zod building blocks. App-specific input schemas live next to the app's
// domain code and build on these.

/** A day-level date, "YYYY-MM-DD". */
export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date");

/** Optional trimmed text. Empty strings become null. */
export const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

/** Optional email, lowercased. Empty becomes null. */
export const optEmail = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || z.email().safeParse(v).success, "Check the email");

export const idInput = z.object({ id: z.string().uuid() });
