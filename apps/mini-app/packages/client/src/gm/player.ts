import type { Player } from '@fair/shared';
import type { MarkField } from '../screens/gm/Abilities';
import { nameCase } from '../labels';

export function playerMarks(p: Player, name: (key: string) => string, fair: boolean): { label: string; field?: MarkField }[] {
    const out: { label: string; field?: MarkField }[] = [];
    if (p.abilityUsedInAct) out.push({ label: fair ? 'дар использован' : 'применено в акте', field: 'abilityUsed' });
    if (p.abilityPending) out.push({ label: 'ждёт ответа на просьбу' });
    if (p.protection) {
      const src = p.protection.source === 'ward' ? 'талисман' : p.protection.source === 'gm' ? 'от ведущего' : `от ${nameCase(name(p.protection.by), 'gen')}`;
      out.push({ label: `защита (${src})`, field: 'protection' });
    }
    if (p.thorns) out.push({ label: p.thornsBy ? `шипы (от ${nameCase(name(p.thornsBy), 'gen')})` : 'шипы', field: 'thorns' });
    if (p.curse) out.push({ label: 'проклятие', field: 'curse' });
    if (p.discount) out.push({ label: p.discountBy ? `скидка (от ${nameCase(name(p.discountBy), 'gen')})` : 'скидка', field: 'discount' });
    if (p.hostileAttemptsAgainstInAct > 0) out.push({ label: 'попытка по нему', field: 'hostileAttempt' });
    if (p.guise) out.push({ label: `облик «${p.guise.name}»`, field: 'guise' });
    return out;
}
