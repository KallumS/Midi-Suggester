# Session log - 14 October 2026: the window's words

Asked, across all the user's repositories: "ensure the GUI text matches
Apple's suggested conventions (developer.apple.com/design/human-interface-guidelines/writing),
like you've done for Noterator and Miderator." Done with Midi Variator in the
same session, so the two windows use the same words for the same things.
Recorded as [decision 0008](../decisions/0008-window-text-follows-apples-writing-guidelines.md).

## What changed (1.1.1)

| Before | After |
| --- | --- |
| Use selected item | Use Selected Items (it reads several) |
| Insert on new track | Insert on New Track |
| Put back as suggested | Put Back as Suggested |
| More ideas / Back to the first | More Ideas / Back to the First Set |
| Bass note | Bass Note |
| Chord progressions (heading) | Chord Progressions |
| 2 a bar, 1 a bar, 1 / 2 bars | 2 a Bar, 1 a Bar, 1 per 2 Bars |
| REAPER would not make the item. | REAPER couldn't make the item. Try again. |
| That item has no notes in it. | That item has no notes. Select a MIDI item with notes in it. |
| "press" the button, " - " dashes, straight quotes | "click", em dashes, curly quotes |

The ReaImGui-missing message is titled "ReaImGui Needed" and says to run the
script again after installing it. The temporary audition track is called
"Midi Suggester Audition" (it is found by its marker, not its name).

`ms_harmony.lua` (the chord-pace names) and `ms_place.lua` (the audition
track's name) are vendored into Noterator and Miderator: copy them across.

## What was left alone

- `ms_theory.lua` - ScaleView Pro's reader, copied unchanged. Its scale names
  ("C Major") are ScaleView's.
- Chord symbols, numerals, the saved-state keys (preferences are stored as
  indexes, so no saved choice moves).

## Checks

`tools/test.sh`: every suite passes (the UI test clicks by the new labels).
Nothing can be rendered here without REAPER; the longest new label, "Back to
the First Set", was given a wider button (170).
