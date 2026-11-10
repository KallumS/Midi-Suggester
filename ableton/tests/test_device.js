/* The Max for Live device, run in Node on a pretend Max and a pretend Live.
 *   python3 ableton/kit/build.py ableton/device.json && node --test ableton/tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { load, liveSet } = require('../kit/test/max.js');
const suite = require('../kit/test/generator_suite.js');

const BUNDLE = path.join(__dirname, '..', 'MidiSuggester.js');
const { device } = suite({ bundle: BUNDLE, name: 'Midi Suggester', selection: true, keyless: true, beside: true });

test('a melody gets chord progressions under it', () => {
  const d = device();
  const r = d.ctx.S.results;
  assert.ok(r.length > 0);
  const polyphonic = r[0].parts.some((p) => p.notes.some((n, i) => p.notes.some((m, j) => j !== i && m.start === n.start)));
  assert.ok(polyphonic, 'a suggestion under a tune is chords');
});

test('chords get melodies over them', () => {
  const set = liveSet();
  const chords = [];
  [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]].forEach((ch, b) => ch.forEach((p) =>
    chords.push({ pitch: p, start_time: b * 4, duration: 4, velocity: 90 })));
  set.open(set.clip(16, chords));
  const d = load(BUNDLE, { set });
  d.send('bang');
  d.click('Use Clip');
  const r = d.ctx.S.results;
  assert.ok(r.length > 0, d.ctx.S.status);
  const notes = r[0].parts[0].notes.slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < notes.length; i++) assert.ok(notes[i].start >= notes[i - 1].start + notes[i - 1].len - 1e-6, 'a melody is one line');
});
