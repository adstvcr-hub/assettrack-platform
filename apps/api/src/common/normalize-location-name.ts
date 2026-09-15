export function normalizeLocationName(value: string): string {
  const ENYE_PLACEHOLDER = "__enye__";

  return value
    .trim()
    .toLocaleLowerCase("es")
    .replace(/ñ/g, ENYE_PLACEHOLDER)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(new RegExp(ENYE_PLACEHOLDER, "g"), "ñ")
    .replace(/[.,;:!?¿¡'"()[\]{}\\/|_+=*&%$#@~`´^<>-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
