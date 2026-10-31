#!/usr/bin/env python3
"""Собрать воспроизводимую, автономную HTML-книгу ведущего из данных Mini App."""
from pathlib import Path
import copy
import hashlib
import html
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/prototypes'
DATA = ROOT / 'docs/design/gm-book'
ASSETS = OUT / 'assets/gm-book'

def esc(x): return html.escape(str(x), quote=True)
def p(x, cls=''): return f'<p class="{cls}">{esc(x)}</p>'
def ul(xs): return '<ul>' + ''.join(f'<li>{esc(x)}</li>' for x in xs) + '</ul>'
def labelled(label, text): return f'<span class="label">{esc(label)}</span>{p(text)}'

raw = subprocess.check_output(['pnpm', '--dir', str(ROOT / 'apps/mini-app/packages/server'), 'exec', 'tsx', str(ROOT / 'scripts/export-gm-data.ts')], text=True)
game = json.loads(raw)
notes = json.loads((DATA / 'roles.json').read_text())
story = json.loads((DATA / 'story.json').read_text())
past = json.loads((DATA / 'past.json').read_text())
illustrations = {x['id']: x for x in json.loads((DATA / 'illustrations.json').read_text())['chapters']}
expected_images = {c['id'] for c in past['chapters']} | {c['id'] for c in story['chapters'] if c['id'] not in ('legend', 'crime')}
assert set(illustrations) == expected_images, 'Каждой главе нужна своя иллюстрация'
roles = game['roles']
by_key = {r['key']: r for r in roles}
sides = {f['id']: f['name'] for f in game['factions']}
assert len(roles) == 30 and set(by_key) == set(notes), 'Нужны материалы всех 30 ролей'
assert len(story['acts']) == 3
assert set(past['roles']) == set(by_key)
assert len({c['id'] for c in past['chapters']}) == len(past['chapters'])
for c in past['chapters']:
    assert c['paragraphs'] and all(k in by_key for q in c['paragraphs'] for k in q['roles'])
for who in past['participants']:
    assert who['role'] is None or who['role'] in by_key
    assert all(who.get(k) for k in ['origin','motive','knowledge','act','fate','result','impact'])
for detail in past['roles'].values(): assert detail['history'] and detail['knowledge']
assert set(by_key) <= {k for c in story['chapters'] for q in c['paragraphs'] for k in q['roles']}, 'История должна включать все роли'
for key, n in notes.items():
    assert len(n['acts']) == 3 and n['hooks'] and n['summary'] and n['gmNote'] and n['absence'], key
    assert all(link['role'] in by_key for link in n['links']), key
for twist in story['twists']:
    assert twist['kind'] in ('core', 'optional')
    assert all(key in by_key for key in twist['roles'])
    for field in ['trigger', 'knowledge', 'steps', 'consequence', 'gm', 'absence', 'release']: assert twist[field], (twist['id'], field)
DATA.mkdir(parents=True, exist_ok=True)
(DATA / 'game-data.json').write_text(raw)
(OUT / 'characters').mkdir(exist_ok=True)
(ASSETS / 'portraits').mkdir(parents=True, exist_ok=True)
for r in roles:
    shutil.copyfile(ROOT / f'apps/mini-app/packages/client/public/assets/portraits/{r["key"]}.jpg', ASSETS / f'portraits/{r["key"]}.jpg')
archive = OUT / 'magic-fair-v2-archive.html'
if not archive.exists(): shutil.copyfile(OUT / 'magic-fair-v2.html', archive)

# Полные источники остаются основой дополнения; редакция 17 — отдельный согласованный срез книги.
full_game, full_notes, full_story, full_past = map(copy.deepcopy, (game, notes, story, past))
edition = json.loads((DATA / 'edition-17.json').read_text())
core_keys = set(edition['roleKeys'])
assert core_keys == {r['key'] for r in roles if 17 in r['rosters']} and len(core_keys) == 17
roles = [dict(r, **edition['roleOverrides'].get(r['key'], {})) for r in roles if r['key'] in core_keys]
extra_roles = [r for r in full_game['roles'] if r['key'] not in core_keys]
assert len(extra_roles) == 13
notes, story, past = edition['notes'], edition['story'], edition['past']
assert set(notes) == set(past['roles']) == core_keys
by_key.update({r['key']: r for r in roles})
game['roles'] = roles
game['relics'] = [dict(it, wants=[k for k in it['wants'] if k in core_keys]) for it in game['relics'] if it['owner'] in core_keys or any(k in core_keys for k in it['wants'])]
assert len(game['relics']) == 8
core_game, core_notes, core_story, core_past = game, notes, story, past


def portrait(key, prefix=''):
    data = (ASSETS / f'portraits/{key}.jpg').read_bytes()
    return f'{prefix}assets/gm-book/portraits/{key}.jpg?v={hashlib.sha256(data).hexdigest()[:12]}'

def link(key, individual=False):
    assert key in by_key, key
    url = f'{key}.html' if individual else f'characters/{key}.html'
    return f'<a href="{url}">{esc(by_key[key]["name"])}</a>'

def people(keys, individual=False):
    return '<div class="people-links">' + ''.join(link(k, individual) for k in dict.fromkeys(keys)) + '</div>'

