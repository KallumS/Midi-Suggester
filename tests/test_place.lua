--[[ Everything that touches REAPER, against a REAPER that only records.

       lua5.4 tests/test_place.lua
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local C = dofile(HERE .. "/check.lua")
local ok, eq = C.ok, C.eq
local P = dofile(HERE .. "/reaper_mock.lua")
P.install()
local Place = dofile(C.SCRIPTS .. "ms_place.lua")
local F = dofile(HERE .. "/fixtures.lua")

------------------------------------------------------------------------------
-- Reading
------------------------------------------------------------------------------

do
  P.reset()
  local src, why = Place.read()
  eq(src, nil, "nothing selected, nothing read")
  eq(why, Place.NO_ITEM, "and it says why")
end

do
  -- Twinkle, on a track, starting at bar 3 (quarter note 8).
  P.reset()
  local tr = P.track("Piano", 2)
  local item = P.item(tr, 8, 16, F.twinkle, "Twinkle")
  P.selected = { item }
  local src = Place.read()
  eq(#src.notes, #F.twinkle, "every note read")
  eq(src.notes[1].start, 0, "counted from the item's bar line")
  eq(src.originQN, 8, "which is quarter note 8")
  eq(src.barBeats, 4, "4/4")
  eq(src.pulse, 1, "counted in quarters")
  eq(src.notes[#src.notes].start, 14, "the last note on beat 15")
  eq(src.name, "Twinkle", "the take's name")
  eq(src.track, tr, "and its track")
end

do
  -- An item that starts part-way through a bar keeps the bar's counting:
  -- a pickup note on beat 4 of bar 1 is at 3, not 0.
  P.reset()
  local tr = P.track("Lead")
  P.selected = { P.item(tr, 3, 5, { { pitch = 67, start = 0, len = 1 }, { pitch = 72, start = 1, len = 4 } }) }
  local src = Place.read()
  eq(src.originQN, 0, "a pickup counts from the bar before")
  eq(src.notes[1].start, 3, "on beat four")
end

do
  -- Muted notes and anything outside a trimmed item are left out.
  P.reset()
  local tr = P.track("Lead")
  local item = P.item(tr, 0, 4, {
    { pitch = 60, start = 0, len = 1 },
    { pitch = 62, start = 1, len = 1, muted = true },
    { pitch = 64, start = 3, len = 3 },     -- rings past the item's end
    { pitch = 65, start = 5, len = 1 },     -- starts after it
  })
  P.selected = { item }
  local src = Place.read()
  eq(#src.notes, 2, "the muted note and the one past the end are gone")
  eq(src.notes[2].len, 1, "a note ringing past the end is cut at it")
end

do
  -- Several items read as one piece, counted from the earliest.
  P.reset()
  local tr = P.track("Keys")
  local a = P.item(tr, 4, 4, { { pitch = 60, start = 0, len = 4 } })
  local b = P.item(tr, 8, 4, { { pitch = 67, start = 0, len = 4 } })
  P.selected = { b, a }
  local src = Place.read()
  eq(src.items, 2, "two items")
  eq(src.originQN, 4, "counted from the earlier one")
  eq(src.notes[2].start, 4, "the later one a bar on")
end

do
  -- Nothing selected, but the MIDI editor has a take open.
  P.reset()
  local tr = P.track("Keys")
  local item = P.item(tr, 0, 4, { { pitch = 60, start = 0, len = 4 } })
  P.editorTake = item.take
  local src = Place.read()
  ok(src and #src.notes == 1, "the MIDI editor's take is read")
end

do
  -- An item of audio, or an empty one.
  P.reset()
  local tr = P.track("Keys")
  local item = P.item(tr, 0, 4, {})
  P.selected = { item }
  local src, why = Place.read()
  eq(why, Place.NOTHING, "an empty item has nothing to read")
  item.take.midi = false
  src, why = Place.read()
  eq(why, Place.NO_ITEM, "an audio item is not a MIDI item")
end

do
  -- 6/8 is counted in dotted quarters, and a bar is three quarter notes.
  P.reset()
  P.num, P.den = 6, 8
  local tr = P.track("Lead")
  P.selected = { P.item(tr, 0, 6, { { pitch = 60, start = 0, len = 1 } }) }
  local src = Place.read()
  eq(src.barBeats, 3, "a bar of 6/8 is three quarter notes")
  eq(src.pulse, 1.5, "counted in dotted quarters")
  eq(Place.pulse(3, 4), 1, "3/4 in quarters")
  eq(Place.pulse(7, 8), 0.5, "7/8 in eighths")
  eq(Place.pulse(2, 2), 2, "cut time in halves")
end

------------------------------------------------------------------------------
-- Inserting
------------------------------------------------------------------------------

local function setup()
  P.reset()
  local drums = P.track("Drums", 1)
  local piano = P.track("Piano", 2)
  local bass = P.track("Bass", 1)
  P.selected = { P.item(piano, 8, 16, F.twinkle, "Twinkle") }
  return Place.read(), piano, drums, bass
end

do
  local src, piano = setup()
  local notes = { { pitch = 48, start = 0, len = 4, vel = 100 }, { pitch = 53, start = 4, len = 4, vel = 100 } }
  eq(Place.insert(notes, 16, src, "Chords: I IV"), Place.OK, "inserted")
  eq(#P.tracks, 4, "on a new track")
  local new = P.tracks[3]
  eq(P.tracks[2], piano, "the source stays where it was")
  eq(new.name, "Chords: I IV", "named for what is on it")
  eq(new.fx, 2, "carrying a copy of the source's two FX")
  eq(new.copiedFrom, piano, "copied from the source")
  eq(P.tracks[4].name, "Bass", "and the track that was under it is under it still")
  local item = new.items[1]
  eq(item.pos * 2, 8, "lined up with the source's bar line")
  eq(item.len * 2, 16, "and as long as the piece")
  eq(#item.take.notes, 2, "both notes")
  eq(item.take.notes[2].sp, 4 * 960, "in the right place")
  ok(item.take.notes[1].noSort and item.take.sorted, "inserted unsorted, then sorted once")
  eq(item.take.name, "Chords: I IV", "the take named too")
  eq(P.undoDepth, 0, "the undo block closed")
  eq(P.undoNames[#P.undoNames], "Midi Suggester: Chords: I IV", "one named undo step")
  eq(P.refreshDepth, 0, "UI refresh let go")
end

do
  local src = setup()
  eq(Place.insert({}, 16, src, "x"), Place.NOTHING, "nothing to insert")
  eq(#P.tracks, 3, "and no track made")
end

do
  -- REAPER refusing the item still closes the undo block, and leaves no
  -- empty track behind.
  local src = setup()
  local realInsert = reaper.InsertTrackAtIndex
  reaper.InsertTrackAtIndex = function(idx, d) realInsert(idx, d); P.tracks[idx + 1].refuses = true end
  eq(Place.insert({ { pitch = 60, start = 0, len = 1 } }, 16, src, "x"), Place.FAILED, "refused")
  reaper.InsertTrackAtIndex = realInsert
  eq(P.undoDepth, 0, "the undo block still closed")
  eq(#P.tracks, 3, "and the empty track taken away")
end

do
  -- The source's track was deleted after it was read: the suggestion goes
  -- at the bottom rather than failing.
  local src, piano = setup()
  reaper.DeleteTrack(piano)
  eq(Place.insert({ { pitch = 60, start = 0, len = 1, vel = 100 } }, 16, src, "x"), Place.OK, "still inserts")
  eq(P.tracks[#P.tracks].name, "x", "at the bottom")
  eq(P.tracks[#P.tracks].fx, 0, "with nothing to copy")
end

------------------------------------------------------------------------------
-- Auditioning
------------------------------------------------------------------------------

do
  local src = setup()
  P.cursor = 30
  local notes = { { pitch = 60, start = 0, len = 4, vel = 100 } }
  eq(Place.auditionStart(notes, 16, src), Place.OK, "audition starts")
  eq(#P.tracks, 4, "on a temporary track")
  local tmp = P.tracks[3]
  eq(tmp.ext.MidiSuggester, Place.PREVIEW, "marked as one")
  eq(P.cursor, 4, "playing from the source's bar line (8 quarters at 120 is 4s)")
  ok(P.playing, "playing")
  eq(P.undoDepth, 0, "no undo block opened")
  ok(Place.auditioning(), "auditioning")

  P.playPos = 8
  local at = Place.auditionTick()
  eq(at, 0.5, "half way through the eight seconds")

  P.playPos = 12.5
  eq(Place.auditionTick(), nil, "past the end, it stops")
  ok(not P.playing, "and stops the transport")
  eq(#P.tracks, 3, "the temporary track is gone")
  eq(P.cursor, 30, "and the edit cursor is back where it was")
  ok(not Place.auditioning(), "not auditioning")
end

do
  -- Stopped from REAPER's own transport.
  local src = setup()
  Place.auditionStart({ { pitch = 60, start = 0, len = 4, vel = 100 } }, 16, src)
  P.playing = false
  eq(Place.auditionTick(), nil, "REAPER's stop ends it")
  eq(#P.tracks, 3, "and tidies up")
end

do
  -- Starting another replaces the first; stopping twice is harmless.
  local src = setup()
  Place.auditionStart({ { pitch = 60, start = 0, len = 4, vel = 100 } }, 16, src)
  Place.auditionStart({ { pitch = 64, start = 0, len = 4, vel = 100 } }, 16, src)
  eq(#P.tracks, 4, "one temporary track, not two")
  eq(P.tracks[3].items[1].take.notes[1].pitch, 64, "holding the new one")
  Place.auditionStop()
  Place.auditionStop()
  eq(#P.tracks, 3, "gone")
end

do
  -- A preview track left behind by a crash is swept away at startup, and
  -- nothing else is.
  local src = setup()
  Place.auditionStart({ { pitch = 60, start = 0, len = 4, vel = 100 } }, 16, src)
  Place.audition.track = nil       -- as if the script had died mid-audition
  eq(#P.tracks, 4, "left behind")
  Place.sweep()
  eq(#P.tracks, 3, "swept")
  eq(P.tracks[1].name .. P.tracks[2].name .. P.tracks[3].name, "DrumsPianoBass", "and only it")
end

C.done()
