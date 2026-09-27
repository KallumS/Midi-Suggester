--[[
 * ReaScript Name: Midi Suggester
 * Description:    Reads a MIDI item and suggests what goes with it: chord
 *                 progressions for a melody, melodies for a chord
 *                 progression. Hear one against the original, then drop it
 *                 onto a new track lined up bar for bar.
 *
 * About:          Import a .mid file (or play something in), select the item,
 *                 and run this. It works out whether the item is a melody or
 *                 chords and what key it is in - both can be changed - and
 *                 lists suggestions, best first.
 *
 *                 Needs ReaImGui, from the ReaTeam Extensions repository.
 * Author:         Kallum Shah
 * Links:          https://github.com/KallumS/Midi-Suggester
 * Version:        1.0
 * Provides:
 *   ms_theory.lua
 *   ms_read.lua
 *   ms_harmony.lua
 *   ms_melody.lua
 *   ms_place.lua
--]]

local TITLE   = "Midi Suggester"
local SECTION = "MidiSuggester"

------------------------------------------------------------------------------
-- Dependencies
------------------------------------------------------------------------------

local imgui_path = reaper.ImGui_GetBuiltinPath and
                   (reaper.ImGui_GetBuiltinPath() .. "/imgui.lua")
if not imgui_path then
  reaper.MB("Midi Suggester needs the ReaImGui extension.\n\n" ..
            "Install it with ReaPack, from the ReaTeam Extensions repository.",
            "Missing dependency", 0)
  return
end
local ImGui = dofile(imgui_path)("0.9")

local HERE  = ({ reaper.get_action_context() })[2]:match("^(.*[/\\])")
local T     = dofile(HERE .. "ms_theory.lua")
local R     = dofile(HERE .. "ms_read.lua")
local H     = dofile(HERE .. "ms_harmony.lua")
local Mel   = dofile(HERE .. "ms_melody.lua")
local Place = dofile(HERE .. "ms_place.lua")

------------------------------------------------------------------------------
-- Look
--
-- The house scheme, shared with Starting Blocks and ScaleView: a dark cool
-- grey ground, light grey controls, one yellow for whatever is switched on.
-- Every grey is blue-shifted, R < G < B - a neutral grey looks correct in a
-- diff and reads flat on screen beside the yellow.
------------------------------------------------------------------------------

local THEME = {
  { "Col_Text",              0xDDE1E7FF },
  { "Col_TextDisabled",      0x8A919CFF },
  { "Col_WindowBg",          0x23272EFF },
  { "Col_PopupBg",           0x1B1F25FF },
  { "Col_Border",            0x14171CFF },
  { "Col_FrameBg",           0x1A1D23FF },
  { "Col_FrameBgHovered",    0x22262DFF },
  { "Col_FrameBgActive",     0x2A2F37FF },
  { "Col_TitleBg",           0x1B1F25FF },
  { "Col_TitleBgActive",     0x23272EFF },
  { "Col_TitleBgCollapsed",  0x1B1F25FF },
  { "Col_Button",            0xA9AFBAFF },
  { "Col_ButtonHovered",     0xC0C6CFFF },
  { "Col_ButtonActive",      0x8F96A2FF },
  { "Col_CheckMark",         0xFFF200FF },
  { "Col_SliderGrab",        0xA9AFBAFF },
  { "Col_SliderGrabActive",  0xFFF200FF },
  { "Col_Separator",         0x3A404AFF },
  { "Col_ScrollbarBg",       0x1A1D23FF },
  { "Col_ScrollbarGrab",     0x585F6BFF },
  { "Col_ScrollbarGrabHovered", 0x6D7581FF },
  { "Col_ScrollbarGrabActive",  0xA9AFBAFF },
}

local SELECTED  = 0xFFF200FF   -- the accent: a chosen button, and the suggestion's notes
local INK       = 0x14171CFF   -- text on every button, grey or yellow
local STEP      = 0xBFC5CEFF   -- the step numbers: neutral, they only give the order
local ROLL_BG   = 0x111419FF
local ROLL_BAR  = 0x3A404AFF
local ROLL_BEAT = 0x1E2228FF
-- The source's notes in the roll. A grey off the same ramp, so the yellow is
-- only ever the suggestion: what you would be adding, against what is there.
local SOURCE_NOTE = 0x6D7581FF
local PLAYHEAD  = 0xF2F4F7FF
local DIM       = 0x8A919CFF
local WARN      = 0xD2483FFF