def illustration(key):
    art = illustrations[key]
    asset = ASSETS / 'chapters' / art['file']
    assert asset.is_file(), asset
    version = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
    url = f'assets/gm-book/chapters/{art["file"]}?v={version}'
    return f'<figure class="chapter-illustration"><a href="{esc(url)}" target="_blank" rel="noopener" aria-label="Открыть иллюстрацию крупно: {esc(art["alt"])}"><img src="{esc(url)}" alt="{esc(art["alt"])}" width="1536" height="1024" loading="lazy" decoding="async"></a><figcaption><span>{esc(art["caption"])}</span><a href="{esc(url)}" target="_blank" rel="noopener">Рассмотреть ↗</a></figcaption></figure>'

def section(id, num, title, intro, body):
    return f'<section class="chapter" id="{id}"><div class="section-head"><span class="section-no">{num}</span><div><h2>{esc(title)}</h2>{p(intro) if intro else ""}</div></div>{body}</section>'

def page(title, body, key=None, expansion=False):
    prefix = '../' if key else ''
    is_extra = expansion or (key is not None and key not in core_keys)
    home = prefix + ('magic-fair-expansion.html' if is_extra else 'magic-fair-v2.html')
    nav = [('legend','01','Что произошло'),('chronicle','02','Полная история'),('acts','03','Вечер по актам'),('characters','04','Все персонажи'),('twists','05','Сюжетные повороты'),('evidence','06','Вещи и улики'),('endings','07','Финал и Сарн')]
    if is_extra: nav = [('characters','01','13 дополнительных ролей'),('expansion-story','02','Сохранённые ветки'),('sources','03','Полная прежняя редакция')]
    nav_html = ''.join(f'<a href="{home}#{anchor}"><span>{n}</span>{label}</a>' for anchor,n,label in nav)
    rev = hashlib.sha256((ASSETS/'book.css').read_bytes()).hexdigest()[:10]
    jsrev = hashlib.sha256((ASSETS/'book.js').read_bytes()).hexdigest()[:10]
    return f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#171713"><title>{esc(title)} · Книга ведущего</title><link rel="stylesheet" href="{prefix}assets/gm-book/book.css?v={rev}"><script defer src="{prefix}assets/gm-book/book.js?v={jsrev}"></script></head>
