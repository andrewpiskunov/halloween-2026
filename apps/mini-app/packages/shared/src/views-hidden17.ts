import type { Content } from './content';
import type { HiddenPlayerView } from './hidden17';
import type { GameState } from './types';
import { hiddenGoals } from './engine/hidden17';
import type { PlayerView } from './views';

export function hiddenProjection(state: GameState, content: Content, key: string, base: PlayerView): PlayerView {
  if (!state.hidden17 || !content.hidden17) return base;
  const h = state.hidden17, source = content.hidden17, r = h.ritual, briefing = source.roles[key];
  const own = (id: string) => state.items[id]?.owner.type === 'player' && state.items[id].owner.key === key;
  const visible = new Set(base.me.items.map(i => i.id));
  for (const [id, viewers] of Object.entries(h.presentations)) if (viewers.includes(key)) visible.add(id);
  for (const id of [...r.circle, ...r.focuses]) visible.add(id);
  const accessibleShards = Object.values(state.items).filter(i => i.kind === 'shard' && !r.extinguished.includes(i.ref) && (own(i.id) || r.circle.includes(i.id) || r.permissions[i.id]?.includes(key))).map(i => i.id);
  for (const id of accessibleShards) visible.add(id);
  const revealed = ['responses','last-choice','finished'].includes(r.step);
  const interventions = revealed ? Object.values(r.choices).filter(c => ['salt','sign','vessel'].includes(c.kind) && c.status !== 'invalid').map(c => ({ player: c.player, kind: c.kind, status: c.status, ...(c.targetId ? { targetId: c.targetId } : {}) })) : [];
  for (const c of interventions) if (c.targetId) visible.add(c.targetId);
  const knownItems = Object.fromEntries([...visible].flatMap(id => {
    const i = state.items[id]; if (!i) return [];
    return [[id, { kind: i.kind, ref: i.ref, ...(i.owner.type === 'player' ? { owner: i.owner.key } : {}) }]];
  }));
  for (const b of Object.values(h.board)) for (const [id, metadata] of Object.entries(b.rewardItems ?? {})) if (!knownItems[id]) knownItems[id] = metadata;
  const mineGoals = hiddenGoals(state, content)[key];
  const outcome = r.outcome && { ...r.outcome, goals: { [key]: r.outcome.goals[key] }, vessels: r.outcome.vessels };
  const hidden17: HiddenPlayerView = {
    briefing, publicIntro: source.publicIntro, publicRules: source.publicRules, craftingRules: source.crafting.rules,
    methods: source.methods.filter(m => m.holders.includes(key) || h.learned[key]?.includes(m.id === 'command' ? 'sign' : m.id as 'salt' | 'vessel')).map(({ holders: _holders, ...m }) => ({ ...m, holders: [] })),
    knownMethods: h.learned[key] ?? [], productionRecipes: source.crafting.makers[key] ?? [], signatureGoods: source.signatureGoods.map(g => ({ id: g.id, name: g.name, maker: g.maker, cost: g.cost, gold: g.gold, effect: g.effect, use: g.use, limits: g.limits })),
    board: Object.values(h.board), dice: Object.values(h.dice).filter(d => d.from === key || d.to === key), production: Object.values(h.production).filter(p => p.maker === key || p.customer === key), uses: Object.values(h.uses).filter(u => u.author === key || u.targets.includes(key)),
    prepared: Object.fromEntries(Object.entries(h.prepared).filter(([id]) => own(id))), fixedGuise: h.fixedGuise[key], knownItems, rumors: h.rumors,
    ritual: { accessibleShards, permissions: Object.fromEntries(Object.entries(r.permissions).filter(([id]) => own(id))), step: r.step, stone: source.ritual.stone, formula: source.ritual.formula, circle: r.circle, focuses: r.focuses, extinguished: r.extinguished, observed: r.observed, myChoice: r.choices[key], interventions, wards: r.wards, orderSelected: r.orderSelected, orderOptions: r.step === 'last-choice' ? [...new Set(Object.values(r.choices).filter(c => c.kind === 'sign' && c.status === 'active' && c.controller === key).map(c => c.order!))] : [], ...(outcome ? { outcome } : {}) },
  };
  const role = { ...base.me.role, side: 'free' as const, block: '', intro: briefing.publicFace, goals: briefing.goals, secret: briefing.secret, backstory: briefing.backstory, motivation: briefing.desire, extra: '', rumor: '', contacts: [] };
  return { ...base, hidden17, me: { ...base.me, role, player: { ...base.me.player, side: undefined }, ability: { ...base.me.ability, ...(r.step !== 'preparation' ? { state: 'closed' as const } : {}) }, goals: briefing.goals.map((text, i) => ({ text, done: mineGoals[i], byGm: state.players[key].goalOverrides?.[i] != null })) }, contacts: [], altars: [], story: base.story, closing: undefined,
    public: { ...base.public, factions: [], clues: content.clues.filter(c => base.me.items.some(i => i.kind === 'clue' && i.ref === c.id)).map(c => ({ ...c, where: '' })), story: source.publicIntro, shards: content.shards.map(sh => ({ id: sh.id, status: 'unknown' as const })), relics: base.public.relics.map(x => ({ ...x, lore: '' })) },
  };
}
