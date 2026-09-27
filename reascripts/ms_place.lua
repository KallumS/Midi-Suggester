--[[ Midi Suggester - everything that talks to REAPER.

     Reading the MIDI that was imported, putting a suggestion into the
     project, and letting it be heard first. Nothing here draws, so
     tests/test_place.lua can run it against a REAPER that only records what
     it is asked to do.

     Every signature used here was checked against REAPER's API
     documentation, not guessed: TimeMap_GetTimeSigAtTime returns
     num, denom, tempo with no retval in front, and TimeMap_QNToMeasures
     returns the measure index first and the measure's start and end in
     quarter notes after it.
]]

local M = {}

M.OK, M.NOTHING, M.NO_ITEM, M.FAILED = 0, 1, 2, 3

-- Marks the audition track, so one left behind by a crash can be found and
-- removed the next time the script starts.
M.EXT_KEY    = "P_EXT:MidiSuggester"
M.PREVIEW    = "preview"
M.PREVIEW_NAME = "Midi Suggester preview"

------------------------------------------------------------------------------
-- Reading
------------------------------------------------------------------------------

--[[  The takes to read: every selected MIDI item, or - if none is selected -
      whatever the MIDI editor has open. An imported .mid file lands in the
      project as a MIDI item, so "select it" is the whole of importing. ]]
