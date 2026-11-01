import { expect, test } from 'vitest';
import type { GameState } from '@fair/shared';
import { attentionFor } from '../gm/attention';

const fixture = () => ({
 phase: 'act1', clock: { pausedAt: undefined },
 story: { requests: {
   fresh: { id: 'fresh', author: 'o1', title: 'Осмотр плиты', status: 'pending', at: 20 },
   work: { id: 'work', author: 'o2', title: 'Условия получены', status: 'conditions', at: 10 },
   done: { id: 'done', author: 'o1', status: 'done', at: 0 },
 } },
 requests: { consent: { id: 'consent', author: 'o3', status: 'pending' }, old: { id: 'old', status: 'accepted' } },
 hidden17: { uses: {
   lens: { id: 'lens', author: 'o4', status: 'pending', question: 'material', targets: ['o1','o2'], approved: ['o1','o2'] },
   wait: { id: 'wait', author: 'o4', status: 'pending', question: 'compartment', targets: ['o1','o2'], approved: ['o1'] },
   closed: { id: 'closed', status: 'completed', question: 'material', targets: [], approved: [] },
 }, production: { order: { id: 'order', maker: 'o6', customer: 'o1', status: 'pending' } },
 fair: { destruction: {
   scene: { id: 'scene', author: 'o5', status: 'pending', ref: 'I' },
   window: { id: 'window', author: 'o5', status: 'active', ref: 'II', endsAt: 1000 },
   saved: { id: 'saved', status: 'saved', ref: 'III' },
 } } },
}) as unknown as GameState;

test('новые заявки, согласованный осмотр и новая сцена ждут ведущего; условия и согласия отдельно', () => {
 const q = attentionFor(fixture(), 500);
 expect(q.ready.map(x => x.id)).toEqual(['fresh','lens','scene']);
 expect(q.waiting.map(x => x.id)).toEqual(['work','wait','window','consent','order']);
 expect(q.ready.map(x => x.kind)).toEqual(['story','inspection','destruction']);
});
test('окно спасения становится делом ведущего по окончании, пауза замораживает срок', () => {
 const s = fixture();
 expect(attentionFor(s, 1000).ready.map(x => x.id)).toContain('window');
 s.clock.pausedAt = 900;
 expect(attentionFor(s, 2000).ready.map(x => x.id)).not.toContain('window');
 expect(attentionFor(s, 2000).waiting.map(x => x.id)).toContain('window');
});
test('отмена, ответ и завершение убирают дело из счётчика', () => {
 const s = fixture();
 s.story!.requests.fresh.status = 'rejected';
 s.hidden17!.uses.lens.status = 'completed';
 s.hidden17!.fair!.destruction.scene.status = 'cancelled';
 expect(attentionFor(s, 500).ready).toEqual([]);
});
test('архивная партия без hidden17 и завершённая ярмарка не ломают очередь', () => {
 const s = fixture(); delete s.hidden17;
 expect(attentionFor(s, 500).ready.map(x => x.id)).toEqual(['fresh']);
 s.phase = 'closed';
 expect(attentionFor(s, 500)).toEqual({ ready: [], waiting: [] });
});
