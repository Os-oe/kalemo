// Teilen: Web Share mit Datei, sonst Vorschau + Speichern + „lange drücken" + Text in Zwischenablage.
import { t } from '../core/i18n.js';
import { escapeHtml } from './round.js';

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
  }
}

/** Datei teilen. Rückgabe: 'shared' | 'fallback' | 'cancelled' */
export async function shareImage(app, { blob, filename = 'kalemo.png', text, url = null, forceFallback = false }) {
  const file = new File([blob], filename, { type: 'image/png' });
  const data = { files: [file], text: url ? `${text}\n${url}` : text, title: 'Kalemo' };
  app.sfx?.play('whoosh');
  if (!forceFallback && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share(data); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  // Fallback. Iteration 2 (R2-P3-4): die Zwischenablage wird erst beim Tipp auf „Text kopieren" beschrieben, nie ungefragt
  const href = URL.createObjectURL(blob);
  const touch = matchMedia('(hover: none)').matches;
  // R2-P3-13: im Instagram-/LinkedIn-App-Browser bewirkt ein Datei-Download meist nichts → „Lange auf das Bild drücken" als
  // Hauptaktion + „Im Browser öffnen" (Link kopieren + Weg über das ⋯-Menü), kein Download-Knopf
  const inApp = /Instagram|FBAN|FBAV|LinkedInApp/i.test(navigator.userAgent);
  const box = document.getElementById('sheet');
  box.innerHTML = `<div class="sheet-card${inApp ? ' inapp-share' : ''}" role="dialog" aria-label="${escapeHtml(t('share'))}">
    <span class="share-wrap"><img src="${href}" alt="" class="share-img"></span>
    ${inApp ? `<p class="share-press">${escapeHtml(t('sharePress'))}</p>` : touch ? `<p class="hint">${escapeHtml(t('shareLong'))}</p>` : ''}
    <p class="hint ok share-copied" hidden>${escapeHtml(t('shareCopied'))}</p>
    <p class="hint share-browser-how" hidden>${escapeHtml(t('openBrowserHow'))}</p>
    <div class="actions">${inApp ? `<button class="btn primary" data-act="openbrowser">${escapeHtml(t('openBrowser'))}</button>` : `<a class="btn primary" href="${href}" download="${escapeHtml(filename)}" data-act="save">${escapeHtml(t('shareSave'))}</a>`}
    <button class="btn" data-act="copytext">${escapeHtml(t('shareCopyText'))}</button>
    <button class="btn ghost" data-act="close">${escapeHtml(t('close'))}</button></div></div>`;
  box.hidden = false;
  app.lastShare = { mode: 'fallback', copied: false, filename, bytes: blob.size, text: data.text, inApp };
  box.onclick = async (e) => {
    if (e.target.closest('[data-act=copytext]')) { const ok = await copyText(data.text); app.lastShare.copied = ok; const h = box.querySelector('.share-copied'); if (h) h.hidden = !ok; return; }
    if (e.target.closest('[data-act=openbrowser]')) { const ok = await copyText(url || location.origin + location.pathname.replace(/index\.html$/, '')); app.lastShare.browserLink = ok; box.querySelector('.share-browser-how').hidden = false; return; }
    if (e.target === box || e.target.closest('[data-act=close]')) { box.hidden = true; box.innerHTML = ''; URL.revokeObjectURL(href); }
  };
  return 'fallback';
}

/** Link teilen (Duell): Web Share, sonst Satz + Link in die Zwischenablage. Test-Modus nutzt navigator.share nur als Attrappe (__mock). */
export async function shareLink(app, { url, text, quiet = false }) {
  app.sfx?.play('whoosh');
  if (navigator.share && (!app.TEST || navigator.share.__mock)) {
    try { await navigator.share({ url, text, title: 'Kalemo' }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const ok = await copyText(`${text}\n${url}`);
  if (!quiet) app.ui.toast(ok ? t('duelCopied') : t('duelCopyManual'), 3000); // nie die rohe URL als Toast (lief aus dem Bild)
  return ok ? 'copied' : 'shown';
}
