# 0007. A chosen progression is edited chord by chord, in place

Taken 2026-09-27. Stands.

## Context

Asked for, after the first release, with Wingman as the model: swap one
chord for another, split a chord to add a passing chord, remove one - all
auditioned against the original.

## Decision

The chosen progression is drawn as a row of chord buttons sized by length.
Choosing one offers its alternatives, **Split** and **Remove**. Edits change
that suggestion in place; the first edit keeps a copy of it as suggested,
and **Put back as suggested** restores it.

- **Alternatives** are scored exactly as the search scores a chord in that
  place: fit to the melody under it plus the moves from the chord before and
  into the chord after. Anything that could not stand there - a secondary
  dominant not followed by its target - is not offered.
- **Split** halves on the beat nearest the middle and fills the second half
  with the best alternative. No separate "passing chord" rule was needed: the
  best chord to put between C and F, scored this way, is C7.
- **Remove** gives the time to the chord before (or, for the first chord, to
  the one after) and joins the same chord twice in a row into one.

## Consequences

- Insert and Audition use the edited progression, with no extra step.
- Changing any option re-suggests and discards edits, except the bass note,
  which re-voices in place.
- The palette, key and pulse travel with each suggestion, so the editor
  needs nothing from the window's options.

## Alternatives

**A free-form chord picker** (any chord, anywhere). Rejected for now: a
ranked list of chords that fit is the point of the tool, and the whole
palette is one colour setting away.

**Resizing a chord by dragging its edge.** Not asked for; Split and Remove
cover changing lengths in beat-sized steps.
