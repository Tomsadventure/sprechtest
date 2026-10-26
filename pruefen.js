/* Prüft, ob das Gehörte zum Wort passt. Ohne Bildschirm-Code, damit Scripts/test.mjs es in Node prüfen kann. */
(function (root) {
  'use strict';

  // Wörter, die gleich klingen: bei einem einzelnen Wort schreibt die Spracherkennung oft das andere.
  // Schlüssel und Werte in der Form von norm() (ohne Akzente, Apostroph = Leerschlag).
  const GLEICH_KLINGEND = {
    en: {
      'see': ['sea', 'c', 'si'],
      'hear': ['here'],
      'fair': ['fare'],
      'bite': ['byte', 'bight'],
      'sense': ['cents', 'scents', 'sens'],
      'favourite product': ['favorite product'],
    },
    fr: {
      'a': ['ah', 'as', 'ha'],
      'dans': ['dent', 'dents', 'd en'],
      'quand': ['quant', 'qu en', 'camp', 'caen', 'kant'],
      'qui': ['qu il', 'ki'],
      'quoi': ['koi'],
      'sous': ['sou', 'soue', 'soul'],
      'lire': ['lyre'],
      'quel': ['qu elle'],
      'quelle': ['qu elle'],
    },
  };

  // Klein, ohne Akzente, Satzzeichen/Apostroph/Bindestrich → Leerschlag, «19h» → «19 h».
  function norm(s) {
    return String(s).toLowerCase()
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/(\d)([a-z])/g, '$1 $2')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Französisch: stumme Endungen angleichen (motivé = motivée = motiver, parents = parent).
  function klang(s, sprache) {
    if (sprache !== 'fr') return s;
    return s.split(' ').map(w => (w.length > 3 ? w.replace(/(ees|ee|es|er|ez)$/, 'e').replace(/[sx]$/, '') : w)).join(' ');
  }

  // Satz mit Lücken («I like ... because ...») → Muster, in dem jede Lücke beliebige Wörter sein darf.
  function muster(antwort) {
    const t = norm(String(antwort).replace(/\.\.\.|…/g, ' zzz ')).replace(/ ?zzz ?/g, ' (.+) ').trim();
    return { re: new RegExp('^' + t + '( .+)?$'), anfang: t.split(' (.+)')[0] };
  }

  // Ähnlichkeit 0–1 (1 = gleich), nach Anzahl Buchstaben, die man ändern müsste.
  function aehnlich(a, b) {
    a = a.replace(/ /g, ''); b = b.replace(/ /g, '');
    if (!a.length || !b.length) return 0;
    let vor = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const jetzt = [i];
      for (let j = 1; j <= b.length; j++) {
        jetzt[j] = Math.min(vor[j] + 1, jetzt[j - 1] + 1, vor[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      vor = jetzt;
    }
    return 1 - vor[b.length] / Math.max(a.length, b.length);
  }

  function passt(gehoert, ziel, sprache) {
    const a = klang(gehoert, sprache), b = klang(ziel, sprache);
    if (a === b || a.replace(/ /g, '') === b.replace(/ /g, '')) return true;   // «candy floss» = «candyfloss»
    // Das Wort steckt im Gehörten («the smell»), aber nicht bei ganz kurzen Wörtern wie «à».
    return b.length >= 3 && (' ' + a + ' ').includes(' ' + b + ' ');
  }

  // gehoert: Liste von Texten der Spracherkennung (beste zuerst). antworten: richtige Antworten aus den Wortlisten.
  // Gibt { stufe: 'richtig' | 'fast' | 'falsch', text } zurück; text = das Gehörte, das am besten passt.
  function pruefe(gehoert, antworten, sprache) {
    const gleich = GLEICH_KLINGEND[sprache] || {};
    const ziele = [];
    for (const a of antworten) {
      if (/\.\.\.|…/.test(a)) { ziele.push(muster(a)); continue; }
      const n = norm(a);
      ziele.push({ n });
      for (const h of gleich[n] || []) ziele.push({ n: h });
    }
    let best = { stufe: 'falsch', text: gehoert[0] || '', wert: 0 };
    for (const g of gehoert) {
      const gn = norm(g);
      if (!gn) continue;
      for (const z of ziele) {
        if (z.re) {
          if (z.re.test(gn)) return { stufe: 'richtig', text: g };
          if (z.anfang && gn.startsWith(z.anfang) && best.wert < 0.8) best = { stufe: 'fast', text: g, wert: 0.8 };
          continue;
        }
        if (passt(gn, z.n, sprache)) return { stufe: 'richtig', text: g };
        const w = aehnlich(klang(gn, sprache), klang(z.n, sprache));
        if (w > best.wert) best = { stufe: w >= 0.6 ? 'fast' : 'falsch', text: g, wert: w };
      }
    }
    return { stufe: best.stufe, text: best.text };
  }

  const Pruefen = { norm, klang, aehnlich, pruefe };
  if (typeof module !== 'undefined' && module.exports) module.exports = Pruefen;
  else root.Pruefen = Pruefen;
})(this);
