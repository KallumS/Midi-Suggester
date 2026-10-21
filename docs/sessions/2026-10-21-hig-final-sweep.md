# Session log - 21 October 2026: the final HIG Foundations sweep (1.3)

Asked across the family: a final sweep of the 19 Foundations pages, so that
everything a window like this can do has been done. Midi Suggester first, as
the pattern. The verdict for every guideline is in
[`apple-hig-review.md`](../apple-hig-review.md#final-sweep-16-october-2026);
the decision is a dated section of [0009](../decisions/0009-apples-hig-foundations.md).

## What changed

- Theme: popups `#2A2F37` with a `#3A404A` edge, menu bar `#1B1F25`, menu
  highlight from the ramp, TextDisabled `#BFC5CE` (ImGui's colour for a
  menu item's keys), scrollbar thumb and resize corner `#6D7581`.
- The Bass Note box drawn with a `#8A919C` edge.
- Rows wrap at the window's edge; secondary text wraps; a minimum size.
- Esc lets go first; closes only with nothing held.
- `letGo()` asks before new suggestions or closing throw chord edits away;
  *Restore the Changes* undoes *Put Back as Suggested*.
- Bold headings, a title naming the item, a legend under the roll, hints for
  every choice, the playhead grown with the text, grid lines on whole pixels.

## Found on the way

- CLAUDE.md said the UI test held "every grey R < G < B"; it did not. It
  does now, and it caught ImGui's neutral menu bar the moment it was added.
- At 200% the bottom row (Insert, Audition, More Ideas, Back to the First
  Set) and the eight swap choices ran off the right-hand edge: every
  `SameLine` was unconditional. The mock now places every item and fails on
  any that would.
- Clicking the chosen key, rhythm or palette again used to re-suggest (and
  lose edits); it now does nothing.

## Checks

`tools/test.sh` passes. Twenty sabotages in a copy, each caught by `test_ui`:
popup darker, menu keys grey, a neutral grey, ImGui's header colours, the old
thumb, no box edge, plain headings, a plain title, no legend, no Auto hint,
rows not wrapping, text not wrapping, no size limit, a thin playhead, Esc
always closing, Esc ignoring menus, never asking, closing never asking, More
Ideas never asking, no Restore.

## Not done

Not run in REAPER. Only REAPER can say: whether Esc reaches the window with
a menu open, how the bold sans-serif looks, whether the minimum size holds
when docked (it does not apply there), and the dialog's look.
