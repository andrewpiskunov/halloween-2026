import { ItemText } from './ItemText';
import { confirmRequest } from '../store';
import { Button } from './Button';

/** Модальное подтверждение необратимого действия на бумажной карточке; открывается через ask() из store. */
export function Confirm() {
  const req = confirmRequest.value;
  if (!req) return null;
  const close = () => { confirmRequest.value = null; };
  return (
    <div class="modal-back" onClick={close}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={req.title} onClick={e => e.stopPropagation()}>
        <h4>{req.title}</h4>
        {req.text && <p class="m-note"><ItemText>{req.text}</ItemText></p>}
        <div class="m-btns two">
          <Button kind="sec" onClick={close}>Отмена</Button>
          <Button kind={req.danger ? 'red' : 'main'} onClick={() => { close(); req.onOk(); }}>
            {req.okLabel ?? 'Да'}
          </Button>
        </div>
      </div>
    </div>
  );
}
