// Bildwörterbuch: gesammelte Wörter mit eigener, wackelnder Zeichnung · Filter · Detail · So malen andere · Poster.
import { t, word, ART_TEXT, ART_COLOR, pluralPhrase, ambHint, LANGS } from '../core/i18n.js';
import * as store from '../core/dictstore.js';
import { mount, unmountAll } from './alive.js';
import { drawStrokes } from './ink.js';
import { escapeHtml } from './round.js';
import { poster } from './cards.js';
import { shareImage } from './share.js';
import { pluralTip } from './plural.js';

const $ = (s) => document.querySelector(s);
const baseCat = (c) => c.replace(/ \(.*\)$/, '');

export function installDict(app) {
  app.dict = store;
  let filter = 'all';
  app.openDict = async () => {
    app.show('dict');
    const entries = (await store.all()).filter((e) => app.byId.has(e.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    app.dictEntries = entries.map((e) => e.id);
    const { learn, native } = app.settings;
    const cats = [...new Set(entries.map((e) => baseCat(app.byId.get(e.id).category)))];
    unmountAll($('#screen-dict'));
    const body = $('#dict-body');
    body.innerHTML = `<header class="dict-head"><button class="icon-btn ink" data-act="home" aria-label="${escapeHtml(t('back'))}"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><h2 class="h-hand">${escapeHtml(t('dictT'))}</h2>
      <span class="count">${escapeHtml(entries.length === 1 ? t('dictCount1') : t('dictCount', { n: entries.length }))}</span></header>
      ${entries.length ? `<div class="chips" role="tablist"><button class="chip-f" aria-pressed="${filter === 'all'}" data-f="all">${escapeHtml(t('dictAll'))}</button>${cats.map((c) => `<button class="chip-f" aria-pressed="${filter === c}" data-f="${escapeHtml(c)}">${escapeHtml(t('cats.' + c))}</button>`).join('')}</div>
      <div class="dict-grid">${entries.filter((e) => filter === 'all' || baseCat(app.byId.get(e.id).category) === filter).map((e) => { const w = app.byId.get(e.id); return `<button class="dict-cell" data-id="${escapeHtml(e.id)}"><canvas></canvas><span style="color:${learn === 'de' ? ART_TEXT[w.de.art] : '#1E2A3A'}">${escapeHtml(word(w, learn))}</span><small>${escapeHtml(word(w, native))}</small></button>`; }).join('')}</div>
      <div class="actions"><button class="btn primary" data-act="poster">${escapeHtml(t('dictPoster'))}</button></div>`
      : `<div class="empty"><canvas class="empty-art"></canvas><p>${escapeHtml(t('dictEmpty'))}</p><button class="btn primary" data-act="home">${escapeHtml(t('home'))}</button></div>`}`;
    body.querySelectorAll('.dict-cell').forEach((b, i) => {
      const e = entries.find((x) => x.id === b.dataset.id), w = app.byId.get(e.id);
      mount(b.querySelector('canvas'), { strokes: e.strokes, color: learn === 'de' ? ART_TEXT[w.de.art] : '#1E2A3A', style: 'pencil', width: 2.6, boil: 1, still: true, seed: i + 1 });
    });
    const empty = body.querySelector('.empty-art');
    if (empty) { const o = await app.others(); mount(empty, { strokes: o.cat[0].strokes, color: '#6B7280', style: 'pencil', width: 2.4, motion: { kind: 'hop', id: 'cat' } }); }
    body.onclick = async (ev) => {
      const f = ev.target.closest('[data-f]'); if (f) { filter = f.dataset.f; app.sfx?.play('tap'); app.openDict(); return; }
      const c = ev.target.closest('.dict-cell'); if (c) { app.sfx?.play('tap'); detail(entries.find((x) => x.id === c.dataset.id)); return; }
      if (ev.target.closest('[data-act=home]')) { app.goHome(); return; }
      if (ev.target.closest('[data-act=poster]')) {
        const p = await poster(app, entries); app.lastPoster = { bytes: p.blob.size, w: p.canvas.width, h: p.canvas.height };
        await shareImage(app, { blob: p.blob, filename: 'kalemo-poster.png', text: 'Kalemo', forceFallback: !!app.TEST });
      }
    };
    app.music?.play();
  };

  async function detail(e) {
    const w = app.byId.get(e.id), { learn, native } = app.settings;
    const order = [learn, native, LANGS.find((l) => l !== learn && l !== native)];
    const amb = ambHint(w, learn, native);
    const pl = w.kP ? null : (learn === 'tr' ? pluralPhrase(w, 'tr', 3) : learn === 'de' ? `die ${w.de.pl}` : w.en.pl);
    const box = document.getElementById('sheet');
    box.innerHTML = `<div class="sheet-card dict-detail" role="dialog">
      <canvas class="big"></canvas>
      <div class="langs">${order.map((l, i) => `<button class="lang-line${i === 0 ? ' first' : ''}" data-say="${l}" ${l === 'de' ? `style="--ac:${ART_TEXT[w.de.art]}"` : ''}><small>${l.toUpperCase()}</small><span>${escapeHtml(word(w, l))}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6"/></svg></button>`).join('')}</div>
      ${pl ? `${learn === 'tr' ? '' : `<p class="plural-line"><strong>${escapeHtml(t('plural'))}:</strong> ${escapeHtml(pl)}</p>`}<p class="hint">${escapeHtml(pluralTip(w, learn, native, 3))}</p>` : ''}
      ${amb ? `<p class="amb">${escapeHtml(t('dictAmbig', { h: amb }))}</p>` : ''}
      <h4>${escapeHtml(t('dictOthers'))}</h4><div class="others"></div>
      <button class="btn ghost" data-act="close">${escapeHtml(t('close'))}</button></div>`;
    box.hidden = false;
    const col = learn === 'de' ? ART_TEXT[w.de.art] : '#1E2A3A';
    mount(box.querySelector('canvas.big'), { strokes: e.strokes, color: col, style: 'pencil', width: 3.6, motion: { kind: w.motion, id: w.id } });
    const others = (await app.examples())[w.id] || [];
    const oBox = box.querySelector('.others');
    oBox.innerHTML = others.slice(0, 3).map(() => '<canvas></canvas>').join('');
    oBox.querySelectorAll('canvas').forEach((c, i) => mount(c, { strokes: others[i].strokes, color: '#6B7280', style: 'pencil', width: 2.4, replay: 2.4 + i * 0.4, delay: i * 500, boil: 0.6, still: true, seed: i + 7 }));
    app.voice?.word(w.id, learn);
    box.onclick = (ev) => {
      const s = ev.target.closest('[data-say]'); if (s) { app.voice?.word(w.id, s.dataset.say); return; }
      if (ev.target === box || ev.target.closest('[data-act=close]')) { unmountAll(box); box.hidden = true; box.innerHTML = ''; }
    };
  }
}
