#!/usr/bin/env python3
"""Проверка раздельной выдачи новой редакции; не симуляция живой игры."""
import json
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'docs/prototypes'; DATA=ROOT/'docs/design/gm-book'
h=json.loads((DATA/'hidden-17.json').read_text()); e=json.loads((DATA/'edition-17.json').read_text())
n=json.loads((DATA/'narrative-17.json').read_text())
assert set(n['roles'])==set(h['roles']) and n['version']==2
assert set(h['roles'])==set(e['roleKeys']) and len(h['roles'])==17
class Page(HTMLParser):
 def __init__(self,path):
  super().__init__(); self.text=[]; self.refs=[]; self.ids=[]; self.feed(path.read_text())
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.append(a['id'])
  self.refs.extend(a[k] for k in ['href','src'] if k in a)
 def handle_data(self,data):self.text.append(data)
paths=[OUT/'player-guide.html',OUT/'finale-sheet.html',OUT/'magic-fair-v2.html',*[OUT/f'players/{key}.html' for key in h['roles']]]
assert all(p.is_file() for p in paths),'Нет отдельного комплекта вводных / памяток'
for path in paths:
 doc=Page(path); text=' '.join(doc.text)
 assert len(doc.ids)==len(set(doc.ids)),path
 for ref in doc.refs:
  u=urlsplit(ref)
  if u.scheme or u.netloc:continue
  target=(path.parent/unquote(u.path)).resolve() if u.path else path
  assert target.is_file(),(path,ref)
  if u.fragment and target.suffix=='.html':assert unquote(u.fragment) in Page(target).ids,(path,ref)
 if path.parent.name=='players':
  own=n['roles'][path.stem]
  for v in [*own['story'],*own['goals'],own['abilityOrigin']]:assert v in text,(path,'утрачены личные сведения',v)
  for key,other in h['roles'].items():
   if key!=path.stem:assert other['secret'] not in text,(path,'чужой секрет',key)
  for ref in doc.refs:
   assert 'magic-fair' not in ref and 'characters/' not in ref and 'finale-sheet' not in ref,(path,'ссылка на GM')
  assert 'data-side' not in path.read_text() and '<script' not in path.read_text(),path
  for method in h['methods']:
   if path.stem not in method['holders']:assert method['private'] not in text,(path,method['id'])
 if path.name=='player-guide.html':
  for r in h['roles'].values():assert r['secret'] not in text
main=(OUT/'magic-fair-v2.html').read_text()
for stale in ['Четыре сторонника пробуждения','Все три улики A, B, C у этого игрока','доступность осколка наступает в III акте','id="side-filter"']:assert stale not in main,stale
assert len(h['casebook'])>=12
assert len(h['chapters'])==15
for method in h['methods']:
 assert all(method.get(k) for k in ['cost','tell','counter','result','private'])
 assert set(method['holders']) <= set(h['roles'])
for key,r in h['roles'].items():
 assert len(r['acts'])==3 and len(r['goals'])==2
 assert all(r['finale'][k] for k in ['prepare','action','choice','impact'])
print('OK: 17 изолированных вводных, публичная памятка, лист финала; личные сведения, отсутствие чужих секретов и GM-ссылок, 15 глав и сценарные примеры.')
# Регрессии содержательного ревью: выбор после раскрытия и достаточность вводных.
assert 'добровольно снять свою' in ' '.join(h['phases'][1]['steps']), 'Не задан отказ от раскрытого вмешательства'
assert any('сосуд' in k['topic'].lower() and k['fallback'] for k in h['knowledgeRoutes']), 'Нет резервного рецепта сосуда'
for key in ['o5','o17']:
 assert any('разными именами' in k for k in h['roles'][key]['knowledge']), 'Противоречие правила знаков в короткой вводной'
assert 'О V' not in ' '.join(h['roles']['o8']['knowledge']), 'Никсу раскрыто существование V'
g=json.loads((DATA/'game-data.json').read_text())
for key,clue in [('o10','B'),('o16','C')]:
 clue_text=next(x['text'] for x in g['clues'] if x['id']==clue)
 assert clue_text in ' '.join(Page(OUT/f'players/{key}.html').text), 'Не выдано содержание собственной улики'
assert 'Голос Сарна остаётся опциональной ролью ведущего' not in main
for key in h['roles']:
 doc=Page(OUT/f'players/{key}.html')
 assert all(ref.startswith('#') or ref.startswith('data:') for ref in doc.refs), 'Вводная зависит от внешних файлов'
print('OK: отказ после раскрытия, резерв знания, единые правила знаков, отсутствие метаподсказки V, содержание улик, автономность раздаток.')
# Места и изготовление: источники и выдача игроку должны совпадать.
assert set(h['venues'])=={'fair','workshop','tavern'}
assert set(h['crafting']['makers'])=={'o5','o6','o10','o16'}
assert {x['id'] for x in h['signatureGoods']}=={'shape-fixative','inspection-lens','herbal-incense'}
assert 'Принесите мастеру' in h['venues']['workshop']['intro']
public_text=' '.join(Page(OUT/'player-guide.html').text)
for entry in h['noticeboard']['examples']:
 assert entry['request'] not in public_text,'Пример раскрывает чужую цель всем'
for r in h['roles']:
 text=' '.join(Page(OUT/f'players/{r}.html').text)
 for entry in h['noticeboard']['examples']:
  if entry['author']!=r:assert entry['request'] not in text,'Чужой личный заказ попал в вводную'
 for good in h['signatureGoods']:
  if good.get('gmNote'):assert good['gmNote'] not in text,'Секрет о физическом устройстве реликвии опубликован'
