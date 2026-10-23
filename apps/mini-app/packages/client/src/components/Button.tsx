import type { ComponentChildren } from 'preact';

interface Props {
  icon?: string;
  kind?: 'main' | 'sec' | 'red';
  small?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: ComponentChildren;
}

/** Золотая кнопка с нижней кромкой; sec — тёмная, red — опасная. */
export function Button({ icon, kind = 'main', small, disabled, onClick, children }: Props) {
  const cls = ['m-btn', kind !== 'main' ? kind : '', small ? 'small' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" class={cls} disabled={disabled} onClick={disabled ? undefined : onClick}>
      {icon && <span class="ic">{icon}</span>}
      {children}
    </button>
  );
}
