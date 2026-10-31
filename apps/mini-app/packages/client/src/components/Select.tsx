import { createPortal } from 'preact/compat';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Portrait } from './Portrait';
import { Thumb } from './Thumb';
import './character-picker.css';

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

/** Галерея персонажей: портрет открывает просмотр, подпись выбирает героя. */
function CharacterPicker({ value, options, label, onPick, onClose }: {
  value: string; options: SelectOption[]; label?: string;
  onPick: (value: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const search = query.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const visible = options.filter(o => `${o.label} ${o.hint ?? ''}`.toLocaleLowerCase('ru').replaceAll('ё', 'е').includes(search));
  const titleId = useId();

  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    const selected = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    (selected ?? list.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
    return () => {
      dialog.current?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const onListKey = (e: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const active = (document.activeElement as HTMLElement)?.closest('.character-picker-card');
    const index = items.findIndex(item => item.closest('.character-picker-card') === active);
    const columns = list.current ? getComputedStyle(list.current).gridTemplateColumns.split(' ').length : 2;
    const step = e.key === 'ArrowDown' ? columns : e.key === 'ArrowUp' ? -columns : e.key === 'ArrowLeft' ? -1 : 1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + step));
    items[next]?.focus();
  };

  return createPortal(<dialog ref={dialog} class="character-picker" aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); onClose(); }}
    onKeyDown={e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    }}>
    <header class="character-picker-header">
      <div><span class="character-picker-eyebrow">Лица ярмарки</span><h2 id={titleId}>{label ?? 'Выберите персонажа'}</h2></div>
      <button type="button" class="character-picker-close" aria-label="Закрыть выбор персонажа" onClick={onClose}>✕</button>
    </header>
    <div class="character-picker-tools">
      <label class="character-picker-search"><span>Найти героя</span><input type="search" value={query} placeholder="Имя персонажа…"
        onInput={e => setQuery(e.currentTarget.value)} onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); list.current?.querySelector<HTMLElement>('[role="option"]')?.focus(); }
        }} /></label>
      <p>Нажмите имя, чтобы выбрать. Портрет можно рассмотреть.</p>
      <span class="character-picker-count" role="status">Показано: {visible.length} из {options.length}</span>
    </div>
    <div class="character-picker-scroll">
      <div class="character-picker-grid" role="listbox" aria-label={label ?? 'Персонажи'} ref={list} onKeyDown={onListKey}>
        {visible.map(o => <div key={o.value} role="presentation" class={`character-picker-card ${o.value === value ? 'is-selected' : ''}`}>
          {o.avatar ? <div class="character-picker-art"><Portrait roleKey={o.avatar} emoji={o.icon ?? '✦'} size="card" /><span aria-hidden="true">Рассмотреть ↗</span></div>
            : <div class="character-picker-fallback" aria-hidden="true">{o.icon ?? '—'}</div>}
          <button type="button" role="option" tabIndex={-1} aria-label={o.label} aria-selected={o.value === value}
            class="character-picker-choice" onClick={() => onPick(o.value)}>
            <b>{o.label}</b>{o.hint && <small>{o.hint}</small>}
            <span class="character-picker-state" aria-hidden="true">{o.value === value ? '✓ Выбран' : 'Выбрать →'}</span>
          </button>
        </div>)}
      </div>
      {visible.length === 0 && <div class="character-picker-empty"><span aria-hidden="true">✧</span><p>Герой не найден</p><small>Попробуйте другое имя или очистите поиск.</small></div>}
    </div>
  </dialog>, document.body);
}

/** Выпадающий список вместо системного select: строка с рукописным значением и бумажный лист с вариантами снизу. */
export function Select({ value, onChange, options, placeholder = 'Выберите', label, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.value === value);
  const characters = options.some(o => o.avatar);

  useEffect(() => {
    if (!open || characters) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    (selected ?? listRef.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, characters]);

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
      {open && characters && <CharacterPicker value={value} options={options} label={label} onPick={pick} onClose={() => setOpen(false)} />}
      {open && !characters && (
        <div class="sheet-back" onClick={e => { e.preventDefault(); setOpen(false); }}>
          <div class="sheet" onClick={e => e.stopPropagation()}>
            {label && <h5>{label}</h5>}
            <div class="sheet-list" role="listbox" aria-label={label} ref={listRef} onKeyDown={onListKey}>
              {options.map(o => (
                <div
                  key={o.value} role="option" tabIndex={-1} aria-label={o.label} aria-selected={o.value === value}
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
