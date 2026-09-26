"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function playCalmTone() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(523, context.currentTime);
  oscillator.frequency.setValueAtTime(659, context.currentTime + 0.15);
  gain.gain.setValueAtTime(0.07, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.35);
  oscillator.addEventListener("ended", () => void context.close());
}

type GuestAlertSettings = {
  enabled: boolean;
  sound: boolean;
  vibration: boolean;
};

const defaults: GuestAlertSettings = {
  enabled: false,
  sound: true,
  vibration: true,
};

export function useGuestAlerts(eventKey: string, message: string) {
  const storageKey = "assettrack_guest_alert_settings";
  const previousKey = useRef("");
  const initialized = useRef(false);
  const [settings, setSettings] = useState(defaults);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(storageKey) ?? "null",
      ) as GuestAlertSettings | null;
      if (saved) setSettings(saved);
    } catch {
      setSettings(defaults);
    }
  }, []);

  const notify = useCallback(
    (nextMessage: string, nextSettings = settings) => {
      setNotice(nextMessage);
      if (!nextSettings.enabled) return;
      if (nextSettings.sound) playCalmTone();
      if (nextSettings.vibration && "vibrate" in navigator) {
        navigator.vibrate(100);
      }
    },
    [settings],
  );

  useEffect(() => {
    if (!eventKey) return;
    if (!initialized.current) {
      initialized.current = true;
      previousKey.current = eventKey;
      return;
    }
    if (previousKey.current === eventKey) return;
    previousKey.current = eventKey;
    notify(message);
  }, [eventKey, message, notify]);

  function save(next: GuestAlertSettings) {
    setSettings(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function enableAndTest() {
    const next = { ...settings, enabled: true };
    save(next);
    notify(
      "Alertas activadas. Le mantendremos informado con tranquilidad.",
      next,
    );
  }

  function disable() {
    save({ ...settings, enabled: false });
    if ("vibrate" in navigator) navigator.vibrate(0);
  }

  function setSound(sound: boolean) {
    save({ ...settings, sound });
  }

  function setVibration(vibration: boolean) {
    save({ ...settings, vibration });
  }

  return {
    settings,
    notice,
    enableAndTest,
    disable,
    setSound,
    setVibration,
  };
}
