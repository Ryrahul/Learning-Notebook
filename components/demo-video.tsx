"use client";

import * as React from "react";
import { Play } from "lucide-react";

/**
 * The product demo on the landing page.
 *
 * Click-to-play with `preload="none"`, deliberately. The clip is 1m44s and
 * 3.5 MB; autoplaying it would push that onto every visitor including the ones
 * who came to sign in. Until someone presses play, the page costs one 41 KB
 * poster image.
 *
 * Controls only appear once playing, so the resting state is a clean still
 * rather than a browser control bar.
 */
export function DemoVideo() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = React.useState(false);

  function play() {
    const video = videoRef.current;
    if (!video) return;
    setStarted(true);
    void video.play().catch(() => {
      // Autoplay policies vary; the native controls are visible either way.
      setStarted(true);
    });
  }

  return (
    <figure className="group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-lifted">
      <video
        ref={videoRef}
        className="block aspect-video w-full bg-black"
        poster="/demo/notebook-poster.jpg"
        preload="none"
        controls={started}
        playsInline
        // No audio track, so muted costs nothing and keeps autoplay policies happy.
        muted
        onEnded={() => setStarted(false)}
      >
        <source src="/demo/notebook.mp4" type="video/mp4" />
        Your browser cannot play this video.
      </video>

      {!started && (
        <button
          onClick={play}
          aria-label="Play the product demo"
          className="absolute inset-0 grid place-items-center bg-foreground/15 transition-colors hover:bg-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <span className="flex items-center gap-3 rounded-full bg-surface/95 px-5 py-3 shadow-float backdrop-blur-sm transition-transform group-hover:scale-105">
            <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-foreground">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
            <span className="text-sm font-medium">Watch the demo</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              1:44
            </span>
          </span>
        </button>
      )}
    </figure>
  );
}
