(() => {
  const search = document.querySelector('#character-search');
  const side = document.querySelector('#side-filter');
  const cards = [...document.querySelectorAll('[data-character]')];
  const clean = s => s.toLocaleLowerCase('ru').replaceAll('ё','е').trim();
  function filter() {
    const query = clean(search.value);
    let count = 0;
    cards.forEach(card => {
      const visible = (!side?.value || card.dataset.side === side.value) && clean(card.dataset.search).includes(query);
      card.hidden = !visible;
      count += Number(visible);
    });
    document.querySelector('#search-status').textContent = `Найдено персонажей: ${count} из ${cards.length}`;
    document.querySelector('#no-results').hidden = count !== 0;
  }
  if (search) { search.addEventListener('input', filter); side?.addEventListener('change', filter); }
  document.querySelectorAll('[data-print]').forEach(b => b.addEventListener('click', () => window.print()));
  document.querySelectorAll('[data-menu]').forEach(b => b.addEventListener('click', () => {
    const nav = document.querySelector('#book-nav');
    const expanded = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(expanded));
    nav.classList.toggle('is-open', expanded);
  }));
  document.querySelectorAll('#book-nav a').forEach(a => a.addEventListener('click', () => {
    document.querySelector('#book-nav').classList.remove('is-open');
    document.querySelector('[data-menu]')?.setAttribute('aria-expanded','false');
  }));
})();
