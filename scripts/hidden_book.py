"""Рендер сценарной редакции 17. Дополнение и архив остаются прежними."""
import json
import hashlib
import base64
import shutil


def build(c):
    OUT, DATA, ASSETS = c['OUT'], c['DATA'], c['ASSETS']
    esc,p,ul,labelled,section,page,portrait,illustration,link = [c[x] for x in ('esc','p','ul','labelled','section','page','portrait','illustration','link')]
    game, past = c['core_game'], c['core_past']
    h=json.loads((DATA/'hidden-17.json').read_text())
    narrative=json.loads((DATA/'narrative-17.json').read_text())
    documents={d['id']:d for d in narrative['documents']}
    # Текущие механические тексты хранятся в hidden-17; личные — в narrative-17.
    h['crafting']['rules']=narrative['craftingRules']
    h['dice']['steps']=['Два согласных участника физически бросают d6; у кого больше, тот выиграл. При равенстве — ничья.', 'До начала договоритесь о ставке. Можно играть без неё. Приложение не бросает кубик и не держит банк.', 'Итоговый перевод монет оформите обычной сделкой или через ведущего. Используйте только свободные игровые монеты.']
    roles=game['roles']; by={r['key']:r for r in roles}
    for key,role in narrative['roles'].items():
        h['roles'][key]['goals']=role['goals']

    assert set(by)==set(h['roles']) and len(roles)==17
    (OUT/'players').mkdir(exist_ok=True)
    item_source=c['ROOT']/'apps/mini-app/packages/client/public/assets/items'
    manifest=json.loads((item_source/'manifest.json').read_text())
    item_dir=ASSETS/'items'; item_dir.mkdir(exist_ok=True)
    for source in item_source.iterdir():
        if source.suffix in ('.jpg','.webp'):shutil.copyfile(source,item_dir/source.name)
    def item_picture(file,label,prefix=''):
        src=item_dir/file
        assert src.is_file(),src
        version=hashlib.sha256(src.read_bytes()).hexdigest()[:10]
        return f'<figure class="item-art"><img src="{prefix}assets/gm-book/items/{esc(file)}?v={version}" alt="{esc(label)}" width="256" height="256" loading="lazy"><figcaption>{esc(label)}</figcaption></figure>'
    def item_gallery(entries,prefix=''):
        return '<div class="item-gallery">'+''.join(item_picture(f,label,prefix) for f,label in entries)+'</div>'
    def name(k):return by[k]['name']
    def ordered(xs):return '<ol>'+''.join(f'<li>{esc(x)}</li>' for x in xs)+'</ol>'
    def article(title,body,cls='note'):return f'<article class="{cls}"><h3>{esc(title)}</h3>{body}</article>'
    def standalone(title,body,prefix='',private=False):
        rev=hashlib.sha256((ASSETS/'book.css').read_bytes()).hexdigest()[:10]
        return f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>{esc(title)} · Ярмарка</title><link rel="stylesheet" href="{prefix}assets/gm-book/book.css?v={rev}"></head><body class="handout"><main class="book" id="main"><header class="masthead"><span>Ярмарка украденной магии</span><span>{'Личные вводные' if private else 'Общая памятка'}</span></header>{body}<footer class="endnote">Сценарная редакция · 17 игроков · печать через меню браузера.<br>{'<a href="#common">Общие правила ↓</a>' if private else 'Каждый знает собственную историю. Остальное выясняется на ярмарке.'}</footer></main></body></html>'''
    resources={'ash':'Пепел феникса','moon':'Лунная пыль','dew':'Роса междумирья'}
    shard_owners={'o1':'I','o5':'II','o9':'III','o14':'V'}
    def gear(r):
        k=r['key']; xs=['8 золотых']+[f'{resources[x]}: {n}' for x,n in r['bundle'].items() if n]
        xs += [it['name'] for it in game['relics'] if it['owner']==k]
        if k in shard_owners: xs += ['Осколок '+shard_owners[k]+' — отдельная вещь']
        if k=='o10':xs += ['Улика B — '+next(x['text'] for x in game['clues'] if x['id']=='B')]
        if k=='o16':xs += ['Улика C — '+next(x['text'] for x in game['clues'] if x['id']=='C')]
        if k=='o9':xs += ['Проклятие: звон при лжи. Его нужно отыгрывать; автоматически ложь не определяется.']
        images=[(manifest['resources']['gold'],'Золото')]+[(manifest['resources'][x],resources[x]) for x,n in r['bundle'].items() if n]
        images += [(manifest['relics'][it['name']],it['name']) for it in game['relics'] if it['owner']==k]
        if k in shard_owners:images.append((manifest['shard'],'Осколок '+shard_owners[k]))
        if k in ('o10','o16'):
            clue='B' if k=='o10' else 'C';images.append((manifest['clues'][clue],'Улика '+clue))
        return ul(xs)+item_gallery(images,'../')
    def ability(r):
        ab=r['ability']
        result=labelled(r['skill'],r['effect'])+p('Одно применение до обновления сил. Ведущий может обновить силы дважды за вечер; в закрытом обряде обычные способности не действуют.')
        if ab['consent']:result+=p('Нужно согласие затронутого игрока. К себе можно применить, если это допускает текст способности.')
        if ab['hostile']:result+=p('Щит останавливает враждебную попытку, но применение способности расходуется. По одной цели — не более одной враждебной попытки до обновления сил.')
        return result
    def acting(r):
        a=r['acting']
        return labelled('Образ',a['vibe'])+labelled('Голос',a['voice'])+ul(a['actions'])+''.join(f'<blockquote>{esc(x)}</blockquote>' for x in a['lines'])+labelled('Лёгкая задача для отыгрыша',r['joke'])
    def method(m,private=False):
        fields=[('private','Что вам известно'),('cost','Подготовка и цена'),('tell','Наблюдаемый след'),('counter','Как могут ответить'),('result','Что получится')]
        return article(m['title'],''.join(labelled(label,m[k]) for k,label in fields if private or k!='private'))
    def finale(r):
        return ''.join(labelled(label,r['finale'][k]) for k,label in [('prepare','До закрытия брода'),('action','Ваше действие'),('choice','Личный выбор'),('impact','Возможное последствие')])
    def recipes(prefix=""):
        descriptions={'cleanse':'Снимает проклятие и Шипы с одного согласного получателя; расходуется.', 'ward':'До обряда: активируется против одного враждебного действия до обновления сил. В общем окне: одна выбранная защита (свободный талисман или активный личный щит) останавливает группу солей на одной части, кровь одного донора или один сосуд. Расходуется только сработавшая защита.', 'focus':'Удерживает магическую связь; без изученного способа применения не действует.', 'shape':'Расходуется и меняет облик до конца вечера без дополнительных товаров; способность сохраняется. Постоянную природу обычный Камень не меняет.'}
        return ''.join(article(r['name'],item_picture(manifest['recipes'][r['id']],r['name'],prefix)+labelled('Принести мастеру',', '.join(f'{resources[k]} × {v}' for k,v in r['cost'].items())+f'; банку при работе героя — {r["gold"]} золота, в фоновой мастерской — {r["gold"]+2}. Личный гонорар героя согласуется отдельно.')+p(descriptions[r['id']])) for r in game['recipes'])
    recipe_names={r['id']:r['name'] for r in game['recipes']}
    def signature(g,gm=False,prefix=''):
        text=labelled('Изготовитель',name(g['maker']))
        text+=labelled('Материалы и базовая плата',', '.join(f'{resources[k]} × {v}' for k,v in g['cost'].items())+f'; золото × {g["gold"]}.')
        text+=labelled('Действие',g['effect'])+labelled('Как применить',g['use'])+labelled('Ограничения',g['limits'])+p('Можно изготовить один авторский товар до обновления сил. Гонорар изготовителю согласуйте отдельно, сверх базовой платы.')
        if (item_dir/(g['id']+'.webp')).is_file():text+=item_picture(g['id']+'.webp',g['name'],prefix)
        elif g['materialArt']:text+=item_picture(manifest['recipes'][g['materialArt']],g['artLabel'],prefix)
        if gm and g.get('gmNote'):text+=labelled('Только ведущему',g['gmNote'])
        return article(g['name'],text)
    def profession(key,gm=False,prefix='../'):
        ids=h['crafting']['makers'].get(key,[])
        if not ids:return p('Вы не начинаете с ремесленной профессией. Обычные вещи закажите у мастера или купите у другого героя; продавать собственные вещи может каждый. Особые изученные способы подготовки сердца действуют по своим правилам.')
        body=labelled('Вы умеете изготавливать сами',', '.join(recipe_names[x] for x in ids))+p('В мастерской подтвердите материалы и оплату; обычный заказ выполняется без отдельного подтверждения ведущего. Можно изготовить для себя, сделать запас на продажу или взять заказ. Вещь считается изготовленной вами, даже если материалы принёс клиент.')
        body+=''.join(signature(g,gm,prefix) for g in h['signatureGoods'] if g['maker']==key)
        return body
    def venues(prefix='',gm=False):
        result=''
        for v in h['venues'].values():
            result+=article(v['title'],p(v['intro'])+ordered(v['steps'])+(labelled('Организация ведущему',v['gm']) if gm and v.get('gm') else ''))
        board=h['noticeboard']
        result+='<h3>Доска объявлений и награды</h3>'+p(board['intro'])+labelled('Поля объявления','')+ul(board['fields'])+ordered(board['rules'])
        result+='<div class="notice-template"><p><b>Нужно:</b> ____________________</p><p><b>Награда:</b> ____________________</p><p><b>Заказчик / исполнитель:</b> ____________________</p><p><b>Срок и проверка:</b> ____________________</p><p><b>Статус (награда не резервируется):</b> ____________________</p></div>'
        if gm:
            result+='<h3>Примеры: публикует только сам владелец</h3>'
            for n in board['examples']:
                result+=article(n['title'],labelled('Автор',name(n['author']))+labelled('Что требуется',n['request'])+labelled('Награда',n['reward'])+p(n['note']))
        else:
            result+=article('Пример объявления',p('«Нужно: два разных обычных изделия. Награда: моя реликвия — вписать название. Срок: до закрытия мастерской. Проверка: передать обе вещи мне подтверждённой сделкой». Автор может выбрать другую цену. Этот пустой образец не считается действующим заказом.'))
        result+=article(h['dice']['title'],p(h['dice']['props'])+ordered(h['dice']['steps']))
        return result
    def craft_rules(gm=False,prefix=''):
        result=ordered(h['crafting']['rules'])+p(h['crafting']['example'])
        result+='<h3>К кому обратиться за изготовлением</h3>'+ul([name(k)+': '+', '.join(recipe_names[x] for x in ids)+'.' for k,ids in h['crafting']['makers'].items()])
        result+='<h3>Авторские товары</h3>'+p('Это открытые предложения ремесленников. Рецепты финальных вмешательств в этот список не входят.')+''.join(signature(g,gm,prefix) for g in h['signatureGoods'])
        return result
    def short_rules(prefix=''):
        return ''.join(article(rule['title'],item_picture(rule['image'],rule['title'],prefix)+p(rule['text'])) for rule in narrative['rules'])
    def personal_documents(key):
        return ''.join(article(documents[id]['title'],labelled('Источник',documents[id]['source'])+p(documents[id]['text'])) for id in narrative['roles'][key]['documents'])
    def acquaintances(key):
        return ''.join(article(name(person['role']),f'<img src="{portrait(person["role"],"../")}" alt="{esc(name(person["role"]))}" width="64" height="64" loading="lazy">'+p(person['relation'],'aside-note')+p(person['text'])) for person in narrative['roles'][key].get('acquaintances',[]))
    public=section('welcome','01','На одну ночь у брода','',''.join(p(part) for part in h['publicIntro'].split('\n\n')))
    public+=section('rules','02','Что можно делать','',short_rules()+ul(h['publicRules'])+p(h['consentPolicy']))
    public+=section('workshop','03','Обычные изделия',h['venues']['workshop']['intro'],recipes()+p('Базовый ингредиент можно купить у ярмарки за 2 золота, если он есть в запасе. Торговля между игроками — по взаимной договорённости.'))
    public+=section('requests','04','Ваша идея может изменить историю','',p('Скажите ведущему: что хотите сделать, чем готовы заплатить и какого изменения ждёте. Вместе запишите условия успеха, заметный след, срок и возможный ответ других. Затем можно искать помощь и выполнять условия.')+p('Например: вырастить дерево из необычного семени, перенести проклятие в предмет, придумать временную способность или добровольную клятву. Такую заявку нужно обсудить с ведущим; сама по себе она ещё не даёт права на эффект.'))
    public+=section('venues','05','Три места ярмарки','Заказы, сделки и разговоры дают повод найти друг друга.',venues())
    public+=section('crafting','06','Мастер и герои-ремесленники','Кто изготовил вещь, кому она принадлежит и кто получает деньги.',craft_rules())
    (OUT/'player-guide.html').write_text(standalone('Общие правила',public))
    def ritual_map():
        slots=''.join(f'<div class="grave-slot"><span>{n}</span><img src="assets/gm-book/items/{manifest["shard"]}" alt="Гнездо {n}" width="72" height="72"></div>' for n in ['I','II','III','IV','V'])
        return '<div class="grave-map"><span class="eyebrow">Внутренний двор · у обвалившейся стены</span><h3>Плита над останками Сарна</h3><div class="grave-slots">'+slots+'</div><p>Только ведущему: любые 3 целые части · пыль из 2 Фокусов · формула из личной записи</p></div>'
    def ritual_steps():
        result=''
        steps=h['ritual']['steps']
        # Сохраняем пять якорей исходника; powder и choices показываем одним этапом.
        for i,group in enumerate([[steps[0]],steps[1:3],[steps[3]],[steps[4]]]):
            step=group[0]
            title='Пробудить сердце и сделать выбор' if len(group)>1 else step['title']
            time='Около 2–3 минут' if len(group)>1 else step['time']
            items=list(dict.fromkeys(tuple(item) for part in group for item in part['items']))
            props=''.join(item_picture(manifest['shard'] if k=='shard' else manifest['recipes'][k],label) for k,label in items)
            roles=list(dict.fromkeys(k for part in group for k in part['roles']))
            cast=''.join(f'<span class="ritual-person"><img src="{portrait(k)}" alt="{esc(name(k))}" width="32" height="32"><span>{esc(name(k))}</span></span>' for k in roles)
            script=''.join((f'<span id="{part["id"]}"></span>' if j else '')+f'<blockquote>{esc(part["gm"])}</blockquote>'+labelled('За кадром: что проверить',part['gmAction']) for j,part in enumerate(group))
            actions=ordered([action for part in group for action in part['players']])
            notes=' '.join(dict.fromkeys(part['roleNote'] for part in group))
            result+=f'<article class="ritual-step" id="{step["id"]}"><header><span class="ritual-number">{i+1:02}</span><div><span class="label">{esc(time)}</span><h3>{esc(title)}</h3></div></header><div class="ritual-columns"><div class="ritual-script"><span class="eyebrow">Ведущему · читать вслух</span>{script}</div><div class="ritual-actions"><span class="eyebrow">Игрокам · конкретные действия</span>{actions}<div class="ritual-components">{props}</div></div></div><footer><span class="label">Кто может участвовать</span><div class="ritual-cast">{cast}</div>{p(notes,"aside-note")}</footer></article>'
        return result
    ritual_intro=p(h['ritual']['place'])+ritual_map()+labelled('Как игроки узнают порядок',h['ritual']['discovery'])+labelled('Что такое порошок',h['ritual']['powder'])
    reference=''.join(article(x['title'],ordered(x['steps'])) for x in h['phases'])
    resolution=ritual_intro+ritual_steps()
    cases=''.join(article(x['title'],labelled('Если произошло',x['given'])+labelled('Результат',x['outcome'])) for x in h['casebook'])
    stone=section('inscription','—','Старая застава','Лист игрового места.',p('Обвалившаяся стена, каменные плиты и следы старых линий. Здесь можно осмотреть развалины или поговорить с теми, кто помнит заставу.')+p('Чтобы исследовать место, сообщите ведущему, что именно вы рассматриваете. Он опишет находку и выдаст доступные сведения.'))
    stone_html=standalone('Старая застава',stone)
    css_url='assets/gm-book/book.css?v='+hashlib.sha256((ASSETS/'book.css').read_bytes()).hexdigest()[:10]
    stone_html=stone_html.replace(f'<link rel="stylesheet" href="{css_url}">','<style>'+(ASSETS/'book.css').read_text()+'</style>')
    for file in (f for f in item_dir.iterdir() if f.suffix in ('.jpg','.webp')):
        version=hashlib.sha256(file.read_bytes()).hexdigest()[:10]
        stone_html=stone_html.replace(f'assets/gm-book/items/{file.name}?v={version}',('data:image/webp;base64,' if file.suffix=='.webp' else 'data:image/jpeg;base64,')+base64.b64encode(file.read_bytes()).decode())
    (OUT/'ritual-stone.html').write_text(stone_html)
    sheet=section('setup','00','Ритуал у могилы Сарна','Только для ведущего. Четыре этапа, около 10 минут.',p(h['status'])+'<p><a href="ritual-stone.html">Нейтральный лист игрового места →</a></p>'+ul(h['ritual']['props']))
    sheet+=section('ritual','01','Слова ведущего и действия игроков','Сначала прочитайте только нужную сцену. Проверки и развилки находятся рядом.',resolution)
    sheet+=section('record','02','Журнал финала','',p('У похода: заявка, подтверждение каждого спутника, время прибытия и допуск. У вмешательства: игрок, компонент, цель; у крови — донор. У ответа: один источник защиты (талисман или активный щит) и группа эффекта; расход только при срабатывании. Приказ донор произносит после пробуждения.')+p('Осколок I ____; осколок II ____; осколок III ____; осколок IV ____; осколок V ____. Для каждой части: владелец, находится ли она внутри круга, соединена ли, уничтожена ли за вечер. Два Фокуса: ____ / ____. Итог: сердце ____; свобода ____; сосуды ____; добровольная помощь ____.')+'<div class="notes-lines" aria-hidden="true"></div>')
    sheet+=section('reference','03','Справочник спорных случаев','Эту часть не нужно читать игрокам целиком.','<details><summary>Полные правила расходов и одновременных действий</summary>'+reference+f'</details><details><summary>{len(h["casebook"])} примеров сочетаний</summary>'+cases+'</details>'+p(h['appBoundary']))
    sheet_html=standalone('Лист финала ведущему',sheet).replace('Общая памятка','Только для ведущего').replace('Каждый знает собственную историю. Остальное выясняется на ярмарке.','<a href="magic-fair-v2.html">Вернуться в книгу ведущего →</a>')
    (OUT/'finale-sheet.html').write_text(sheet_html)
    # Главное издание: история сохранена отдельным снимком, без старых финальных счётчиков.
    hero=f'''<section class="chapter hero"><span class="eyebrow">17 игроков + ведущий · скрытые намерения</span><div class="hero-grid"><div><h1>Семнадцать<br>желаний.<br><em>Одно сердце.</em></h1>{p('На ярмарку приходят за своим. Общая история складывается из того, что люди решат рассказать — и сделать.','lead')}{p(h['status'],'hero-note')}<div class="quick-links"><a class="button" href="#characters">Персонажи и вводные ↗</a><a class="button light" href="#venues">Три места и заказы</a></div></div><div class="hero-art"><img class="large" src="{portrait('o9')}" alt="Эльмар"><img class="small" src="{portrait('o14')}" alt="Лира"></div></div></section>'''
    body=hero+section('legend','01','Кто что знает','Ведущий видит целое. Игроки получают только собственные вводные.','<span class="label">Можно прочитать всем</span>'+''.join(p(part) for part in h['publicIntro'].split('\n\n'))+ul(h['gmOverview'])+'<p><a href="player-guide.html">Общая памятка для игроков →</a></p>'+f'<div class="truth">{labelled("Граница этой редакции",h["appBoundary"])}</div>')
    chapters=''
    for ch in h['chapters']:
        chapters+=f'<article class="story-chapter" id="chapter-{esc(ch["id"])}"><h3>{esc(ch["title"])}</h3>'+illustration(ch['id'])
        for q in ch['paragraphs']:
            chapters+=p(q['text'])+'<div class="people-links">'+''.join(link(k) for k in dict.fromkeys(q['roles']))+'</div>'
        chapters+='</article>'
    participants=''
    for who in past['participants']:
        who=dict(who,**h.get('historicalOverrides',{}).get(who['name'],{}))
        participants+=article(who['name'],''.join(labelled(label,who[k]) for k,label in [('origin','Откуда пришёл'),('motive','Чего хотел'),('knowledge','Что понимал'),('act','Что сделал'),('fate','Куда делся'),('result','Чего достиг'),('impact','Что изменилось вокруг')]))
    body+=section('chronicle','02','От заставы до нынешней ночи','Мотивы, ход преступления, путь вещей и последствия.',chapters+'<h3>Участники прошлого: цель и результат</h3>'+participants)
    timing=ul(h['preparation'])+''.join(article(t['title']+' · '+t['minutes']+' минут',labelled('Объявление вслух',t['announcement'])+ordered(t['steps'])) for t in h['timing'])
    timing+=p('Время — ориентир ведущему. Не назначайте публичные переходы и обязательный час раскрытия тайны. Если обряд не состоится, завершите ярмарку и перейдите к эпилогам.')
    body+=section('acts','03','Как провести вечер','Порядок для ручного прогона на 17.',timing)
    body+=section('venues','03а','Таверна, ярмарка и мастерская','Что здесь делают игроки.',venues(gm=True))
    catalog='<div class="filters"><label>Найти персонажа<input id="character-search" type="search" placeholder="Имя, желание, предмет…"></label></div><p id="search-status" aria-live="polite">Найдено персонажей: 17 из 17</p><p id="no-results" hidden>Ничего не найдено</p><div class="catalog">'
    for r in roles:
        b=h['roles'][r['key']]; search=' '.join([r['name'],b['desire'],*b['goals']])
        catalog+=f'<a class="character" data-character="{r["key"]}" data-search="{esc(search)}" href="characters/{r["key"]}.html"><img src="{portrait(r["key"])}" alt="{esc(r["name"])}" loading="lazy"><div><span class="label">{esc(r["title"])}</span><h3>{esc(r["name"])}</h3>{p(b["publicFace"])}<span>Досье и личные вводные ↗</span></div></a>'
    catalog+='</div>'
    body+=section('characters','04','Семнадцать личных историй','Откройте досье и выдайте игроку только ссылку «Личные вводные». В досье раскрыты сведения ведущего.',catalog)
    twists=''.join(method(m) for m in h['methods'])+article('Передумать после раскрытия',labelled('Что должно произойти','Другие показывают последствия вмешательства, признаются или предлагают реальную альтернативу до последней фиксации.')+labelled('Что делает игрок','Отказывается от подготовленного предательства, отзывает часть, защищает прежнего противника или меняет просьбу. Новый секретный компонент на этом шаге не возникает.')+labelled('Что меняется','Намерение меняется поступком. Ведущий не назначает новую команду; фиксирует действие и его личную цену.'))
    twists+=article('Новая заявка: смерть, превращение, клятва',p(h['consentPolicy'])+p('Сначала договориться о конкретном событии и цене, затем провести сцену с наблюдаемым признаком. Смерть не выводит из игры: роль продолжается призраком. Для временного подчинения записать допустимые приказы, срок и способ освобождения; отказ от дискомфортной сцены всегда прекращает её без наказания.')+p('Пример клятвы: добровольно обещать одну доставку в обмен на защиту до обновления сил. Нарушение прекращает защиту, но не отнимает управление персонажем. Пример превращения: Камень меняет образ, отдельная заявка о постоянной природе требует заранее оговорённого поступка. Зомби-состояние можно добавить только по такой согласованной заявке, а не за чужую тайную отметку.'))
    body+=section('twists','05','Что нужно для сюжетного поворота','Подготовка → наблюдаемый поступок → возможность ответа → конкретное последствие.',twists)
    evidence='<h3>Карта знаний — только ведущему</h3>'+''.join(article(k['topic'],labelled('Кто начинает со знанием',', '.join(name(x) for x in k['sources']))+p(k['fact'])+labelled('Если носителей нет',k['fallback'])) for k in h['knowledgeRoutes'])
    evidence+='<h3>Пять осколков</h3>'+item_picture(manifest['shard'],'Осколок сердца')+p('Осколок I — Серафина; осколок II — Вельда; осколок III — Эльмар; осколок IV — отдельный лот ведущего вместе с уликой A; осколок V — Лира с начала вечера. Соединение не меняет владельца. Уничтоженный солью осколок исчезает навсегда; после трёх уничтоженных возвращение невозможно.')
    evidence+='<h3>Три улики</h3>'+''.join(article(x['id']+' · '+x['name'],item_picture(manifest['clues'][x['id']],x['name'])+p('Отдельный лот ведущего вместе с осколком IV. Победитель торга получает оба.' if x['id']=='A' else x['where'])+p(x['text'])) for x in game['clues'])
    evidence+=p('Для правды: доказать три роли независимыми свидетельствами. Кроме A/B/C доступны опись Вельды, память Эльмара и дедова книга Грима; обязательного набора нет. Факты, выводы и слухи различают, а найденная истина не является условием обряда.')
    evidence+='<h3>Восемь реликвий</h3>'+''.join(article(x['name'],item_picture(manifest['relics'][x['name']],x['name'])+labelled('Стартовый владелец',name(x['owner']))+labelled('Кому нужна',', '.join(name(k) for k in x['wants']))+p('Обычный предмет торга: название не добавляет тайного обязательного эффекта.')) for x in game['relics'])
    evidence+='<h3>Ингредиенты и деньги</h3>'+item_gallery([(manifest['resources'][k],v) for k,v in dict(gold='Золото',**resources).items()])
    evidence+='<h3>Заказать у мастера</h3>'+p(h['venues']['workshop']['intro'])+recipes()+craft_rules(gm=True)
    body+=section('evidence','06','Вещи, знания и способы их получить','Ведите отдельный журнал владения и расходов.',evidence)
    ends='<p><a class="button" href="finale-sheet.html">Открыть печатный лист финала ↗</a></p>'+resolution
    ends+='<h3>Раскрытие ведущего</h3>'+p('До последнего шага слышны только удары из-под плиты. Когда возвращение действительно произошло, смените голос и произнесите реплику Сарна из четвёртого этапа. При сне или уничтожении живого разговора нет. Ведущий не получает собственного права переиграть чужие результаты.')
    ends+='<details><summary>Подробные правила для спорных сочетаний</summary>'+reference+'</details>'
    ends+=''.join(article(title,p(text)) for _,title,text in h['endings'])
    ends+='<h3>Каждому — собственный эпилог</h3>'+p('На отдельном разборе после игровой сцены оценить обе цели: достигнута, частично достигнута или не достигнута; записать пояснение. Отсутствие оценки не означает провал. Предметы и журнал помогают оценке, но не заменяют смысл поступка. Затем спросить: чего хотел; что сделал; что получил; кто почувствует последствия. Несовместимые личные цели допускают, что не все получат всё.')
    for r in roles:
        b=h['roles'][r['key']]
        ends+=article(r['name'],labelled('Проверить личные цели',' / '.join(b['goals']))+labelled('Пояснения к оценке',' / '.join(narrative['roles'][r['key']]['gmGoals'])))
    body+=section('endings','07','Финал: жизнь, свобода, цена','Четыре этапа закрытого обряда: слева сцена ведущему, справа действия участников круга.',ends)
    (OUT/'magic-fair-v2.html').write_text(page(h['title'],body))
    for i,r in enumerate(roles):
        key=r['key']; b=h['roles'][key]
        private_methods=[m for m in h['methods'] if key in m['holders']]
        header=f'<section class="chapter"><span class="eyebrow">{esc(r["title"])}</span><div class="dossier-hero"><img class="role-portrait" src="{portrait(key,"../")}" alt="{esc(r["name"])}"><div><h1>{esc(r["name"])}</h1>{p(b["publicFace"],"lead")}{labelled("Чего вы хотите",b["desire"])}</div></div></section>'
        nr=narrative['roles'][key]
        private=header+section('background','01','Ваша история','Личные сведения. Делитесь ими по своему выбору.',''.join(p(x) for x in nr['story']))
        if nr.get('acquaintances'):private+=section('acquaintances','—','Знакомые лица','Ваши знакомства и впечатления.',acquaintances(key))
        private+=section('goals','02','Ваши стремления','Итог оценивает ведущий с учётом смысла поступков; отсутствие оценки не означает провал.',ordered(nr['goals']))
        private+=section('ability','03','Ваш дар','',p(nr['abilityOrigin'])+ability(r))
        private+=section('documents','04','Письма и записи','Показанная запись становится постоянной копией; получатель может передать её дальше.',personal_documents(key))
        private+=section('gear','05','С собой','',gear(r)+''.join(article(narrative['items'][ref]['name'],p(text)) for ref,text in nr['startingItems'].items()))
        if key in h['crafting']['makers'] or any(g['maker']==key for g in h['signatureGoods']):
            private+=section('profession','06','Ваше ремесло','',profession(key))
        private+=section('acting','07','Как войти в роль','Постоянная актёрская игра не обязательна.',acting(r))
        private+=section('common','08','Короткая памятка','',short_rules('../')+p(h['consentPolicy'])+p('Свою необычную идею можно предложить ведущему.'))
        private_html=standalone(r['name'],private,'../',True)
        css_url='../assets/gm-book/book.css?v='+hashlib.sha256((ASSETS/'book.css').read_bytes()).hexdigest()[:10]
        private_html=private_html.replace(f'<link rel="stylesheet" href="{css_url}">','<style>'+ (ASSETS/'book.css').read_text()+'</style>')
        for person_key in {key,*(x['role'] for x in nr.get('acquaintances',[]))}:
            private_html=private_html.replace(portrait(person_key,'../'),'data:image/jpeg;base64,'+base64.b64encode((ASSETS/f'portraits/{person_key}.jpg').read_bytes()).decode())
        for file in (f for f in item_dir.iterdir() if f.suffix in ('.jpg','.webp')):
            version=hashlib.sha256(file.read_bytes()).hexdigest()[:10]
            private_html=private_html.replace(f'../assets/gm-book/items/{file.name}?v={version}',('data:image/webp;base64,' if file.suffix=='.webp' else 'data:image/jpeg;base64,')+base64.b64encode(file.read_bytes()).decode())
        (OUT/f'players/{key}.html').write_text(private_html)
        gmheader=header.replace('<section class="chapter">','<section class="chapter"><p class="breadcrumbs"><a href="../magic-fair-v2.html#characters">← Все персонажи</a></p>',1)
        dossier=gmheader+f'<section class="chapter"><a class="button" href="../players/{key}.html">Личные вводные {esc(r["name"])} — выдать игроку ↗</a>{p("Эту страницу оставить ведущему. Личная карточка не содержит ссылок на книгу и чужих секретов.","aside-note")}</section>'
        dossier+=section('background','I','Предыстория','',''.join(p(x) for x in nr['story'])+labelled('Настоящее желание',b['desire']))
        dossier+=section('secrets','II','Граница знаний','Не дополняйте исходную карточку всей картиной.',personal_documents(key)+''.join(method(m) for m in private_methods))
        dossier+=section('mechanics','III','Цели и способность','Цели этой редакции проверяются вручную.',ordered(nr['goals'])+labelled('Оценка ведущему','')+ordered(nr['gmGoals'])+p(nr['abilityOrigin'])+ability(r)+gear(r)+profession(key,True))
        relations=acquaintances(key)
        for it in game['relics']:
            if key in it['wants'] or it['owner']==key:
                participants=set(it['wants'])|{it['owner']}
                relations+=article(it['name'],'<div class="people-links">'+''.join(link(k,True) for k in by if k in participants and k!=key)+'</div>'+p('Стартовый владелец: '+name(it['owner'])+'. Владение и обещание помощи обсуждаются отдельно.'))
        dossier+=section('relations','IV','Связи и повод для разговора','Знакомые лица — личные впечатления персонажа; круг претендентов на вещи ниже предназначен ведущему.',relations)
        acts='<div class="act-strip">'+''.join(article('Возможный шаг '+str(j+1),p(t)) for j,t in enumerate(b['acts']))+'</div>'
        dossier+=section('role-acts','V','Возможные действия на ярмарке','Подсказки для разговора и выбора; порядок свободный.',acts)
        dossier+=section('role-twists','VI','Личный выбор и его оценка','',ordered(nr['gmGoals'])+p('Используйте точные критерии этой редакции после игрового финала, сверяя рассказ с журналом и свидетелями. Возможны достигнута, частично достигнута и не достигнута; запишите причину. Неоценённая цель не считается провалом.')+p(h['consentPolicy']))
        dossier+=section('acting','VII','Отыгрыш','',acting(r))
        last=labelled('Если игрок застрял',b['firstSteps'][0]+' Предложите конкретную сделку или вопрос, не раскрывая чужой замысел.')+labelled('Если персонажа нет','Перенести его уникальные стартовые вещи на рынок; обычное золото и ингредиенты не добавлять. Проверить карту дублирующихся знаний. Никому не отдавать автоматическую власть над его сюжетной линией.')
        last+='<div class="notes-lines" aria-hidden="true"></div>'+f'<div class="folio-nav"><span>← {link(roles[(i-1)%17]["key"],True)}</span><span>{link(roles[(i+1)%17]["key"],True)} →</span></div>'
        dossier+=section('gm','VIII','На полях ведущего','',last)
        (OUT/f'characters/{key}.html').write_text(page(r['name'],dossier,key))
    print('Новая редакция: 17 личных вводных + 17 досье; общая памятка и лист финала; 15 глав, 5 способов вмешательства.')
