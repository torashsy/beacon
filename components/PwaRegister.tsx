"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    const revisionKey = "via-mi:revision";
    let checkingRevision = false;
    const checkRevision = async () => {
      if (checkingRevision) return;
      checkingRevision = true;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const { revision } = await response.json() as { revision?: string };
        if (!revision || revision === "local") return;
        const previous = window.localStorage.getItem(revisionKey);
        window.localStorage.setItem(revisionKey, revision);
        if (previous && previous !== revision) window.location.reload();
      } catch {
        /* 次に画面を開いたとき再確認する */
      } finally {
        checkingRevision = false;
      }
    };

    void checkRevision();
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkRevision();
    };
    window.addEventListener("online", checkRevision);
    document.addEventListener("visibilitychange", onVisible);

    if (!("serviceWorker" in navigator)) {
      return () => {
        window.removeEventListener("online", checkRevision);
        document.removeEventListener("visibilitychange", onVisible);
      };
    }

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
      window.removeEventListener("online", checkRevision);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", update);
    };
  }, []);

  return null;
}
