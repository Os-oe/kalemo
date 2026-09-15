// UI-Texte in DE/EN/TR (UI-Sprache = „Ich spreche") + Wort-Helfer. Keine Freitexte, nie „falsch"/„Fehler".
export const LANGS = ['de', 'en', 'tr'];
export const LANG_CODE = { de: 'DE', en: 'EN', tr: 'TR' };

export const T = {
  de: {
    langName: { de: 'Deutsch', en: 'Englisch', tr: 'Türkisch' },
    tagline: 'Mal’s in die Luft.', subtitle: 'Der Luftmaler',
    iSpeak: 'Ich spreche', iLearn: 'Ich lerne', swap: 'Tauschen',
    dailyHint: '5 Wörter · etwa 2 Minuten · für alle gleich', daily: 'Tagesskizze #{n}', dailyDone: 'Tagesskizze #{n} geschafft', practice: 'Noch mal üben', duel: 'Luft-Duell', dict: 'Bildwörterbuch',
    streak: 'Serie {n}', yesterday: 'Gestern gemalt', settings: 'Einstellungen', close: 'Schließen', back: 'Zurück',
    next: 'Weiter', skip: 'Überspringen', start: 'Los geht’s', finish: 'Fertig',
    slot: 'Wort {i} von {n}', review: 'Wiederholung', plural: 'Mehrzahl',
    guessHmm: 'Hmm … {w}?', guessHit: 'Ich weiß! {w}!', guessHard: 'Hmm, schwierig …', timeUp: 'Zeit ist um.',
    missTitle: 'Ich hab’s nicht erkannt — so malen es andere:', helpOthers: 'Zeig mir, wie andere es malen',
    hitTitle: 'Erkannt!', youDrew: 'Du hast gemalt:',
    articleQ: 'der, die oder das?', articleHintAir: 'Zeig 1, 2 oder 3 Finger — oder tippe.', articleHintTap: 'Tippe auf der, die oder das.',
    articleOk: 'Genau!', articleShow: 'Es heißt: {w}',
    fingers: { 1: '1 Finger', 2: '2 Finger', 3: '3 Finger' },
    pluralDraw: 'Mal es {n}-mal hintereinander', pluralCount: '{i}/{n}',
    pluralTipTR: 'Im Türkischen reicht die Zahl: {ex}',
    pluralTipTRtane: 'Im Türkischen reicht die Zahl — „tane“ heißt „Stück“: {ex}',
    pluralTipDE: 'Die Mehrzahl immer mitlernen: {sg} → die {pl}',
    pluralTipEN: 'Unregelmäßige Mehrzahl: {sg} → {pl}',
    pluralTipENreg: 'Regelmäßige Mehrzahl: {sg} → {pl}',
    realQ: 'Findest du das in echt? {w} — du hast 10 Sekunden!', realOk: 'Echt gefunden! Punkte ×2', realNone: 'Diesmal nicht gesehen — macht nichts.',
    airOfferT: 'Jetzt in die Luft?', airOfferB: 'Mal mit dem Zeigefinger vor der Kamera — wie ein Zauberstab.', airYes: 'Ja, in die Luft', airNo: 'Lieber hier weiter',
    preCamT: 'Dein Kamerabild verlässt nie dein Gerät.', preCamB: 'Die Handerkennung läuft komplett in deinem Browser. Vom Kamerabild wird nichts gespeichert oder gesendet.',
    poseDraw: 'Zeigefinger = malen', posePause: 'Offene Hand = Pause', preCamGo: 'Kamera erlauben',
    handCheck: 'Zeig deine Hand hier', handOk: 'Hand erkannt!', loadingAir: 'Handerkennung lädt … {p} %',
    camDenied: 'Kein Problem — du malst auf dem Bildschirm.', camFail: 'Die Kamera ist gerade nicht verfügbar — du malst auf dem Bildschirm.',
    moreLight: 'Mehr Licht von vorn hilft der Kamera.', toScreen: 'Auf dem Bildschirm malen', airToggle: 'In die Luft', screenToggle: 'Bildschirm',
    inApp: 'Für die Kamera im Browser öffnen', inAppB: 'Hier im App-Browser malst du auf dem Bildschirm.',
    dayEndT: 'Tagesskizze #{n}', aiRecognized: 'KI erkannte {x}/5', points: 'Punkte', streakDays: 'Serie: {n} Tage', streakDay: 'Serie: 1 Tag',
    funniest: 'Lustigster KI-Tipp', share: 'Teilen', challenge: 'Jemanden herausfordern', toDict: 'Zum Bildwörterbuch', home: 'Start',
    shareText: 'Kalemo #{n} · {pair} · {x}/5 · Serie {s}', shareCopied: 'Text kopiert.', shareSave: 'Bild speichern', shareLong: 'Lange drücken zum Speichern',
    yesterdayCard: 'Karte von gestern', todayCard: 'Karte von heute',
    duelT: 'Luft-Duell', duelPick: 'Wähle ein Wort', duelDraw: 'Mal es — im Link steckt nur diese eine Zeichnung.',
    duelLink: 'Dein Duell-Link', duelSend: 'Link teilen', duelCopy: 'Link kopieren', duelCopied: 'Link kopiert.',
    duelIncoming: 'Jemand hat dir etwas in die Luft gemalt!', duelWatch: 'Schau zu …', duelWhat: 'Was ist das?',
    duelYou: 'Du: {a} s', duelThem: 'Absender: {b} s', duelBack: 'Du bist dran', duelRight: 'Richtig geraten!', duelWas: 'Es war: {w}',
    duelBroken: 'Dieser Duell-Link ist unvollständig.',
    dictT: 'Bildwörterbuch', dictEmpty: 'Noch leer — jede erkannte Zeichnung landet hier.', dictAll: 'Alle', dictOthers: 'So malen andere',
    dictPoster: 'Poster erstellen', dictCount: '{n} Wörter', dictCount1: '1 Wort', dictAmbig: 'Gut zu wissen: {h}',
    mute: 'Ton aus', unmute: 'Ton an', music: 'Musik', pinch: 'Malen mit Daumen und Zeigefinger zusammen', speaker: 'Noch mal hören',
    legal: 'Impressum', privacy: 'Datenschutz', credits: 'Credits', byOsai: 'von OsAI',
    doDont: 'Bewegung beim Lernen: Gesten können helfen, sich Wörter zu merken.',
    cats: { Tier: 'Tiere', Essen: 'Essen', Haus: 'Zuhause', Küche: 'Küche', Ding: 'Dinge', Draußen: 'Draußen', Kleidung: 'Kleidung', Körper: 'Körper', 'Wetter/Himmel': 'Himmel & Wetter', Natur: 'Natur', Gebäude: 'Gebäude', Straße: 'Straße', Fahrzeug: 'Fahrzeuge', Spiel: 'Spielen', Musik: 'Musik' },
    reduced: 'Weniger Bewegung', loading: 'Lädt …', offlineModel: 'Die Mal-KI lädt noch …', modelFail: 'Die Mal-KI konnte nicht laden. Bitte lade die Seite neu.',
  },
  en: {
    langName: { de: 'German', en: 'English', tr: 'Turkish' },
    tagline: 'Draw it in the air.', subtitle: 'The air-drawing game',
    iSpeak: 'I speak', iLearn: 'I’m learning', swap: 'Swap',
    dailyHint: '5 words · about 2 minutes · the same for everyone', daily: 'Daily Sketch #{n}', dailyDone: 'Daily Sketch #{n} done', practice: 'Practise again', duel: 'Air Duel', dict: 'Picture Dictionary',
    streak: 'Streak {n}', yesterday: 'Drawn yesterday', settings: 'Settings', close: 'Close', back: 'Back',
    next: 'Next', skip: 'Skip', start: 'Let’s go', finish: 'Done',
    slot: 'Word {i} of {n}', review: 'Review', plural: 'Plural',
    guessHmm: 'Hmm … {w}?', guessHit: 'I know! {w}!', guessHard: 'Hmm, tricky …', timeUp: 'Time’s up.',
    missTitle: 'I couldn’t tell — this is how others draw it:', helpOthers: 'Show me how others draw it',
    hitTitle: 'Got it!', youDrew: 'You drew:',
    articleQ: 'der, die or das?', articleHintAir: 'Show 1, 2 or 3 fingers — or tap.', articleHintTap: 'Tap der, die or das.',
    articleOk: 'Exactly!', articleShow: 'It’s {w}.',
    fingers: { 1: '1 finger', 2: '2 fingers', 3: '3 fingers' },
    pluralDraw: 'Draw it {n} times in a row', pluralCount: '{i}/{n}',
    pluralTipTR: 'In Turkish, the number is enough: {ex}',
    pluralTipTRtane: 'In Turkish, the number is enough — “tane” means ‘piece’: {ex}',
    pluralTipDE: 'Always learn the plural with the word: {sg} → die {pl}',
    pluralTipEN: 'Irregular plural: {sg} → {pl}',
    pluralTipENreg: 'Regular plural: {sg} → {pl}',
    realQ: 'Can you find a real one? {w} — you’ve got 10 seconds!', realOk: 'Found the real thing! Points ×2', realNone: 'Didn’t spot it this time — no worries.',
    airOfferT: 'Try it in the air?', airOfferB: 'Draw with your index finger in front of the camera — like a magic wand.', airYes: 'Yes, in the air', airNo: 'Keep drawing here',
    preCamT: 'Your camera image never leaves your device.', preCamB: 'Hand tracking runs entirely in your browser. No camera images are stored or sent.',
    poseDraw: 'Index finger = draw', posePause: 'Open hand = pause', preCamGo: 'Allow camera',
    handCheck: 'Show your hand here', handOk: 'Hand found!', loadingAir: 'Loading hand tracking … {p}%',
    camDenied: 'No problem — you’ll draw on the screen.', camFail: 'The camera isn’t available right now — you’ll draw on the screen.',
    moreLight: 'More light from the front helps the camera.', toScreen: 'Draw on the screen', airToggle: 'In the air', screenToggle: 'Screen',
    inApp: 'Open in your browser to use the camera', inAppB: 'In this in-app browser you draw on the screen.',
    dayEndT: 'Daily Sketch #{n}', aiRecognized: 'AI recognised {x}/5', points: 'Points', streakDays: 'Streak: {n} days', streakDay: 'Streak: 1 day',
    funniest: 'Funniest AI guess', share: 'Share', challenge: 'Challenge a friend', toDict: 'Picture Dictionary', home: 'Home',
    shareText: 'Kalemo #{n} · {pair} · {x}/5 · Streak {s}', shareCopied: 'Text copied.', shareSave: 'Save image', shareLong: 'Press and hold to save',
    yesterdayCard: 'Yesterday’s card', todayCard: 'Today’s card',
    duelT: 'Air Duel', duelPick: 'Pick a word', duelDraw: 'Draw it — your link only contains this one drawing.',
    duelLink: 'Your duel link', duelSend: 'Share link', duelCopy: 'Copy link', duelCopied: 'Link copied.',
    duelIncoming: 'Someone drew something in the air for you!', duelWatch: 'Watch …', duelWhat: 'What is it?',
    duelYou: 'You: {a} s', duelThem: 'Sender: {b} s', duelBack: 'Draw one back', duelRight: 'You got it!', duelWas: 'The answer: {w}',
    duelBroken: 'This duel link is incomplete.',
    dictT: 'Picture Dictionary', dictEmpty: 'Still empty — every recognised drawing ends up here.', dictAll: 'All', dictOthers: 'How others draw it',
    dictPoster: 'Create poster', dictCount: '{n} words', dictCount1: '1 word', dictAmbig: 'Good to know: {h}',
    mute: 'Sound off', unmute: 'Sound on', music: 'Music', pinch: 'Draw by pinching (thumb + index finger)', speaker: 'Listen again',
    legal: 'Legal notice', privacy: 'Privacy', credits: 'Credits', byOsai: 'by OsAI',
    doDont: 'Moving while learning: gestures can help you remember words.',
    cats: { Tier: 'Animals', Essen: 'Food', Haus: 'Home', Küche: 'Kitchen', Ding: 'Things', Draußen: 'Outdoors', Kleidung: 'Clothes', Körper: 'Body', 'Wetter/Himmel': 'Sky & weather', Natur: 'Nature', Gebäude: 'Buildings', Straße: 'Street', Fahrzeug: 'Vehicles', Spiel: 'Play', Musik: 'Music' },
    reduced: 'Reduce motion', modelFail: 'The drawing AI couldn’t load. Please reload the page.', loading: 'Loading …', offlineModel: 'The drawing AI is still loading …',
  },
  tr: {
    langName: { de: 'Almanca', en: 'İngilizce', tr: 'Türkçe' },
    tagline: 'Havada çiz.', subtitle: 'Havada çizim oyunu',
    iSpeak: 'Bildiğim dil', iLearn: 'Öğrendiğim dil', swap: 'Değiştir',
    dailyHint: '5 kelime · yaklaşık 2 dakika · herkes için aynı', daily: 'Günün Çizimi #{n}', dailyDone: 'Günün Çizimi #{n} tamam', practice: 'Tekrar çalış', duel: 'Hava Düellosu', dict: 'Resimli Sözlük',
    streak: 'Seri {n}', yesterday: 'Dün çizdiklerin', settings: 'Ayarlar', close: 'Kapat', back: 'Geri',
    next: 'Devam', skip: 'Geç', start: 'Haydi başla', finish: 'Bitti',
    slot: 'Kelime {i}/{n}', review: 'Tekrar', plural: 'Çoğul',
    guessHmm: 'Hmm… {w}?', guessHit: 'Buldum! {w}!', guessHard: 'Hmm, zor…', timeUp: 'Süre doldu.',
    missTitle: 'Anlayamadım — başkaları böyle çiziyor:', helpOthers: 'Başkaları nasıl çiziyor, göster',
    hitTitle: 'Tanıdım!', youDrew: 'Senin çizimin:',
    articleQ: 'der mi, die mi, das mı?', articleHintAir: '1, 2 ya da 3 parmak göster — ya da dokun.', articleHintTap: 'der, die ya da das’a dokun.',
    articleOk: 'Aynen öyle!', articleShow: 'Artikeliyle: {w}',
    fingers: { 1: '1 parmak', 2: '2 parmak', 3: '3 parmak' },
    pluralDraw: 'Arka arkaya {n} kez çiz', pluralCount: '{i}/{n}',
    pluralTipTR: 'Türkçede sayı yeterli: {ex}',
    pluralTipTRtane: 'Türkçede sayı yeterli — burada “tane” adet demek: {ex}',
    pluralTipDE: 'Çoğulu her zaman kelimeyle birlikte öğren: {sg} → die {pl}',
    pluralTipEN: 'Düzensiz çoğul: {sg} → {pl}',
    pluralTipENreg: 'Düzenli çoğul: {sg} → {pl}',
    realQ: 'Yanında gerçek bir {w} var mı? 10 saniye içinde kameraya göster!', realOk: 'Gerçeğini buldun! Puan ×2', realNone: 'Bu sefer göremedim — önemli değil.',
    airOfferT: 'Havada denemek ister misin?', airOfferB: 'Kameranın önünde işaret parmağınla çiz — sihirli değnek gibi.', airYes: 'Evet, havada', airNo: 'Burada devam',
    preCamT: 'Kamera görüntün cihazından asla çıkmaz.', preCamB: 'El takibi tamamen tarayıcında çalışır. Kamera görüntüsü kaydedilmez ya da gönderilmez.',
    poseDraw: 'İşaret parmağı = çiz', posePause: 'Açık el = dur', preCamGo: 'Kameraya izin ver',
    handCheck: 'Elini buraya göster', handOk: 'El bulundu!', loadingAir: 'El takibi yükleniyor… %{p}',
    camDenied: 'Sorun değil — ekranda çizebilirsin.', camFail: 'Kamera şu anda kullanılamıyor — ekranda çizebilirsin.',
    moreLight: 'Önden daha fazla ışık kameraya yardımcı olur.', toScreen: 'Ekranda çiz', airToggle: 'Havada', screenToggle: 'Ekran',
    inApp: 'Kamera için tarayıcıda aç', inAppB: 'Bu uygulama içi tarayıcıda ekranda çizebilirsin.',
    dayEndT: 'Günün Çizimi #{n}', aiRecognized: 'Yapay zekâ {x}/5 tanıdı', points: 'Puan', streakDays: 'Seri: {n} gün', streakDay: 'Seri: 1 gün',
    funniest: 'En komik tahmin', share: 'Paylaş', challenge: 'Arkadaşına meydan oku', toDict: 'Resimli Sözlük', home: 'Ana sayfa',
    shareText: 'Kalemo #{n} · {pair} · {x}/5 · Seri {s}', shareCopied: 'Metin kopyalandı.', shareSave: 'Resmi kaydet', shareLong: 'Kaydetmek için basılı tut',
    yesterdayCard: 'Dünün kartı', todayCard: 'Bugünün kartı',
    duelT: 'Hava Düellosu', duelPick: 'Bir kelime seç', duelDraw: 'Çiz — linkinde yalnızca bu çizim var.',
    duelLink: 'Düello linkin', duelSend: 'Linki paylaş', duelCopy: 'Linki kopyala', duelCopied: 'Link kopyalandı.',
    duelIncoming: 'Biri senin için havaya bir şey çizdi!', duelWatch: 'İzle…', duelWhat: 'Bu ne?',
    duelYou: 'Sen: {a} sn', duelThem: 'Gönderen: {b} sn', duelBack: 'Sen de çiz', duelRight: 'Bildin!', duelWas: 'Cevap: {w}',
    duelBroken: 'Bu düello linki eksik.',
    dictT: 'Resimli Sözlük', dictEmpty: 'Henüz boş — tanınan her çizim buraya gelir.', dictAll: 'Hepsi', dictOthers: 'Başkaları böyle çiziyor',
    dictPoster: 'Poster oluştur', dictCount: '{n} kelime', dictCount1: '1 kelime', dictAmbig: 'Bilmekte fayda var: {h}',
    mute: 'Sesi kapat', unmute: 'Sesi aç', music: 'Müzik', pinch: 'Parmaklarını birleştirerek çiz (başparmak + işaret parmağı)', speaker: 'Tekrar dinle',
    legal: 'Künye', privacy: 'Gizlilik', credits: 'Emeği geçenler', byOsai: 'OsAI yapımı',
    doDont: 'Hareket ederek öğrenmek: jestler kelimeleri akılda tutmaya yardımcı olabilir.',
    cats: { Tier: 'Hayvanlar', Essen: 'Yiyecekler', Haus: 'Ev', Küche: 'Mutfak', Ding: 'Eşyalar', Draußen: 'Dışarıda', Kleidung: 'Giysiler', Körper: 'Vücut', 'Wetter/Himmel': 'Gökyüzü ve hava', Natur: 'Doğa', Gebäude: 'Binalar', Straße: 'Sokak', Fahrzeug: 'Taşıtlar', Spiel: 'Oyun', Musik: 'Müzik' },
    reduced: 'Daha az hareket', modelFail: 'Çizim yapay zekâsı yüklenemedi. Lütfen sayfayı yenile.', loading: 'Yükleniyor…', offlineModel: 'Çizim yapay zekâsı hâlâ yükleniyor…',
  },
};

