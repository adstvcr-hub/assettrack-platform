export function formatScanDate(scannedAt: string, timezone?: string | null) {
  const date = new Date(scannedAt);

  try {
    return date.toLocaleString(undefined, {
      timeZone: timezone || undefined,
      timeZoneName: "short",
    });
  } catch {
    return date.toLocaleString();
  }
}
