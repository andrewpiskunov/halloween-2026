interface Props { value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string }

/** Число с крупными кнопками «−» и «+» вместо мелкого поля ввода. */
export function Stepper({ value, onChange, min = 0, max = 99, label }: Props) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <span class="stepper" aria-label={label}>
      <button type="button" disabled={value <= min} onClick={() => set(value - 1)}>−</button>
      <b>{value}</b>
      <button type="button" disabled={value >= max} onClick={() => set(value + 1)}>+</button>
    </span>
  );
}
