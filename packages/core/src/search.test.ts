import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyScore } from "./search";

const biz = [
  { name: "Barclay's Salon", niche: "Hair salon", contact: "Ryan" },
  { name: "Tata's Mexican", niche: "Restaurant", contact: null },
  { name: "Salon Bella", niche: "Hair", contact: "Bella" },
  { name: "Mill Creek Auto", niche: "Auto repair", contact: "Sam" },
];
const fields = (b: (typeof biz)[number]) => [b.name, b.niche, b.contact];

describe("fuzzy search", () => {
  it("ranks prefix over word start over scattered letters", () => {
    expect(fuzzyScore("sal", "Salon Bella")!).toBeGreaterThan(fuzzyScore("sal", "Barclay's Salon")!);
    expect(fuzzyScore("sal", "Barclay's Salon")!).toBeGreaterThan(fuzzyScore("sln", "Barclay's Salon")!);
    expect(fuzzyScore("xyz", "Barclay's Salon")).toBeNull();
  });
  it("matches name, niche or contact", () => {
    expect(fuzzyFilter("salon", biz, fields).map((b) => b.name)).toEqual(["Salon Bella", "Barclay's Salon"]);
    expect(fuzzyFilter("restaurant", biz, fields).map((b) => b.name)).toEqual(["Tata's Mexican"]);
    expect(fuzzyFilter("ryan", biz, fields).map((b) => b.name)).toEqual(["Barclay's Salon"]);
    expect(fuzzyFilter("mca", biz, fields)[0].name).toBe("Mill Creek Auto");
  });
  it("keeps order and limits on an empty query", () => {
    expect(fuzzyFilter("", biz, fields, 2)).toHaveLength(2);
  });
});
