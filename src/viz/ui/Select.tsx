import { useId } from "react";

interface Props<T extends string> {
  label: string;
  value: T;
  /** A disabled option's label should say why. */
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** A native select with a visible label. */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: Props<T>) {
  const id = useId();
  return (
    <div className="control select">
      <label className="control__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.target.value);
          if (next) onChange(next.value);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
