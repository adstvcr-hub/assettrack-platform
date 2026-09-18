import { describe, expect, it } from "vitest";
import { locationNameSimilarity } from "./location-name-similarity";

describe("locationNameSimilarity", () => {
  it("returns 1 for normalized equivalent names", () => {
    expect(locationNameSimilarity("Main Office", "MÁIN---OFFICE!!!")).toBe(1);
  });

  it("detects a likely single-character typo", () => {
    expect(
      locationNameSimilarity("Bodega Principal", "Bodeja Principal"),
    ).toBeGreaterThan(0.9);
  });

  it("treats accents as equivalent", () => {
    expect(
      locationNameSimilarity("Almacén Principal", "Almacen Principal"),
    ).toBe(1);
  });

  it("detects a missing character", () => {
    expect(
      locationNameSimilarity("Bodega Central", "Bodeg Central"),
    ).toBeGreaterThan(0.9);
  });

  it("does not consider clearly different locations almost identical", () => {
    expect(
      locationNameSimilarity("Planta Norte", "Bodega Central"),
    ).toBeLessThan(0.7);
  });
  it("detects Bodeja Principa as similar to Bodeja Principal", () => {
    const similarity = locationNameSimilarity(
      "Bodeja Principa",
      "Bodeja Principal",
    );

    expect(similarity).toBeGreaterThanOrEqual(0.9);
  });

  it("distinguishes meaningful directional differences", () => {
    expect(locationNameSimilarity("Planta Norte", "Planta Sur")).toBeLessThan(
      0.9,
    );
  });
});
