"use client";

import { useEffect, useRef, useState } from "react";

const REFRESH_DISTANCE = 54;
const SETTLE_DISTANCE = 42;
const MAX_DISTANCE = 84;
const RELEASE_DELAY = 170;

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
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [distance, setDistance] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    function reset() {
      startY.current = null;
      distanceRef.current = 0;
      setDragging(false);
      setDistance(0);
    }

    function finishRefresh() {
      refreshingRef.current = false;
      setRefreshing(false);
      reset();
    }

    function onTouchStart(event: TouchEvent) {
      if (!enabled || refreshingRef.current || window.scrollY > 0 || isInteractive(event.target)) return;
      startY.current = event.touches[0]?.clientY ?? null;
      setDragging(startY.current !== null);
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
      const next = Math.min(delta * 0.42, MAX_DISTANCE);
      distanceRef.current = next;
      setDistance(next);
    }

    function onTouchEnd() {
      if (startY.current === null) return;
      const shouldRefresh = distanceRef.current >= REFRESH_DISTANCE;
      startY.current = null;
      setDragging(false);
      if (!shouldRefresh) {
        reset();
        return;
      }

      refreshingRef.current = true;
      setRefreshing(true);
      distanceRef.current = SETTLE_DISTANCE;
      setDistance(SETTLE_DISTANCE);
      releaseTimer.current = setTimeout(() => {
        void Promise.resolve(onRefresh())
          .then(() => new Promise((resolve) => setTimeout(resolve, 320)))
          .finally(finishRefresh);
      }, RELEASE_DELAY);
    }

    function onTouchCancel() {
      if (!refreshingRef.current) reset();
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
    };
  }, [enabled, onRefresh]);

  const ready = distance >= REFRESH_DISTANCE;
  const progress = Math.min(distance / REFRESH_DISTANCE, 1);
  const stateClass = refreshing ? "refreshing" : ready ? "ready" : dragging ? "dragging" : "";

  return (
    <div
      className={`pullRefresh ${distance > 0 || refreshing ? "show" : ""} ${stateClass}`}
      style={{ transform: `translate3d(-50%, ${distance - 64}px, 0)` }}
      role="status"
      aria-live="polite"
    >
      {refreshing ? (
        <span className="pullRefreshSpinner" aria-hidden="true" />
      ) : (
        <svg
          className="pullRefreshArrow"
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{ transform: `rotate(${progress * 180}deg) scale(${0.82 + progress * 0.18})` }}
        >
          <path d="M12 4v14M7 13l5 5 5-5" />
        </svg>
      )}
      <span>{refreshing ? "更新中…" : ready ? "離して更新" : "引っ張って更新"}</span>
    </div>
  );
}
