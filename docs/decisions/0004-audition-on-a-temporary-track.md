# 0004. Audition plays the project with a temporary track

Taken 2026-09-27. Stands.

## Context

Starting Blocks auditions through `StuffMIDIMessage` to the virtual
keyboard, which needs a record-armed, monitored track with an instrument,
plays on the nearest defer tick, and plays the block alone. Here the point of
listening is to hear the suggestion **against the original**.

## Decision

Audition puts the suggestion on a temporary track under the source (with the
source's FX, as insert does), moves the edit cursor to the source's first
bar and starts REAPER's transport. It stops when the transport stops for
any reason or passes the end; stopping deletes the track and puts the edit
cursor back.

## Consequences

- Sample-accurate, through real instruments, with the original playing.
- The temporary track is added and removed outside any undo block, so it
  leaves no undo history. It is marked `P_EXT:MidiSuggester=preview`, and
  `Place.sweep()` removes any left by a crash when the script starts.
- It moves the transport, which the virtual keyboard did not.

## Alternatives

**The virtual keyboard.** Rejected for the setup it needs and because it
plays the suggestion alone.
