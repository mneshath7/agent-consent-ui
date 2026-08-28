import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  ActionAuthorization,
  ActionIntent,
  ActionProvider,
  AuthProvider,
} from "./types";

export type SlideStage =
  | "idle"
  | "dragging"
  | "authenticating"
  | "requesting_grant"
  | "success"
  | "declined"
  | "error";

export interface SlideToAuthorizeProps {
  intent: ActionIntent;
  authProvider: AuthProvider;
  actionProvider: ActionProvider;
  onAuthorized: (grant: ActionAuthorization) => void;
  onDeclined?: (reason: string) => void;
  onError?: (error: Error) => void;
  /** Override the idle label. Defaults based on `intent.reversible`. */
  labelIdle?: string;
  /** Shown while the platform authenticator is active. */
  labelAuthenticating?: string;
  /** Optional className on the root for host-app theming. */
  className?: string;
  /** Disable the control (e.g. while parent is loading). */
  disabled?: boolean;
}

/**
 * A physical slide-to-confirm gesture that gates ANY consequential action an
 * AI agent wants to take — a payment, an email sent as you, a file deletion,
 * a document signature, a credential share, a public post.
 *
 * IMPORTANT: completing the slide does NOT authorize the action. It only
 * unlocks `authProvider.authenticate()`, which must be backed by a
 * platform-owned surface this component cannot see or influence.
 * The slider itself carries no security weight.
 */
