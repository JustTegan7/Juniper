import { NextResponse, type NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { isManager } from "@evergreen/core";
import { uuidv7 } from "uuidv7";
import { getCtx } from "../../../../lib/services/ctx";
import { PHOTO_CONTENT_TYPE, PHOTO_EXT, PHOTO_MAX_BYTES, sniffImage } from "../../../../lib/photo";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Uploads one product photo and returns its public link. Owners and managers only. */
export async function POST(req: NextRequest) {
  const ctx = await getCtx();
  if (!isManager(ctx.role)) return fail("Not allowed", 403);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return fail("Photo upload is not set up yet. Paste an image link instead.", 503);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Choose a photo.", 400);
  if (file.size > PHOTO_MAX_BYTES) return fail("That photo is too large. Try a smaller one.", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return fail("Use a JPG, PNG or WebP photo.", 415);

  const blob = await put(`${ctx.workspace.id}/products/${uuidv7()}.${PHOTO_EXT[kind]}`, file, { access: "public", contentType: PHOTO_CONTENT_TYPE[kind], addRandomSuffix: false });
  return NextResponse.json({ url: blob.url });
}
