import type { ComponentChildren } from 'preact';
import { useFrozen } from './Frozen';

interface Props {
  icon?: string;
  kind?: 'main' | 'sec' | 'red';
  small?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: ComponentChildren;
}

/** Кнопка гравюры: main — светлая на поле и чернильная на бумаге, sec — контурная, red — киноварь (печать или необратимое). */
export function Button({ icon, kind = 'main', small, disabled, onClick, children }: Props) {
  // после закрытия ярмарки и у ушедшего игрока все кнопки действий на экранах игрока выключены
  const frozen = useFrozen();
  const off = disabled || frozen !== false;
  const cls = ['m-btn', kind !== 'main' ? kind : '', small ? 'small' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" class={cls} disabled={off} title={frozen === false ? undefined : frozen} onClick={off ? undefined : onClick}>
      {icon && <span class="ic">{icon}</span>}
      {children}
    </button>
  );
}