export function SlideToAuthorize({
  intent,
  authProvider,
  actionProvider,
  onAuthorized,
  onDeclined,
  onError,
  labelIdle,
  labelAuthenticating = "Confirming…",
  className,
  disabled = false,
}: SlideToAuthorizeProps) {
  const [stage, setStage] = useState<SlideStage>("idle");
  const [dragX, setDragX] = useState(0);
  const [trackWidth, setTrackWidth] = useState(320);

  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dragXRef = useRef(0); // always-current value for pointer-up (avoids stale state)
  const pointerIdRef = useRef<number | null>(null);

  const labelId = useId();
  const statusId = useId();

  const thumbSize = 52;
  const padding = 4;
  const maxDrag = Math.max(0, trackWidth - thumbSize - padding * 2);
  const completionThreshold = 0.92;

  const defaultLabel =
    labelIdle ??
    (intent.reversible ? "Slide to confirm" : "Slide to authorize");

  // Measure track width for responsive layout
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setTrackWidth(w);
    });
    ro.observe(el);
    setTrackWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // Inject keyframes once (safe across multiple instances)
  useEffect(() => {
    const id = "s2a-keyframes";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes s2a-spin {
        to { transform: rotate(360deg); }
      }
      @media (prefers-reduced-motion: reduce) {
        .s2a-thumb { transition: none !important; }
      }
    `;
    document.head.appendChild(style);
  }, []);

  const reset = useCallback(() => {
    dragXRef.current = 0;
    setDragX(0);
    setStage("idle");
    pointerIdRef.current = null;
  }, []);

  const runAuthAndGrant = useCallback(async () => {
    setStage("authenticating");
    try {
      const available = await authProvider.isAvailable();
      if (!available) {
        setStage("error");
        onError?.(
          new Error("No trusted auth surface available on this device")
        );
        return;
      }

      const auth = await authProvider.authenticate(intent);
      if (!auth.success) {
        setStage("declined");
        onDeclined?.(auth.reason ?? "unknown");
        return;
      }

      setStage("requesting_grant");
      const grant = await actionProvider.requestAuthorization(intent, auth);
      setStage("success");
      onAuthorized(grant);
    } catch (err) {
      setStage("error");
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [authProvider, actionProvider, intent, onAuthorized, onDeclined, onError]);

  const canInteract =
    !disabled && (stage === "idle" || stage === "dragging");

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!canInteract) return;
      e.preventDefault();
      draggingRef.current = true;
      pointerIdRef.current = e.pointerId;
      setStage("dragging");
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [canInteract]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current || !trackRef.current) return;
      if (
        pointerIdRef.current !== null &&
        e.pointerId !== pointerIdRef.current
      )
        return;

      const rect = trackRef.current.getBoundingClientRect();
      const x = Math.min(
        Math.max(e.clientX - rect.left - thumbSize / 2 - padding, 0),
        maxDrag
      );
      dragXRef.current = x;
      setDragX(x);
    },
    [maxDrag]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      if (
        pointerIdRef.current !== null &&
        e.pointerId !== pointerIdRef.current
      )
        return;

      draggingRef.current = false;
      pointerIdRef.current = null;

      const current = dragXRef.current;
      const completed = current >= maxDrag * completionThreshold;

      if (completed) {
        dragXRef.current = maxDrag;
        setDragX(maxDrag);
        void runAuthAndGrant();
      } else {
        reset();
      }
    },
    [maxDrag, runAuthAndGrant, reset]
  );

  // Keyboard: Space / Enter while focused starts the auth flow (no drag required)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!canInteract) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        dragXRef.current = maxDrag;
        setDragX(maxDrag);
        void runAuthAndGrant();
      }
    },
    [canInteract, maxDrag, runAuthAndGrant]
  );

  const progress = maxDrag > 0 ? dragX / maxDrag : 0;

  const label =
    stage === "authenticating"
      ? labelAuthenticating
      : stage === "requesting_grant"
        ? "Getting authorization…"
        : stage === "success"
          ? "Authorized"
          : stage === "declined"
            ? "Declined — slide to retry"
            : stage === "error"
              ? "Something went wrong — slide to retry"
              : defaultLabel;

  const isBusy =
    stage === "authenticating" || stage === "requesting_grant";
  const isTerminal = stage === "success";

  return (
    <div
      className={className}
      style={{
        ...styles.container,
        opacity: disabled ? 0.55 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
      data-stage={stage}
    >
      <div style={styles.intentRow}>
        <span style={styles.subject}>{intent.subject}</span>
        <span style={styles.consequence}>{intent.consequence}</span>
      </div>
      <div style={styles.description}>{intent.description}</div>

      {!intent.reversible && (
        <div style={styles.irreversibleFlag} role="status">
          Cannot be undone
        </div>
      )}

      {intent.detail && intent.detail.length > 0 && (
        <div style={styles.detailList}>
          {intent.detail.map((d, i) => (
            <div key={i} style={styles.detailRow}>
              <span style={{ opacity: 0.7 }}>{d.label}</span>
              <span>{d.value}</span>
            </div>
          ))}
        </div>
      )}

      <div style={styles.requestedBy}>
        Requested by {intent.requestedBy.agentName}
      </div>

      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={label}
        aria-labelledby={labelId}
        aria-describedby={statusId}
        aria-disabled={disabled || isBusy || isTerminal}
        tabIndex={canInteract ? 0 : -1}
        style={{
          ...styles.track,
          opacity: isBusy ? 0.7 : 1,
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        {/* Progress fill */}
        <div
          style={{
            ...styles.fill,
            width: `${Math.max(progress * 100, 0)}%`,
            opacity: stage === "success" ? 1 : 0.85,
            background:
              stage === "success"
                ? "linear-gradient(90deg, #059669, #10b981)"
                : "linear-gradient(90deg, #374151, #4b5563)",
          }}
        />

        <span id={labelId} style={styles.trackLabel}>
          {label}
        </span>

        <div
          ref={thumbRef}
          className="s2a-thumb"
          style={{
            ...styles.thumb,
            width: thumbSize,
            height: thumbSize,
            transform: `translateX(${dragX}px)`,
            cursor: canInteract ? "grab" : "default",
            transition:
              stage === "dragging"
                ? "none"
                : "transform 0.18s ease-out",
          }}
          onPointerDown={handlePointerDown}
        >
          {isBusy ? (
            <Spinner />
          ) : stage === "success" ? (
            <span aria-hidden>✓</span>
          ) : (
            <span aria-hidden>→</span>
          )}
        </div>
      </div>

      <div id={statusId} style={styles.srOnly} aria-live="polite">
        {stage === "success"
          ? "Action authorized"
          : stage === "declined"
            ? "Authorization declined"
            : stage === "error"
              ? "Authorization failed"
              : ""}
      </div>

      {(stage === "declined" || stage === "error") && (
        <button type="button" style={styles.retryButton} onClick={reset}>
          Reset
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 20,
        height: 20,
        border: "2px solid rgba(255,255,255,0.35)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "s2a-spin 0.7s linear infinite",
      }}
      aria-hidden
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: 20,
    borderRadius: 16,
    background: "var(--s2a-bg, #111318)",
    color: "var(--s2a-fg, #fff)",
    maxWidth: 400,
    width: "100%",
    boxSizing: "border-box",
  },
  intentRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
    gap: 12,
  },
  subject: {
    fontSize: 15,
    fontWeight: 500,
    opacity: 0.85,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  consequence: {
    fontSize: 20,
    fontWeight: 600,
    textAlign: "right",
    flexShrink: 0,
  },
  description: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 2,
    lineHeight: 1.4,
  },
  irreversibleFlag: {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 500,
    color: "#fca5a5",
    background: "rgba(248,113,113,0.12)",
    borderRadius: 6,
    padding: "2px 8px",
    marginTop: 6,
  },
  detailList: {
    marginTop: 10,
    marginBottom: 4,
    borderTop: "1px solid var(--s2a-border, #262a33)",
    paddingTop: 8,
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    padding: "3px 0",
    gap: 12,
  },
  requestedBy: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 10,
    marginBottom: 16,
  },
  track: {
    position: "relative",
    height: 60,
    borderRadius: 30,
    background: "var(--s2a-track, #1d2029)",
    display: "flex",
    alignItems: "center",
    padding: 4,
    userSelect: "none",
    touchAction: "none",
    overflow: "hidden",
    outline: "none",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 30,
    transition: "background 0.2s ease",
    pointerEvents: "none",
  },
  trackLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 14,
    opacity: 0.65,
    pointerEvents: "none",
    zIndex: 1,
  },
  thumb: {
    position: "absolute",
    left: 4,
    borderRadius: "50%",
    background: "linear-gradient(180deg, #4b5563, #1f2937)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
    zIndex: 2,
    color: "#fff",
    touchAction: "none",
  },
  retryButton: {
    marginTop: 12,
    fontSize: 13,
    background: "transparent",
    color: "#9ca3af",
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "6px 12px",
    cursor: "pointer",
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: 0,
  },
};
