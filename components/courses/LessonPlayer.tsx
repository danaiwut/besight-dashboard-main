"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import Icon from "../Icon";
import type { CourseLessonDto } from "../../lib/courses";

/* ── Lesson player (shared by the customer watch page and the CRM preview) ──
   Uses the YouTube IFrame API so a lesson can be a chapter range inside a
   longer video, auto-completes on end, and falls back to a plain iframe with
   the same range parameters when the API can't load. */

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
};

export type LessonPlayerHandle = {
  /** Current playhead position in seconds (0 when the API player is absent). */
  getCurrentTime: () => number;
  seekTo: (seconds: number) => void;
};

export type WatchProgress = { positionSec: number; durationSec: number };

type YouTubeWindow = {
  YT?: { Player?: unknown; PlayerState?: { ENDED: number } };
  onYouTubeIframeAPIReady?: () => void;
};

let apiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as YouTubeWindow;
  if (w.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise<void>((resolve) => {
      const previous = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      if (!document.getElementById("youtube-iframe-api")) {
        const script = document.createElement("script");
        script.id = "youtube-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    });
  }
  return apiPromise;
}

function embedUrl(videoId: string, startSec: number, endSec: number | null) {
  // youtube-nocookie + iv_load_policy=3/cc_load_policy=0 minimizes YouTube's own
  // top gradient (title/author) and annotation overlays that read as a "shadow
  // covering the video". The title strip on pause/hover is YouTube-native and
  // cannot be fully disabled via the embed API.
  const params = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1", iv_load_policy: "3", cc_load_policy: "0" });
  if (startSec > 0) params.set("start", String(startSec));
  if (endSec != null) params.set("end", String(endSec));
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function fmtTimecode(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export const WATCH_HEARTBEAT_MS = 5000;

const LessonPlayer = forwardRef<LessonPlayerHandle, { lesson: CourseLessonDto; onEnded?: () => void; onProgress?: (progress: WatchProgress) => void }>(function LessonPlayer(
  { lesson, onEnded, onProgress },
  ref,
) {
  const { t } = useLanguage();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const endedRef = useRef(onEnded);
  const progressRef = useRef(onProgress);
  const createdRef = useRef(false);
  const [fallback, setFallback] = useState(false);

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
    seekTo: (seconds: number) => playerRef.current?.seekTo?.(Math.max(0, seconds), true),
  }), []);

  useEffect(() => {
    endedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    progressRef.current = onProgress;
  }, [onProgress]);

  function reportProgress() {
    const position = playerRef.current?.getCurrentTime?.() ?? 0;
    const duration = playerRef.current?.getDuration?.() ?? 0;
    if (position > 0 && duration > 0) progressRef.current?.({ positionSec: Math.floor(position), durationSec: Math.floor(duration) });
  }

  useEffect(() => {
    if (!lesson.videoId || fallback) return;
    let cancelled = false;
    createdRef.current = false;
    let heartbeat: number | null = null;
    const timeout = window.setTimeout(() => {
      if (!createdRef.current) setFallback(true);
    }, 5000);

    void loadYouTubeApi().then(() => {
      if (cancelled || createdRef.current || !hostRef.current) return;
      const YT = (window as unknown as { YT: { Player: new (el: HTMLElement, options: unknown) => YouTubePlayer; PlayerState: { ENDED: number } } }).YT;
      createdRef.current = true;
      playerRef.current = new YT.Player(hostRef.current, {
        videoId: lesson.videoId,
        playerVars: {
          start: lesson.startSec > 0 ? lesson.startSec : undefined,
          end: lesson.endSec ?? undefined,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          fs: 1,
          iv_load_policy: 3,
          cc_load_policy: 0,
        },
        events: {
          onStateChange: (event: { data: number }) => {
            if (event.data === YT.PlayerState.ENDED) {
              // Flush the final position before signalling the end.
              reportProgress();
              endedRef.current?.();
            }
          },
        },
      });
      // Watch heartbeat for the ≥90% completion rule (lesson page persists it).
      heartbeat = window.setInterval(reportProgress, WATCH_HEARTBEAT_MS);
      // The IFrame API creates the iframe for us. Explicitly grant it the
      // fullscreen permission so YouTube's bottom-right fullscreen button
      // expands to the entire viewport just like youtube.com.
      window.requestAnimationFrame(() => {
        const frame = hostRef.current?.querySelector("iframe");
        if (!frame) return;
        frame.setAttribute("allowfullscreen", "");
        frame.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen");
      });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (heartbeat) window.clearInterval(heartbeat);
      try {
        playerRef.current?.destroy();
      } catch {
        // the player may already be gone when switching lessons
      }
      playerRef.current = null;
    };
  }, [lesson.videoId, lesson.startSec, lesson.endSec, fallback]);

  if (!lesson.videoId) {
    return (
      <div className="lms-video lms-video-empty">
        <Icon name="smart_display" />
        <span>{t("dash.courses.noVideo")}</span>
      </div>
    );
  }

  if (fallback) {
    return (
      <iframe
        className="lms-video"
        src={embedUrl(lesson.videoId, lesson.startSec, lesson.endSec)}
        title={lesson.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    );
  }

  return <div ref={hostRef} className="lms-video" />;
});

export default LessonPlayer;
