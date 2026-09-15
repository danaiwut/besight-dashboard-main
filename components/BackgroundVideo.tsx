"use client";

import { useEffect, useRef } from "react";

/** Full-bleed looping background video — handles both a plain video file
 *  (mp4, set as `src` directly, works natively everywhere) and an HLS
 *  (.m3u8) stream (Safari plays that natively; everywhere else needs
 *  hls.js to feed it into a MediaSource, loaded only when actually
 *  needed). */
export default function BackgroundVideo({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!src.includes(".m3u8")) {
      video.src = src;
      return;
    }

    let hls: import("hls.js").default | null = null;
    let cancelled = false;

    // Chrome's `canPlayType('application/vnd.apple.mpegurl')` unreliably
    // reports "maybe" even though it can't actually decode HLS without
    // MediaSource help — so hls.js is tried first (matches its own
    // documented integration pattern) and native `src` is only the
    // fallback for when Hls.isSupported() itself says no (old Safari).
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
      }
    });

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src]);

  return <video ref={videoRef} className={className} autoPlay muted loop playsInline />;
}
