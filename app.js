/* Sprechtest: Wort zeigen, das Kind spricht, die Spracherkennung des Browsers hört zu, pruefen.js vergleicht. */
(function () {
  'use strict';
  const LISTEN = window.SPRECHTEST.listen;
  const P = window.Pruefen;
  const $ = id => document.getElementById(id);
  const HOEREN_MAX_MS = 10000;   // spätestens dann aufhören zuzuhören

  const URTEIL = { richtig: 'Richtig', fast: 'Fast', falsch: 'Nicht erkannt' };
  const FEHLER = {
    'no-speech': 'Nichts gehört. Nochmals tippen und etwas lauter sprechen.',
    'audio-capture': 'Kein Mikrofon gefunden.',
    'not-allowed': 'Das Mikrofon ist nicht erlaubt. iPad/iPhone: Einstellungen → Apps → Safari → Mikrofon → Erlauben. ' +
      'Chrome: Schloss links neben der Adresse → Mikrofon erlauben.',
    'service-not-allowed': 'Die Spracherkennung ist ausgeschaltet. iPad/iPhone: Einstellungen → Allgemein → Tastatur → ' +
      '«Diktierfunktion aktivieren» einschalten.',
    'network': 'Keine Verbindung zur Spracherkennung. Sie braucht Internet.',
    'language-not-supported': 'Diese Sprache kann die Spracherkennung auf diesem Gerät nicht.',
  };

  const opt = { zeigen: true, mischen: false };
  let liste = null, reihe = [], pos = 0, ergebnisse = {}, aufgedeckt = false;
  let rec = null, audio = null;

  const Erkennung = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

  // ---------- Ansichten ----------
  function ansicht(name) {
    for (const id of ['start', 'ueben', 'ende']) $(id).hidden = id !== name;
    $('zurueck').hidden = name === 'start';
    if (name !== 'ueben') $('fortschritt').textContent = '';
    window.scrollTo(0, 0);
  }

  function zeigeStart() {
    stopAlles();
    ansicht('start');
    const h = $('hinweis');
    if (!Erkennung()) {
      h.textContent = 'Dieser Browser hat keine Spracherkennung. Bitte Safari (iPad, iPhone, Mac) oder Chrome nehmen.';
      h.hidden = false;
    } else if (!window.isSecureContext) {
      h.textContent = 'Das Mikrofon geht nur über eine sichere Adresse (https://…).';
      h.hidden = false;
    }
  }

  function baueListen() {
    const box = $('listen');
    for (const l of LISTEN) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'liste';
      b.style.setProperty('--farbe', l.farbe);
      b.innerHTML = `<span class="chip"></span><span class="liste-text"><b></b><small></small></span><span class="liste-zahl"></span>`;
      b.querySelector('.chip').textContent = l.kurz;
      b.querySelector('b').textContent = l.titel;
      b.querySelector('small').textContent = l.thema;
      b.querySelector('.liste-zahl').textContent = `${l.woerter.length} Wörter`;
      b.addEventListener('click', () => starte(l));
      box.appendChild(b);
    }
  }

  // ---------- Üben ----------
  function starte(l, nurIds) {
    liste = l;
    reihe = nurIds ? l.woerter.filter(w => nurIds.includes(w.id)) : l.woerter.slice();
    if (opt.mischen) {
      for (let i = reihe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [reihe[i], reihe[j]] = [reihe[j], reihe[i]]; }
    }
    ergebnisse = {};
    pos = 0;
    ansicht('ueben');
    zeigeWort();
  }

  function zeigeWort() {
    stopAlles();
    const w = reihe[pos];
    aufgedeckt = opt.zeigen || !!ergebnisse[w.id];
    $('u-liste').textContent = liste.kurz;
    $('u-liste').style.background = liste.farbe;
    $('u-typ').textContent = w.typ === 'satz' ? 'Satz' : w.typ === 'phrase' ? 'Wortgruppe' : 'Wort';
    $('u-de').textContent = w.de;
    zeigeFremdwort();
    const lueckenSatz = /\.\.\.|…/.test(w.wort);
    const hinweis = [w.hinweis, lueckenSatz ? 'Die Lücken (…) mit eigenen Wörtern füllen.' : ''].filter(Boolean).join(' ');
    $('u-hinweis').textContent = hinweis;
    $('u-hinweis').hidden = !hinweis;
    $('u-anhoeren').hidden = !w.audio;
    $('fortschritt').textContent = `${pos + 1} / ${reihe.length}`;
    $('u-vorher').disabled = pos === 0;
    $('u-weiter').textContent = pos === reihe.length - 1 ? 'Fertig ›' : 'Weiter ›';
    zeigeErgebnis();
  }

  function zeigeFremdwort() {
    const w = reihe[pos], el = $('u-wort');
    el.lang = liste.sprache;
    el.textContent = aufgedeckt ? w.wort : '? ? ?';
    el.classList.toggle('versteckt', !aufgedeckt);
    $('u-aufdecken').hidden = aufgedeckt;
  }

  function zeigeErgebnis(meldung) {
    const box = $('u-ergebnis'), e = ergebnisse[reihe[pos].id];
    box.className = 'ergebnis';
    if (meldung) {
      box.hidden = false;
      $('u-urteil').textContent = '';
      $('u-gehoert').textContent = meldung;
      $('u-mehr').textContent = '';
      return;
    }
    if (!e) { box.hidden = true; return; }
    box.hidden = false;
    box.classList.add(e.stufe);
    $('u-urteil').textContent = (e.stufe === 'richtig' ? '✓ ' : '') + URTEIL[e.stufe];
    const g = $('u-gehoert');
    g.textContent = 'Gehört: ';
    const q = document.createElement('q');
    q.lang = liste.sprache;
    q.textContent = e.text || '–';
    g.appendChild(q);
    const andere = e.alle.filter(t => t !== e.text);
    $('u-mehr').textContent = [andere.length ? 'Auch verstanden: ' + andere.join(' · ') : '',
      e.versuche > 1 ? `${e.versuche}. Versuch` : ''].filter(Boolean).join(' – ');
  }

  // ---------- Zuhören ----------
  function sprechen() {
    if (rec) { rec.stop(); return; }          // zweites Tippen beendet das Zuhören
    const Rec = Erkennung();
    if (!Rec) { zeigeErgebnis('Dieser Browser hat keine Spracherkennung. Bitte Safari oder Chrome nehmen.'); return; }
    stopAudio();
    const w = reihe[pos];
    let texte = [], live = '', fehler = '';
    const r = new Rec();
    rec = r;
    r.lang = liste.lang;
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.continuous = false;
    r.onresult = ev => {
      const res = Array.from(ev.results);
      live = res.map(x => x[0].transcript).join(' ').replace(/\s+/g, ' ').trim();
      if (res.every(x => x.isFinal)) {
        texte = res.length === 1 ? Array.from(res[0]).map(a => a.transcript.trim()).filter(Boolean) : [live];
      }
      if (live) zeigeErgebnis('Ich höre: «' + live + '»');
    };
    r.onerror = ev => { fehler = ev.error; };
    r.onend = () => {
      clearTimeout(r.uhr);
      if (rec !== r) return;
      rec = null;
      zeigeMic(false);
      if (!texte.length && live) texte = [live];            // Safari meldet manchmal kein «fertig»
      if (texte.length) {
        const urteil = P.pruefe(texte, w.antworten, liste.sprache);
        const vorher = ergebnisse[w.id];
        ergebnisse[w.id] = { stufe: urteil.stufe, text: urteil.text, alle: [...new Set(texte)], versuche: (vorher ? vorher.versuche : 0) + 1 };
        if (!aufgedeckt) { aufgedeckt = true; zeigeFremdwort(); }
        zeigeErgebnis();
      } else if (fehler && fehler !== 'aborted') {
        zeigeErgebnis(FEHLER[fehler] || `Die Spracherkennung meldet einen Fehler («${fehler}»).`);
      } else {
        zeigeErgebnis(FEHLER['no-speech']);
      }
    };
    try {
      r.start();
    } catch (e) {
      rec = null;
      zeigeErgebnis('Die Spracherkennung liess sich nicht starten. Seite neu laden und nochmals versuchen.');
      return;
    }
    r.uhr = setTimeout(() => r.stop(), HOEREN_MAX_MS);
    zeigeMic(true);
    zeigeErgebnis('Ich höre zu …');
  }

  function zeigeMic(an) {
    $('u-sprechen').classList.toggle('hoert', an);
    $('u-sprechen-text').textContent = an ? 'Fertig' : 'Sprechen';
  }

  function anhoeren() {
    const w = reihe[pos];
    if (!w.audio) return;
    if (rec) { rec.abort(); rec = null; zeigeMic(false); }
    stopAudio();
    audio = new Audio(w.audio);
    audio.play().catch(() => {});
  }

  function stopAudio() { if (audio) { audio.pause(); audio = null; } }
  function stopAlles() {
    stopAudio();
    if (rec) { const r = rec; rec = null; r.abort(); zeigeMic(false); }
  }

  function weiter(schritt) {
    const neu = pos + schritt;
    if (neu < 0) return;
    if (neu >= reihe.length) { zeigeEnde(); return; }
    pos = neu;
    zeigeWort();
  }

  // ---------- Zusammenfassung ----------
  function zeigeEnde() {
    stopAlles();
    ansicht('ende');
    const richtig = reihe.filter(w => ergebnisse[w.id]?.stufe === 'richtig').length;
    $('e-titel').textContent = liste.titel;
    $('e-zahl').textContent = `${richtig} von ${reihe.length} richtig`;
    $('e-nochmals').hidden = richtig === reihe.length;
    const ol = $('e-liste');
    ol.textContent = '';
    for (const w of reihe) {
      const e = ergebnisse[w.id];
      const li = document.createElement('li');
      li.className = e ? e.stufe : 'offen';
      li.innerHTML = '<span class="e-wort"></span><span class="e-stufe"></span><span class="e-info"></span>';
      li.querySelector('.e-wort').textContent = w.wort;
      li.querySelector('.e-wort').lang = liste.sprache;
      li.querySelector('.e-stufe').textContent = e ? URTEIL[e.stufe] : 'nicht gesprochen';
      li.querySelector('.e-info').textContent = w.de + (e ? ` · gehört: «${e.text}»` + (e.versuche > 1 ? ` · ${e.versuche} Versuche` : '') : '');
      ol.appendChild(li);
    }
  }

  // ---------- Start ----------
  opt.zeigen = $('opt-zeigen').checked;      // der Browser stellt Häkchen nach dem Neuladen manchmal wieder her
  opt.mischen = $('opt-mischen').checked;
  $('opt-zeigen').addEventListener('change', e => { opt.zeigen = e.target.checked; });
  $('opt-mischen').addEventListener('change', e => { opt.mischen = e.target.checked; });
  $('zurueck').addEventListener('click', zeigeStart);
  $('u-sprechen').addEventListener('click', sprechen);
  $('u-anhoeren').addEventListener('click', anhoeren);
  $('u-aufdecken').addEventListener('click', () => { aufgedeckt = true; zeigeFremdwort(); });
  $('u-vorher').addEventListener('click', () => weiter(-1));
  $('u-weiter').addEventListener('click', () => weiter(1));
  $('e-nochmals').addEventListener('click', () => starte(liste, reihe.filter(w => ergebnisse[w.id]?.stufe !== 'richtig').map(w => w.id)));
  $('e-auswahl').addEventListener('click', zeigeStart);

  baueListen();
  zeigeStart();
})();