-- Shifts a colour towards white or black, keeping its alpha byte - without
-- it ReaImGui is handed a fully transparent colour.
local function shade(col, amount)
  local a = col % 256
  local b = math.floor(col / 256) % 256
  local g = math.floor(col / 65536) % 256
  local r = math.floor(col / 16777216) % 256
  local function mix(c)
    if amount >= 0 then return math.floor(c + (255 - c) * amount + 0.5) end
    return math.floor(c * (1 + amount) + 0.5)
  end
  return mix(r) * 16777216 + mix(g) * 65536 + mix(b) * 256 + a
end

------------------------------------------------------------------------------
-- State
------------------------------------------------------------------------------

-- Preferences, kept between runs. What the source is and what key it is in
-- belong to the item, not to the user, so they are not saved.
local st = { rhythm = 1, colour = 1, bass = 1, density = 2, register = 2 }
local SAVED = { "rhythm", "colour", "bass", "density", "register" }
local LIMITS = { rhythm = #H.RHYTHMS, colour = #H.COLOURS, bass = 1,
                 density = #Mel.DENSITIES, register = #Mel.REGISTERS }

local ui = {
  src = nil,          -- what Place.read returned
  an = nil,           -- what R.analyse made of it
  kind = nil,         -- "Melody" or "Chords" when the user has overridden it
  keyRoot = nil, keyScale = nil, key = nil,
  sugs = {}, pick = 1, variation = 0,
  dirty = false, status = "", warn = false, playhead = nil,
}

local ctx

local function say(text, warn) ui.status, ui.warn = text, warn or false end

local function saveState()
  local out = {}
  for _, k in ipairs(SAVED) do out[#out + 1] = k .. "=" .. tostring(st[k]) end
  reaper.SetExtState(SECTION, "state", table.concat(out, ";"), true)
end

local function loadState()
  local blob = reaper.GetExtState(SECTION, "state")
  if not blob or blob == "" then return end
  for pair in blob:gmatch("[^;]+") do
    local k, v = pair:match("^(%w+)=(.*)$")
    v = tonumber(v)
    if k and LIMITS[k] and v then
      st[k] = math.max(k == "bass" and 0 or 1, math.min(LIMITS[k], math.floor(v)))
    end
  end
end

------------------------------------------------------------------------------
-- Reading and suggesting
------------------------------------------------------------------------------

local function analyse()
  ui.an = R.analyse(ui.src.notes, ui.src.barBeats, T, ui.kind)
  local best = ui.an.keys[1]
  ui.keyRoot = ui.keyRoot or best.root
  ui.keyScale = ui.keyScale or best.scale
  ui.key = T.key(ui.keyRoot, ui.keyScale)
  if ui.an.chords then R.nameSegments(ui.an.chords, ui.key, T) end
  ui.pick, ui.dirty = 1, true
end

local function load(quiet)
  Place.auditionStop()
  local src, why = Place.read()
  if not src then
    ui.src, ui.an, ui.sugs = nil, nil, {}
    if not quiet then
      say(why == Place.NO_ITEM and "Select a MIDI item first." or "That item has no notes in it.", true)
    end
    return
  end
  ui.src, ui.kind, ui.keyRoot, ui.keyScale, ui.variation = src, nil, nil, nil, 0
  analyse()
  say("")
end

local function rebuild()
  ui.dirty = false
  ui.sugs = {}
  if not ui.an then return end
  local opts = { key = ui.key, beats = ui.an.beats, barBeats = ui.src.barBeats,
                 pulse = ui.src.pulse, variation = ui.variation }
  if ui.an.kind == "Melody" then
    opts.rhythm, opts.colour = st.rhythm, st.colour
    ui.sugs = H.suggest(ui.an.line, T, opts)
    for _, s in ipairs(ui.sugs) do
      s.notes = H.voice(s, ui.an.line, st.bass == 1)
      s.title = table.concat(s.numerals, "  ")
      s.detail = ("%s      fits %d%%"):format(table.concat(s.symbols, "  "),
                                                math.floor(s.match * 100 + 0.5))
      s.trackName = "Chords: " .. table.concat(s.symbols, " ")
    end
  else
    opts.density, opts.register = st.density, st.register
    ui.sugs = Mel.suggest(ui.an.chords, T, opts)
    for i, s in ipairs(ui.sugs) do
      local function nm(p) return T.noteName(ui.key, p % 12) .. (p // 12 - 1) end
      s.title = "Melody " .. i
      s.detail = ("%d notes, %s to %s"):format(#s.notes, nm(s.low), nm(s.high))
      s.trackName = ("Melody %d (%s)"):format(i, ui.key.label)
    end
  end
  if ui.pick > #ui.sugs then ui.pick = 1 end
end

local function touched() ui.dirty = true; Place.auditionStop() end

------------------------------------------------------------------------------
-- Widgets
------------------------------------------------------------------------------

local function pushTheme()
  for _, c in ipairs(THEME) do ImGui.PushStyleColor(ctx, ImGui[c[1]], c[2]) end
end
local function popTheme() ImGui.PopStyleColor(ctx, #THEME) end

-- A chosen button takes the accent; every button, chosen or not, takes the
-- dark ink, because both fills are far lighter than the window's own text.
local function pick(label, selected, width)
  local pushed = 1
  if selected then
    ImGui.PushStyleColor(ctx, ImGui.Col_Button, SELECTED)
    ImGui.PushStyleColor(ctx, ImGui.Col_ButtonHovered, shade(SELECTED, 0.18))
    ImGui.PushStyleColor(ctx, ImGui.Col_ButtonActive, shade(SELECTED, -0.18))
    pushed = 4
  end
  ImGui.PushStyleColor(ctx, ImGui.Col_Text, INK)
  local hit = ImGui.Button(ctx, label, width or 0, 0)
  ImGui.PopStyleColor(ctx, pushed)
  return hit
end

local function heading(n, text)
  ImGui.PushStyleColor(ctx, ImGui.Col_Text, STEP)
  ImGui.Text(ctx, tostring(n))
  ImGui.PopStyleColor(ctx, 1)
  ImGui.SameLine(ctx, 0, 10)
  ImGui.SeparatorText(ctx, text)
end

-- The gap between numbered steps. A gap, not an arrow: it separates them
-- just as well with nothing on screen to read.
local STEP_GAP = 22
local function stepGap() ImGui.Dummy(ctx, 16, STEP_GAP) end

local function tip(text)
  if text and ImGui.IsItemHovered(ctx) then ImGui.SetTooltip(ctx, text) end
end

local function dim(text)
  ImGui.PushStyleColor(ctx, ImGui.Col_Text, DIM)
  ImGui.Text(ctx, text)
  ImGui.PopStyleColor(ctx, 1)
end

-- A wrapped row of choices. Returns the index clicked, or nil.
local function chooser(id, items, current, perRow, width, label, hint)
  local chosen
  ImGui.PushID(ctx, id)
  for i, item in ipairs(items) do
    if i > 1 and (perRow == 0 or (i - 1) % perRow ~= 0) then ImGui.SameLine(ctx) end
    ImGui.PushID(ctx, i)
    if pick(label and label(item, i) or tostring(item), current == i, width) then chosen = i end
    if hint then tip(hint(item, i)) end
    ImGui.PopID(ctx)
  end
  ImGui.PopID(ctx)
  return chosen
end

------------------------------------------------------------------------------
-- The roll
------------------------------------------------------------------------------

local function pianoRoll(source, suggestion, beats, barBeats, width, height, playhead)
  local dl = ImGui.GetWindowDrawList(ctx)
  local x, y = ImGui.GetCursorScreenPos(ctx)
  ImGui.InvisibleButton(ctx, "##roll", width, height)
  ImGui.DrawList_AddRectFilled(dl, x, y, x + width, y + height, ROLL_BG, 3)
  beats = math.max(beats or 0, 1e-9)

  local b = 0
  while b <= beats + 1e-9 do
    local gx = x + width * (b / beats)
    ImGui.DrawList_AddLine(dl, gx, y, gx, y + height,
                           (b % barBeats < 1e-9) and ROLL_BAR or ROLL_BEAT, 1)
    b = b + 1
  end

  local lo, hi = 200, -1
  for _, list in ipairs({ source or {}, suggestion or {} }) do
    for _, n in ipairs(list) do lo, hi = math.min(lo, n.pitch), math.max(hi, n.pitch) end
  end
  if hi < 0 then return end
  if hi - lo < 11 then
    lo = math.max(0, math.floor((lo + hi) / 2) - 6)
    hi = lo + 12
  end
  local rowh = height / (hi - lo + 1)

  -- The source first, so the suggestion is drawn over it.
  for _, layer in ipairs({ { source, SOURCE_NOTE }, { suggestion, SELECTED } }) do
    for _, n in ipairs(layer[1] or {}) do
      local nx = x + width * (n.start / beats)
      local nw = math.max(2, width * (n.len / beats) - 1)
      local ny = y + height - (n.pitch - lo + 1) * rowh
      ImGui.DrawList_AddRectFilled(dl, nx, ny, nx + nw, ny + math.max(2, rowh - 1), layer[2], 1)
    end
  end

  if playhead then
    local px = x + width * math.min(1, playhead)
    ImGui.DrawList_AddLine(dl, px, y, px, y + height, PLAYHEAD, 2)
  end
end

------------------------------------------------------------------------------
-- The three steps
------------------------------------------------------------------------------

local KINDS = { "Melody", "Chords" }

local function drawSource()
  heading(1, "Source")
  if pick("Use selected item", false, 170) then load() end
  tip("Select a MIDI item in the arrange view - an imported .mid file is one -\n" ..
      "or open one in the MIDI editor, then press this. Several selected items\n" ..
      "are read as one piece.")
  if not ui.src then
    dim("Import a .mid file onto a track, select the item it makes, and press the button.")
    return
  end
  ImGui.SameLine(ctx, 0, 16)
  local bars = math.floor(ui.an.beats / ui.src.barBeats + 0.5)
  dim(("\"%s\"   %d bar%s of %d/%d, %d notes%s"):format(ui.src.name, bars, bars == 1 and "" or "s",
      ui.src.num, ui.src.den, #ui.src.notes,
      ui.src.items > 1 and (", from " .. ui.src.items .. " items") or ""))

  dim("It is")
  ImGui.SameLine(ctx, 0, 10)
  local cur = ui.an.kind == "Melody" and 1 or 2
  local k = chooser("kind", KINDS, cur, 0, 90, nil, function(x)
    return x == "Melody" and "One note at a time: suggest chords to go under it"
                          or "Chords: suggest melodies to go over them"
  end)
  if k and KINDS[k] ~= ui.an.kind then
    ui.kind, ui.keyRoot, ui.keyScale, ui.variation = KINDS[k], nil, nil, 0
    Place.auditionStop()
    analyse()
  end
  if ui.an.kind ~= ui.an.detected then
    ImGui.SameLine(ctx, 0, 16)
    dim(("(it looked like %s)"):format(ui.an.detected == "Melody" and "a melody" or "chords"))
  end

  if ui.an.chords then
    local names = {}
    for _, c in ipairs(ui.an.chords) do names[#names + 1] = c.name end
    dim("Chords:   " .. table.concat(names, "   "))
  end
end

local function drawKey()
  heading(2, "Key")
  local r = chooser("root", T.ROOTS, ui.keyRoot, 0, 38, function(x) return x.name end)
  if r then
    ui.keyRoot = r
    analyse()
    Place.auditionStop()
  end
  local s = chooser("scale", T.SCALES, ui.keyScale, 0, 124, function(x) return x.name end)
  if s then
    ui.keyScale = s
    analyse()
    Place.auditionStop()
  end
  local best, second = ui.an.keys[1], ui.an.keys[2]
  local function label(k) return T.ROOTS[k.root].name .. " " .. T.SCALES[k.scale].name end
  dim(("Sounds like %s, then %s."):format(label(best), label(second)))
  tip("Worked out from which notes are played and for how long, and from the\n" ..
      "note the music ends on. Pick another key if it has guessed wrong.")
end

local function drawOptions()
  if ui.an.kind == "Melody" then
    dim("Change chord")
    ImGui.SameLine(ctx, 0, 10)
    local r = chooser("rhythm", H.RHYTHMS, st.rhythm, 0, 96, function(x) return x.name end)
    if r then st.rhythm = r; touched() end

    dim("Chords from")
    ImGui.SameLine(ctx, 0, 10)
    local c = chooser("colour", H.COLOURS, st.colour, 0, 96, nil, function(_, i)
      return ({ "The seven chords the key is built from",
                "Those, and their sevenths",
                "Those, plus chords borrowed from the parallel key and secondary dominants" })[i]
    end)
    if c then st.colour = c; touched() end
    ImGui.SameLine(ctx, 0, 24)
    local changed, v = ImGui.Checkbox(ctx, "Bass note", st.bass == 1)
    if changed then st.bass = v and 1 or 0; touched() end
    tip("Adds each chord's root, low, under the chord")
  else
    dim("Notes")
    ImGui.SameLine(ctx, 0, 10)
    local d = chooser("density", Mel.DENSITIES, st.density, 0, 84, function(x) return x.name end)
    if d then st.density = d; touched() end
    ImGui.SameLine(ctx, 0, 24)
    dim("Register")
    ImGui.SameLine(ctx, 0, 10)
    local g = chooser("register", Mel.REGISTERS, st.register, 0, 64, function(x) return x.name end)
    if g then st.register = g; touched() end
  end
end

local function drawSuggestions()
  heading(3, ui.an.kind == "Melody" and "Chord progressions" or "Melodies")
  drawOptions()
  ImGui.Dummy(ctx, 0, 4)

  local w = select(1, ImGui.GetContentRegionAvail(ctx))
  if #ui.sugs == 0 then
    dim("Nothing to suggest for this.")
  end
  for i, s in ipairs(ui.sugs) do
    ImGui.PushID(ctx, "sug" .. i)
    if pick(("%d.  %s"):format(i, s.title), ui.pick == i, math.max(160, w * 0.42)) then
      if ui.pick ~= i then Place.auditionStop() end
      ui.pick = i
    end
    ImGui.PopID(ctx)
    ImGui.SameLine(ctx, 0, 14)
    dim(s.detail)
  end

  ImGui.Dummy(ctx, 0, 4)
  local chosen = ui.sugs[ui.pick]
  pianoRoll(ui.src.notes, chosen and chosen.notes, ui.an.beats, ui.src.barBeats,
            math.max(160, w), 110, ui.playhead)

  ImGui.Dummy(ctx, 0, 2)
  if not chosen then return end
  if pick("Insert on new track", false, 170) then
    Place.auditionStop()
    local r = Place.insert(chosen.notes, ui.an.beats, ui.src, chosen.trackName)
    if r == Place.OK then say("Inserted on a new track under \"" .. ui.src.name .. "\".")
    else say("REAPER would not make the item.", true) end
  end
  tip("A new track under the source, lined up with it bar for bar, with a copy\n" ..
      "of the source track's instrument so it plays straight away. One undo step.")

  ImGui.SameLine(ctx)
  local playing = Place.auditioning()
  if pick(playing and "Stop" or "Audition", playing, 96) then
    if playing then Place.auditionStop()
    else
      local r = Place.auditionStart(chosen.notes, ui.an.beats, ui.src)
      if r ~= Place.OK then say("REAPER would not make the preview.", true) end
    end
  end
  tip("Plays the project from the source's first bar with this suggestion on a\n" ..
      "temporary track. Stopping - here or in REAPER - takes the track away.")

  ImGui.SameLine(ctx, 0, 16)
  if pick("More ideas", false, 110) then
    ui.variation = ui.variation + 1
    ui.pick = 1
    touched()
  end
  tip("Another set of suggestions. The first set is always the best-scoring.")
  if ui.variation > 0 then
    ImGui.SameLine(ctx)
    if pick("Back to the first", false, 140) then ui.variation, ui.pick = 0, 1; touched() end
  end
end

local function frame()
  if ui.dirty then rebuild() end
  ui.playhead = Place.auditionTick()

  drawSource()
  if ui.src then
    stepGap()
    drawKey()
    stepGap()
    drawSuggestions()
  end

  if ui.status ~= "" then
    ImGui.PushStyleColor(ctx, ImGui.Col_Text, ui.warn and WARN or DIM)
    ImGui.Text(ctx, ui.status)
    ImGui.PopStyleColor(ctx, 1)
  end
end

------------------------------------------------------------------------------
-- Running
------------------------------------------------------------------------------

local sectionID, cmdID

local function loop()
  ImGui.SetNextWindowSize(ctx, 900, 720, ImGui.Cond_FirstUseEver)
  ImGui.SetNextWindowBgAlpha(ctx, 1.0)
  pushTheme()
  local visible, open = ImGui.Begin(ctx, TITLE, true)
  if visible then
    frame()
    ImGui.End(ctx)
  end
  popTheme()   -- outside the visible test: a push always needs its pop
  if open and not ImGui.IsKeyPressed(ctx, ImGui.Key_Escape) then
    reaper.defer(loop)
  end
end

local function shutdown()
  Place.auditionStop()
  saveState()
  if sectionID then
    reaper.SetToggleCommandState(sectionID, cmdID, 0)
    reaper.RefreshToolbar2(sectionID, cmdID)
  end
end

local function main()
  Place.sweep()
  loadState()
  local _, _, sid, cid = reaper.get_action_context()
  sectionID, cmdID = sid, cid
  reaper.SetToggleCommandState(sectionID, cmdID, 1)
  reaper.RefreshToolbar2(sectionID, cmdID)
  reaper.atexit(shutdown)
  if reaper.set_action_options then reaper.set_action_options(1) end
  ctx = ImGui.CreateContext(TITLE)
  load(true)
  reaper.defer(loop)
end

main()
