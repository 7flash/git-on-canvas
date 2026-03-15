// @ts-nocheck
/**
 * Loading progress overlay.
 * Uses melina/client JSX + render.
 */
import { render } from "melina/client";
import type { CanvasContext } from "./context";

function LoadingOverlayContent({
  message,
  sub,
  progress,
}: {
  message: string;
  sub: string;
  progress?: number;
}) {
  return (
    <div className="loading-content">
      <div className="loading-spinner"></div>
      <div className="loading-message">{message}</div>
      <div className="loading-sub">{sub}</div>
      {progress !== undefined && (
        <div className="loading-progress-container">
          <div className="loading-progress-bar">
            <div
              className="loading-progress-fill"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="loading-progress-text">{Math.round(progress)}%</div>
        </div>
      )}
    </div>
  );
}

let currentMessage = "";
let currentSub = "";
let currentProgress: number | undefined;

export function showLoadingProgress(
  ctx: CanvasContext,
  message: string,
  progress?: number,
) {
  if (!ctx.loadingOverlay) {
    ctx.loadingOverlay = document.createElement("div");
    ctx.loadingOverlay.className = "loading-overlay";
    document.body.appendChild(ctx.loadingOverlay);
  }
  currentMessage = message;
  currentSub = "";
  currentProgress = progress;
  render(
    <LoadingOverlayContent
      message={currentMessage}
      sub={currentSub}
      progress={currentProgress}
    />,
    ctx.loadingOverlay,
  );
  ctx.loadingOverlay.classList.add("active");
}

export function updateLoadingProgress(
  ctx: CanvasContext,
  sub: string,
  progress?: number,
) {
  if (ctx.loadingOverlay) {
    currentSub = sub;
    if (progress !== undefined) currentProgress = progress;
    render(
      <LoadingOverlayContent
        message={currentMessage}
        sub={currentSub}
        progress={currentProgress}
      />,
      ctx.loadingOverlay,
    );
  }
}

export function hideLoadingProgress(ctx: CanvasContext) {
  if (ctx.loadingOverlay) {
    ctx.loadingOverlay.classList.remove("active");
  }
}
