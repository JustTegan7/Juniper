import { describe, expect, it } from "vitest";
import { fileContentType, formatBytes, isImageType, safeFileName } from "./files";

describe("file rules", () => {
  it("allows known types by browser type or extension", () => {
    expect(fileContentType("a.png", "image/png")).toBe("image/png");
    expect(fileContentType("Proposal.PDF", "")).toBe("application/pdf");
    expect(fileContentType("photo.jpeg", "application/octet-stream")).toBe("image/jpeg");
    expect(fileContentType("run.exe", "application/x-msdownload")).toBeNull();
    expect(fileContentType("page.html", "text/html")).toBeNull();
  });
  it("makes names safe for storage paths", () => {
    expect(safeFileName("Barclay's Salon logo (final).png")).toBe("Barclay-s-Salon-logo-final.png");
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFileName("???")).toBe("file");
  });
  it("formats sizes and spots images", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
    expect(isImageType("image/png")).toBe(true);
    expect(isImageType("application/pdf")).toBe(false);
  });
});
