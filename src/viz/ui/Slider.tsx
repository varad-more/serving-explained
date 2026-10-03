import { useId } from "react";

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Discrete stops (for log scales); otherwise min, max, and step. */
  stops?: readonly number[];
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  disabled?: boolean;
}

/** A native range input with a visible label and a live output. */
export function Slider({
  label,
  value,
  onChange,
  stops,
  min = 0,
  max = 100,
  step = 1,
  format = String,
  disabled,
}: Props) {
  const id = useId();
  const index = stops ? Math.max(0, stops.indexOf(value)) : value;
  return (
    <div className="control slider">
      <label className="control__label" htmlFor={id}>
        {label}
      </label>
      <div className="slider__row">
        <input
          id={id}
          type="range"
          min={stops ? 0 : min}
          max={stops ? stops.length - 1 : max}
          step={stops ? 1 : step}
          value={index}
          disabled={disabled}
          aria-valuetext={format(value)}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(stops ? (stops[n] ?? value) : n);
          }}
        />
        <output className="slider__output num" htmlFor={id}>
          {format(value)}
        </output>
      </div>
    </div>
  );
}
