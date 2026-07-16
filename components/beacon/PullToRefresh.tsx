"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const REFRESH_DISTANCE = 58;
const HOLD_DISTANCE = 52;
const PULL_ASYMPTOTE = 118;
const PULL_RESISTANCE = 0.9;
const MIN_SPIN_TIME = 700;

function isInteractive(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

export function PullToRefresh({
  enabled,
  onRefresh,
  children,
}: {
  enabled: boolean;
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}) {
  const startY = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);
  const [distance, setDistance] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    function reset() {
      startY.current = null;
      distanceRef.current = 0;
      setDragging(false);
      setDistance(0);
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
      // Approach the visual limit gradually instead of clamping at a hard stop.
      // This is the same rubber-band shape used by native overscroll interactions.
      const resisted = (delta * PULL_ASYMPTOTE * PULL_RESISTANCE)
        / (PULL_ASYMPTOTE + delta * PULL_RESISTANCE);
      distanceRef.current = Math.max(0, resisted);
      setDistance(distanceRef.current);
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
      distanceRef.current = 0;
      setDistance(0);
      const started = performance.now();
      void Promise.resolve(onRefreshRef.current()).catch(() => {}).finally(() => {
        const remaining = Math.max(0, MIN_SPIN_TIME - (performance.now() - started));
        settleTimer.current = window.setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          reset();
        }, remaining);
      });
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
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [enabled]);

  const ready = distance >= REFRESH_DISTANCE;
  const progress = Math.min(distance / REFRESH_DISTANCE, 1);
  const phase = refreshing ? "refreshing" : ready ? "ready" : dragging ? "dragging" : "idle";
  const indicatorDistance = refreshing ? HOLD_DISTANCE : distance;
  const indicatorOffset = Math.max(-38, Math.min(12, indicatorDistance - 46));

  return (
    <>
      <div
        className={`pullRefresh ${distance > 0 || refreshing ? "show" : ""} ${phase}`}
        style={{
          opacity: distance > 0 || refreshing ? Math.min(1, distance / 18) : undefined,
          transform: `translate3d(-50%, ${indicatorOffset}px, 0)`,
        }}
        role="status"
        aria-live="polite"
        aria-label={refreshing ? "更新中" : ready ? "離して更新" : "引っ張って更新"}
      >
        {refreshing ? (
          <span className="pullRefreshSpinner" aria-hidden="true" />
        ) : (
          <span
            className="pullRefreshProgress"
            aria-hidden="true"
            style={{ transform: `rotate(${progress * 260}deg) scale(${0.72 + progress * 0.28})` }}
          />
        )}
      </div>
      <div
        className={`pullRefreshSurface ${phase}`}
        style={{ transform: `translate3d(0, ${distance}px, 0)` }}
      >
        {children}
      </div>
    </>
  );
}