let ui = 'de';
export function setUiLang(l) { ui = LANGS.includes(l) ? l : 'de'; document.documentElement.lang = ui; }
export function uiLang() { return ui; }
/** t('daily', {n: 3}) — Punktpfade erlaubt: t('cats.Tier') */
export function t(key, vars = {}, lang = ui) {
  let v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), T[lang]);
  if (v == null) v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), T.de);
  if (typeof v !== 'string') return v;
  return v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

// ---------- Wörter ----------
export const NUM = { de: ['', 'eins', 'zwei', 'drei', 'vier', 'fünf'], en: ['', 'one', 'two', 'three', 'four', 'five'], tr: ['', 'bir', 'iki', 'üç', 'dört', 'beş'] };
export const ART_COLOR = { der: '#3B82F6', die: '#EF4444', das: '#22C55E', plural: '#FACC15', neutral: '#FFC857' };
export const ART_TEXT = { der: '#1D4ED8', die: '#B91C1C', das: '#15803D', plural: '#A16207', neutral: '#1E2A3A' };

/** Wort in einer Sprache. article: DE mit Artikel (Default true) */
export function word(w, lang, { article = true } = {}) {
  if (!w) return '';
  if (lang === 'de') return article ? `${w.de.art} ${w.de.noun}` : w.de.noun;
  if (lang === 'en') return w.en.word;
  return w.tr.word;
}
/** Mehrzahl-Phrase: DE „drei Äpfel" · EN „three apples" · TR „üç elma" */
export function pluralPhrase(w, lang, n) {
  if (lang === 'de') return `${NUM.de[n]} ${w.de.pl}`;
  if (lang === 'en') return `${NUM.en[n]} ${w.en.pl}`;
  return `${NUM.tr[n]} ${w.tr.tane ? 'tane ' : ''}${w.tr.word}`; // „üç yüz" = dreihundert → „üç tane yüz"
}
/** Mehrdeutigkeits-Hinweis für ein Wort in der Lernsprache, formuliert in der UI-Sprache */
export function ambHint(w, learn, uiL) { return w.amb?.[learn]?.[uiL] || null; }

