"use client";

import { useEffect, useRef, useState } from "react";

const REFRESH_DISTANCE = 60;

function isInteractive(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

export function PullToRefresh({
  enabled,
  onRefresh,
}: {
  enabled: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const startY = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    function reset() {
      startY.current = null;
      distanceRef.current = 0;
      setDistance(0);
    }

    function onTouchStart(event: TouchEvent) {
      if (!enabled || refreshingRef.current || window.scrollY > 0 || isInteractive(event.target)) return;
      startY.current = event.touches[0]?.clientY ?? null;
    }

    function onTouchMove(event: TouchEvent) {
      if (startY.current === null || window.scrollY > 0) return;
      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined) return;
      const delta = currentY - startY.current;
      if (delta <= 0) {
        distanceRef.current = 0;
        setDistance(0);
        return;
      }
      event.preventDefault();
      const next = Math.min(delta * 0.45, 72);
      distanceRef.current = next;
      setDistance(next);
    }

    function onTouchEnd() {
      if (startY.current === null) return;
      const shouldRefresh = distanceRef.current >= REFRESH_DISTANCE;
      startY.current = null;
      if (!shouldRefresh) {
        reset();
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setDistance(REFRESH_DISTANCE);
      void Promise.resolve(onRefresh()).catch(() => {
        refreshingRef.current = false;
        setRefreshing(false);
        reset();
      });
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, [enabled, onRefresh]);

  const ready = distance >= REFRESH_DISTANCE;
  return (
    <div
      className={`pullRefresh ${distance > 0 || refreshing ? "show" : ""}`}
      style={{ transform: `translate(-50%, ${distance - 64}px)` }}
      role="status"
      aria-live="polite"
    >
      <span className={refreshing ? "pullRefreshSpinner" : "pullRefreshArrow"} aria-hidden="true">
        {refreshing ? "" : "↓"}
      </span>
      {refreshing ? "更新中…" : ready ? "離して更新" : "引っ張って更新"}
    </div>
  );
}
