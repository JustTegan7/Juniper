/**
 * FormData to a plain object for server actions. Fields named "x[]" become arrays.
 * Checkboxes send "on" when ticked and nothing when not, so zod's coerce.boolean
 * with a false default reads them correctly.
 */
export function formObject(f: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of f.entries()) {
    if (typeof v !== "string") continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      (out[key] ??= [] as string[]);
      (out[key] as string[]).push(v);
    } else out[k] = v;
  }
  return out;
}
