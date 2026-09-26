"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function playTone() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  oscillator.frequency.setValueAtTime(1175, context.currentTime + 0.18);
  gain.gain.setValueAtTime(0.12, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.42);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.42);
  oscillator.addEventListener("ended", () => void context.close());
}

type OperationalAlertOptions = {
  maxAttempts?: number | null;
  repeatMs?: number;
};

export function useOperationalAlerts(
  channel: string,
  actionKeys: string[],
  options: OperationalAlertOptions = {},
) {
  const { maxAttempts = 3, repeatMs = 12_000 } = options;
  const storageKey = `assettrack_alerts_${channel}`;
  const attemptsKey = `${storageKey}_attempts`;
  const attempts = useRef<Record<string, number>>({});
  const skipNextImmediate = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const signature = [...new Set(actionKeys)].sort().join("|");
  const uniqueKeys = useMemo(
    () => (signature ? signature.split("|") : []),
    [signature],
  );

  useEffect(() => {
    setEnabled(window.localStorage.getItem(storageKey) === "enabled");
    try {
      attempts.current = JSON.parse(
        window.sessionStorage.getItem(attemptsKey) ?? "{}",
      );
    } catch {
      attempts.current = {};
    }
  }, [attemptsKey, storageKey]);

  const notify = useCallback(() => {
    playTone();
    if ("vibrate" in navigator) navigator.vibrate([250, 120, 250]);
  }, []);

  useEffect(() => {
    const active = new Set(uniqueKeys);
    for (const key of Object.keys(attempts.current)) {
      if (!active.has(key)) delete attempts.current[key];
    }
    window.sessionStorage.setItem(
      attemptsKey,
      JSON.stringify(attempts.current),
    );
    if (!enabled || uniqueKeys.length === 0) return;

    const notifyPending = () => {
      const eligible = uniqueKeys.filter(
        (key) =>
          maxAttempts === null || (attempts.current[key] ?? 0) < maxAttempts,
      );
      if (!eligible.length) return;
      for (const key of eligible) {
        attempts.current[key] = (attempts.current[key] ?? 0) + 1;
      }
      window.sessionStorage.setItem(
        attemptsKey,
        JSON.stringify(attempts.current),
      );
      notify();
    };

    if (skipNextImmediate.current) {
      skipNextImmediate.current = false;
    } else {
      notifyPending();
    }
    const timer = window.setInterval(notifyPending, repeatMs);
    return () => window.clearInterval(timer);
  }, [attemptsKey, enabled, maxAttempts, notify, repeatMs, uniqueKeys]);

  function enableAndTest() {
    window.localStorage.setItem(storageKey, "enabled");
    skipNextImmediate.current = uniqueKeys.length > 0;
    setEnabled(true);
    notify();
  }

  function disable() {
    window.localStorage.removeItem(storageKey);
    setEnabled(false);
    if ("vibrate" in navigator) navigator.vibrate(0);
  }

  return {
    enabled,
    flash: uniqueKeys.length > 0,
    activeCount: uniqueKeys.length,
    enableAndTest,
    disable,
  };
}
