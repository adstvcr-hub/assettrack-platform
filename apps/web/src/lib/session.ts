// Keep the current tab's identity while allowing a mobile browser to restore
// its work session when it recreates the tab. Explicit sign-out clears both.
export function getSessionValue(key: string): string | null {
  const current = sessionStorage.getItem(key);
  if (current) {
    localStorage.setItem(key, current);
    return current;
  }
  const saved = localStorage.getItem(key);
  if (saved) sessionStorage.setItem(key, saved);
  return saved;
}

export function setSessionValue(key: string, value: string) {
  sessionStorage.setItem(key, value);
  localStorage.setItem(key, value);
}

export function removeSessionValue(key: string) {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}
