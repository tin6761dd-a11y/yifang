(function(){
  const buttons = document.querySelectorAll('.filters button');
  const cards = document.querySelectorAll('.machine');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-cat');
      buttons.forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
      cards.forEach(card => {
        const show = cat === 'all' || card.getAttribute('data-category') === cat;
        card.hidden = !show;
      });
    });
  });
  document.querySelectorAll('.gallery').forEach(g => {
    const main = g.querySelector('.main-photo');
    const thumbs = g.querySelectorAll('.thumbs button');
    thumbs.forEach(btn => {
      btn.addEventListener('click', () => {
        const src = btn.getAttribute('data-src');
        const alt = btn.getAttribute('data-alt') || main.alt;
        if (src) { main.src = src; main.alt = alt; }
        thumbs.forEach(t => t.setAttribute('aria-current', t === btn ? 'true' : 'false'));
      });
    });
  });
})();
