import { BASE } from './base';

// Только названия уже написанных в тексте вещей. Сюжетные данные сюда не попадают.
const art: [string, string][] = [
  ['корон(?:а|ы|е|у|ой|ою) пепла', 'crown-of-ash'],
  ['(?:семя|семени|семенем) леса', 'forest-seed'],
  ['костян(?:ая|ой|ую|ою) флейт(?:а|ы|е|у|ой|ою)', 'bone-flute'],
  ['серебрян(?:ая|ой|ую|ою) чешу(?:я|и|е|ю|ёй|ей|ёю|ею)', 'silver-scale'],
  ['медн(?:ый|ого|ому|ым|ом) жезл(?:а|у|ом|е)?', 'copper-wand'],
  ['изумрудн(?:ый|ого|ому|ым|ом) глаз(?:а|у|ом|е)?', 'emerald-eye'],
  ['клятвенн(?:ый|ого|ому|ым|ом) перст(?:ень|ня|ню|нем|не)', 'oath-ring'],
  ['лунн(?:ый|ого|ому|ым|ом) рог(?:а|у|ом|е)?', 'moon-horn'],
  ['зв[её]здн(?:ая|ой|ую|ою) уздечк(?:а|и|е|у|ой|ою)', 'star-bridle'],
  ['колокольчик(?:а|у|ом|е)? тишины', 'silence-bell'],
  ['молот(?:а|у|ом|е)?[ -]гасител(?:ь|я|ю|ем|е)', 'quench-hammer'],
  ['печат(?:ь|и|ью) торгового дома', 'house-seal'],
  ['вес(?:ы|ов|ам|ами|ах) оценщика', 'appraiser-scales'],
  ['фонар(?:ь|я|ю|ём|ем|е) перевозчика', 'carrier-lantern'],
  ['ключ(?:а|у|ом|е)? от ворот', 'gate-key'],
  ['маск(?:а|и|е|у|ой|ою) смеха', 'laughing-mask'],
  ['ч[её]тк(?:и|ам|ами|ах) молчания', 'silence-beads'],
  ['карт(?:а|ы|е|у|ой|ою) подземных троп', 'tunnel-map'],
  ['книг(?:а|и|е|у|ой|ою) долгов', 'debt-book'],
  ['зеркал(?:о|а|у|ом|е) лжи', 'lying-mirror'],
  ['лопат(?:а|ы|е|у|ой|ою) могильщика', 'gravedigger-shovel'],
  ['очищающ(?:ее|его|ему|им|ем) зель(?:е|я|ю|ем)', 'cleanse'],
  ['защитн(?:ый|ого|ому|ым|ом|ые|ых|ыми) талисман(?:а|у|ом|е|ы|ов|ам|ами|ах)?', 'ward'],
  ['кам(?:ень|ня|ню|нем|не) облика', 'shape'],
  ['закрепител(?:ь|я|ю|ем|е) облика', 'shape-fixative.webp'],
  ['осмотров(?:ая|ой|ую|ою) линз(?:а|ы|е|у|ой|ою)', 'inspection-lens.webp'],
  ['травян(?:ой|ого|ому|ым|ом) ладан(?:а|у|ом|е)?', 'herbal-incense.webp'],
  ['(?:фокус(?:а|у|ом|е)? с начертанными линиями|управляющ(?:ий|его|ему|им|ем) знак(?:а|у|ом|е)?)', 'inscribed-focus.webp'],
  ['(?:отводящ(?:ий|его|ему|им|ем) сосуд(?:а|у|ом|е)?|сосуд(?:а|у|ом|е)? с медным нал[её]том)', 'copper-vial.webp'],
  ['(?:запечатанн(?:ый|ого|ому|ым|ом) порош(?:ок|ка|ку|ком|ке)|разрывн(?:ая|ой|ую|ою) сол(?:ь|и|ью))', 'sealed-powder.webp'],
  ['фокус(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?: силы)?', 'focus'],
  ['оскол(?:ок|ка|ку|ком|ке|ки|ков|кам|ками|ках)(?: [IVX]+)?', 'shard'],
  ['пеп(?:ел|ла|лу|лом|ле)(?: феникса)?', 'ash'],
  ['лунн(?:ая|ой|ую|ою) пыл(?:ь|и|ью)', 'moon'],
  ['рос(?:а|ы|е|у|ой|ою|ам|ами|ах)', 'dew'],
  ['золот(?:о|а|у|ом|е)', 'gold'],
];
const patterns=art.map(([pattern,file])=>({re:new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`,'giu'),src:`${BASE}assets/items/${file.includes('.')?file:`${file}.jpg`}`}));
export interface ItemMention { text: string; src?: string }
export function itemMentions(text:string):ItemMention[]{
  const candidates:{start:number;end:number;src:string}[]=[];
  for(const {re,src} of patterns){re.lastIndex=0;for(const match of text.matchAll(re))candidates.push({start:match.index!,end:match.index!+match[0].length,src});}
  candidates.sort((a,b)=>a.start-b.start||b.end-a.end);
  const parts:ItemMention[]=[];let end=0;
  for(const hit of candidates){if(hit.start<end)continue;if(hit.start>end)parts.push({text:text.slice(end,hit.start)});parts.push({text:text.slice(hit.start,hit.end),src:hit.src});end=hit.end;}
  if(end<text.length)parts.push({text:text.slice(end)});
  return parts;
}
