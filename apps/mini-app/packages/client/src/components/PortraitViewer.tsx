import { signal } from '@preact/signals';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { portraitUrl } from '../assets';

export const portraitPreview = signal<{ roleKey: string; name: string; abilitySrc?: string } | null>(null);

/** Портрет или иллюстрация способности в верхнем слое: не обрезается карточками и перекрывает лист выбора. */
export function PortraitViewer() {
  const portrait = portraitPreview.value;
  return portrait ? <Viewer key={`${portrait.roleKey}:${portrait.abilitySrc ?? 'portrait'}`} {...portrait} /> : null;
}

function Viewer({ roleKey, name, abilitySrc }: { roleKey: string; name: string; abilitySrc?: string }) {
  const title = abilitySrc ? `Способность: ${name}` : `Портрет: ${name}`;
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(false);
  const [failed, setFailed] = useState(false);
  const close = () => { portraitPreview.value = null; };
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} class="portrait-viewer" aria-label={title}
    onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } }}>
    <header class="portrait-viewer-bar"><strong>{name}</strong>
      {!failed && <button type="button" aria-pressed={zoom} onClick={() => {
        setZoom(!zoom); canvas.current?.scrollTo(0, 0);
      }}>{zoom ? 'Целиком' : 'Увеличить'}</button>}
      <button type="button" aria-label={abilitySrc ? 'Закрыть изображение способности' : 'Закрыть портрет'} onClick={close}>✕</button>
    </header>
    <div ref={canvas} class={`portrait-viewer-canvas ${zoom ? 'zoomed' : ''}`} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      {failed ? <p role="status">{abilitySrc ? 'Изображение способности не загрузилось.' : 'Портрет не загрузился.'} Закройте просмотр и попробуйте ещё раз.</p> :
        <img src={abilitySrc ?? portraitUrl(roleKey)} alt={title} onError={() => setFailed(true)} />}
    </div>
  </dialog>;
}
