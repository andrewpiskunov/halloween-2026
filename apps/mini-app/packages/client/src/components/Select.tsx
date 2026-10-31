import { useEffect, useRef, useState } from 'preact/hooks';
import { Portrait } from './Portrait';
import { Thumb } from './Thumb';

export interface SelectOption {
  value: string; label: string; icon?: string; hint?: string;
  /** Ключ роли: в листе показывается цветной аватар. */
  avatar?: string;
  /** Картинка предмета или ресурса: в листе показывается цветная иконка. */
  image?: string;
}

/** Значок варианта: аватар роли, иконка предмета или эмодзи. */
function OptionIcon({ o }: { o: SelectOption }) {
  if (o.avatar) return <Portrait roleKey={o.avatar} emoji={o.icon ?? ''} size="sm" />;
  if (o.image) return <Thumb src={o.image} emoji={o.icon ?? ''} size="sm" />;
  return <i>{o.icon ?? ''}</i>;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Текст, когда ничего не выбрано. */
  placeholder?: string;
  /** Заголовок листа и подпись для читалок экрана. */
  label?: string;
  disabled?: boolean;
}

/** Выпадающий список вместо системного select: строка с рукописным значением и бумажный лист с вариантами снизу. */
export function Select({ value, onChange, options, placeholder = 'Выберите', label, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    (selected ?? listRef.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = (v: string) => { setOpen(false); if (v !== value) onChange(v); };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
    items[next]?.focus();
  };

  return (
    <>
      <button
        type="button" class={`select ${current ? '' : 'empty'}`} disabled={disabled}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        onClick={() => setOpen(true)}
      >
        <span>{current ? current.label : placeholder}</span>
        <em aria-hidden="true">▾</em>
      </button>
      {open && (
        <div class="sheet-back" onClick={e => { e.preventDefault(); setOpen(false); }}>
          <div class="sheet" onClick={e => e.stopPropagation()}>
            {label && <h5>{label}</h5>}
            <div class="sheet-list" role="listbox" aria-label={label} ref={listRef} onKeyDown={onListKey}>
              {options.map(o => (
                <div
                  key={o.value} role="option" tabIndex={-1} aria-selected={o.value === value}
                  class={`sheet-item ${o.value === value ? 'on' : ''}`}
                  onClick={e => { e.preventDefault(); pick(o.value); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(o.value); } }}
                >
                  <OptionIcon o={o} />
                  <span><b>{o.label}</b>{o.hint && <small>{o.hint}</small>}</span>
                  <em aria-hidden="true">{o.value === value ? '✓' : ''}</em>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
