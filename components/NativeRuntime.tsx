"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

const APP_HOSTS = new Set(["via-mi.com", "www.via-mi.com"]);

export function NativeRuntime() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const platform = Capacitor.getPlatform();
    document.documentElement.dataset.nativePlatform = platform;

    const appUrlListener = App.addListener("appUrlOpen", ({ url }) => {
      try {
        const target = new URL(url);
        if (!APP_HOSTS.has(target.hostname)) return;
        window.location.assign(`${target.pathname}${target.search}${target.hash}`);
      } catch {
        // Ignore malformed external URLs.
      }
    });

    const onPointerUp = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest("button, a, [role='button']");
      if (!control || control.hasAttribute("disabled")) return;
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    };

    document.addEventListener("pointerup", onPointerUp, { passive: true });

    return () => {
      document.removeEventListener("pointerup", onPointerUp);
      void appUrlListener.then((listener) => listener.remove());
      delete document.documentElement.dataset.nativePlatform;
    };
  }, []);

  return null;
}
