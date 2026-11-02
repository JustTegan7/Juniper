// Rules for files attached to a business. Pure, shared with the future phone app.

/** Server uploads stay under Vercel's 4.5 MB request limit. The phone app will upload larger files directly. */
export const FILE_MAX_BYTES = 4 * 1024 * 1024;

export const FILE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

const EXT_TYPES: Record<string, string> = Object.fromEntries(Object.entries(FILE_TYPES).map(([t, e]) => [e, t]));
EXT_TYPES.jpeg = "image/jpeg";

/** Works out a safe content type from the browser's type or the file extension. Null means not allowed. */
export function fileContentType(name: string, browserType: string | null | undefined): string | null {
  if (browserType && FILE_TYPES[browserType]) return browserType;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return EXT_TYPES[ext] ?? null;
}

/** Keeps letters, numbers, dots, dashes and underscores so the name is safe in a storage path. */
export function safeFileName(name: string): string {
  const base = name.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").replace(/-\./g, ".").replace(/^[-.]+|[-.]+$/g, "");
  return (base || "file").slice(-80);
}

export function isImageType(type: string): boolean {
  return type.startsWith("image/") && type !== "image/heic";
}

/** "820 KB", "3.4 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
