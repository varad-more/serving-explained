import { useId } from "react";
import { useReducedMotion } from "../useReducedMotion.ts";

export const SPEEDS = [0.5, 1, 2, 4] as const;

interface Props {
  /** Sim seconds at the playhead. */
  time: number;
  duration: number;
  playing: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onSeek: (time: number) => void;
  onSpeed: (speed: number) => void;
  /** Forces the reduced-motion state; defaults to the reader's setting. */
  reducedMotion?: boolean;
  /** The playhead as words; seconds by default. */
  formatTime?: (time: number, duration: number) => string;
  /** The scrub step (default duration / 200). */
  scrubStep?: number;
}

const seconds = (t: number, d: number) =>
  `${t.toFixed(1)} of ${d.toFixed(1)} seconds`;

/**
 * Play, pause, step, scrub, and speed for an animated figure (CLAUDE.md visual
 * rules). The figure is a pure function of the playhead; this bar only moves
 * it. Under reduced motion, Play is disabled and Step shows every state.
 */
export function PlaybackBar(props: Props) {
  const systemReduced = useReducedMotion();
  const reduced = props.reducedMotion ?? systemReduced;
  const scrubId = useId();
  const speedId = useId();
  const { time, duration, playing } = props;
  const format = props.formatTime ?? seconds;
  return (
    <div className="playback" role="group" aria-label="Playback">
      <button
        type="button"
        className="icon-button"
        aria-label="Play"
        disabled={playing || reduced || time >= duration}
        onClick={props.onPlay}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 2 L14 8 L4 14 Z" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Pause"
        disabled={!playing}
        onClick={props.onPause}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="2" width="4" height="12" fill="currentColor" />
          <rect x="9" y="2" width="4" height="12" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Step"
        disabled={time >= duration}
        onClick={props.onStep}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 2 L10 8 L2 14 Z" fill="currentColor" />
          <rect x="11" y="2" width="3" height="12" fill="currentColor" />
        </svg>
      </button>
      <label className="visually-hidden" htmlFor={scrubId}>
        Playhead
      </label>
      <input
        id={scrubId}
        className="playback__scrub"
        type="range"
        min={0}
        max={duration}
        step={props.scrubStep ?? (duration / 200 || 1)}
        value={time}
        aria-valuetext={format(time, duration)}
        onChange={(e) => {
          props.onSeek(Number(e.target.value));
        }}
      />
      <output className="playback__time num" htmlFor={scrubId}>
        {props.formatTime ? format(time, duration) : `${time.toFixed(1)} s`}
      </output>
      <label className="visually-hidden" htmlFor={speedId}>
        Speed
      </label>
      <select
        id={speedId}
        className="playback__speed"
        value={props.speed}
        onChange={(e) => {
          props.onSpeed(Number(e.target.value));
        }}
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
      {reduced && (
        <p className="playback__note">
          Motion is reduced. Use Step to see each state.
        </p>
      )}
    </div>
  );
}
