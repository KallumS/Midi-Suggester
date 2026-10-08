# Midi Suggester

A ReaScript that reads a MIDI item and suggests what goes with it: chord
progressions under a melody, melodies over a chord progression. ReaImGui for
the window. The user is a musician, not a programmer - explain in those terms.

## Shape of it

| | |
| --- | --- |
| `reascripts/Midi Suggester.lua` | The window and the wiring. ReaImGui lives only here. |
| `reascripts/ms_theory.lua` | Keys, spelling, finding the key, naming chords, Roman numerals. |
| `reascripts/ms_read.lua` | Melody or chords? The melody line; a progression cut into chords. |
| `reascripts/ms_harmony.lua` | Chords for a melody. |
| `reascripts/ms_melody.lua` | Melodies for chords. |
| `reascripts/ms_place.lua` | Everything that touches REAPER. |
| `tools/demo.lua` | What the engine suggests for the test tunes, printed. |
| `docs/decisions/` | Why things are the way they are, one file per decision. |
| `docs/sessions/` | What happened in a session, written at the end of it. |

**The four `ms_` music files never touch `reaper.` or `ImGui.`** They take
plain tables and return plain tables, which is why they can be tested and
why `tools/demo.lua` can print what they do without REAPER. `ms_place.lua`
touches REAPER but not ImGui, so a mocked `reaper` is enough for it. If a
music question needs `reaper.`, pass the value in.

Notes everywhere are `{ pitch, start, len, vel }` with `start` and `len` in
**quarter notes, counted from the bar line at or before the source item**.
`ms_place.read` does that conversion, so the engine's bars are the
project's bars; `barBeats` is a bar in quarter notes (3 for 6/8) and `pulse`
the counted beat (1.5 for 6/8).

## Why a ReaScript

Asked as "ReaScript, JSFX or CLAP - whichever is best". Settled in
[decision 0001](docs/decisions/0001-a-reascript-not-a-jsfx-or-clap.md): a
plugin sees MIDI only as it plays past and cannot read or create items. The
Starting Blocks repo learned the same thing the hard way. Do not revisit it
without a feature that genuinely needs to run in the audio thread.

## Chord names come from ScaleView Pro

`ms_theory.lua` carries ScaleView Pro's chord reader **copied unchanged** -
`CORE_RANK` through `analyse`, comments included - from
`ScaleView-for-Reaper/reascripts/ScaleView Pro.lua` at `f9e2691`. Its weights
were tuned against 1.2 million sonorities of real music; they are not to be
retuned here. A change belongs in ScaleView first, then is copied across.
`tests/test_theory.lua` holds ScaleView's own expected names to prove the copy.

