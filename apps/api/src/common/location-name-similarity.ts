import { normalizeLocationName } from "./normalize-location-name";

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const columns = b.length + 1;

  const matrix = Array.from({ length: rows }, () =>
    Array<number>(columns).fill(0),
  );

  for (let i = 0; i < rows; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j < columns; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

export function locationNameSimilarity(a: string, b: string): number {
  const normalizedA = normalizeLocationName(a);
  const normalizedB = normalizeLocationName(b);

  if (normalizedA === normalizedB) {
    return 1;
  }

  const longestLength = Math.max(normalizedA.length, normalizedB.length);

  if (longestLength === 0) {
    return 1;
  }

  const distance = levenshteinDistance(normalizedA, normalizedB);

  return 1 - distance / longestLength;
}