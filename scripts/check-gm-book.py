#!/usr/bin/env python3
"""Проверка комплектности и навигации сгенерированной книги, без сетевых запросов."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import re

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/prototypes'
game=json.loads((ROOT/'docs/design/gm-book/game-data.json').read_text())
edition=json.loads((ROOT/'docs/design/gm-book/edition-17.json').read_text())
hidden=json.loads((ROOT/'docs/design/gm-book/hidden-17.json').read_text())
narrative=json.loads((ROOT/'docs/design/gm-book/narrative-17.json').read_text())
archive_effects=json.loads((ROOT/'docs/design/gm-book/archive-ability-texts.json').read_text())['effects']
core=set(edition['roleKeys']); extra={r['key'] for r in game['roles']}-core
assert len(core)==17 and len(extra)==13 and not core & extra
class Page(HTMLParser):
    def __init__(self,path):
        super().__init__(); self.ids=[];self.refs=[];self.text=[];self.cards=[];self.path=path;self.feed(path.read_text())
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        if 'data-character' in a:self.cards.append(a['data-character'])
        for k in ['href','src']:
            if k in a:self.refs.append(a[k])
    def handle_data(self,data):self.text.append(data)
pages=[OUT/'magic-fair-v2.html',OUT/'magic-fair-expansion.html',OUT/'magic-fair-30-archive.html',*[OUT/f'characters-30-archive/{r["key"]}.html' for r in game['roles']],*[OUT/f'characters/{r["key"]}.html' for r in game['roles']]]
parsed={p:Page(p) for p in pages}
for path,page in parsed.items():
    assert len(page.ids)==len(set(page.ids)), f'Повтор id в {path}'
    for ref in page.refs:
        u=urlsplit(ref)
        if u.scheme or u.netloc:continue
        target=(path.parent/unquote(u.path)).resolve() if u.path else path
        assert target.is_file(),f'{path}: отсутствует {ref}'
        if u.fragment and target in parsed:assert unquote(u.fragment) in parsed[target].ids,f'{path}: неверный якорь {ref}'
    assert 'Только для ведущего' in ' '.join(page.text)
for r in game['roles']:
    text=' '.join(parsed[OUT/f'characters/{r["key"]}.html'].text)
    current=dict(r,**edition['roleOverrides'].get(r['key'],{}))
    values=[current['name'],current['backstory'],current['secret'],current['rumor'],current['effect'],*current['goals']]
    if r['key'] in core:
        brief=narrative['roles'][r['key']]
        values=[current['name'],current['effect'],*brief['story'],*brief['goals'],*brief['gmGoals'],brief['abilityOrigin']]
    for value in values:assert value in text,(r['key'],'утрачены сведения редакции')
    original=' '.join(parsed[OUT/f'characters-30-archive/{r["key"]}.html'].text)
    for value in [r['name'],r['backstory'],r['secret'],r['rumor'],archive_effects[r['key']],*r['goals']]:assert value in original,(r['key'],'утрачены исходные сведения в архиве')
    for id in ['background','secrets','mechanics','relations','role-acts','role-twists','acting','gm']:assert id in parsed[OUT/f'characters/{r["key"]}.html'].ids
assert len(list((OUT/'characters').glob('*.html')))==30
for r in game['roles']:
    assert (OUT/f'assets/gm-book/portraits/{r["key"]}.jpg').read_bytes()==(ROOT/f'apps/mini-app/packages/client/public/assets/portraits/{r["key"]}.jpg').read_bytes()
assert set(parsed[OUT/'magic-fair-v2.html'].cards)==core
assert set(parsed[OUT/'magic-fair-expansion.html'].cards)==extra
assert len(parsed[OUT/'magic-fair-v2.html'].cards)==17
assert len(parsed[OUT/'magic-fair-expansion.html'].cards)==13
for path in [OUT/'magic-fair-v2.html',*[OUT/f'characters/{k}.html' for k in core]]:
    doc=parsed[path]
    for ref in doc.refs:
        target=Path(urlsplit(ref).path)
        if target.suffix=='.html' and target.stem in extra:raise AssertionError(f'Ссылка на дополнительного персонажа в основной книге: {path}: {ref}')
    forbidden=r'\b(?:Пим\w*|Орсон\w*|Хельг\w*|Бубен\w*|Март[аыуе]\w*|Рун[аыуе]\w*|Магд\w*|Торвин\w*|Йорик\w*|Сцилл\w*|Долф\w*|Вест[аыуе]\w*|Кнут\w*|Вейн\w*)\b'
    assert not re.search(forbidden,' '.join(doc.text)),f'Дополнительная роль упомянута в {path}'
assert (OUT/'magic-fair-v2.html').read_text().count('<figure class="chapter-illustration">')==15
print('OK: 17 основных + 13 дополнительных досье; 63 HTML-страницы с архивом; новые вводные и архив сверены; ссылки, состав и 15 иллюстраций проверены.')
