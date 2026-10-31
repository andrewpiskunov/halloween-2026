import { signal } from '@preact/signals';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { portraitUrl } from '../assets';

export const portraitPreview = signal<{ roleKey: string; name: string } | null>(null);

/** Полный портрет в верхнем слое: не обрезается карточками и перекрывает лист выбора. */
export function PortraitViewer() {
  const portrait = portraitPreview.value;
  return portrait ? <Viewer key={portrait.roleKey} {...portrait} /> : null;
}

function Viewer({ roleKey, name }: { roleKey: string; name: string }) {
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
  return <dialog ref={dialog} class="portrait-viewer" aria-label={`Портрет: ${name}`}
    onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } }}>
    <header class="portrait-viewer-bar"><strong>{name}</strong>
      {!failed && <button type="button" aria-pressed={zoom} onClick={() => {
        setZoom(!zoom); canvas.current?.scrollTo(0, 0);
      }}>{zoom ? 'Целиком' : 'Увеличить'}</button>}
      <button type="button" aria-label="Закрыть портрет" onClick={close}>✕</button>
    </header>
    <div ref={canvas} class={`portrait-viewer-canvas ${zoom ? 'zoomed' : ''}`} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      {failed ? <p role="status">Портрет не загрузился. Закройте просмотр и попробуйте ещё раз.</p> :
        <img src={portraitUrl(roleKey)} alt={`Портрет персонажа ${name}`} onError={() => setFailed(true)} />}
    </div>
  </dialog>;
}
