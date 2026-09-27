# 0005. The roll draws the source grey and the suggestion yellow

Taken 2026-09-27. Stands.

## Context

The house scheme puts every MIDI note in the accent, `#FFF200`. This roll
draws two things at once - the source and a suggestion - and they have to be
told apart at a glance.

## Decision

The suggestion takes the accent; the source is drawn in `#6D7581`, a grey
off the same blue-shifted ramp. The source is drawn first so the suggestion
sits on top.

## Consequences

Yellow keeps one meaning in the window: what is chosen, and what you would be
adding. The UI test checks both colours are drawn.

## Alternatives

**Two accents.** Rejected: the scheme has one accent on purpose.

**Source in the controls grey `#A9AFBA`.** Rejected: bright enough to compete
with the yellow on the dark roll.
