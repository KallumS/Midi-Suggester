# 0001. A ReaScript, not a JSFX or a CLAP plugin

Taken 2026-09-27. Stands.

## Context

The request left the form open: "a ReaScript, a JSFX or a CLAP plugin,
whichever will be best for the features". The features are: read a melody or
a chord progression that has been imported, work out what it is, and put
suggestions into the project.

## Decision

A Lua ReaScript with a ReaImGui window.

- **Reading what was imported.** An imported `.mid` becomes a MIDI item. A
  script reads the whole item at once with `MIDI_GetNote`. A JSFX or a CLAP
  plugin only sees MIDI as it plays past, one event at a time - it would have
  to wait for the song to play through before it could suggest anything, and
  could not see ahead of the playhead to harmonise a phrase as a whole.
- **Writing suggestions.** A script creates tracks and items. A JSFX cannot
  write a file, reach the REAPER API or create an item; a CLAP plugin can
  only reach REAPER's API through REAPER-specific extensions.
- **Testing the music.** The engine is plain Lua, run and checked outside
  REAPER. A JSFX's EEL2 only runs inside REAPER; a CLAP plugin is C++ built
  per platform.

## Consequences

Nothing runs in real time: the script analyses when asked, not as the
music plays. Nothing asked for needs real time.

## Alternatives

**JSFX.** Rejected for the reasons above. Starting Blocks tried it (version 1
was a JSFX plus a bridge script over `gmem`) and retired it for the same
limits.

**CLAP.** Rejected: the same blindness to the timeline as a JSFX, plus a
compiled build for every platform, for no feature that needs it.
