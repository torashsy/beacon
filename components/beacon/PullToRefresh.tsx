"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const REFRESH_DISTANCE = 58;
const HOLD_DISTANCE = 52;
const PULL_ASYMPTOTE = 118;
const PULL_RESISTANCE = 0.9;
const MIN_SPIN_TIME = 850;
const RETURN_DURATION = 420;

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
  const returnTimer = useRef<number | null>(null);
  const moveFrame = useRef<number | null>(null);
  const pendingDistance = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  const [distance, setDistance] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    function cancelMoveFrame() {
      if (moveFrame.current === null) return;
      cancelAnimationFrame(moveFrame.current);
      moveFrame.current = null;
    }

    function renderDistance(nextDistance: number) {
      distanceRef.current = nextDistance;
      pendingDistance.current = nextDistance;
      if (moveFrame.current !== null) return;
      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = null;
        setDistance(pendingDistance.current);
      });
    }

    function reset() {
      cancelMoveFrame();
      startY.current = null;
      distanceRef.current = 0;
      pendingDistance.current = 0;
      setDragging(false);
      setDistance(0);
    }

    function onTouchStart(event: TouchEvent) {
      if (!enabled || refreshingRef.current || window.scrollY > 0 || isInteractive(event.target)) return;
      // The previous refresh may still be visually springing back. Let a new
      // gesture take control immediately instead of making the user wait for
      // the return animation to finish.
      if (returnTimer.current !== null) {
        clearTimeout(returnTimer.current);
        returnTimer.current = null;
        setRefreshing(false);
        setReturning(false);
      }
      startY.current = event.touches[0]?.clientY ?? null;
      setDragging(startY.current !== null);
    }

    function onTouchMove(event: TouchEvent) {
      if (startY.current === null || window.scrollY > 0) return;
      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined) return;
      const delta = currentY - startY.current;
      if (delta <= 0) {
        renderDistance(0);
        return;
      }

      event.preventDefault();
      // Approach the visual limit gradually instead of clamping at a hard stop.
      // This is the same rubber-band shape used by native overscroll interactions.
      const resisted = (delta * PULL_ASYMPTOTE * PULL_RESISTANCE)
        / (PULL_ASYMPTOTE + delta * PULL_RESISTANCE);
      renderDistance(Math.max(0, resisted));
    }

    function onTouchEnd() {
      if (startY.current === null) return;
      const shouldRefresh = distanceRef.current >= REFRESH_DISTANCE;
      cancelMoveFrame();
      startY.current = null;
      setDragging(false);
      if (!shouldRefresh) {
        reset();
        return;
      }

      refreshingRef.current = true;
      setRefreshing(true);
      distanceRef.current = HOLD_DISTANCE;
      setDistance(HOLD_DISTANCE);
      const started = performance.now();
      void Promise.resolve(onRefreshRef.current()).catch(() => {}).finally(() => {
        const remaining = Math.max(0, MIN_SPIN_TIME - (performance.now() - started));
        settleTimer.current = window.setTimeout(() => {
          setReturning(true);
          // Network refresh is complete. The remaining motion is cosmetic and
          // must not block the next pull gesture.
          refreshingRef.current = false;
          distanceRef.current = 0;
          setDistance(0);
          returnTimer.current = window.setTimeout(() => {
            returnTimer.current = null;
            setRefreshing(false);
            setReturning(false);
            reset();
          }, RETURN_DURATION);
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
      cancelMoveFrame();
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (returnTimer.current) clearTimeout(returnTimer.current);
    };
  }, [enabled]);

  const ready = distance >= REFRESH_DISTANCE;
  const progress = Math.min(distance / REFRESH_DISTANCE, 1);
  const phase = returning ? "returning" : refreshing ? "refreshing" : ready ? "ready" : dragging ? "dragging" : "idle";
  const indicatorDistance = refreshing && !returning ? HOLD_DISTANCE : distance;
  const indicatorOffset = Math.max(-38, Math.min(12, indicatorDistance - 46));

  return (
    <>
      <div
        className={`pullRefresh ${distance > 0 || refreshing ? "show" : ""} ${phase}`}
        style={{
          opacity: returning ? 0 : refreshing ? 1 : distance > 0 ? Math.min(1, distance / 18) : undefined,
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
        // distance 0 のとき transform を残すと、恒等変換でも子孫の position: fixed の
        // 基準がこの要素になり、モーダルが画面外(ページ下端)に配置されてしまう。
        style={distance > 0 ? { transform: `translate3d(0, ${distance}px, 0)` } : undefined}
      >
        {children}
      </div>
    </>
  );
}
