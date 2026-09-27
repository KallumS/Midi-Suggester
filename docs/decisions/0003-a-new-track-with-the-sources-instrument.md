# 0003. A suggestion goes on a new track carrying the source's instrument

Taken 2026-09-27. Stands.

## Context

Starting Blocks inserts at the edit cursor on the selected track. Here a
suggestion only makes sense lined up with the item it was made for, and the
selected track is usually the source itself.

## Decision

Insert makes a new track directly under the source's track, named for the
suggestion (`Chords: C F C G`), with one item spanning the source's bars. The
source track's FX chain is **copied** onto it (`TrackFX_CopyToTrack`, never
moved).

## Consequences

- A suggestion plays the moment it lands, through the same instrument as the
  original - a new empty track is silent, and a musician who is not
  technical would not know why.
- Trying several suggestions leaves several tracks, which can be muted to
  compare; each insert is one undo step.
- If the source track was deleted since it was read, the new track goes at
  the bottom with no FX rather than failing.

## Alternatives

**Insert on the selected track.** Rejected: that is usually the source, and
chords laid over a melody in one item cannot be separated again.

**A new empty track.** Rejected: silent until set up.
