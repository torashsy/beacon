"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    const update = () => void registration?.update();

    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((next) => {
        registration = next;
        return next.update();
      })
      .catch(() => {});

    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", update);
    };
  }, []);

  return null;
}
