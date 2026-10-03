import { useId } from "react";

interface Props {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** An on/off switch: a button with role="switch", operated by Space or Enter. */
export function Toggle({ label, checked, onChange, disabled }: Props) {
  const labelId = useId();
  return (
    <div className="control toggle">
      <span className="control__label" id={labelId}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        className="toggle__switch"
        disabled={disabled}
        onClick={() => {
          onChange(!checked);
        }}
      >
        <span className="toggle__track" aria-hidden="true">
          <span className="toggle__thumb" />
        </span>
        <span className="toggle__state">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