function M.sourceTakes()
  local takes = {}
  for i = 0, reaper.CountSelectedMediaItems(0) - 1 do
    local item = reaper.GetSelectedMediaItem(0, i)
    local take = item and reaper.GetActiveTake(item)
    if take and reaper.TakeIsMIDI(take) then takes[#takes + 1] = take end
  end
  if #takes == 0 and reaper.MIDIEditor_GetActive then
    local editor = reaper.MIDIEditor_GetActive()
    local take = editor and reaper.MIDIEditor_GetTake(editor)
    if take and reaper.TakeIsMIDI(take) then takes[1] = take end
  end
  return takes
end

-- The beat the ear counts in, in quarter notes: a quarter in 4/4, an eighth
-- in 5/8, a dotted quarter in 6/8 and 12/8.
function M.pulse(num, den)
  if den == 8 and num % 3 == 0 and num > 3 then return 1.5 end
  return 4 / den
end

--[[  The notes, ready for the engine: in quarter notes, counted from the bar
      line at or before the first selected item, so the engine's bars are the
      project's bars. Muted notes are left out, and so is anything outside
      the item's edges - a trimmed item plays only what is inside it.

      Returns a source table, or nil and NO_ITEM / NOTHING. ]]
function M.read()
  local takes = M.sourceTakes()
  if #takes == 0 then return nil, M.NO_ITEM end

  local firstPos, firstTrack, name
  for _, take in ipairs(takes) do
    local item = reaper.GetMediaItemTake_Item(take)
    local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
    if not firstPos or pos < firstPos then
      firstPos, firstTrack = pos, reaper.GetMediaItem_Track(item)
      name = reaper.GetTakeName(take)
    end
  end

  local startQN = reaper.TimeMap2_timeToQN(0, firstPos)
  -- A hair past the item's start, so an item that begins exactly on a bar
  -- line is counted in that bar and not the one before it.
  local _, barStart, barEnd = reaper.TimeMap_QNToMeasures(0, startQN + 1e-6)
  local num, den = reaper.TimeMap_GetTimeSigAtTime(0, firstPos)
  if not num or num <= 0 or not den or den <= 0 then num, den = 4, 4 end
  local barBeats = barEnd - barStart
  if not barBeats or barBeats <= 0 then barBeats = num * 4 / den end

  local notes = {}
  for _, take in ipairs(takes) do
    local item = reaper.GetMediaItemTake_Item(take)
    local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
    local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
    local itemStart = reaper.TimeMap2_timeToQN(0, pos)
    local itemEnd = reaper.TimeMap2_timeToQN(0, pos + len)
    local _, count = reaper.MIDI_CountEvts(take)
    for i = 0, count - 1 do
      local ok, _, muted, sp, ep, _, pitch, vel = reaper.MIDI_GetNote(take, i)
      if ok and not muted then
        local s = math.max(itemStart, reaper.MIDI_GetProjQNFromPPQPos(take, sp))
        local e = math.min(itemEnd, reaper.MIDI_GetProjQNFromPPQPos(take, ep))
        if e - s > 1e-6 then
          notes[#notes + 1] = { pitch = pitch, start = s - barStart, len = e - s, vel = vel }
        end
      end
    end
  end
  if #notes == 0 then return nil, M.NOTHING end
  table.sort(notes, function(a, b)
    if a.start ~= b.start then return a.start < b.start end
    return a.pitch < b.pitch
  end)

  return {
    notes = notes, barBeats = barBeats, pulse = M.pulse(num, den),
    num = num, den = den, originQN = barStart, track = firstTrack,
    name = (name and name ~= "") and name or "MIDI item", items = #takes,
  }
end

------------------------------------------------------------------------------
-- Writing
------------------------------------------------------------------------------

local function validTrack(track)
  if not track then return false end
  if reaper.ValidatePtr2 then return reaper.ValidatePtr2(0, track, "MediaTrack*") end
  return true
end

--[[  A new track straight under the source, carrying a copy of the source's
      FX. A new empty track is silent, and someone who has just imported a
      melody onto a piano wants the chords on a piano too - so they hear the
      suggestion the moment it lands, and can change the instrument after. ]]
function M.newTrackBelow(source, name)
  local src = validTrack(source.track) and source.track or nil
  local idx = src and reaper.GetMediaTrackInfo_Value(src, "IP_TRACKNUMBER") or 0
  if idx <= 0 then idx = reaper.CountTracks(0) end    -- 1-based number = the slot after it
  reaper.InsertTrackAtIndex(idx, true)
  local track = reaper.GetTrack(0, idx)
  reaper.GetSetMediaTrackInfo_String(track, "P_NAME", name, true)
  if src then
    for fx = 0, reaper.TrackFX_GetCount(src) - 1 do
      reaper.TrackFX_CopyToTrack(src, fx, track, fx, false)
    end
  end
  return track
end

local function fill(track, notes, beats, source, name)
  local t0 = reaper.TimeMap2_QNToTime(0, source.originQN)
  local t1 = reaper.TimeMap2_QNToTime(0, source.originQN + beats)
  local item = reaper.CreateNewMIDIItemInProj(track, t0, t1, false)
  if not item then return nil end
  local take = reaper.GetActiveTake(item)
  for _, n in ipairs(notes) do
    local sp = reaper.MIDI_GetPPQPosFromProjQN(take, source.originQN + n.start)
    local ep = reaper.MIDI_GetPPQPosFromProjQN(take, source.originQN + n.start + n.len)
    -- The last argument is noSort: every note in the batch, then one sort.
    reaper.MIDI_InsertNote(take, false, false, sp, ep, 0, n.pitch, n.vel or 100, true)
  end
  reaper.MIDI_Sort(take)
  reaper.GetSetMediaItemTakeInfo_String(take, "P_NAME", name, true)
  return item
end

-- Puts a suggestion into the project, on its own new track under the
-- source, lined up with it bar for bar. One undo step.
function M.insert(notes, beats, source, name)
  if not notes or #notes == 0 then return M.NOTHING end
  reaper.Undo_BeginBlock()
  reaper.PreventUIRefresh(1)
  local track = M.newTrackBelow(source, name)
  local item = fill(track, notes, beats, source, name)
  reaper.PreventUIRefresh(-1)
  if not item then
    reaper.DeleteTrack(track)
    reaper.Undo_EndBlock("Midi Suggester: " .. name, -1)   -- a refusal still closes its block
    return M.FAILED
  end
  reaper.TrackList_AdjustWindows(false)
  reaper.UpdateArrange()
  reaper.Undo_EndBlock("Midi Suggester: " .. name, -1)
  return M.OK
end

------------------------------------------------------------------------------
-- Hearing one first
--
-- The suggestion goes on a temporary track under the source and the project
-- plays from the source's first bar, so it is heard with the melody or the
-- chords it was written for, through the source's own instrument. Stopping -
-- here, or with REAPER's own transport, or by reaching the end - takes the
-- track away again and puts the edit cursor back where it was.
--
-- The temporary track is added and removed outside any undo block, so it
-- leaves nothing in the undo history; it is marked so that one left behind
-- by a crash is swept up the next time the script starts.
------------------------------------------------------------------------------

local audition = { track = nil, stopAt = 0, startAt = 0, cursor = 0 }
M.audition = audition

function M.auditionStop()
  if not audition.track then return end
  if reaper.GetPlayState() & 1 == 1 then reaper.OnStopButton() end
  if validTrack(audition.track) then reaper.DeleteTrack(audition.track) end
  reaper.SetEditCurPos(audition.cursor, false, false)
  audition.track = nil
  reaper.TrackList_AdjustWindows(false)
  reaper.UpdateArrange()
end

function M.auditionStart(notes, beats, source)
  M.auditionStop()
  if not notes or #notes == 0 then return M.NOTHING end
  reaper.PreventUIRefresh(1)
  local track = M.newTrackBelow(source, M.PREVIEW_NAME)
  reaper.GetSetMediaTrackInfo_String(track, M.EXT_KEY, M.PREVIEW, true)
  local item = fill(track, notes, beats, source, M.PREVIEW_NAME)
  reaper.PreventUIRefresh(-1)
  if not item then
    reaper.DeleteTrack(track)
    return M.FAILED
  end
  audition.track = track
  audition.cursor = reaper.GetCursorPosition()
  audition.startAt = reaper.TimeMap2_QNToTime(0, source.originQN)
  audition.stopAt = reaper.TimeMap2_QNToTime(0, source.originQN + beats)
  reaper.SetEditCurPos(audition.startAt, false, false)
  reaper.OnPlayButton()
  return M.OK
end

function M.auditioning() return audition.track ~= nil end

-- Called every frame. Returns how far through the audition is, 0 to 1, or
-- nil once it has stopped for any reason.
function M.auditionTick()
  if not audition.track then return nil end
  if reaper.GetPlayState() & 1 == 0 then M.auditionStop(); return nil end
  local at = reaper.GetPlayPosition()
  if at >= audition.stopAt then M.auditionStop(); return nil end
  local span = math.max(audition.stopAt - audition.startAt, 1e-9)
  return math.max(0, math.min(1, (at - audition.startAt) / span))
end

-- Removes any audition track a crash left behind.
function M.sweep()
  for i = reaper.CountTracks(0) - 1, 0, -1 do
    local track = reaper.GetTrack(0, i)
    local _, mark = reaper.GetSetMediaTrackInfo_String(track, M.EXT_KEY, "", false)
    if mark == M.PREVIEW then reaper.DeleteTrack(track) end
  end
end

return M