/** Lustigster-Tipp-Paar zulässig? (Sprach-Review 1 Nr. 17: keine Beleidigungs-Kombis bei Körperteilen) */
const BODY = new Set(['face', 'mouth', 'nose', 'eye', 'ear', 'beard', 'hand', 'foot', 'leg', 'arm', 'tooth', 'brain']);
const INSULT = new Set(['pig', 'cow', 'monkey', 'snake', 'toilet', 'camel', 'donkey', 'frog', 'crocodile', 'sheep', 'elephant', 'whale']);
export const funnyAllowed = (targetId, guessId) => !(BODY.has(targetId) && INSULT.has(guessId)) && !(INSULT.has(guessId) && guessId === 'pig' && BODY.has(targetId));
/** Satzanfang groß (TR: i → İ) */
export function cap(s, lang) {
  if (!s) return s;
  const f = lang === 'tr' ? s[0].toLocaleUpperCase('tr') : s[0].toLocaleUpperCase(lang);
  return f + s.slice(1);
}
/** Strichfarbe: DE-Lernende Artikel-Farbe, sonst neutral Gold */
export function strokeColor(w, learn, { plural = false } = {}) {
  if (learn !== 'de') return ART_COLOR.neutral;
  return plural ? ART_COLOR.plural : ART_COLOR[w.de.art];
}

/** „Die KI hielt meine Katze für einen Rasenmäher." in UI-Sprache (Wörter in UI-Sprache) */
export function funnyLine(target, guess, lang) {
  if (lang === 'de') {
    const poss = { der: 'meinen', die: 'meine', das: 'mein' }[target.de.art];
    const ind = guess.de.mass ? '' : { der: 'einen ', die: 'eine ', das: 'ein ' }[guess.de.art];
    const acc = (w) => (w.de.art === 'der' && w.de.akk) || w.de.noun; // n-Deklination: Löwe → Löwen
    return `Die KI hielt ${poss} ${acc(target)} für ${ind}${acc(guess)}.`;
  }
  if (lang === 'en') {
    const PL = new Set(['glasses', 'trousers', 'scissors', 'stairs', 'drums', 'grapes']);
    const g = guess.en.word;
    const art = PL.has(g) || guess.en.mass ? '' : /^[aeiou]/i.test(g) ? 'an ' : 'a ';
    return `The AI mistook my ${target.en.word} for ${art}${g}.`;
  }
  return `Yapay zekâ ${target.tr.word} yerine ${guess.tr.word} dedi.`;
}
