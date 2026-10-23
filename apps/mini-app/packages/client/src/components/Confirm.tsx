import { confirmRequest } from '../store';
import { Button } from './Button';

/** Модальное подтверждение необратимого действия; открывается через ask() из store. */
export function Confirm() {
  const req = confirmRequest.value;
  if (!req) return null;
  const close = () => { confirmRequest.value = null; };
  return (
    <div class="modal-back" onClick={close}>
      <div class="modal m-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h4>{req.title}</h4>
        {req.text && <p class="m-note">{req.text}</p>}
        <div class="m-btns">
          <Button kind="sec" icon="✖️" onClick={close}>Отмена</Button>
          <Button kind={req.danger ? 'red' : 'main'} icon="✅" onClick={() => { close(); req.onOk(); }}>
            {req.okLabel ?? 'Да'}
          </Button>
        </div>
      </div>
    </div>
  );
}
