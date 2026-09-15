import { describe, expect, it } from "vitest";
import { normalizeLocationName } from "./normalize-location-name";

describe("normalizeLocationName", () => {
  it("normalizes uppercase and lowercase", () => {
    expect(normalizeLocationName("MAIN OFFICE")).toBe("main office");
    expect(normalizeLocationName("Main Office")).toBe("main office");
  });

  it("removes Spanish accents", () => {
    expect(normalizeLocationName("Área de Producción")).toBe(
      "area de produccion",
    );
    expect(normalizeLocationName("ÁREA DE PRODUCCIÓN")).toBe(
      "area de produccion",
    );
  });

  it("preserves ñ as a distinct letter", () => {
    expect(normalizeLocationName("Peña")).toBe("peña");
    expect(normalizeLocationName("Pena")).toBe("pena");

    expect(normalizeLocationName("Peña")).not.toBe(
      normalizeLocationName("Pena"),
    );
  });

  it("normalizes punctuation and separators", () => {
    expect(normalizeLocationName("Área-de-Producción")).toBe(
      "area de produccion",
    );

    expect(normalizeLocationName("Área, de Producción")).toBe(
      "area de produccion",
    );
  });

  it("normalizes repeated and surrounding spaces", () => {
    expect(normalizeLocationName("   Área   de   Producción   ")).toBe(
      "area de produccion",
    );
  });

  it("produces the same key for equivalent location names", () => {
    const names = [
      "Área de Producción",
      "AREA DE PRODUCCION",
      "Área-de-Producción",
      "Área, de Producción",
      "  área   de producción  ",
    ];

    const keys = names.map(normalizeLocationName);

    expect(new Set(keys).size).toBe(1);
  });

  it("does not treat real spelling differences as identical", () => {
    expect(normalizeLocationName("Bodega Principal")).not.toBe(
      normalizeLocationName("Bodeja Principal"),
    );
  });
});