<body><a class="skip" href="#main">К содержанию</a><aside class="sidebar"><div class="sigil" aria-hidden="true">С</div><a class="brand" href="{home}">Ярмарка<br>украденной магии</a><p class="edition">Книга ведущего<br>{'Дополнение до 30' if is_extra else '17 игроков + ведущий'}</p><button class="mobile-toggle" data-menu aria-expanded="false" aria-controls="book-nav">Оглавление</button><nav id="book-nav" aria-label="Разделы книги">{nav_html}</nav><div class="sidebar-bottom"><button data-print>Печатать {'персонажа' if key else 'книгу'}</button><p>Только для ведущего.<br>Здесь раскрыты все тайны.</p><a href="{prefix}magic-fair-v2.html">Основная книга · 17</a><br><a href="{prefix}magic-fair-expansion.html">Дополнение · ещё 13 ↗</a></div></aside><main class="book" id="main"><header class="masthead"><span>Застава у брода / Дело Сарна</span><span>Все секреты раскрыты</span></header>{body}<footer class="endnote">Справочник для подготовки и ведения игры. Стартовые данные, а не состояние текущей сессии.<br><a href="{prefix}../design/gm-book/README.md">Источники и сборка</a><a href="{home}#characters">{13 if is_extra else 17} персонажей</a><a href="{prefix}../design/free-play.md">Инструменты «Сюжета»</a></footer></main></body></html>'''

# Точные условия из каталога целей: дополнительное объяснение проверки ведущему.
def goal_rule(g):
    t=g['type']; kinds={'potion':'Очищающих зелий','ward':'Защитных талисманов','focus':'Фокусов силы'}
    if t=='holdItem': return f'При закрытии в личном инвентаре: {g["ref"]}.'
    if t=='holdRelics': return f'При закрытии одновременно {g["count"]} разных реликвии. Ранее проданные не считаются.'
    if t=='holdCraftedKinds': return f'При закрытии {g["count"]} разных вида изготовленных вещей; считается владение, а не история изготовления.'
    if t=='holdKind': return f'При закрытии неиспользованных {kinds[g["kind"]]}: не меньше {g["count"]}.'
    if t=='holdClues': return 'Все три улики A, B, C у этого игрока при закрытии. Разговоры и показ чужой улики не заменяют владение.'
    if t=='goldAtLeast': return f'При закрытии золота в личном кошельке не меньше {g["value"]}.'
    if t=='craftedKinds': return f'По журналу лично изготовлены {g["count"]} разных вида вещей; покупки чужих изделий не считаются.'
    if t=='soldCrafted': return f'По журналу проданы {g["count"]} собственных изделия {g["distinctBuyers"]} разным покупателям; каждый минимум за {g["minPrice"]} золото.'
    if t=='exchanges': return f'Завершённые двусторонние обмены с {g["distinctPartners"]} разными игроками; пустое обещание или подарок не заменяет обмен.'
    if t=='servicePaid': return f'Сделки с отметкой услуги: не меньше {g["minGold"]} золота от каждого из {g["distinctPayers"]} разных плательщиков.'
    if t=='abilityUsed': return f'Успешные применения собственной способности: {g["count"]}.' + (f' Разных целей: {g["distinctTargets"]}.' if 'distinctTargets' in g else '') + ' Заблокированная попытка не считается успехом.'
    if t=='shapeSelf': return 'В журнале есть применение Камня облика к себе; одной покупки камня недостаточно.'
    if t=='cleansed': return 'Проклятие действительно снято зельем или способностью очищения; завершение акта не считается.'
    if t=='cleanseOthers': return f'Своей способностью действительно сняты проклятие или шипы с {g["distinctTargets"]} разных игроков.'
    if t=='contributedGold': return f'К закрытию собственные невозвращённые вклады золота на сторону «{sides[g["side"]]}»: минимум {g["value"]}.'
    if t=='contributedFocus': return f'К закрытию собственные невозвращённые Фокусы на стороне «{sides[g["side"]]}»: {g["count"]}. Успех всего ритуала не требуется.'
    if t=='contributedShard': return f'К закрытию личный невозвращённый вклад осколка на стороне «{sides[g["side"]]}».'
    if t=='gaveKind': return f'Лично изготовлены и переданы сделками {g["count"]} {kinds[g["kind"]]} {g["distinctReceivers"]} разным получателям.'
    if t=='protectedOthers': return f'Успешная защита собственной способностью {g["distinctTargets"]} разных игроков.'
    if t=='potionOnOther': return 'В журнале успешно применено Очищающее зелье к другому игроку с его согласием.'
    raise ValueError(t)

TARGETS={'none':'Без отдельной цели: собственное действие или изделие.', 'other':'Другой присутствующий игрок.', 'any':'Себя или другого присутствующего игрока.', 'protectedAndOther':'Нынешний владелец защиты и другой получатель.'}
MECHANICAL_NOTES={
'o14':'Осколок V — отдельная игровая вещь. Продажа Костяной флейты сама по себе не передаёт осколок; в III акте укажите его отдельно в сделке. Продажа V дороже 5 — сюжетное намерение, не третья автоматическая личная цель.',
'o17':'Если владельца оригинала нет на ярмарке, его согласие не требуется; согласия цели копируемого действия остаются обязательными. Копия расходует применение Астры, а не оригинала.',
'o15':'«Нюх» показывает только наличие выбранного базового ингредиента у присутствующих. Не показывает его количество, осколки, тайны или состояние превращения.',
'o11':'Инвентарь не раскрывает личные цели и секреты. Осколок V до III акта скрыт и от осмотра.',
'o9':'Звон при лжи — отыгрыш. Приложение хранит отметку проклятия, но не проверяет слова игрока. Очищение не удаляет улики и не меняет историческую правду.',
'o10':'Действующий движок очищения также снимает шипы. Для личной цели требуется действительно снятый эффект с другого игрока.',
'r5':'Ответ на вопрос да/нет произносит игрок. Приложение фиксирует применение, но не генерирует и не проверяет устный ответ.',
'r2':'Приложение показывает действующую сторону, включая изменение ведущим через «Сюжет»; это не раскрытие целей.',
'n20':'Перековка работает с собственным свободным изделием. Камень облика не участвует; результат должен быть другого вида из списка допустимых изделий.',
}

# Главная: сначала легенда и история, затем справочные разделы.
hero=f'''<section class="chapter hero"><span class="eyebrow">Основная история · 17 персонажей · все тайны</span><div class="hero-grid"><div><h1>Ярмарка<br>украденной<br><em>магии</em></h1><p class="lead">Сто лет назад у дракона вырезали сердце.<br>Сегодня каждый пришёл за своей долей.</p><p class="hero-note">Книга ведущего: кто открыл ворота, кому достались осколки и что может случиться в эту ночь. От первого знакомства до последнего признания.</p><div class="quick-links"><a class="button" href="#characters">Найти персонажа ↗</a><a class="button light" href="#chronicle">Читать историю</a></div></div><div><div class="hero-art"><img class="large" src="{portrait('o9')}" alt="Эльмар — рыцарь, открывший ворота"><img class="small" src="{portrait('o1')}" alt="Серафина — претендентка на наследство Сарна"></div><p class="art-caption">Один помнит преступление.<br>Другая ждёт возвращения дракона.</p></div></div><div class="stats"><div><b>17</b><span>игроков в основном составе</span></div><div><b>3</b><span>акта до закрытия</span></div><div><b>13</b><span>ролей в дополнении</span></div></div></section>'''
legend='<div class="truth">'+labelled('Рабочий состав · 17 игроков и ведущий','Четыре сторонника пробуждения, четыре подчинения, четыре разрушения и пять независимых. Основной рассказ и связи рассчитаны на эти роли. Материалы ещё 13 участников сохранены отдельно для расширения.')+'<p><a href="magic-fair-expansion.html">Открыть дополнение до 30 →</a></p></div>'
legend+=labelled('Можно прочитать всем',game['story']['public'])
legend+=f'<div class="truth">{labelled("Краткое раскрытие из игры",game["story"]["truth"])}</div>'
legend+=p('Дело об убийстве и судьба сердца — две разные линии. Ритуал определяет исход ярмарки, а три улики в руках одного игрока при закрытии открывают «Правду». Ни один конкретный гость не обязателен для расследования.')
legend+='<div class="two-col"><div class="note">'+labelled('Что знают игроки','Каждый знает свою предысторию, тайну и слух с карточки. Чужие секреты и этот справочник им заранее не показывают. Разговор, сделка или согласованная сцена могут изменить круг знающих.')+'</div><div class="note">'+labelled('Как читать книгу','Вводные адаптированы к составу на 17; исходная редакция сохранена в дополнении и архиве. Планы действий и свободные сцены — предложения ведущему. Не заставляйте игрока повторять их; используйте как помощь, когда ему нужен следующий шаг.')+'</div></div>'
legend+=p('Финальная сцена находится в переработке: владелец выбрал направление с личными действиями и последним выбором участников. Точные способы воздействия на сердце ещё обсуждаются. Алтари и связанные с ними цели ниже описывают нынешнее приложение, а не утверждённую сюжетную модель.','aside-note')
chronicle=p(past['note'],'aside-note')
chronicle+='<nav aria-label="Подробная история"><ul>'+''.join(f'<li><a href="#past-{esc(c["id"])}">{esc(c["title"])}</a></li>' for c in past['chapters'])+'<li><a href="#historical-cast">Мотивы, результат и судьба каждого участника</a></li><li><a href="#past-aftermath">Что изменилось вокруг</a></li></ul></nav>'
for c in past['chapters']:
    chronicle+=f'<article class="chapter-story" id="past-{esc(c["id"])}"><h3>{esc(c["title"])}</h3>{illustration(c["id"])}<div class="prose">'
    for para in c['paragraphs']: chronicle+=p(para['text'])+people(para['roles'])
    chronicle+='</div></article>'
chronicle+='<article class="chapter-story" id="historical-cast"><h3>Участники: откуда пришли и что оставили после себя</h3>'
for who in past['participants']:
    chronicle+=f'<article class="note"><h4>{esc(who["name"])}</h4>'
    for field,label in [('origin','Откуда пришёл'),('motive','Чего добивался'),('knowledge','Что знал'),('act','Что сделал'),('result','Чего достиг на самом деле'),('impact','Как это повлияло на остальных'),('fate','Куда делся и что осталось')]: chronicle+=labelled(label,who[field])
    if who['role']: chronicle+='<p>Связанное досье: '+link(who['role'])+'</p>'
    chronicle+='</article>'
chronicle+='</article><article class="chapter-story" id="past-aftermath"><h3>'+esc(past['aftermath']['title'])+'</h3>'+''.join(p(x) for x in past['aftermath']['paragraphs'])+'</article>'
for c in story['chapters']:
    if c['id'] in ('legend','crime'): continue
    chronicle+=f'<article class="chapter-story" id="story-{esc(c["id"])}"><h3>{esc(c["title"])}</h3>{illustration(c["id"])}<div class="prose">'
    for para in c['paragraphs']: chronicle+=p(para['text'])+people(para['roles'])
    chronicle+='</div></article>'
acts='<div class="truth">'+labelled('Порядок текущего приложения','Три акта и команды ниже сохранены как рабочая справка. Новый финал с разными действиями вместо одинаковых алтарей ещё проектируется; его условия не подменяются этими инструкциями.')+'</div>'
for i,a in enumerate(story['acts'],1):
    acts+=f'<article class="act"><span class="eyebrow">Акт {i}</span><h3>{esc(a["title"])}</h3><blockquote>{esc(a["announcement"])}</blockquote>{people(a["roles"])}<div class="two-col"><div>{ul(a["steps"])}</div><div>{labelled("Что известно участникам",a["knowledge"])}{labelled("Действия ведущего",a["gm"])}</div></div></article>'
acts+=p('Ориентир стандартного вечера: 0–10 минут — объяснение; 10–35 — акт I; 35–60 — акт II; 60–85 — акт III; затем фиксация и раскрытия до 120-й минуты. Паузы и фактический момент закрытия контролирует ведущий.','aside-note')
def build_catalog(catalog_roles):
    catalog='''<div class="filters"><label><span class="label">Имя, роль или предмет</span><input id="character-search" type="search" placeholder="Имя, способность или предмет…" autocomplete="off"></label><label><span class="label">Сторона</span><select id="side-filter"><option value="">Все стороны</option>'''+''.join(f'<option value="{k}">{esc(v)}</option>' for k,v in sides.items() if any(r['side']==k for r in catalog_roles))+'''</select></label></div><p id="search-status" class="results-count" role="status" aria-live="polite">'''+str(len(catalog_roles))+''' персонажей · материалы этой редакции</p><p id="no-results" class="empty" hidden>Никого не найдено. Попробуйте другое имя или выберите все стороны.</p><div class="catalog">'''
    for i,r in enumerate(catalog_roles,1):
        search=' '.join([r['name'],r['title'],r['skill'],r['extra'],*r['goals'],r['secret']])
        catalog+=f'<a class="character" data-character="{r["key"]}" data-side="{r["side"]}" data-search="{esc(search)}" href="characters/{r["key"]}.html"><img loading="lazy" width="480" height="480" src="{portrait(r["key"])}" alt="Портрет: {esc(r["name"])}"><div class="character-top"><span>Досье {i:02}</span><span>{esc(sides[r["side"]])}</span></div><h3>{esc(r["name"])}</h3>{p(r["title"])}</a>'
    catalog+='</div><noscript><p>Без JavaScript доступны все карточки; для поиска используйте поиск браузера.</p></noscript>'
    return catalog
catalog=build_catalog(roles)
twists=''
for t in story['twists']:
    twists+=f'<article class="twist" id="{esc(t["id"])}"><span class="tag">{"Возможность действующего сюжета" if t["kind"]=="core" else "Опциональная сцена · решение ведущего"}</span><h3>{esc(t["title"])}</h3>{people(t["roles"])}<div class="twist-grid"><div>{labelled("Условия запуска",t["trigger"])}{labelled("Кто что знает",t["knowledge"])}{ul(t["steps"])}</div><div>{labelled("Что изменится",t["consequence"])}{labelled("Как провести в приложении",t["gm"])}{labelled("Если участника нет",t["absence"])}{labelled("Выход из состояния / завершение сцены",t["release"])}</div></div></article>'

evidence='<div class="truth">'+labelled('Граница знания','Сведения ниже доступны ведущему. Знание происхождения вещи не даёт игроку автоматического права на неё. Реликвии — предметы целей и торговли; их легенды не добавляют серверных эффектов.')+'</div><h3>Три улики</h3>'
for c in game['clues']:
    evidence+=f'<article class="note"><span class="label">Улика {esc(c["id"])}</span><h4>{esc(c["name"])}</h4>{p(c["text"])}{p(c["where"],"aside-note")}{people([{ "B": "o10", "C": "o16" }[c["id"]]]) if c["id"] in ("B", "C") else ""}</article>'
evidence+='<h3>Пять осколков</h3><div class="two-col">'
for sh in game['shards']:
    text=('Стартовый владелец: '+by_key[sh['owner']]['name']) if 'owner' in sh else ('Лот II акта вместе с уликой A.' if sh['id']=='IV' else 'Тайно у Лиры, открывается в III акте. Без неё выходит через лот III акта.')
    evidence+=f'<div class="note"><h4>Осколок {sh["id"]}</h4>{p(text)}{people([sh.get("owner",sh.get("hidden"))]) if sh.get("owner",sh.get("hidden")) else ""}</div>'
evidence+='</div><h3>8 реликвий основного состава: кто владеет и кто ищет</h3><div class="table-wrap"><table><thead><tr><th>Реликвия / происхождение</th><th>На старте</th><th>Заинтересованы</th></tr></thead><tbody>'
for it in game['relics']:
    evidence+=f'<tr><td><strong>{esc(it["name"])}</strong>{p(it["lore"])}</td><td>{link(it["owner"])}</td><td>{people(it["wants"]) if it["wants"] else "Личные переговоры"}</td></tr>'
evidence+='</tbody></table></div>'+p('Если владельца нет, нужные составу реликвии попадают в пул лотов. Осколки и стартовые улики отсутствующих также выходят через предусмотренные лоты; ресурсы неявившегося не раздаются остальным. Владельцы в таблице — исходные, после сделок сверяйтесь с Mini App.','aside-note')
evidence+='<h3>Обычные изделия</h3><div class="two-col">'
for recipe in game['recipes']:
    names={'ash':'Пепел','moon':'Лунная пыль','dew':'Роса'}
    cost=', '.join(f'{v} × {names[k]}' for k,v in recipe['cost'].items())+f'; работа: {recipe["gold"]} золота.'
    evidence+=f'<article class="note"><h4>{esc(recipe["name"])}</h4>{p(recipe["text"])}{p(cost,"aside-note")}</article>'
evidence+='</div>'
endings=labelled('Справка о действующем приложении · условие готового алтаря','3 разных осколка + 2 Фокуса силы + 6 золота минимум от 3 разных вкладчиков золота. Проверяется при закрытии. До закрытия свои вклады можно забрать.')
for k, text in game['outcomeTexts'].items():
    if k == 'ship': continue
    endings+=f'<article class="outcome"><span class="label">{"Ни один алтарь не готов" if k=="sleep" else "Готов соответствующий алтарь"}</span><h3>{esc(game["outcomeTitles"][k])}</h3><blockquote>{esc(text)}</blockquote></article>'
endings+='<div class="truth">'+labelled('После исхода · Правда',game['story']['truth_read'])+p('Если улики распределены между разными людьми, официального раскрытия и достижения «Правда» нет. Все могут обсудить личные секреты в обычном круге после игры.')+'</div>'
endings+=p('В стандартной игре два готовых алтаря одновременно невозможны: для этого потребовалось бы шесть осколков, а их пять. Смена стороны через «Сюжет» меняет действующую сторону и итог, но не переписывает исходные личные цели и прежние вклады.','aside-note')
endings+='<h3>Личный итог: что изменил каждый игрок</h3>'+p('После общего исхода назовите для каждого присутствующего четыре вещи: чего он хотел; что действительно сделал; что получил или потерял; на кого повлиял. Сверяйте личные достижения с итогами приложения, а сюжетные последствия — с завершёнными сценами и решениями ведущего. Намерение и обещание ещё не совершённое действие.')+ul(['Продал предмет и заработал: отметьте, кому он помог этим предметом и как покупатель его использовал. Если использования не было, не приписывайте результат продавцу.','Снял проклятие: получил свободу от эффекта, но не отменил совершённого; отдельно назовите признание, помощь пострадавшим или отказ от них, если они произошли.','Передал осколок или Фокус: назовите вклад в фактический исход сердца; личная награда и судьба Сарна могут оцениваться по-разному.','Сменил сторону, воскрес или освободился от приказа: опишите конкретную сцену и состояние к концу, затем назовите тех, кому выбор помог или помешал.'])+p('Шаблон эпилога: «Ты хотел … . За вечер ты … . Поэтому получил/потерял … . Для … это означало … . После закрытия …». Последнюю фразу согласуйте с игроком; не объявляйте все цели выполненными и не предписывайте будущие поступки.')
endings+='<h3>Распорядитель — последний голос Сарна</h3><span class="tag">Опциональное раскрытие ведущего</span>'+p('Ведущий весь вечер — голос дракона, оставшийся у брода. У него нет тела, собственной победы или права переиграть исход. Память о ночи убийства расколота; раскрытие ведущего не заменяет три улики.')
endings+=ul(['После фиксации прочитайте штатный исход.','Если выполнено условие трёх улик, прочитайте Правду и дайте Эльмару первое признание, если он присутствует.','Покажите незаметный реквизит — кольцо, чешую или перчатку — и назовите себя.','Дайте остальным закончить их личные истории.'])
endings+='<blockquote>Вы считали, что я только объявляю торги. Но весь вечер я слушал, как вы делите моё сердце. Меня звали Сарн Пепельнокрылый. Тело вы у меня отняли сто лет назад. Голос остался здесь — ждать вашего решения.</blockquote>'
voices={'wake':'Впервые за сто лет я слышу своё сердце. Вы вернули мне жизнь. Всё остальное нам ещё предстоит решить.','bind':'Теперь вы знаете имя того, кому будете приказывать. Я слышу вас. Приказывайте.','break':'Вы не вернули мне жизнь. Но закончили мою смерть. Пусть больше никому не придётся ждать сто лет.','ship':'Сто лет я ждал возвращения домой. Вы дали мне другую дорогу. Только цену этой дороги назвали без меня.','sleep':'Тогда до следующей ярмарки. Я постараюсь запомнить ваши имена. Своё я уже назвал.'}
endings+='<div class="two-col">'+''.join(f'<div class="note">{labelled(game["outcomeTitles"][k],v)}</div>' for k,v in voices.items() if k != 'ship')+'</div>'
endings='<div class="truth">'+labelled('Финальная сцена: предстоит доработать','Обсуждаем пробуждение, подчинение, уничтожение или незавершённое решение. Владелец хочет разные сюжетные действия и общий решающий момент, где участвуют все 17. Точные условия, порядок вмешательств и личные цели после изменения правил ещё не утверждены. Ниже сохранена техническая справка о нынешнем приложении.')+'</div><details><summary>Текущие правила и тексты исходов приложения</summary>'+endings+'</details>'
main=hero+section('legend','01','Что произошло у брода','Короткая опора перед чтением всех историй.',legend)+section('chronicle','02','История заставы и её наследников','От основания и убийства Сарна до последствий и нынешней ярмарки. Ссылки ведут к полным досье.',chronicle)+section('acts','03','Как вести этот вечер','Объявления задают общий ритм. Дальнейшие решения принимают игроки.',acts)+section('characters','04','Лица ярмарки','У каждого — причина приехать, личная ставка и то, о чём он предпочёл бы молчать.',catalog)+section('twists','05','Когда история меняет направление','Для каждого поворота: событие, участники, сведения и последствия. Смерть и подчинение продолжают игру, а не выводят человека из неё.',twists)+section('evidence','06','То, что переходит из рук в руки','Стартовое распределение, происхождение и связи предметов.',evidence)+section('endings','07','Последнее слово','Исход сердца, раскрытие правды и личные признания идут последовательно.',endings)
(OUT/'magic-fair-v2.html').write_text(page('Ярмарка украденной магии',main))

appendix='<section class="chapter"><span class="eyebrow">Материалы для будущего расширения</span><h1>Дополнение<br><em>до 30 игроков</em></h1>'+p('Эти 13 ролей не участвуют в основной редакции на 17. Здесь сохранены их вводные, способности, цели, связи и повороты. Добавление роли потребует отдельной проверки состава и финальной сцены.')+'<p><a href="magic-fair-v2.html">← Основная книга на 17</a></p></section>'
appendix+=section('characters','01','13 дополнительных персонажей','Полные досье сохранены для возможных дальнейших доработок.',build_catalog(extra_roles))
branches=''
for title,keys,description in [
    ('Жизнь старой заставы',['n18','n19','n20'],'Конюх, писарь ордена и кузнец добавляют воспоминания о драконе, служебные обязательства и цепочку уздечки, колокольчика и молота.'),
    ('Свидетели, память и поиски',['r1','r2','r3','r4','r5','r6'],'Театральная труппа, свидетельница открытия ворот, поиски логова, старые долги, гадание и погребение. Эти линии не требуются для расследования основной версии.'),
    ('Торговый дом и вывоз',['t1','t2','t3','t4'],'Отдельная группа с заказчиком, оценщиком, перевозчиком и стражницей. Сохранены тайна покупателя и прежний исход вывоза; в основном составе этой ветки нет.')]:
    branches+='<article class="note"><h3>'+esc(title)+'</h3>'+p(description)+people(keys)+'</article>'
appendix+=section('expansion-story','02','Что добавляют эти роли','Сохранённые направления прежней редакции, а не обязательства будущего сценария.',branches)
source=p('Полная прежняя история, все акты, повороты, предметы и досье зафиксированы до сокращения состава. Это архив редакции на 30, а не продолжение основной истории, которое нужно читать для игры на 17.')+'<p><a href="magic-fair-30-archive.html">Открыть полную прежнюю книгу на 30 →</a></p>'+p('В редакции 17 финансирование и вывоз сосредоточены на деде Грима и Орвике; корона взята из имущества заставы. В расширенной редакции сохраняется заказ торгового дома, другой путь короны, перевозчики и дополнительные свидетели. При возврате этих веток потребуется согласовать различия, а не сложить версии автоматически.')
source+='<details><summary>Исходные досье 17 основных ролей до редакционной адаптации</summary>'+''.join('<p><a href="characters-30-archive/'+r['key']+'.html">'+esc(r['name'])+'</a></p>' for r in roles)+'</details>'
appendix+=section('sources','03','Прежняя редакция и различия','Материалы сохранены целиком.',source)
(OUT/'magic-fair-expansion.html').write_text(page('Дополнение до 30 игроков',appendix,expansion=True))

for r in roles + extra_roles:
    is_extra = r['key'] not in core_keys
    group = extra_roles if is_extra else roles
    i = next(j for j,x in enumerate(group) if x['key'] == r['key'])
    game, notes, story, past = (full_game, full_notes, full_story, full_past) if is_extra else (core_game, core_notes, core_story, core_past)

    key=r['key']; n=notes[key]; a=r['acting']; ab=r['ability']
    hero=f'<section class="chapter"><div class="breadcrumbs"><a href="../magic-fair-v2.html#characters">← Все персонажи</a> / Досье {i+1:02}</div><div class="dossier-head"><div><span class="eyebrow">{esc(sides[r["side"]])} · {esc(r["style"])}</span><h1>{esc(r["name"])}</h1><p class="role-title">{esc(r["title"])}</p>{p(n["summary"],"dossier-summary")}<span class="tag">Полное досье ведущего</span></div><div class="dossier-portrait"><img src="{portrait(key,"../")}" alt="{esc(r["name"])}" width="480" height="600"></div></div><nav class="role-nav" aria-label="Разделы персонажа"><a href="#background">Предыстория</a><a href="#secrets">Тайны</a><a href="#mechanics">Способность и цели</a><a href="#relations">Связи</a><a href="#role-acts">По актам</a><a href="#role-twists">Повороты</a></nav></section>'
    background=f'<div class="dossier-section" id="background"><span class="label">Что читает игрок</span><h2>Предыстория</h2>{p(r["intro"])}{p(r["backstory"])}<h3>Чего хочет на самом деле</h3>{p(r["motivation"])}</div>'
    background+=f'<div class="dossier-section secret-block" id="secrets"><span class="label">Не общедоступное знание</span><h2>Личная тайна</h2>{p(r["secret"])}<h3>Слух на старте</h3>{p(r["rumor"])}{p("Слух известен этому персонажу. Он не становится автоматически знанием остальных и сам по себе не заменяет улику.","aside-note")}</div>'
    if n.get('loreNote'): background+=f'<div class="truth">{labelled("Примечание ведущему",n["loreNote"])}</div>'
    detail=past['roles'][key]
    background+='<div class="dossier-section" id="history"><span class="label">Расширенная история · для ведущего</span><h2>Место в истории заставы</h2>'+p(detail['history'])+labelled('Что известно самому персонажу',detail['knowledge'])+'<p><a href="../magic-fair-v2.html#historical-cast">Мотивы, результаты и судьбы участников →</a></p></div>'
    roster='Дополнение до 30; не входит в основной состав' if is_extra else 'Основной состав: 17 игроков и отдельный ведущий'
    gear=labelled('Редакция',roster)+labelled('Старт при отмеченной явке','6 золота; '+', '.join(f'{name}: {r["bundle"].get(k,0)}' for k,name in [('ash','Пепел'),('moon','Лунная пыль'),('dew','Роса')])+'.')
    owned=[it for it in game['relics'] if it['owner']==key]
    for item in owned: gear+=f'<h4>{esc(item["name"])}</h4>{p(item["lore"])}'
    extras=[f'Осколок {s["id"]}' for s in game['shards'] if s.get('owner')==key]
    if key=='o14': extras+=['Осколок V: скрыт до III акта.']
    if key=='o9': extras+=['Старое проклятие: отметка в игре и звон при лжи в отыгрыше.']
    if key=='o10': extras+=['Улика B — Пепел на перчатке.']
    if key=='o16': extras+=['Улика C — Клятва у ворот.']
    if extras: gear+=ul(extras)
    if not owned and not extras: gear+=p('Особых стартовых вещей нет: главная валюта в разговорах — способность, ингредиенты и сведения.')
    gear+=p('Вещи перечислены на старте. После передачи или торговли смотрите актуальный инвентарь в приложении.','aside-note')
    body=hero+f'<section class="chapter"><div class="dossier-layout"><div>{background}</div><aside class="key-facts"><h3>Перед началом</h3>{gear}</aside></div></section>'
    mech=f'<div class="two-col"><div><span class="eyebrow">{esc(r["skill"])}</span><h3>Как работает способность</h3>{p(r["effect"])}{labelled("Где применять","Мастерская — внутри покупки или изготовления; отдельные действия доступны также с роли." if ab["place"]=="workshop" else "На экране «Роль».")}{labelled("Цель",TARGETS[ab["target"]])}'
    mech+=p('Одно применение за акт. Сервер проверяет доступность ресурсов и действие эффекта. Активная сюжетная замена может временно закрыть основную способность.','aside-note')
    if ab['consent']: mech+=p('Нужно согласие затронутого игрока; для эффекта на себя отдельный ответ не требуется. Согласие через приложение имеет срок ожидания 5 минут.')
    if ab['hostile']: mech+=p('Враждебное действие: защита может его остановить; по одной цели допускается не более одной враждебной попытки за акт. Даже остановленная попытка расходует применение.')
    if key in MECHANICAL_NOTES: mech+=f'<div class="truth">{p(MECHANICAL_NOTES[key])}</div>'
    mech+='</div><div><span class="eyebrow">Две личные цели</span>'
    for idx,goal in enumerate(r['goals']): mech+=f'<article class="note"><h3>{idx+1:02}</h3>{p(goal)}{p(goal_rule(r["goalConditions"][idx]),"aside-note")}</article>'
    mech+=p('Достижение за выбранный исход и раскрытие «Правды» считаются отдельно. Сюжетная цель от ведущего не заменяет эти две автоматически.','aside-note')+'</div></div>'
    body+=section('mechanics','I','Правила этого персонажа','Текст способности и условия целей сверены с каталогами Mini App.',mech)
    relations=[]
    for c in r['contacts']:
        if c['role']: relations.append((c['role'],'Первый контакт · '+c['text']))
        else: relations.append((None,'Ориентир первого разговора · '+c['text']))
    for other in (full_game['roles'] if is_extra else roles):
        for c in other['contacts']:
            if c['role']==key: relations.append((other['key'],'Может прийти к вам · '+c['text']))
    for item in game['relics']:
        if key in item['wants'] and item['owner']!=key: relations.append((item['owner'],f'Вы ищете «{item["name"]}». По стартовой раздаче предмет здесь.'))
        if item['owner']==key:
            for who in item['wants']:
                if who!=key: relations.append((who,f'Ищет вашу реликвию «{item["name"]}». Есть основание для торга.'))
    for rel in n['links']: relations.append((rel['role'],'Сюжетная связь · '+rel['text']))
    relation_html=''
    grouped={}
    for who,text in relations: grouped.setdefault(who,[]).append(text)
    for who,texts in grouped.items():
        relation_html+=f'<article class="relation"><h3>{link(who,True) if who else "Найти на ярмарке"}</h3>'+''.join(p(x) for x in dict.fromkeys(texts))+'</article>'
    body+=section('relations','II','Связи и предметы торга','Это карта для ведущего. Персонаж не обязан знать чужие тайны, перечисленные на связанных страницах.',relation_html)
    roleacts='<span class="tag">Предлагаемый маршрут · решения остаются за игроком</span><div class="act-strip">'+''.join(f'<article><span class="label">Акт {j+1}</span><h3>{["Войти в историю","Поставить на карту","Сделать выбор"][j]}</h3>{p(x)}</article>' for j,x in enumerate(n['acts']))+'</div>'
    body+=section('role-acts','III','Что делать в течение вечера','Три опоры, если игроку нужна подсказка для следующего разговора.',roleacts)
    hooks='<span class="tag">Опциональные сцены · подтверждает ведущий</span>'
    for h in n['hooks']: hooks+=f'<article class="hook"><h3>{esc(h["title"])}</h3>{labelled("Что должно произойти",h["trigger"])}{labelled("Действие и вовлечение",h["action"])}{labelled("Последствие",h["outcome"])}</article>'
    associated=[t for t in story['twists'] if key in t['roles']]
    if associated: hooks+='<h3>В общих сюжетных поворотах</h3><ul>'+''.join(f'<li><a href="../magic-fair-v2.html#{esc(t["id"])}">{esc(t["title"])}</a></li>' for t in associated)+'</ul>'
    hooks+=p('Новые состояния, предметы и способности выдаются через «Сюжет». Свободный текст не списывает ресурсы и не исполняет произвольные эффекты автоматически. Смена стороны проводится отдельным действием; цена, срок, адресаты и способ освобождения записываются явно.','aside-note')
    body+=section('role-twists','IV','Куда может повернуть личная история','Используйте при заявке игрока или подходящей сцене, а не как обязательный маршрут.',hooks)
    acting=f'<div class="two-col"><div>{labelled("Образ",a["vibe"])}{labelled("Голос",a["voice"])}{labelled("Внешний вид",a["look"])}{ul(a["actions"])}{labelled("Лёгкая задача для отыгрыша",r["joke"])}</div><div><span class="label">Реплики для первого разговора</span>'+''.join(f'<blockquote>{esc(x)}</blockquote>' for x in a['lines'])+'</div></div>'
    body+=section('acting','V','Как помочь войти в роль','Костюм и постоянная актёрская игра не обязательны.',acting)
    last=f'<div class="two-col"><div>{labelled("Если игрок застрял",n["gmNote"])}</div><div>{labelled("Если персонажа нет",n["absence"])}</div></div><h3>Заметки ведущего</h3><p class="aside-note">Место для рукописных заметок в распечатке.</p><div class="notes-lines" aria-hidden="true"></div>'
    prev=group[(i-1)%len(group)]['key']; nxt=group[(i+1)%len(group)]['key']
    last+=f'<div class="folio-nav"><span>← {link(prev,True)}</span><span>{link(nxt,True)} →</span></div>'
    body+=section('gm','VI','На полях досье','',last)
    if is_extra:
        body=body.replace('← Все персонажи','← Дополнительные персонажи').replace('Полное досье ведущего','Дополнение · вне состава 17')
        body=body.replace('../magic-fair-v2.html#characters','../magic-fair-expansion.html#characters').replace('../magic-fair-v2.html#','../magic-fair-30-archive.html#')
    else:
        body=body.replace('Полное досье ведущего','Основной состав · 17 игроков')
        body=body.replace('Текст способности и условия целей сверены с каталогами Mini App.','Действующие способности и цели Mini App. Условия, связанные с ритуалом, предстоит согласовать при переработке финала.')
    (OUT/f'characters/{key}.html').write_text(page(r['name'],body,key))
print('Собрано: основная книга на 17 + дополнение на 13; 30 досье, 15 иллюстрированных глав, 8 реликвий основного состава.')

from hidden_book import build as build_hidden
build_hidden(globals())
