import { describe, expect, it } from "vitest";
import { compareCfiPosition, sortAnnotationsByPosition } from "./annotation-order";

describe("annotation-order", () => {
  it("sorts EPUB CFIs by numeric book position", () => {
    const sorted = sortAnnotationsByPosition([
      { id: "third", cfi: "epubcfi(/6/10!/4/2)", createdAt: 1 },
      { id: "first", cfi: "epubcfi(/6/2!/4/2)", createdAt: 3 },
      { id: "second", cfi: "epubcfi(/6/4!/4/2)", createdAt: 2 },
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });

  it("sorts page CFIs numerically", () => {
    expect(compareCfiPosition("page:2", "page:10")).toBeLessThan(0);
  });

  it("uses created time as a stable tie-breaker for the same position", () => {
    const sorted = sortAnnotationsByPosition([
      { id: "newer", cfi: "epubcfi(/6/2!/4/2)", createdAt: 200 },
      { id: "older", cfi: "epubcfi(/6/2!/4/2)", createdAt: 100 },
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["older", "newer"]);
  });

  it("places annotations without a usable position after positioned annotations", () => {
    const sorted = sortAnnotationsByPosition([
      { id: "missing", createdAt: 1 },
      { id: "blank", cfi: " ", createdAt: 2 },
      { id: "positioned", cfi: "epubcfi(/6/2!/4/2)", createdAt: 3 },
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["positioned", "missing", "blank"]);
  });
});
