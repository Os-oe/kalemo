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
  // Fallback
  const copied = await copyText(data.text);
  const href = URL.createObjectURL(blob);
  const touch = matchMedia('(hover: none)').matches;
  const box = document.getElementById('sheet');
  box.innerHTML = `<div class="sheet-card" role="dialog" aria-label="${escapeHtml(t('share'))}">
    <img src="${href}" alt="" class="share-img">
    ${touch ? `<p class="hint">${escapeHtml(t('shareLong'))}</p>` : ''}
    ${copied ? `<p class="hint ok">${escapeHtml(t('shareCopied'))}</p>` : ''}
    <div class="actions"><a class="btn primary" href="${href}" download="${escapeHtml(filename)}" data-act="save">${escapeHtml(t('shareSave'))}</a>
    <button class="btn ghost" data-act="close">${escapeHtml(t('close'))}</button></div></div>`;
  box.hidden = false;
  app.lastShare = { mode: 'fallback', copied, filename, bytes: blob.size, text: data.text };
  box.onclick = (e) => { if (e.target === box || e.target.closest('[data-act=close]')) { box.hidden = true; box.innerHTML = ''; URL.revokeObjectURL(href); } };
  return 'fallback';
}

/** Link teilen (Duell): Web Share, sonst Satz + Link in die Zwischenablage. Test-Modus nutzt navigator.share nur als Attrappe (__mock). */
export async function shareLink(app, { url, text, quiet = false }) {
  app.sfx?.play('whoosh');
  if (navigator.share && (!app.TEST || navigator.share.__mock)) {
    try { await navigator.share({ url, text, title: 'Kalemo' }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const ok = await copyText(`${text}\n${url}`);
  if (!quiet || !ok) app.ui.toast(ok ? t('duelCopied') : url, 3000);
  return ok ? 'copied' : 'shown';
}
