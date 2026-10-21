--[[
 * ReaScript Name: Midi Suggester
 * Description:    Reads a MIDI item and suggests what goes with it: chord
 *                 progressions for a melody, melodies for a chord
 *                 progression. Hear one against the original, then drop it
 *                 onto a new track lined up bar for bar.
 *
 * About:          Import a .mid file (or play something in), select the item,
 *                 and run this. It works out whether the item is a melody or
 *                 chords and what key it is in — both can be changed — and
 *                 lists suggestions, best first.
 *
 *                 Needs ReaImGui, from the ReaTeam Extensions repository.
 * Author:         Kallum Shah
 * Links:          https://github.com/KallumS/Midi-Suggester
 * Version:        1.3
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
            "Install it with ReaPack, from the ReaTeam Extensions repository, " ..
            "then run Midi Suggester again.",
            "ReaImGui Needed", 0)
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
  -- ImGui writes a menu item's keys (Cmd+=) in this colour, so it is a word
  -- and 7:1 on the menu too (#8A919C was 4.2:1 there). A disabled item is
  -- drawn faded on top of this, which Apple exempts.
  { "Col_TextDisabled",      0xBFC5CEFF },
  { "Col_WindowBg",          0x23272EFF },
  -- Menus and tooltips sit in front of the window, so they are a step
  -- lighter than it, as Apple's dark surfaces are (#1B1F25 was darker), with
  -- an edge of their own.
  { "Col_PopupBg",           0x2A2F37FF },
  { "Col_Border",            0x3A404AFF },
  { "Col_MenuBarBg",         0x1B1F25FF },
  -- A menu item under the pointer, and pressed: lighter, then darker, as a
  -- button is. ImGui's own were blue.
  { "Col_Header",            0x3A404AFF },
  { "Col_HeaderHovered",     0x3A404AFF },
  { "Col_HeaderActive",      0x22262DFF },
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
  -- Things you can drag are 3:1 on what they sit on, like any control's
  -- edge (#585F6B was 2.6:1 on its track). The window's resize corner was
  -- ImGui's blue.
  { "Col_ScrollbarGrab",     0x6D7581FF },
  { "Col_ScrollbarGrabHovered", 0x8A919CFF },
  { "Col_ScrollbarGrabActive",  0xA9AFBAFF },
  { "Col_ResizeGrip",        0x6D7581FF },
  { "Col_ResizeGripHovered", 0x8A919CFF },
  { "Col_ResizeGripActive",  0xA9AFBAFF },
  -- The keyboard's focus ring: the playhead's near-white, because yellow
  -- means "on" and a focused control is not necessarily on.
  { "Col_NavHighlight",      0xF2F4F7FF },
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
-- Behind the chord being edited: the ramp's "frame active" grey, a step up
-- from the roll's ground and still far below the notes.
local ROLL_BAND = 0x2A2F37FF
-- Secondary text and warnings are 7:1 against the ground, Apple's target
-- for small text in a dark window (0009). The ramp's #8A919C was 4.7:1 and
-- the house red #D2483F 3.4:1, so neither is used for words any more.
local DIM       = 0xB0B6C0FF
local WARN      = 0xFF9E96FF
-- The edge of the Bass Note box: 3:1 on the ground and on the box's own
-- dark fill, so the box can be seen before it is ticked (Apple asks the
-- same contrast of a control's edge as of an icon; the fill alone was 1.1:1).
local BOX_EDGE  = 0x8A919CFF

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
local st = { rhythm = 1, colour = 1, bass = 1, density = 2, register = 2, textSize = 1 }
local SAVED = { "rhythm", "colour", "bass", "density", "register", "textSize" }

local ui = {
  src = nil,          -- what Place.read returned
  an = nil,           -- what R.analyse made of it
  kind = nil,         -- "Melody" or "Chords" when the user has overridden it
  keyRoot = nil, keyScale = nil, key = nil,
  sugs = {}, pick = 1, variation = 0,
  chord = nil,        -- which chord of the chosen progression is being edited
  dirty = false, status = "", warn = false, playhead = nil,
  -- The keyboard is on a control, or a menu is open, as of the last frame:
  -- then Escape lets go of that rather than closing the window.
  held = false,
}

local ctx
local labelProgression

------------------------------------------------------------------------------
-- Apple's Human Interface Guidelines (0009, docs/apple-hig-review.md)
--
-- Text Size, in the View menu: Apple asks that text can be made at least
-- twice as big, and 13 points is the Mac's default text size. Every fixed
-- width in the window goes through px(), so it grows with the text.
------------------------------------------------------------------------------

local TEXT_SIZES = { 100, 125, 150, 200 }
local BASE_TEXT = 13
local fonts = {}           -- one per size, made and attached once in main()
local bold = {}            -- the same in bold, for the step headings
local S = 1                -- the chosen size as a scale: 1, 1.25, 1.5 or 2
local function px(n) return math.floor(n * S + 0.5) end

local LIMITS = { rhythm = #H.RHYTHMS, colour = #H.COLOURS, bass = 1,
                 density = #Mel.DENSITIES, register = #Mel.REGISTERS,
                 textSize = #TEXT_SIZES }

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
  ui.pick, ui.chord, ui.dirty = 1, nil, true
end

local function load(quiet)
  Place.auditionStop()
  local src, why = Place.read()
  if not src then
    ui.src, ui.an, ui.sugs = nil, nil, {}
    if not quiet then
      say(why == Place.NO_ITEM and "Select a MIDI item first."
          or "That item has no notes. Select a MIDI item with notes in it.", true)
    end
    return
  end
  ui.src, ui.kind, ui.keyRoot, ui.keyScale, ui.variation = src, nil, nil, nil, 0
  analyse()
  say("")
end

-- A progression's notes and labels, from its chords as they now stand -
-- after it is suggested, and again after every edit.
labelProgression = function(s)
  s.notes = H.voice(s, ui.an.line, st.bass == 1)
  s.title = table.concat(s.numerals, "  ") .. (s.original and "   (edited)" or "")
  s.detail = ("%s      fits %d%%"):format(table.concat(s.symbols, "  "),
                                            math.floor(s.match * 100 + 0.5))
  s.trackName = "Chords: " .. table.concat(s.symbols, " ")
end

local function rebuild()
  ui.dirty = false
  ui.chord = nil
  ui.sugs = {}
  if not ui.an then return end
  local opts = { key = ui.key, beats = ui.an.beats, barBeats = ui.src.barBeats,
                 pulse = ui.src.pulse, variation = ui.variation }
  if ui.an.kind == "Melody" then
    opts.rhythm, opts.colour = st.rhythm, st.colour
    ui.sugs = H.suggest(ui.an.line, T, opts)
    for _, s in ipairs(ui.sugs) do labelProgression(s) end
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

-- Every edit goes through here: the first one keeps a copy of the
-- progression as suggested, so it can be put back.
local function edit(s, change)
  Place.auditionStop()
  local before = s.original or H.copy(s)
  local result = change()
  s.original = before
  labelProgression(s)
  return result
end

local function touched() ui.dirty = true; Place.auditionStop() end

------------------------------------------------------------------------------
-- Widgets
------------------------------------------------------------------------------

local function pushTheme()
  for _, c in ipairs(THEME) do ImGui.PushStyleColor(ctx, ImGui[c[1]], c[2]) end
end
local function popTheme() ImGui.PopStyleColor(ctx, #THEME) end

-- The text size and Apple's Mac control: 28 points tall at 100% (a 13-point
-- line and 7.5 above and below), about 12 points between controls. Pushed
-- before Begin and popped after End, like the theme.
local SIZE_VARS = 3
local function pushSize()
  ImGui.PushFont(ctx, fonts[st.textSize])
  ImGui.PushStyleVar(ctx, ImGui.StyleVar_FramePadding, px(8), 7.5 * S)
  ImGui.PushStyleVar(ctx, ImGui.StyleVar_ItemSpacing, px(12), px(12))
  ImGui.PushStyleVar(ctx, ImGui.StyleVar_ItemInnerSpacing, px(8), px(6))
end
local function popSize()
  ImGui.PopStyleVar(ctx, SIZE_VARS)
  ImGui.PopFont(ctx)
end

local function setTextSize(i)
  st.textSize = math.max(1, math.min(#TEXT_SIZES, i))
  S = TEXT_SIZES[st.textSize] / 100
end

-- A button's width: the width asked for, grown with the text size, and never
-- narrower than its label, so nothing is cut short at 200%. An exact width
-- was measured from the window already and is not grown again.
local function fit(label, width, exact)
  local text = label:gsub("##.*$", "")
  return math.max(exact and width or px(width), select(1, ImGui.CalcTextSize(ctx, text)) + px(16))
end

-- A chosen button takes the accent; every button, chosen or not, takes the
-- dark ink, because both fills are far lighter than the window's own text.
-- A chosen one also carries a bar under its label, so being chosen is not
-- shown by colour alone.
local function pick(label, selected, width, exact)
  local pushed = 1
  if selected then
    ImGui.PushStyleColor(ctx, ImGui.Col_Button, SELECTED)
    ImGui.PushStyleColor(ctx, ImGui.Col_ButtonHovered, shade(SELECTED, 0.18))
    ImGui.PushStyleColor(ctx, ImGui.Col_ButtonActive, shade(SELECTED, -0.18))
    pushed = 4
  end
  ImGui.PushStyleColor(ctx, ImGui.Col_Text, INK)
  local hit = ImGui.Button(ctx, label, width and fit(label, width, exact) or 0, 0)
  ImGui.PopStyleColor(ctx, pushed)
  if selected then
    local x1 = ImGui.GetItemRectMin(ctx)
    local x2, y2 = ImGui.GetItemRectMax(ctx)
    ImGui.DrawList_AddRectFilled(ImGui.GetWindowDrawList(ctx),
                                 x1 + px(8), y2 - px(5), x2 - px(8), y2 - px(3), INK)
  end
  return hit
end

-- A step's heading is bold, Apple's Headline style (13-point bold), so the
-- steps stand out from the text under them by weight as well as by the rule.
local function heading(n, text)
  ImGui.PushFont(ctx, bold[st.textSize])
  ImGui.PushStyleColor(ctx, ImGui.Col_Text, STEP)
  ImGui.Text(ctx, tostring(n))
  ImGui.PopStyleColor(ctx, 1)
  ImGui.SameLine(ctx, 0, px(10))
  ImGui.SeparatorText(ctx, text)
  ImGui.PopFont(ctx)
end

-- The gap between numbered steps. A gap, not an arrow: it separates them
-- just as well with nothing on screen to read.
local STEP_GAP = 22
local function stepGap() ImGui.Dummy(ctx, px(16), px(STEP_GAP)) end

local function tip(text)
  if text and ImGui.IsItemHovered(ctx) then ImGui.SetTooltip(ctx, text) end
end

-- Secondary text, wrapped at the window's edge rather than cut off by it.
local function dim(text, col)
  ImGui.PushStyleColor(ctx, ImGui.Col_Text, col or DIM)
  ImGui.TextWrapped(ctx, text)
  ImGui.PopStyleColor(ctx, 1)
end

--[[  Rows that wrap. Every row of buttons and words starts with rowStart()
      and places each item with place(width), which puts it beside the last
      if it fits and on a new line if not - so at 200% in a narrow window
      nothing runs off the right-hand edge where it cannot be reached. ]]
local row = { x = 0, avail = 0 }
local function rowStart() row.x, row.avail = 0, select(1, ImGui.GetContentRegionAvail(ctx)) end
local function place(w, gap)
  gap = gap or px(12)
  if row.x > 0 and row.x + gap + w <= row.avail then
    ImGui.SameLine(ctx, 0, gap)
    row.x = row.x + gap + w
  else
    row.x = w
  end
end
local function textWidth(text) return (ImGui.CalcTextSize(ctx, text)) end
-- Words in a row: beside what came before if they fit, else on a line of
-- their own, wrapped.
local function words(text, gap, col)
  place(math.min(textWidth(text), row.avail), gap)
  dim(text, col)
end
-- A button in a row.
local function button(label, selected, width, exact, gap)
  place(fit(label, width or 0, exact), gap)
  return pick(label, selected, width or 0, exact)
end

-- A row of choices, wrapping at the window's edge, carrying on the row
-- already started. Returns the index clicked, or nil.
local function chooser(id, items, current, width, label, hint, gap)
  local chosen
  ImGui.PushID(ctx, id)
  for i, item in ipairs(items) do
    local text = label and label(item, i) or tostring(item)
    ImGui.PushID(ctx, i)
    if button(text, current == i, width, false, i == 1 and gap or nil) then chosen = i end
    if hint then tip(hint(item, i)) end
    ImGui.PopID(ctx)
  end
  ImGui.PopID(ctx)
  return chosen
end

------------------------------------------------------------------------------
-- The roll
------------------------------------------------------------------------------

local function pianoRoll(source, suggestion, beats, barBeats, width, height, playhead, band)
  local dl = ImGui.GetWindowDrawList(ctx)
  local x, y = ImGui.GetCursorScreenPos(ctx)
  ImGui.InvisibleButton(ctx, "##roll", width, height)
  ImGui.DrawList_AddRectFilled(dl, x, y, x + width, y + height, ROLL_BG, 3)
  beats = math.max(beats or 0, 1e-9)

  -- The chord being edited, as a lighter stretch of the ground behind it.
  if band then
    local bx = x + width * (band.start / beats)
    ImGui.DrawList_AddRectFilled(dl, bx, y, bx + width * (band.len / beats), y + height, ROLL_BAND, 0)
  end

  -- Grid lines on the middle of a pixel, so a one-point line stays sharp.
  local b = 0
  while b <= beats + 1e-9 do
    local gx = math.floor(x + width * (b / beats)) + 0.5
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

  -- The playhead grows with the text, like everything else drawn.
  if playhead then
    local hx = x + width * math.min(1, playhead)
    ImGui.DrawList_AddLine(dl, hx, y, hx, y + height, PLAYHEAD, px(2))
  end
end

------------------------------------------------------------------------------
-- Asking first
--
-- Changes made to a progression live only in this window: new suggestions
-- (another key, rhythm or source, More Ideas) and closing the window throw
-- them away, and nothing brings them back. Apple asks for a confirmation
-- before anything that cannot be undone, so it asks, in REAPER's own dialog
-- (which VoiceOver can read), and only when there are changes to lose.
------------------------------------------------------------------------------

local function letGo(doing)
  local edited
  for _, s in ipairs(ui.sugs) do if s.original then edited = s; break end end
  if not edited then return true end
  local answer = reaper.ShowMessageBox(
    ("%s throws away the changes made to “%s”.\n\n" ..
     "To keep them, click Cancel, then Insert on New Track."):format(doing, table.concat(edited.numerals, " ")),
    "Throw Away the Changes?", 1)
  return answer == 1
end

------------------------------------------------------------------------------
-- The three steps
------------------------------------------------------------------------------

local KINDS = { "Melody", "Chords" }

local function drawSource()
  heading(1, "Source")
  rowStart()
  if button("Use Selected Items", false, 170) and letGo("Reading another item") then load() end
  tip("Select a MIDI item in the arrange view — an imported .mid file is one —\n" ..
      "or open one in the MIDI editor, then click this. Several selected items\n" ..
      "are read as one piece.")
  if not ui.src then
    dim("Import a .mid file onto a track, select the item it makes, and click Use Selected Items.")
    return
  end
  local bars = math.floor(ui.an.beats / ui.src.barBeats + 0.5)
  words(("“%s”   %d bar%s of %d/%d, %d notes%s"):format(ui.src.name, bars, bars == 1 and "" or "s",
        ui.src.num, ui.src.den, #ui.src.notes,
        ui.src.items > 1 and (", from " .. ui.src.items .. " items") or ""), px(16))

  rowStart()
  words("It is")
  local cur = ui.an.kind == "Melody" and 1 or 2
  local k = chooser("kind", KINDS, cur, 90, nil, function(x)
    return x == "Melody" and "One note at a time — suggests chords to go under it"
                          or "Chords — suggests melodies to go over them"
  end, px(10))
  if k and KINDS[k] ~= ui.an.kind and letGo("Changing what the item is") then
    ui.kind, ui.keyRoot, ui.keyScale, ui.variation = KINDS[k], nil, nil, 0
    Place.auditionStop()
    analyse()
  end
  if ui.an.kind ~= ui.an.detected then
    words(("(it looked like %s)"):format(ui.an.detected == "Melody" and "a melody" or "chords"), px(16))
  end

  if ui.an.chords then
    local names = {}
    for _, c in ipairs(ui.an.chords) do names[#names + 1] = c.name end
    dim("Chords:   " .. table.concat(names, "   "))
  end
end

local function drawKey()
  heading(2, "Key")
  rowStart()
  local r = chooser("root", T.ROOTS, ui.keyRoot, 38, function(x) return x.name end)
  if r and r ~= ui.keyRoot and letGo("Changing the key") then
    ui.keyRoot = r
    analyse()
    Place.auditionStop()
  end
  rowStart()
  local s = chooser("scale", T.SCALES, ui.keyScale, 124, function(x) return x.name end)
  if s and s ~= ui.keyScale and letGo("Changing the key") then
    ui.keyScale = s
    analyse()
    Place.auditionStop()
  end
  local best, second = ui.an.keys[1], ui.an.keys[2]
  local function label(k) return T.ROOTS[k.root].name .. " " .. T.SCALES[k.scale].name end
  dim(("Sounds like %s, then %s."):format(label(best), label(second)))
  tip("Worked out from which notes are played and for how long, and from the\n" ..
      "note the music ends on. Choose another key if this one sounds wrong.")
end

-- What each choice does, in words, for the ones whose name alone does not say.
local RHYTHM_HINTS = {
  "A chord every half bar",
  "A chord every bar",
  "A chord every two bars",
  "The tune decides — a chord changes on a bar line, or halfway through a bar\n" ..
  "where the tune asks for it, and lasts as long as the tune lets it",
}
local DENSITY_HINTS = {
  "Long notes, with room between them",
  "Mostly quarter and eighth notes",
  "Runs of eighth and sixteenth notes",
}
local REGISTER_HINTS = {
  "Around middle C",
  "Around the G above middle C",
  "Around the D an octave above middle C",
}

local function drawOptions()
  if ui.an.kind == "Melody" then
    rowStart()
    words("Change chord")
    local r = chooser("rhythm", H.RHYTHMS, st.rhythm, 96, function(x) return x.name end,
                      function(_, i) return RHYTHM_HINTS[i] end, px(10))
    if r and r ~= st.rhythm and letGo("Changing how often the chord changes") then st.rhythm = r; touched() end

    rowStart()
    words("Chords from")
    local c = chooser("colour", H.COLOURS, st.colour, 96, nil, function(_, i)
      return ({ "The seven chords the key is built from",
                "Those, and their sevenths",
                "Those, plus chords borrowed from the parallel key and secondary dominants" })[i]
    end, px(10))
    if c and c ~= st.colour and letGo("Changing which chords are used") then st.colour = c; touched() end
    -- The box is a frame as tall as a button, a gap, then its label.
    place(px(28) + px(8) + textWidth("Bass Note"), px(24))
    -- The box's edge, so it can be seen unticked.
    ImGui.PushStyleColor(ctx, ImGui.Col_Border, BOX_EDGE)
    ImGui.PushStyleVar(ctx, ImGui.StyleVar_FrameBorderSize, math.max(1, px(1)))
    local changed, v = ImGui.Checkbox(ctx, "Bass Note", st.bass == 1)
    ImGui.PopStyleVar(ctx, 1)
    ImGui.PopStyleColor(ctx, 1)
    if changed then
      -- Re-voiced in place, so a bass note added or taken away does not
      -- throw away edits made to a progression.
      st.bass = v and 1 or 0
      Place.auditionStop()
      for _, sg in ipairs(ui.sugs) do labelProgression(sg) end
    end
    tip("When ticked, each chord’s root is added low, under the chord.")
  else
    rowStart()
    words("Notes")
    local d = chooser("density", Mel.DENSITIES, st.density, 84, function(x) return x.name end,
                      function(_, i) return DENSITY_HINTS[i] end, px(10))
    if d then st.density = d; touched() end
    words("Register", px(24))
    local g = chooser("register", Mel.REGISTERS, st.register, 64, function(x) return x.name end,
                      function(_, i) return REGISTER_HINTS[i] end, px(10))
    if g then st.register = g; touched() end
  end
end

--[[  The chosen progression, one button per chord, each as wide as the
      chord is long so the row lines up with the roll under it. Clicking one
      opens what can be done to it: swap it for another, split it with a
      passing chord, or remove it. Controls that would do nothing - Split on
      a chord a beat long, Remove on the only chord - are not drawn. ]]
local function drawChordEditor(s, w)
  dim("Click a chord to change it")
  local gap = 3
  local usable = math.max(px(160), w) - gap * (#s.chords - 1)
  rowStart()
  for i, c in ipairs(s.chords) do
    ImGui.PushID(ctx, "chord" .. i)
    -- Touching, like the segments of one control, so the row lines up with
    -- the bars in the roll; it wraps only when the chords will not fit.
    if button(c.chord.symbol, ui.chord == i, math.max(px(36), usable * c.len / ui.an.beats), true, gap) then
      ui.chord = (ui.chord == i) and nil or i
    end
    tip(("%s — %s, %g beat%s"):format(c.chord.symbol, c.chord.numeral, c.len, c.len == 1 and "" or "s"))
    ImGui.PopID(ctx)
  end

  local i = ui.chord
  if i and s.chords[i] then
    local c = s.chords[i]
    rowStart()
    words(("Swap %s for"):format(c.chord.symbol))
    for k, alt in ipairs(H.alternatives(s, i, ui.an.line)) do
      ImGui.PushID(ctx, "alt" .. k)
      if button(alt.chord.symbol, false, 70, false, k == 1 and px(10) or nil) then
        edit(s, function() H.replace(s, i, alt.chord, ui.an.line) end)
      end
      tip(("%s — fits %d%% of the melody here"):format(alt.chord.numeral,
          math.floor(alt.match * 100 + 0.5)))
      ImGui.PopID(ctx)
    end

    rowStart()
    if H.canSplit(s, i) then
      if button("Split", false, 70) then
        ui.chord = edit(s, function() return H.split(s, i, ui.an.line) end)
      end
      tip("Cuts this chord in two and puts a passing chord in the second\n" ..
          "half, chosen to lead into the chord after it.")
    end
    if H.canRemove(s) then
      if button("Remove", false, 80) then
        edit(s, function() H.remove(s, i, ui.an.line) end)
        ui.chord = nil
      end
      tip("Takes this chord out; the chord before it plays on in its place.")
    end
  end

  -- Whenever it has been edited, whichever chord is selected. Putting it
  -- back can itself be undone: the changes are kept until the next edit.
  if s.original then
    if pick("Put Back as Suggested", false, 180) then
      Place.auditionStop()
      local orig = s.original
      orig.edited = s
      ui.sugs[ui.pick] = orig
      labelProgression(orig)
      ui.chord = nil
    end
    tip("Undoes every change made to this progression here.\n" ..
        "Restore the Changes brings them back.")
  elseif s.edited then
    if pick("Restore the Changes", false, 180) then
      Place.auditionStop()
      local changed = s.edited
      s.edited = nil
      ui.sugs[ui.pick] = changed
      labelProgression(changed)
      ui.chord = nil
    end
    tip("Brings back the changes Put Back as Suggested took away.")
  end
  ImGui.Dummy(ctx, 0, px(2))
end

local function drawSuggestions()
  heading(3, ui.an.kind == "Melody" and "Chord Progressions" or "Melodies")
  drawOptions()
  ImGui.Dummy(ctx, 0, px(4))

  local w = select(1, ImGui.GetContentRegionAvail(ctx))
  if #ui.sugs == 0 then
    dim("There’s nothing to suggest for this item.")
  end
  for i, s in ipairs(ui.sugs) do
    ImGui.PushID(ctx, "sug" .. i)
    rowStart()
    if button(("%d.  %s"):format(i, s.title), ui.pick == i, math.max(px(160), w * 0.42), true) then
      if ui.pick ~= i then Place.auditionStop(); ui.chord = nil end
      ui.pick = i
    end
    ImGui.PopID(ctx)
    words(s.detail, px(14))
  end

  ImGui.Dummy(ctx, 0, px(4))
  local chosen = ui.sugs[ui.pick]
  if chosen and chosen.chords then drawChordEditor(chosen, w) end
  local band = chosen and ui.chord and chosen.chords and chosen.chords[ui.chord]
  pianoRoll(ui.src.notes, chosen and chosen.notes, ui.an.beats, ui.src.barBeats,
            math.max(160, w), px(110), ui.playhead, band)
  -- Which notes are which, in words as well as colour - and in lightness,
  -- which reads whatever colours a person sees.
  dim("In the roll, the darker notes are the source and the bright ones the suggestion" ..
      (band and "; the shaded stretch is the chord being changed." or "."))

  ImGui.Dummy(ctx, 0, px(2))
  if not chosen then return end
  rowStart()
  if button("Insert on New Track", false, 170) then
    Place.auditionStop()
    local r = Place.insert(chosen.notes, ui.an.beats, ui.src, chosen.trackName)
    if r == Place.OK then say("Inserted on a new track under “" .. ui.src.name .. "”.")
    else say("REAPER couldn’t make the item. Try again.", true) end
  end
  tip("Puts it on a new track under the source, lined up bar for bar, with a copy\n" ..
      "of the source track’s instrument so it plays straight away. It’s one undo step.")

  local playing = Place.auditioning()
  if button(playing and "Stop" or "Audition", playing, 96) then
    if playing then Place.auditionStop()
    else
      local r = Place.auditionStart(chosen.notes, ui.an.beats, ui.src)
      if r ~= Place.OK then say("REAPER couldn’t start the audition. Try again.", true) end
    end
  end
  tip("Plays the project from the source’s first bar with this suggestion on a\n" ..
      "temporary track. Stopping — here or in REAPER — takes the track away.")

  if button("More Ideas", false, 110, false, px(16)) and letGo("More ideas") then
    ui.variation = ui.variation + 1
    ui.pick = 1
    touched()
  end
  tip("Another set of suggestions. The first set is always the best-scoring.")
  if ui.variation > 0 then
    if button("Back to the First Set", false, 170) and letGo("Going back to the first set") then
      ui.variation, ui.pick = 0, 1
      touched()
    end
  end
end

-- The View menu: Text Size, with the Mac's own zoom keys beside each size.
local SHORTCUT_KEY = (reaper.GetOS():find("OSX") or reaper.GetOS():find("mac")) and "Cmd" or "Ctrl"
local function menuBar()
  if not ImGui.BeginMenuBar(ctx) then return end
  if ImGui.BeginMenu(ctx, "View") then
    for i, size in ipairs(TEXT_SIZES) do
      local keys = (i == 1 and SHORTCUT_KEY .. "+0") or nil
      if ImGui.MenuItem(ctx, ("Text Size %d%%"):format(size), keys, st.textSize == i) then
        setTextSize(i)
      end
    end
    ImGui.Separator(ctx)
    if ImGui.MenuItem(ctx, "Bigger Text", SHORTCUT_KEY .. "+=", false, st.textSize < #TEXT_SIZES) then
      setTextSize(st.textSize + 1)
    end
    if ImGui.MenuItem(ctx, "Smaller Text", SHORTCUT_KEY .. "+-", false, st.textSize > 1) then
      setTextSize(st.textSize - 1)
    end
    ImGui.EndMenu(ctx)
  end
  ImGui.EndMenuBar(ctx)
end

-- Cmd (Ctrl on Windows) with =, - or 0, as in every Mac app that zooms.
local function zoomKeys()
  if ImGui.GetKeyMods(ctx) & ImGui.Mod_Shortcut == 0 then return end
  if ImGui.IsKeyPressed(ctx, ImGui.Key_Equal) or ImGui.IsKeyPressed(ctx, ImGui.Key_KeypadAdd) then
    setTextSize(st.textSize + 1)
  elseif ImGui.IsKeyPressed(ctx, ImGui.Key_Minus) or ImGui.IsKeyPressed(ctx, ImGui.Key_KeypadSubtract) then
    setTextSize(st.textSize - 1)
  elseif ImGui.IsKeyPressed(ctx, ImGui.Key_0) then
    setTextSize(1)
  end
end

-- What just happened, at the top of the window where it cannot fall off
-- the bottom of the screen, and there until it is dismissed or replaced:
-- Apple asks for nothing that goes away on a timer.
local function drawMessage()
  if ui.status == "" then return end
  rowStart()
  words(ui.status, nil, ui.warn and WARN or DIM)
  if button("Dismiss", false, nil, false, px(16)) then say("") end
end

local function frame()
  if ui.dirty then rebuild() end
  ui.playhead = Place.auditionTick()

  menuBar()
  zoomKeys()
  drawMessage()
  drawSource()
  if ui.src then
    stepGap()
    drawKey()
    stepGap()
    drawSuggestions()
  end
end

------------------------------------------------------------------------------
-- Running
------------------------------------------------------------------------------

local sectionID, cmdID

-- The window's title names what it is working on, which is also what a
-- screen reader can read of it. "###" keeps the window the same window
-- whatever the title says.
local function title()
  return TITLE .. (ui.src and (" — " .. ui.src.name) or "") .. "###" .. TITLE
end

local function loop()
  ImGui.SetNextWindowSize(ctx, 900, 720, ImGui.Cond_FirstUseEver)
  -- Never so small that a button is cut off: as wide as the widest one at
  -- this text size, and tall enough for the message and step 1.
  ImGui.SetNextWindowSizeConstraints(ctx, px(400), px(300), 100000, 100000)
  ImGui.SetNextWindowBgAlpha(ctx, 1.0)
  pushTheme()
  pushSize()
  local visible, open = ImGui.Begin(ctx, title(), true, ImGui.WindowFlags_MenuBar)
  if visible then
    frame()
    ImGui.End(ctx)
  end
  popSize()
  popTheme()   -- outside the visible test: a push always needs its pop

  -- Escape lets go of the keyboard's place, or a menu, first (ImGui does
  -- that itself); only with nothing held does it close the window.
  local escape = ImGui.IsKeyPressed(ctx, ImGui.Key_Escape) and not ui.held
  ui.held = ImGui.IsAnyItemFocused(ctx) or ImGui.IsPopupOpen(ctx, "", ImGui.PopupFlags_AnyPopup)
  if (not open or escape) and not letGo("Closing the window") then open, escape = true, false end
  if open and not escape then
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
  -- The keyboard alone: Tab and the arrow keys move between controls, Space
  -- or Return presses one, and a ring shows where you are.
  ctx = ImGui.CreateContext(TITLE, ImGui.ConfigFlags_NavEnableKeyboard)
  for i, size in ipairs(TEXT_SIZES) do
    local points = math.floor(BASE_TEXT * size / 100 + 0.5)
    fonts[i] = ImGui.CreateFont("sans-serif", points)
    bold[i] = ImGui.CreateFont("sans-serif", points, ImGui.FontFlags_Bold)
    ImGui.Attach(ctx, fonts[i])
    ImGui.Attach(ctx, bold[i])
  end
  setTextSize(st.textSize)
  load(true)
  reaper.defer(loop)
end

main()
