import { computed, signal } from '@preact/signals';
import type { Command } from '@fair/shared';
import { auth, authAs, connect, type CmdResult, type Connection, type ErrorCode, type Status, type View } from './api';
import { collectNotices, noticeToast, type Seen } from './notices';

/** Последняя проекция от сервера. */
export const view = signal<View | null>(null);
/** Когда пришла проекция (часы клиента): от него идут часы акта. */
export const viewAt = signal(0);
export const status = signal<Status>('connecting');
export const connected = computed(() => status.value === 'open');
/** Текст последней ошибки для всплывающего сообщения. */
export const toast = signal<string | null>(null);
/** Синоним toast под именем из плана. */
export const error = toast;
/** Текущее время, обновляется раз в секунду: часы акта и обратные отсчёты. */
export const now = signal(Date.now());

export type Tab = 'role' | 'bag' | 'trades' | 'workshop' | 'altars' | 'events' | 'results';
export const tab = signal<Tab>('role');
/** Вкладка «Итоги» уже открывалась сама при первой проекции в revealed: дальше игрок ходит по вкладкам свободно. */
export const resultsShown = signal(false);
export type GmTab = 'roster' | 'console';
export const gmTab = signal<GmTab>('roster');
/** Имя бота для ссылок-приглашений; приходит из /api/auth. */
export const botName = signal('');
/** Ведущий играет за игрока: его роль и имя; null — обычный режим. */
export const playingAs = signal<{ roleKey: string; name: string } | null>(null);
/** Вещь, с которой надо открыть форму сделки (кнопка «Предложить» в сумке). */
export const tradeDraft = signal<{ itemId: string } | null>(null);
/** Кнопка «В мастерскую» на карточке способности: Мастерская открывается на блоке способности. */
export const abilityDraft = signal<{ kind: string } | null>(null);
/** Отметки на игроке, которые он уже видел в сумке: точка на вкладке «Сумка» до открытия. */
export const bagSeenMarks = signal<string | null>(null);

/** Запрос подтверждения для модального окна Confirm. */
export interface ConfirmRequest { title: string; text?: string; okLabel?: string; danger?: boolean; onOk: () => void }
export const confirmRequest = signal<ConfirmRequest | null>(null);
export function ask(req: ConfirmRequest): void { confirmRequest.value = req; }

export const ERROR_TEXT: Record<ErrorCode, string> = {
  insufficient: 'Не хватает',
  phase: 'Сейчас нельзя',
  reserved: 'Уже обещано в другой сделке',
  not_owner: 'Это не ваше',
  forbidden: 'Нельзя',
  not_found: 'Не найдено',
  invalid: 'Так нельзя',
  limit: 'Лимит исчерпан',
  internal: 'Ошибка на сервере',
};

let connection: Connection | null = null;
/** Собственный токен аккаунта: к нему возвращается ведущий после игры за игрока. */
let ownToken = '';
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string): void {
  toast.value = text;
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = null; }, 4000);
}

/** Отправляет команду; при отказе показывает ошибку словами. */
export async function run(cmd: Command): Promise<CmdResult> {
  if (!connection) {
    showToast('Нет соединения');
    return { ok: false, error: 'internal' };
  }
  const result = await connection.send(cmd);
  if (!result.ok) showToast(refusalText(result.error, result.detail));
  return result;
}

/** Отказ словами: общий текст по коду и пояснение сервера, если оно написано по-русски. */
export function refusalText(error: ErrorCode, detail?: string): string {
  const base = ERROR_TEXT[error] ?? ERROR_TEXT.internal;
  return detail && /[а-яё]/i.test(detail) ? `${base}: ${detail}` : base;
}

let seen: Seen | null = null;

/** Новая проекция: уведомления о чужих действиях и просьбах (§7.5), затем сама проекция. */
function onView(v: View): void {
  if (v.kind === 'player') {
    const r = collectNotices(seen, v);
    seen = r.seen;
    const text = noticeToast(r.texts);
    if (text) showToast(text);
    // итоги объявлены: один раз открыть «Итоги» (и сразу, если приложение открыли уже после объявления)
    if (v.phase === 'revealed' && !resultsShown.value) { resultsShown.value = true; tab.value = 'results'; }
  }
  view.value = v;
  viewAt.value = Date.now();
}

/** Соединение рвётся или меняется: первая проекция после него только запоминается. */
function onStatus(s: Status): void {
  if (s !== 'open') seen = null;
  status.value = s;
}

/** Закрывает текущее соединение и открывает новое с другим токеном; проекция сбрасывается до первой новой. */
function reconnect(token: string): void {
  connection?.close();
  view.value = null;
  seen = null;
  bagSeenMarks.value = null;
  resultsShown.value = false;
  status.value = 'connecting';
  connection = connect(token, onView, onStatus);
}

/** Ведущий открывает экраны игрока и действует от его имени. */
export async function playAs(roleKey: string, name: string): Promise<void> {
  try {
    const { token } = await authAs(ownToken, roleKey);
    playingAs.value = { roleKey, name };
    tab.value = 'role';
    reconnect(token);
  } catch {
    showToast('Не удалось открыть экраны игрока');
  }
}

/** Возврат ведущего к своим экранам. */
export function backToGm(): void {
  if (!playingAs.value) return;
  playingAs.value = null;
  reconnect(ownToken);
}

/** Вход и соединение. Вызывается один раз из main.tsx. */
export async function start(): Promise<void> {
  setInterval(() => { now.value = Date.now(); }, 1000);
  try {
    const { token, botName: bot } = await auth();
    botName.value = bot;
    ownToken = token;
    connection = connect(token, onView, onStatus);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'no_auth') status.value = 'no_auth';
    else if (msg === 'unauthorized') status.value = 'unauthorized';
    else { status.value = 'closed'; showToast('Сервер недоступен, обновите страницу'); }
  }
}