**Last re-copied 7 October 2026**, from `e31a6e8` to `f9e2691`, for two changes
made and measured in Pro: an altered dominant on its own root keeps its
alterations whatever its fifth (C7#5b9 reads `Caug7b9`, not `A#min9b5/C`), and
a draw goes to the reading that needs no slash (C D G Bb over C reads
`C7sus2`, not `GminAdd11/C`). The reader block is Pro's verbatim and the
tiebreak in `nameChord` matches Pro's `detectChord`. `nameChord` was then
diffed against `ScaleView Pro.lua` itself - 60,212 voicings, the sweep, every
two-note chord and music21's core corpus with its doublings, in no key and
seven keys: 481,696 names, byte-identical. **Pro is the reference**, not the
ScaleView plugin: the plugin is a port of Pro too.

The same reader names the chords this script **suggests** as well as the ones
it reads, so the two directions speak one vocabulary (`Amin`, `Cmaj7`,
`Bmin7b5`, `C/E`). One exception, in `ms_harmony.palette`: a suggested root
from outside the key is spelled the way its numeral says - bVII in C is `Bb`,
where C major's sharp-leaning names give `A#`. Imported chords keep
ScaleView's spelling.

The roots and seven-note scales are ScaleView's too, and a test asserts it.
Five- and six-note scales are left out on purpose: chords are built by
stacking every other scale note, and a pentatonic has no thirds to stack.

## Finding the key

Krumhansl-Kessler profiles, plus three things a musician would ask
(`ms_theory.detectKey`): does every note belong to the key, does the tune sit
on the tonic chord, and does it end (and begin) on the tonic. **Each of those
weights is load-bearing and a test fails without it** - the table of tunes
in `test_theory.lua` names which tune needs which. The weights were chosen
on fifteen of them; two Ode to Joy cases were added after, to pin
`KEY_OUTSIDE`.

**Every setting misses one tune, and this one misses Ode to Joy's first
phrase** (it ends on D, a half cadence, and reads as D minor). The setting
that fixes it breaks Happy Birthday, which ends on its tonic - the far
commoner case. The miss is pinned in the test so it is seen rather than
rediscovered. The key is always one click to change in the window.

## Suggesting chords (`ms_harmony.lua`)

The melody is cut into slots (one per chord change). Each chord in the
palette gets a **fit** for each slot - chord tones score, passing notes cost a
little, a non-chord note on the change costs more, a semitone clash more
again - and each pair of chords a **move** score from the T -> S -> D -> T cycle
and the root motion. A k-best search keeps the best paths ending on each
chord; the suggestions are the best paths that differ in at least a quarter
of their chords.

Every musical judgement is a named constant at the top of the file. Things
learned tuning them, each of which broke a test first:

- **Primary chords first.** Without `COST_DEGREE`, any chord holding the
  melody note scored alike and Twinkle came out `I iii ii V vii iii V I`.
  I, IV and V are free; vi and ii cost a little; iii more.
- **Rarity is by mode and by chord type, not by degree number.** The degree
  table was first written for major keys only, so in A minor it charged G
  major (VII) the diminished chord's price and let B diminished (ii°) through
  nearly free: `Amin Bdim Emin Amin`. Now `COST_DEGREE` / `COST_DEGREE_MINOR`
  are per mode and `COST_DIMINISHED` is charged to any diminished triad.
- **Holding a chord is a good move, not a penalty** (`SAME_CHORD` +0.1). At
  -0.05 the search changed chord at every opportunity.
- **The tune's last note weighs double** (`ACCENT_FINAL`). Without it,
  Twinkle at one chord a bar ended on V, because the D D beat the C C.
- **A secondary dominant always resolves to its target** (`SECONDARY_LOST`
  is effectively forbidden, and none may end a progression). As a cost of
  -0.5 it held in the fixed rhythms by luck and gave way in Auto.
- **A secondary dominant resolving scores as a dominant going home**, not by
  its target's function. Scored as D into S, V7/IV -> IV was a
  retrogression and C C7 | F lost to Cmaj7. `SECONDARY_HOME` was then
  lowered from 0.6 to 0.2, or every Colourful suggestion filled with them.
- **v loses to V in minor when the melody does not choose**
  (`COST_MINOR_DOMINANT`): the leading tone is what makes a dominant pull
  home. They tied exactly before, and the tie fell the wrong way.
- **The search is a merge, not a sort.** Each chord's paths are already best
  first, so the best ways into the next chord are a k-way merge. That took
  128 bars from 2.4s to 0.38s, with identical answers.

**Auto timing** reads the melody in half bars (whole bars where a bar does
not halve on a beat, as in 3/4). A change on the bar line is free and one on
the half bar costs `CHANGE_HALF`, so chords are as long as the tune lets them
be. A beat-by-beat Auto was built first and abandoned
([0006](docs/decisions/0006-auto-reads-half-bars.md)): every change collects
a reward for moving well, so on a fine grid changes paid for themselves at
any cost short of forbidding them. `RHYTHMS` keeps Auto last so a saved
choice of the others keeps its index.

**Editing** ([0007](docs/decisions/0007-edit-one-chord.md)):
`H.alternatives`, `H.replace`, `H.split`, `H.remove`, `H.copy` and
`H.describe` work on one suggestion. Alternatives are scored the way the
search scores a chord - fit plus the moves either side - and never include a
chord that could not stand there. Split halves on the beat nearest the middle
and fills the second half with the best alternative, which is how a passing
chord is found (C before F becomes C C7 in Colourful). Remove gives the
chord's time to the one before and joins identical neighbours. Each
suggestion carries its `palette`, `key` and `pulse` so it can be edited
without the options that made it.

`H.voice` lays each chord out in close position, **under the melody while the
chord sounds**, moving as little as possible from the chord before. The test
checks that against a brute force written independently of the code.

## Suggesting melodies (`ms_melody.lua`)

Rhythm first: one bar's motif from rhythm cells, phrases of four bars as
`A A' A C` or `A B A C` (C is a cadence bar: half the motif, then a held
note). Then pitch, note by note, drawn with weights: chord tones on strong
beats, stepwise passing notes off them, leaps answered by a step back, an
arch-shaped contour, the motif's shape echoed in the repeated bars, and the
tonic at the end. 48 candidates are drawn per request, scored as whole
melodies, and the best four that share less than 60% of their notes are kept.

- **The note-level strong-beat rule is tested on raw drafts**, not final
  suggestions. The whole-melody score picks chord-tone melodies anyway, so
  at the end its effect is invisible; on the drafts it is 99.95% against
  96.6% without it.
- **Over a chord from outside the key, the key's clashing note is not a
  passing note** (`localScale`): over E major in A minor there is no G natural.
- **Registers are not snapped to a tonic.** They are 7 semitones apart and
  snapping put Mid and High on the same note. Only the last note comes home.
- Randomness is a fixed generator seeded from the request, so the same
  settings always give the same melodies and "More ideas" is repeatable.

## REAPER, from a script

- Every signature in `ms_place.lua` was checked in the API docs.
  `TimeMap_GetTimeSigAtTime` returns `num, denom, tempo` - no retval first.
  `TimeMap_QNToMeasures` returns the measure index, then its start and end.
- `tests/reaper_mock.lua` is written **from the documented signatures**, not
  from the code, and raises on any function it does not have. Add a function
  to it from the docs when the scripts start using one.
- `MIDI_InsertNote`'s last argument is noSort: true for each, one `MIDI_Sort`.
- An insert is one undo block, and a refusal closes the block it opened and
  removes the empty track it made.
- A suggestion goes on a **new track under the source, with a copy of the
  source's FX**, so it sounds at once ([0003](docs/decisions/0003-a-new-track-with-the-sources-instrument.md)).
- **Audition** uses a temporary track and REAPER's own transport, not the
  virtual keyboard ([0004](docs/decisions/0004-audition-on-a-temporary-track.md)).
  The track is marked with `P_EXT:MidiSuggester=preview` and swept away at
  startup if a crash left one behind.

## The window

The house scheme, shared with Starting Blocks and ScaleView - see Starting
Blocks' `docs/COLOUR.md`. Three rules travel with it and the UI test holds
all three: every grey is blue-shifted (R < G < B); **every button wears the
dark ink `#14171C`, chosen or not**; the theme is popped outside the
`visible` test, because a collapsed window still pushed it.

The roll draws **the source in grey `#6D7581` and the suggestion in the
accent**, so yellow always means "what you would be adding"
([0005](docs/decisions/0005-source-grey-suggestion-yellow.md)).

Three numbered steps - **1 Source, 2 Key, 3 Suggestions** - and only step 1
is drawn until something has been read. **No dead controls**: the chord
options appear only for a melody, the melody options only for chords; Split
is not drawn on a chord a beat long, nor Remove on the only chord.

The chord editor draws the chosen progression as one button per chord, each
as wide as the chord is long so the row lines up with the roll; the chord
being edited is marked in the roll with the ramp's `#2A2F37`. The first edit
keeps a copy of the progression as suggested (`s.original`), which is what
*Put back as suggested* restores. **The Bass note box re-voices in place
rather than re-suggesting**, so it does not throw edits away; every other
option change re-suggests and does.

Preferences (chord rhythm, colour, bass, density, register) are saved in one
ExtState string; the source, its kind and its key are not, because they
belong to the item. Values are clamped on load, and the test loads nonsense
to prove it.

## Where it stands

| | |
| --- | --- |
| 1.0 | First release: both directions, audition, insert. Merged to `main`, in the ReaPack index. **Run in REAPER by the user**: window right, suggestions sound good. |
| 1.1 | Auto chord timing, chord-by-chord editing, the minor-key and secondary-dominant fixes. Merged to `main` (PR #2), in the index. **Not yet confirmed in REAPER** - the chord editor has only been driven by the mocked ReaImGui, so ask the user how it behaved. |

**Known limits, all deliberate for now:**

- One key for the whole item: a piece that modulates is read in one key.
- One time signature: `read` takes the meter at the item's start.
- Ode to Joy's first phrase reads as D minor (see *Finding the key*).
- Auto changes chord only on the bar line or half bar, never on a beat.
- Melodies are built in four-bar phrases; there is no editing of a
  suggested melody, only of a progression.
- Audition moves the transport and edit cursor (it puts the cursor back).

**Ideas raised but not started** - the user decides which, if any:
melody editing to match the chord editor (swap a bar, re-draw a phrase);
rhythm patterns for inserted chords (they are block chords held for their
length); a bass-line option beyond one root note; exporting a suggestion as
a `.mid` (Starting Blocks has a tested MIDI writer, `sb_midi.lua`).

**Publishing a version to ReaPack**: commit and push the code; then add a
new `<version>` block to `index.xml` with every `<source>` pinned to that
commit's hash, check each raw URL returns 200, and commit that separately.
Never edit an existing `<version>`. Bump `Version:` in the script header to
match.

## Tests

```
tools/test.sh
```

| | |
| --- | --- |
| `test_theory.lua` | Spelling, ScaleView's chord names, numerals, the key-finding tune table. |
| `test_read.lua` | Melody or chords, the line, cutting and naming chords. |
| `test_harmony.lua` | The palette, known harmonisations, properties of every suggestion, voicing. |
| `test_melody.lua` | The melody rules over every fixture, density, register and three variations. |
| `test_place.lua` | Reading, inserting and auditioning against the mocked REAPER. |
| `test_ui.lua` | The real script against a mocked ReaImGui, every button clicked from a fresh start. |

**Prove a test bites before believing it.** Every rule here was broken on
purpose and the suite watched to fail. That found five real gaps: the key's
ending bonus with no tune that needed it, the outside-the-key check likewise,
voice-leading checked too loosely to notice voicings chosen at random, the
distinct-melodies rule checked only for identical melodies, and the
strong-beat rule hidden by the final scoring. Each now has a test that fails
without it.

**The UI sweep clicks each button from a fresh start**, in each of several
states (`STATES` in `test_ui.lua`: each fixture, and the chord editor open
before and after an edit). Walking the buttons
in one session let an early click on *Chords* hide every chord option after
it, and the sweep passed without ever reaching them. It now lists what it
reached by name, so a control that stops being reachable is a missing name.

**Chord buttons share labels with the key buttons** - the editor's `C` and
the key's `C`. The UI test finds editor chords by position (`clickChord`),
never by label; clicking by label once swapped a chord for the alternative
called `C` instead of choosing the chord `C`.
