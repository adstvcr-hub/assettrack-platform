"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function playTone() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  oscillator.frequency.setValueAtTime(1175, context.currentTime + 0.18);
  gain.gain.setValueAtTime(0.18, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.42);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.42);
  oscillator.addEventListener("ended", () => void context.close());
}

export function useOperationalAlerts(channel: string, actionKeys: string[]) {
  const storageKey = `assettrack_alerts_${channel}`;
  const initialized = useRef(false);
  const previous = useRef(new Set<string>());
  const [enabled, setEnabled] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setEnabled(window.localStorage.getItem(storageKey) === "enabled");
  }, [storageKey]);

  const notify = useCallback(() => {
    playTone();
    if ("vibrate" in navigator) navigator.vibrate([250, 120, 250]);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 5000);
  }, []);

  useEffect(() => {
    const next = new Set(actionKeys);
    if (!initialized.current) {
      previous.current = next;
      initialized.current = true;
      return;
    }
    const hasNewAction = actionKeys.some((key) => !previous.current.has(key));
    previous.current = next;
    if (enabled && hasNewAction) notify();
  }, [actionKeys, enabled, notify]);

  function enableAndTest() {
    window.localStorage.setItem(storageKey, "enabled");
    setEnabled(true);
    notify();
  }

  function disable() {
    window.localStorage.removeItem(storageKey);
    setEnabled(false);
    if ("vibrate" in navigator) navigator.vibrate(0);
  }

  return { enabled, flash, enableAndTest, disable };
}
