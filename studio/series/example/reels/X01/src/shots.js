// ===== Demo reel X01 — the engine end to end, built only from the shared art library (studio/engine/art) =====
const SLOKA = {"lines": ["यह एक उदाहरण श्लोक है ।", "यहाँ मूल ग्रंथ का श्लोक आएगा ॥"], "ref": "BOOK 1.1.1 (EXAMPLE)", "en": "“This is an example verse. The base text's verse goes here, copied from the source page.”"};
const QUOTE = {"source": "A LATER RETELLING", "ref": "EXAMPLE · CHAPTER 1", "lines": ["यह लोकप्रिय कथा की पंक्ति है।", "यहाँ उसका सही उद्धरण आएगा॥"], "translit": "yah lokapriya kathā kī paṅkti hai, yahāṃ uskā sahī uddharaṇ āegā", "en": "“This is the popular version's line; its exact words go here.”"};
function buildScenes() { BG.her = buildHermitage('dusk'); BG.court = buildCourt(); BG.ms = buildManuscript(); }
const SHOTS = {
  // 1 — hook card over the hermitage at dusk
  1(ctx, u, p, sh, t, post) {
    hermitage(ctx, BG.her, { z: lerp(1.05, 1.12, p), y: 40 }, t, c => drawFigure(c, CH.sage, P({ sit: 1, eye: blink(t, 5), smile: 0.3, gaze: [0.4, 0] }), { x: 540, y: 1500, s: 560, face: 1 }, L_DUSK));
    post.ui = c => (sh.card || []).forEach(([s, col], i) => { const q = ease(u, 0.15 + i * 0.3, 0.55 + i * 0.3); if (q > 0) textFit(c, s, 540, 430 + i * 124 + (1 - q) * 22, { size: 108, weight: 900, color: col || C_IVORY, ls: 6, alpha: q, stroke: 10, shadow: 34 }); });
  },
  // 2 — source card, then the verse card (the narrator recites it)
  2(ctx, u, p, sh, t, post) { slokaSource(ctx, u, p, sh, t, post, SLOKA); },
  // 3 — a story shot: the king receives the sage in his court
  3(ctx, u, p, sh, t, post) {
    court(ctx, BG.court, { z: lerp(1.15, 1.22, p), y: 160 }, t, c => {
      drawFigure(c, CH.king, P({ aN: [0.2, 0.04], handN: 'palm', eye: blink(t, 5), smile: 0.4, gaze: [0.5, 0] }), { x: 330, y: COURT_FLOOR + 130, s: 640, face: 1 }, L_LAMP);
      drawFigure(c, CH.sage, P({ eye: blink(t, 6), smile: 0.3, gaze: [-0.5, 0] }), { x: 760, y: COURT_FLOOR + 130, s: 620, face: -1 }, L_LAMP);
    });
  },
  // 4 — the popular version's exact words, as a quote card (from the 2nd unit)
  4(ctx, u, p, sh, t, post) { const st = sentenceStarts(sh, 2); quoteCard(ctx, u, sh, t, post, Object.assign({ enAt: st[1] + 2 }, QUOTE)); },
  5(ctx, u, p, sh, t, post) { endCard(ctx, u, p, sh, t, post); },
};
