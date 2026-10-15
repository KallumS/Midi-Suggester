# 0008. The window's text follows Apple's writing guidelines

Taken 2026-10-14. Stands.

## Context

The user asked for every one of their windows to follow Apple's Human
Interface Guidelines on writing
(developer.apple.com/design/human-interface-guidelines/writing), as Noterator
and Miderator already do (Noterator's decision 0053). The window had grown its
own habits: sentence-case buttons ("Insert on new track") beside title-case
ones, " - " for dashes, straight quotes, "would not" with no way forward.

## Decision

One style for each kind of text, the same as Noterator's 0053 and Midi
Variator's 0014:

- **Buttons, toggles, headings and dialog titles** in title-style
  capitalization, a verb first where they act: **Use Selected Items**,
  **Insert on New Track**, **Put Back as Suggested**, **More Ideas**, **Bass
  Note**, **Chord Progressions**. Articles, short conjunctions and short
  prepositions stay lower case ("1 per 2 Bars").
- **An ellipsis (…)** only on something that asks for more before it acts.
  Nothing in this window does.
- **Tooltips, hints, row labels and the status line** in sentence case;
  complete sentences end with a full stop, fragments do not.
- **Messages** say what happened and what to do, without blame, "please" or
  programmer words: "That item has no notes. Select a MIDI item with notes in
  it.", "REAPER couldn't make the item. Try again."
- **One word per idea, shared with Midi Variator**: *Use Selected Items*,
  *Audition* and *Stop*, *Source*, *Key*, *click* (not "press") for a button.
- **Typography**: an em dash between phrases, curly quotes and apostrophes
  in sentences. File names and chord symbols stay as they are.

## What did not change

- Chord symbols, numerals, ScaleView's root and scale names ("C Major") - they
  are musical values, and the scale names are ScaleView's, copied unchanged.
- Saved preferences are indexes, so relabelling the chord pace ("2 a Bar",
  "1 a Bar", "1 per 2 Bars") changes nothing a user has saved.

## Consequences

- `ms_harmony.lua`'s chord-pace names and `ms_place.lua`'s audition track
  name changed; both files are vendored into Noterator and Miderator, which
  copy them across.
- New text follows the same rules.
