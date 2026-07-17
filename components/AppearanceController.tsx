"use client";

import { useEffect } from "react";
import {
  APPEARANCE_EVENT,
  applyAppearance,
  loadAppearance,
} from "@/lib/beacon/appearance";

function syncThemeColor() {
  const pageColor = getComputedStyle(document.body).backgroundColor;
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    meta.content = pageColor;
  }
}

export function AppearanceController() {
  useEffect(() => {
    applyAppearance(loadAppearance());
    syncThemeColor();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => syncThemeColor();
    const onAppearance = () => syncThemeColor();
    media.addEventListener("change", onChange);
    window.addEventListener(APPEARANCE_EVENT, onAppearance);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener(APPEARANCE_EVENT, onAppearance);
    };
  }, []);

  return null;
}
