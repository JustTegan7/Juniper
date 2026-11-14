/** Product photo rules. The browser shrinks photos first, so the server limit is small. */
export const PHOTO_MAX_BYTES = 2_500_000;
export const PHOTO_MAX_PER_PRODUCT = 8;

export type PhotoKind = "jpeg" | "png" | "webp";

/** Reads the first bytes to confirm the file really is a JPEG, PNG or WebP, whatever its name says. */
export function sniffImage(b: Uint8Array): PhotoKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

export const PHOTO_CONTENT_TYPE: Record<PhotoKind, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const PHOTO_EXT: Record<PhotoKind, string> = { jpeg: "jpg", png: "png", webp: "webp" };
