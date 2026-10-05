import { useEffect, useState } from "react";

/**
 * A playhead over [0, duration] for a PlaybackBar. rAF only moves the time;
 * the figure is a pure function of it (CLAUDE.md visual rules). `rate` is
 * playhead units per wall second at 1×.
 */
export function usePlayhead(duration: number, rate = 1, start = 0) {
  const [time, setTime] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing) return;
    let before = performance.now();
    let id = requestAnimationFrame(function tick(now) {
      const dt = ((now - before) / 1000) * rate * speed;
      before = now;
      setTime((t) => Math.min(duration, t + dt));
      id = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [playing, speed, rate, duration]);

  useEffect(() => {
    if (time >= duration) setPlaying(false);
  }, [time, duration]);

  return {
    time: Math.min(time, duration),
    playing,
    speed,
    setTime,
    setPlaying,
    setSpeed,
    /** Restarts from 0 at the end, as a reader expects. */
    play: () => {
      if (time >= duration) setTime(0);
      setPlaying(true);
    },
  };
}
