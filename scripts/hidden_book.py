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
    roles=game['roles']; by={r['key']:r for r in roles}
    assert set(by)==set(h['roles']) and len(roles)==17
    (OUT/'players').mkdir(exist_ok=True)
    item_source=c['ROOT']/'apps/mini-app/packages/client/public/assets/items'
    manifest=json.loads((item_source/'manifest.json').read_text())
    item_dir=ASSETS/'items'; item_dir.mkdir(exist_ok=True)
    for source in item_source.glob('*.jpg'):shutil.copyfile(source,item_dir/source.name)
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
        k=r['key']; xs=['6 золотых']+[f'{resources[x]}: {n}' for x,n in r['bundle'].items() if n]
        xs += [it['name'] for it in game['relics'] if it['owner']==k]
        if k in shard_owners: xs += ['Осколок '+shard_owners[k]+' — отдельная вещь']
        if k=='o10':xs += ['Улика B — '+next(x['text'] for x in game['clues'] if x['id']=='B')]
        if k=='o16':xs += ['Улика C — '+next(x['text'] for x in game['clues'] if x['id']=='C')]
        if k=='o9':xs += ['Проклятие: звон при лжи. Отыгрыш, не автоматический детектор.']
        images=[(manifest['resources']['gold'],'Золото')]+[(manifest['resources'][x],resources[x]) for x,n in r['bundle'].items() if n]
        images += [(manifest['relics'][it['name']],it['name']) for it in game['relics'] if it['owner']==k]
        if k in shard_owners:images.append((manifest['shard'],'Осколок '+shard_owners[k]))
        if k in ('o10','o16'):
            clue='B' if k=='o10' else 'C';images.append((manifest['clues'][clue],'Улика '+clue))
        return ul(xs)+item_gallery(images,'../')
    def ability(r):
        ab=r['ability']
        result=labelled(r['skill'],r['effect'])+p('Одно применение за акт до финала. Результат и расходы подтверждает ведущий.')
        if ab['consent']:result+=p('Нужно согласие затронутого игрока. К себе можно применить, если это допускает текст способности.')
        if ab['hostile']:result+=p('Щит останавливает враждебную попытку, но применение способности расходуется. По одной цели — не более одной враждебной попытки за акт.')
        return result
    def acting(r):
        a=r['acting']
        return labelled('Образ',a['vibe'])+labelled('Голос',a['voice'])+labelled('Внешний вид',a['look'])+ul(a['actions'])+''.join(f'<blockquote>{esc(x)}</blockquote>' for x in a['lines'])+labelled('Лёгкая задача для отыгрыша',r['joke'])
    def method(m,private=False):
        fields=[('private','Что вам известно'),('cost','Подготовка и цена'),('tell','Наблюдаемый след'),('counter','Как могут ответить'),('result','Что получится')]
        return article(m['title'],''.join(labelled(label,m[k]) for k,label in fields if private or k!='private'))
    def finale(r):
        return ''.join(labelled(label,r['finale'][k]) for k,label in [('prepare','До закрытия брода'),('action','Ваше действие'),('choice','Личный выбор'),('impact','Возможное последствие')])
    def recipes(prefix=""):
        descriptions={'cleanse':'Снимает проклятие или шипы с себя либо согласного игрока; расходуется.', 'ward':'До финала: активируется и защищает от одного враждебного действия до конца акта. В финале: только неиспользованный предмет отменяет одно вмешательство в ответном окне. Уже активированная защита человека здесь не заменяет предмет.', 'focus':'Удерживает магическую связь; не имеет эффекта без изученного способа использования.', 'shape':'Расходуется и меняет вымышленный облик; способность роли сохраняется. Настоящее воскрешение или постоянная смена природы — отдельная заявка.'}
        return ''.join(article(r['name'],item_picture(manifest['recipes'][r['id']],r['name'],prefix)+labelled('Принести мастеру',', '.join(f'{resources[k]} × {v}' for k,v in r['cost'].items())+f'; золото × {r["gold"]}.')+p(descriptions[r['id']])) for r in game['recipes'])
    recipe_names={r['id']:r['name'] for r in game['recipes']}
    def signature(g,gm=False,prefix=''):
        text=labelled('Изготовитель',name(g['maker']))
        text+=labelled('Материалы и базовая плата',', '.join(f'{resources[k]} × {v}' for k,v in g['cost'].items())+f'; золото × {g["gold"]}.')
        text+=labelled('Действие',g['effect'])+labelled('Как применить',g['use'])+labelled('Ограничения',g['limits'])+p('Выпуск: один авторский товар за акт. Гонорар изготовителю — по договорённости сверх базовой платы.')
        if g['materialArt']:text+=item_picture(manifest['recipes'][g['materialArt']],g['artLabel'],prefix)
        if gm and g.get('gmNote'):text+=labelled('Только ведущему',g['gmNote'])
        return article(g['name'],text)
    def profession(key,gm=False,prefix='../'):
        ids=h['crafting']['makers'].get(key,[])
        if not ids:return p('Вы не начинаете с ремесленной профессией. Обычные вещи закажите у мастера или купите у другого героя; продавать собственные вещи может каждый. Особые изученные способы подготовки сердца действуют по своим правилам.')
        body=labelled('Вы умеете изготавливать сами',', '.join(recipe_names[x] for x in ids))+p('Приходите в мастерскую, подтвердите материалы и базовую оплату у ведущего. Можно изготовить для себя, сделать запас на продажу или взять заказ. Это ваше изготовление, даже если материалы принёс клиент.')
        body+=''.join(signature(g,gm,prefix) for g in h['signatureGoods'] if g['maker']==key)
        return body
    def venues(prefix='',gm=False):
        result=''
        for v in h['venues'].values():
            result+=article(v['title'],p(v['intro'])+ordered(v['steps'])+(labelled('Организация ведущему',v['gm']) if gm and v.get('gm') else ''))
        board=h['noticeboard']
        result+='<h3>Доска объявлений и награды</h3>'+p(board['intro'])+labelled('Поля объявления','')+ul(board['fields'])+ordered(board['rules'])
        result+='<div class="notice-template"><p><b>Нужно:</b> ____________________</p><p><b>Награда:</b> ____________________</p><p><b>Заказчик / исполнитель:</b> ____________________</p><p><b>Срок и проверка:</b> ____________________</p><p><b>Статус / резерв:</b> ____________________</p></div>'
        if gm:
            result+='<h3>Примеры: публикует только сам владелец</h3>'
            for n in board['examples']:
                result+=article(n['title'],labelled('Автор',name(n['author']))+labelled('Что требуется',n['request'])+labelled('Награда',n['reward'])+p(n['note']))
        else:
            result+=article('Пример объявления',p('«Нужно: два разных обычных изделия. Награда: моя реликвия — вписать название. Срок: до закрытия мастерской. Проверка: передать обе вещи мне при ведущем». Автор может выбрать другую цену; это пустой образец, не действующий заказ.'))
        result+=article(h['dice']['title'],p(h['dice']['props'])+ordered(h['dice']['steps']))
        return result
    def craft_rules(gm=False,prefix=''):
        result=ordered(h['crafting']['rules'])+p(h['crafting']['example'])
        result+='<h3>К кому обратиться за изготовлением</h3>'+ul([name(k)+': '+', '.join(recipe_names[x] for x in ids)+'.' for k,ids in h['crafting']['makers'].items()])
        result+='<h3>Авторские товары</h3>'+p('Это открытые предложения ремесленников. Рецепты финальных вмешательств в этот список не входят.')+''.join(signature(g,gm,prefix) for g in h['signatureGoods'])
        return result
    public=section('welcome','01','На одну ночь у брода','',p(h['publicIntro']))
    public+=section('rules','02','Что можно делать','',ul(h['publicRules'])+p(h['consentPolicy']))
    public+=section('workshop','03','Обычные изделия',h['venues']['workshop']['intro'],recipes()+p('Базовый ингредиент можно купить у ярмарки за 2 золота, если он есть в запасе. Торговля между игроками — по взаимной договорённости.'))
    public+=section('requests','04','Ваша идея может изменить историю','',p('Скажите ведущему: что хотите сделать, чем готовы заплатить и какого изменения ждёте. Вместе запишите условия успеха, заметный след, срок и возможный ответ других. Затем можно искать помощь и выполнять условия.')+p('Например: вырастить дерево из необычного семени, перенести проклятие в предмет, придумать временную способность или добровольную клятву. Это заявка на обсуждение, а не готовое право на эффект.'))
    public+=section('venues','05','Три места ярмарки','Заказы, сделки и разговоры дают повод найти друг друга.',venues())
    public+=section('crafting','06','Мастер и герои-ремесленники','Кто изготовил вещь, кому она принадлежит и кто получает деньги.',craft_rules())
    (OUT/'player-guide.html').write_text(standalone('Общие правила',public))
    def ritual_map():
        slots=''.join(f'<div class="grave-slot"><span>{n}</span><img src="assets/gm-book/items/{manifest["shard"]}" alt="Гнездо {n}" width="72" height="72"></div>' for n in ['I','II','III','IV','V'])
        return '<div class="grave-map"><span class="eyebrow">Внутренний двор · у обвалившейся стены</span><h3>Плита над останками Сарна</h3><div class="grave-slots">'+slots+'</div><p>Любые 3 целые части · пыль из 2 Фокусов · формула с плиты</p></div>'
    def ritual_steps():
        result=''
        for i,step in enumerate(h['ritual']['steps']):
            props=''.join(item_picture(manifest['shard'] if k=='shard' else manifest['recipes'][k],label) for k,label in step['items'])
            cast=''.join(f'<span class="ritual-person"><img src="{portrait(k)}" alt="{esc(name(k))}" width="32" height="32"><span>{esc(name(k))}</span></span>' for k in step['roles'])
            result+=f'<article class="ritual-step" id="{step["id"]}"><header><span class="ritual-number">{i+1:02}</span><div><span class="label">{esc(step["time"])}</span><h3>{esc(step["title"])}</h3></div></header><div class="ritual-columns"><div class="ritual-script"><span class="eyebrow">Ведущему · читать вслух</span><blockquote>{esc(step["gm"])}</blockquote>{labelled("За кадром: что проверить",step["gmAction"])}</div><div class="ritual-actions"><span class="eyebrow">Игрокам · конкретные действия</span>{ordered(step["players"])}<div class="ritual-components">{props}</div></div></div><footer><span class="label">Кто может участвовать</span><div class="ritual-cast">{cast}</div>{p(step["roleNote"],"aside-note")}</footer></article>'
        return result
    ritual_intro=p(h['ritual']['place'])+ritual_map()+labelled('Как игроки узнают порядок',h['ritual']['discovery'])+labelled('Что такое порошок',h['ritual']['powder'])
    reference=''.join(article(x['title'],ordered(x['steps'])) for x in h['phases'])
    resolution=ritual_intro+ritual_steps()
    cases=''.join(article(x['title'],labelled('Если произошло',x['given'])+labelled('Результат',x['outcome'])) for x in h['casebook'])
    stone=section('inscription','—','Надпись у могилы Сарна','Для размещения на игровом месте.',ordered(h['ritual']['stone'])+f'<blockquote>{esc(h["ritual"]["formula"])}</blockquote>'+item_gallery([(manifest['shard'],'Любые 3 целые части'),(manifest['recipes']['focus'],'2 Фокуса → ритуальная пыль')])+p('Порядок: гнёзда → пыль → формула → наблюдение → последнее решение. Всё проводится вместе с ведущим в момент закрытия брода.'))
    stone_html=standalone('Надпись у могилы',stone)
    css_url='assets/gm-book/book.css?v='+hashlib.sha256((ASSETS/'book.css').read_bytes()).hexdigest()[:10]
    stone_html=stone_html.replace(f'<link rel="stylesheet" href="{css_url}">','<style>'+(ASSETS/'book.css').read_text()+'</style>')
    for file in item_dir.glob('*.jpg'):
        version=hashlib.sha256(file.read_bytes()).hexdigest()[:10]
        stone_html=stone_html.replace(f'assets/gm-book/items/{file.name}?v={version}','data:image/jpeg;base64,'+base64.b64encode(file.read_bytes()).decode())
    (OUT/'ritual-stone.html').write_text(stone_html)
    sheet=section('setup','00','Ритуал у могилы Сарна','Только для ведущего. Пять шагов, около 10 минут.',p(h['status'])+'<p><a href="ritual-stone.html">Печатная надпись для игрового места →</a></p>'+ul(h['ritual']['props']))
    sheet+=section('ritual','01','Слова ведущего и действия игроков','Сначала прочитайте только нужную сцену. Проверки и развилки находятся рядом.',resolution)
    sheet+=section('record','02','Журнал финала','',p('У заявки: игрок, компонент, цель. У знака: имя и заранее выбранное распоряжение. У ответа: один щит и одна отменяемая попытка.')+p('I ____ II ____ III ____ IV ____ V ____. Для каждой части: владелец, в круге ли она, погашена ли. Два Фокуса: ____ / ____. Итог: сердце ____; свобода ____; сосуды ____; добровольная помощь ____.')+'<div class="notes-lines" aria-hidden="true"></div>')
    sheet+=section('reference','03','Справочник спорных случаев','Эту часть не нужно читать игрокам целиком.','<details><summary>Полные правила расходов и одновременных действий</summary>'+reference+'</details><details><summary>16 примеров сочетаний</summary>'+cases+'</details>'+p(h['appBoundary']))
    sheet_html=standalone('Лист финала ведущему',sheet).replace('Общая памятка','Только для ведущего').replace('Каждый знает собственную историю. Остальное выясняется на ярмарке.','<a href="magic-fair-v2.html">Вернуться в книгу ведущего →</a>')
    (OUT/'finale-sheet.html').write_text(sheet_html)
    # Главное издание: история сохранена отдельным снимком, без старых финальных счётчиков.
    hero=f'''<section class="chapter hero"><span class="eyebrow">17 игроков + ведущий · скрытые намерения</span><div class="hero-grid"><div><h1>Семнадцать<br>желаний.<br><em>Одно сердце.</em></h1>{p('На ярмарку приходят за своим. Общая история складывается из того, что люди решат рассказать — и сделать.','lead')}{p(h['status'],'hero-note')}<div class="quick-links"><a class="button" href="#characters">Персонажи и вводные ↗</a><a class="button light" href="#venues">Три места и заказы</a></div></div><div class="hero-art"><img class="large" src="{portrait('o9')}" alt="Эльмар"><img class="small" src="{portrait('o14')}" alt="Лира"></div></div></section>'''
    body=hero+section('legend','01','Кто что знает','Ведущий видит целое. Игроки получают только собственные вводные.',labelled('Можно прочитать всем',h['publicIntro'])+ul(h['gmOverview'])+'<p><a href="player-guide.html">Общая памятка для игроков →</a></p>'+f'<div class="truth">{labelled("Граница этой редакции",h["appBoundary"])}</div>')
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
    timing+=p('Финал: 85–100 минут. Обсуждение: 100–120. Не заставляйте игрока выдавать тайну к заранее назначенной минуте; если он застрял, предложите контакт и действие, а не готовый правильный выбор.')
    body+=section('acts','03','Как провести вечер','Порядок для ручного прогона на 17.',timing)
    body+=section('venues','03а','Таверна, ярмарка и мастерская','Что здесь делают игроки.',venues(gm=True))
    catalog='<div class="filters"><label>Найти персонажа<input id="character-search" type="search" placeholder="Имя, желание, предмет…"></label></div><p id="search-status" aria-live="polite">Найдено персонажей: 17 из 17</p><p id="no-results" hidden>Ничего не найдено</p><div class="catalog">'
    for r in roles:
        b=h['roles'][r['key']]; search=' '.join([r['name'],b['desire'],*b['goals']])
        catalog+=f'<a class="character" data-character="{r["key"]}" data-search="{esc(search)}" href="characters/{r["key"]}.html"><img src="{portrait(r["key"])}" alt="{esc(r["name"])}" loading="lazy"><div><span class="label">{esc(r["title"])}</span><h3>{esc(r["name"])}</h3>{p(b["publicFace"])}<span>Досье и личные вводные ↗</span></div></a>'
    catalog+='</div>'
    body+=section('characters','04','Семнадцать личных историй','Откройте досье и выдайте игроку только ссылку «Личные вводные». В досье раскрыты сведения ведущего.',catalog)
    twists=''.join(method(m) for m in h['methods'])+article('Передумать после раскрытия',labelled('Что должно произойти','Другие показывают последствия вмешательства, признаются или предлагают реальную альтернативу до последней фиксации.')+labelled('Что делает игрок','Отказывается от подготовленного предательства, отзывает часть, защищает прежнего противника или меняет просьбу. Новый секретный компонент на этом шаге не возникает.')+labelled('Что меняется','Намерение меняется поступком. Ведущий не назначает новую команду; фиксирует действие и его личную цену.'))
    twists+=article('Новая заявка: смерть, превращение, клятва',p(h['consentPolicy'])+p('Сначала договориться о конкретном событии и цене, затем провести сцену с наблюдаемым признаком. Смерть не выводит из игры: роль продолжается призраком. Для временного подчинения записать допустимые приказы, срок и способ освобождения; отказ от дискомфортной сцены всегда прекращает её без наказания.')+p('Пример клятвы: добровольно обещать одну доставку в обмен на защиту до конца акта. Нарушение прекращает защиту, но не отнимает управление персонажем. Пример превращения: Камень меняет образ, отдельная заявка о постоянной природе требует заранее оговорённого поступка. Зомби-состояние можно добавить только по такой согласованной заявке, а не за чужую тайную отметку.'))
    body+=section('twists','05','Что нужно для сюжетного поворота','Подготовка → наблюдаемый поступок → возможность ответа → конкретное последствие.',twists)
    evidence='<h3>Карта знаний — только ведущему</h3>'+''.join(article(k['topic'],labelled('Кто начинает со знанием',', '.join(name(x) for x in k['sources']))+p(k['fact'])+labelled('Если носителей нет',k['fallback'])) for k in h['knowledgeRoutes'])
    evidence+='<h3>Пять осколков</h3>'+item_picture(manifest['shard'],'Осколок сердца')+p('I — Серафина; II — Вельда; III — Эльмар; IV — лот II акта вместе с A; V — Лира с начала вечера. Они не расходуются при сборке и остаются у владельцев. Погашенная часть больше не считается целой.')
    evidence+='<h3>Три улики</h3>'+''.join(article(x['id']+' · '+x['name'],item_picture(manifest['clues'][x['id']],x['name'])+p(x['where'])+p(x['text'])) for x in game['clues'])
    evidence+=p('Для правды: публично сопоставить A+B+C и объяснить — Эльмар открыл ворота, дед Грима вывез сердце, Орвик извлёк и разделил его. Предметы могут принадлежать разным людям. Это не обязывает всех согласиться о будущем.')
    evidence+='<h3>Восемь реликвий</h3>'+''.join(article(x['name'],item_picture(manifest['relics'][x['name']],x['name'])+labelled('Стартовый владелец',name(x['owner']))+labelled('Кому нужна',', '.join(name(k) for k in x['wants']))+p('Обычный предмет торга: название не добавляет тайного обязательного эффекта.')) for x in game['relics'])
    evidence+='<h3>Ингредиенты и деньги</h3>'+item_gallery([(manifest['resources'][k],v) for k,v in dict(gold='Золото',**resources).items()])
    evidence+='<h3>Заказать у мастера</h3>'+p(h['venues']['workshop']['intro'])+recipes()+craft_rules(gm=True)
    body+=section('evidence','06','Вещи, знания и способы их получить','Ведите отдельный журнал владения и расходов.',evidence)
    ends='<p><a class="button" href="finale-sheet.html">Открыть печатный лист финала ↗</a></p>'+resolution
    ends+='<h3>Раскрытие ведущего</h3>'+p('До последнего шага слышны только удары из-под плиты. Когда возвращение действительно произошло, смените голос и произнесите реплику Сарна из пятой сцены. При сне или уничтожении живого разговора нет. Ведущий не получает собственного права переиграть чужие результаты.')
    ends+='<details><summary>Подробные правила для спорных сочетаний</summary>'+reference+'</details>'
    ends+=''.join(article(title,p(text)) for _,title,text in h['endings'])
    ends+='<h3>Каждому — собственный эпилог</h3>'+p('Проверить обе цели по тексту личной карточки. «Получить и сохранить» означает владеть при закрытии. Применение или обмен подтверждается записью ведущего. Затем спросить: чего хотел; что сделал; что получил; кто почувствует последствия. Несовместимые личные цели допускают, что не все получат всё.')
    for r in roles:
        b=h['roles'][r['key']]
        ends+=article(r['name'],labelled('Проверить личные цели',' / '.join(b['goals']))+labelled('Последствие выбора',b['finale']['impact']))
    body+=section('endings','07','Финал: жизнь, свобода, цена','Пять шагов у могилы: слева сцена ведущему, справа действия игроков.',ends)
    (OUT/'magic-fair-v2.html').write_text(page(h['title'],body))
    for i,r in enumerate(roles):
        key=r['key']; b=h['roles'][key]
        private_methods=[m for m in h['methods'] if key in m['holders']]
        header=f'<section class="chapter"><span class="eyebrow">{esc(r["title"])}</span><div class="dossier-hero"><img class="role-portrait" src="{portrait(key,"../")}" alt="{esc(r["name"])}"><div><h1>{esc(r["name"])}</h1>{p(b["publicFace"],"lead")}{labelled("Чего вы хотите",b["desire"])}</div></div></section>'
        private=header+section('background','01','Ваша история','',p(b['backstory'])+labelled('Ваш секрет',b['secret']))
        private+=section('knowledge','02','Что вы знаете в начале','Чужие намерения предстоит выяснять. Это ваши исходные сведения, а не знание всей истории.',ul(b['knowledge'])+labelled('Первые разговоры','')+ordered(b['firstSteps']))
        private+=section('goals','03','Две личные цели','Получить и сохранить — значит владеть вещью при закрытии; поступки и обмены фиксирует ведущий.',ordered(b['goals'])+labelled('На старте','')+gear(r)+ability(r))
        private+=section('profession','03а','Изготовление и торговля','',profession(key))
        own_notices=[n for n in h['noticeboard']['examples'] if n['author']==key]
        if own_notices:private+=section('your-notice','03б','Если захотите дать объявление','Это только идея: вы сами решаете, публиковать ли её и за какую цену.',''.join(article(n['title'],p(n['request'])+labelled('Возможная награда',n['reward'])) for n in own_notices))
        private+=section('choice','04','Если события дойдут до сердца','Это возможные действия, а не обязательный маршрут.',finale(b)+''.join(method(m,True) for m in private_methods)+p('Знание способа можно передать. В финальной сцене — одно основное действие и не более одного ответного щита на человека; новые компоненты после фиксации не появляются.'))
        private+=section('acting','05','Как войти в роль','Костюм и постоянная актёрская игра не обязательны.',acting(r))
        private+=section('common','06','Общие правила','',ul(h['publicRules'])+p(h['consentPolicy'])+p(h['venues']['workshop']['intro'])+recipes('../')+venues('../')+craft_rules(prefix='../'))
        private_html=standalone(r['name'],private,'../',True)
        css_url='../assets/gm-book/book.css?v='+hashlib.sha256((ASSETS/'book.css').read_bytes()).hexdigest()[:10]
        private_html=private_html.replace(f'<link rel="stylesheet" href="{css_url}">','<style>'+ (ASSETS/'book.css').read_text()+'</style>')
        private_html=private_html.replace(portrait(key,'../'),'data:image/jpeg;base64,'+base64.b64encode((ASSETS/f'portraits/{key}.jpg').read_bytes()).decode())
        for file in item_dir.glob('*.jpg'):
            version=hashlib.sha256(file.read_bytes()).hexdigest()[:10]
            private_html=private_html.replace(f'../assets/gm-book/items/{file.name}?v={version}','data:image/jpeg;base64,'+base64.b64encode(file.read_bytes()).decode())
        (OUT/f'players/{key}.html').write_text(private_html)
        gmheader=header.replace('<section class="chapter">','<section class="chapter"><p class="breadcrumbs"><a href="../magic-fair-v2.html#characters">← Все персонажи</a></p>',1)
        dossier=gmheader+f'<section class="chapter"><a class="button" href="../players/{key}.html">Личные вводные {esc(r["name"])} — выдать игроку ↗</a>{p("Эту страницу оставить ведущему. Личная карточка не содержит ссылок на книгу и чужих секретов.","aside-note")}</section>'
        dossier+=section('background','I','Предыстория','',p(b['backstory'])+labelled('Настоящее желание',b['desire']))
        dossier+=section('secrets','II','Граница знаний','Не дополняйте исходную карточку всей картиной.',labelled('Личный секрет',b['secret'])+ul(b['knowledge'])+''.join(method(m) for m in private_methods))
        dossier+=section('mechanics','III','Цели и способность','Цели этой редакции проверяются вручную.',ordered(b['goals'])+ability(r)+gear(r)+profession(key,True))
        relations=ordered(b['firstSteps'])
        for it in game['relics']:
            if key in it['wants'] or it['owner']==key:
                participants=set(it['wants'])|{it['owner']}
                relations+=article(it['name'],'<div class="people-links">'+''.join(link(k,True) for k in by if k in participants and k!=key)+'</div>'+p('Стартовый владелец: '+name(it['owner'])+'. Владение и обещание помощи обсуждаются отдельно.'))
        dossier+=section('relations','IV','Связи и повод для разговора','Первые контакты известны персонажу; полный круг желающих — ориентир для ведущего.',relations)
        acts='<div class="act-strip">'+''.join(article('Акт '+str(j+1),p(t)) for j,t in enumerate(b['acts']))+'</div>'
        dossier+=section('role-acts','V','Участие по актам','Подсказки для движения, а не обязательный сценарий.',acts)
        dossier+=section('role-twists','VI','Личный поворот и финал','',finale(b)+p(h['consentPolicy']))
        dossier+=section('acting','VII','Отыгрыш','',acting(r))
        last=labelled('Если игрок застрял',b['firstSteps'][0]+' Предложите конкретную сделку или вопрос, не раскрывая чужой замысел.')+labelled('Если персонажа нет','Перенести его уникальные стартовые вещи на рынок; обычное золото и ингредиенты не добавлять. Проверить карту дублирующихся знаний. Никому не отдавать автоматическую власть над его сюжетной линией.')
        last+='<div class="notes-lines" aria-hidden="true"></div>'+f'<div class="folio-nav"><span>← {link(roles[(i-1)%17]["key"],True)}</span><span>{link(roles[(i+1)%17]["key"],True)} →</span></div>'
        dossier+=section('gm','VIII','На полях ведущего','',last)
        (OUT/f'characters/{key}.html').write_text(page(r['name'],dossier,key))
    print('Новая редакция: 17 личных вводных + 17 досье; общая памятка и лист финала; 15 глав, 5 способов вмешательства.')