assert 'd6' in public_text and 'при равенстве' in public_text.lower()
# Точные существующие изображения подключены, а не подменены сгенерированными.
source=ROOT/'apps/mini-app/packages/client/public/assets/items'
manifest=json.loads((source/'manifest.json').read_text())
expected={manifest['shard'],*manifest['resources'].values(),*manifest['recipes'].values(),*manifest['clues'].values()}
expected.update(manifest['relics'][it['name']] for it in g['relics'] if it['owner'] in h['roles'])
refs=Page(OUT/'magic-fair-v2.html').refs
for file in expected:
 assert any('/items/'+file in ref for ref in refs),('Нет изображения в книге',file)
 assert (OUT/'assets/gm-book/items'/file).read_bytes()==(source/file).read_bytes()
print('OK: три места, изготовители и три авторских товара; доска не раскрывает чужие цели; правила d6; 20 изображений вещей совпадают с исходниками.')
for leak in ['цели Лиры','целей Греты','цели Сив','цель Ады']:
 assert leak not in public_text,('Публичное пояснение выдаёт личную цель',leak)
assert len(n['craftingRules'])==3
print('OK: публичные правила без персональных условий целей; скопированная замена Астры доступна в заказе.')
# Физический обряд известен только из личных источников; никаких ответов по истории.
ritual=h['ritual']
assert len(ritual['steps'])==5
for step in ritual['steps']:
 assert all(step[k] for k in ['id','title','gm','gmAction','players','items','roleNote'])
 assert set(step['roles'])<=set(h['roles'])
assert 'при призыве ведущий говорит' not in h['historicalOverrides']['Сарн Пепельнокрылый']['fate']
assert 'договориться о воспоминании' not in ' '.join(h['roles']['o3']['acts'])
for file in ['magic-fair-v2.html','finale-sheet.html']:
 text=(OUT/file).read_text()
 assert text.count('class="ritual-step"')==5
 assert text.count('class="ritual-script"')==text.count('class="ritual-actions"')==5
 assert 'Сарн, вернись к своему сердцу.' in text
stone=Page(OUT/'ritual-stone.html');stone_text=' '.join(stone.text)
assert all(ref.startswith('#') or ref.startswith('data:') for ref in stone.refs)
for method in h['methods']:assert method['private'] not in stone_text
for role in h['roles'].values():assert role['secret'] not in stone_text
print('OK: пять физических шагов, два представления, надпись без секретов; речь Сарна только после исхода, исторического экзамена нет.')

# Новая редакция: семантика целей, источники знания и публичные описания.
docs={d['id']:d for d in n['documents']}
assert len(docs)==len(n['documents'])
assert all(d['source'] and d['text'] and set(d['holders'])<=set(n['roles']) for d in docs.values())
for key,role in n['roles'].items():
 assert len(role['story'])>=3 and all(len(p)>120 for p in role['story']),key
 assert len(role['goals'])==len(role['gmGoals'])==2 and role['abilityOrigin']
 assert set(role['documents'])=={d['id'] for d in docs.values() if key in d['holders']},key
 text=' '.join(Page(OUT/f'players/{key}.html').text)
 for d in docs.values():
  assert (d['text'] in text)==(d['id'] in role['documents']),(key,d['id'],'граница документов')
 for goal in role['gmGoals']:assert goal not in text,(key,'выдан критерий ведущего')
 assert 'Ваше действие' not in text and 'Что вы знаете в начале' not in text and 'Внешний вид' not in text
 assert 'resource:gold' in role['startingItems']
 assert all(ref in n['items'] for ref in role['startingItems'])
 own=next(r for r in g['roles'] if r['key']==key)
 expected={'resource:gold',*[f'resource:{res}' for res,count in own['bundle'].items() if count]}
 expected.update('relic:'+r['name'] for r in g['relics'] if r['owner']==key)
 for holder,shard in [('o1','I'),('o5','II'),('o9','III'),('o14','V')]:
  if key==holder:expected.add('shard:'+shard)
 if key in ['o10','o16']:expected.add('clue:'+('B' if key=='o10' else 'C'))
 assert set(role['startingItems'])==expected,(key,'неканонические стартовые вещи')
 for rule in n['rules']:
  assert rule['text'] in text and (source/rule['image']).is_file()
joining=[d for d in docs.values() if 'joining' in d.get('knowledge',[])]
assert {tuple(d['holders']) for d in joining}=={('o5',),('o17',)}
for d in joining:
 assert 'три разные целые части' in d['text'] and 'Два' in d['text'] and 'Фокуса' in d['text']
 assert ritual['formula'].rstrip('.') in d['text'] and 'place' in d['knowledge']
assert any('o4' in d['holders'] and 'place' in d.get('knowledge',[]) for d in docs.values())
for public in [public_text,stone_text]:
 assert ritual['formula'].rstrip('.') not in public and 'три целые части' not in public and 'два Фокуса' not in public
 for d in docs.values():assert d['text'] not in public
for key,forbidden in {'relic:Костяная флейта':['тайник','двойном дне','осколок','V'],'relic:Корона пепла':['вывоз','плата','дед'],'relic:Медный жезл':['разрез','убий','сердц'],'relic:Клятвенный перстень':['Эльмар','открыть ворота']}.items():
 text=' '.join(n['items'][key].values())
 for word in forbidden:assert word not in text,(key,'публичный секрет',word)
print('OK: 17 историй, 34 цели и оценки, личные документы, независимые joining, канонические startingItems, нейтральный лист места и безопасные описания вещей.')
