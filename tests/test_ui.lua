--[[ The whole script, headless.

     ReaImGui only exists inside REAPER, so a mock stands in its place and
     the real "Midi Suggester.lua" is run against it and the mocked REAPER.
     It cannot say the window looks right. It can say that nothing raises,
     that no call reaches a ReaImGui function that does not exist, that every
     push is popped, that every button wears the dark ink, and that clicking
     every button in every state leaves the script working.

       lua5.4 tests/test_ui.lua
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local C = dofile(HERE .. "/check.lua")
local ok, eq = C.ok, C.eq
local P = dofile(HERE .. "/reaper_mock.lua")
local F = dofile(HERE .. "/fixtures.lua")
local SCRIPT = C.SCRIPTS .. "Midi Suggester.lua"

------------------------------------------------------------------------------
-- A ReaImGui that records
------------------------------------------------------------------------------

local g = {}
local function resetFrame()
  g.idDepth, g.colDepth, g.colStack = 0, 0, {}
  g.buttons, g.ink, g.texts, g.checkboxes, g.headings = {}, {}, {}, {}, {}
  g.rects, g.textInk, g.widths, g.menu, g.order = {}, {}, {}, {}, {}
  g.varDepth, g.fontDepth, g.font, g.inkBars = 0, 0, nil, 0
  g.theme, g.begun, g.fontStack, g.varStack, g.tips, g.lines = {}, false, {}, {}, {}, {}
  g.headingFonts, g.boxes, g.lineX, g.same, g.overflow = {}, {}, 0, false, nil
end
resetFrame()

local ImGui = {}
local consts = { "Col_Text", "Col_TextDisabled", "Col_WindowBg", "Col_PopupBg", "Col_Border",
  "Col_FrameBg", "Col_FrameBgHovered", "Col_FrameBgActive", "Col_TitleBg", "Col_TitleBgActive",
  "Col_TitleBgCollapsed", "Col_Button", "Col_ButtonHovered", "Col_ButtonActive", "Col_CheckMark",
  "Col_SliderGrab", "Col_SliderGrabActive", "Col_Separator", "Col_ScrollbarBg", "Col_ScrollbarGrab",
  "Col_ScrollbarGrabHovered", "Col_ScrollbarGrabActive", "Cond_FirstUseEver", "Key_Escape",
  "Col_NavHighlight", "StyleVar_FramePadding", "StyleVar_ItemSpacing", "StyleVar_ItemInnerSpacing",
  "Key_Equal", "Key_KeypadAdd", "Key_Minus", "Key_KeypadSubtract", "Key_0",
  "Col_MenuBarBg", "Col_Header", "Col_HeaderHovered", "Col_HeaderActive", "Col_ResizeGrip",
  "Col_ResizeGripHovered", "Col_ResizeGripActive", "StyleVar_FrameBorderSize" }
for i, k in ipairs(consts) do ImGui[k] = i end
local colName = {}
for _, k in ipairs(consts) do if k:find("^Col_") then colName[ImGui[k]] = k end end
-- Flags are bits, as in ReaImGui.
ImGui.WindowFlags_MenuBar = 1024
ImGui.ConfigFlags_NavEnableKeyboard = 1
ImGui.Mod_Shortcut = 4096
ImGui.FontFlags_Bold = 1
ImGui.PopupFlags_AnyPopup = 3072

local function effective(idx)
  for i = #g.colStack, 1, -1 do if g.colStack[i].idx == idx then return g.colStack[i].col end end
end

-- ImGui_Context ctx = CreateContext(string label, optional integer config_flags)
function ImGui.CreateContext(name, flags) g.configFlags = flags; return { name = name } end
-- ImGui_Font font = CreateFont(string family_or_file, integer size, optional integer flags)
function ImGui.CreateFont(family, size, flags)
  if type(family) ~= "string" or math.type(size) ~= "integer" then error("CreateFont(family, size)") end
  return { family = family, size = size, bold = flags and flags & ImGui.FontFlags_Bold ~= 0 }
end
function ImGui.Attach(_, obj) obj.attached = true end
function ImGui.PushFont(_, font)
  if not (font and font.attached) then error("PushFont with a font that is not attached") end
  g.fontDepth = g.fontDepth + 1
  g.fontStack[#g.fontStack + 1] = font
  -- The window's own text size is the first font pushed in a frame.
  if g.fontDepth == 1 then g.font = font end
end
function ImGui.PopFont()
  g.fontDepth = g.fontDepth - 1
  g.fontStack[#g.fontStack] = nil
end
function ImGui.PushStyleVar(_, idx, a, b)
  if type(idx) ~= "number" or type(a) ~= "number" then error("PushStyleVar(ctx, var, val1, val2)") end
  if idx == ImGui.StyleVar_FramePadding then g.framePad = b end
  if idx == ImGui.StyleVar_ItemSpacing then g.spacing = a end
  if idx == ImGui.StyleVar_ItemInnerSpacing then g.inner = a end
  g.varStack[#g.varStack + 1] = { idx = idx, a = a }
  g.varDepth = g.varDepth + 1
end
function ImGui.PopStyleVar(_, n)
  for _ = 1, (n or 1) do g.varStack[#g.varStack] = nil end
  g.varDepth = g.varDepth - (n or 1)
end
local function styleVar(idx)
  for i = #g.varStack, 1, -1 do if g.varStack[i].idx == idx then return g.varStack[i].a end end
end
function ImGui.SetNextWindowSize() end
-- SetNextWindowSizeConstraints(ctx, size_min_w, size_min_h, size_max_w, size_max_h, optional custom_callback)
function ImGui.SetNextWindowSizeConstraints(_, minW, minH, maxW, maxH)
  for _, v in ipairs({ minW, minH, maxW, maxH }) do
    if type(v) ~= "number" then error("SetNextWindowSizeConstraints takes four numbers") end
  end
  g.minW, g.minH = minW, minH
end
-- bool IsAnyItemFocused(ctx); bool IsPopupOpen(ctx, string str_id, optional integer flags)
function ImGui.IsAnyItemFocused() return g.focused or false end
function ImGui.IsPopupOpen(_, id, flags)
  if type(id) ~= "string" then error("IsPopupOpen(ctx, str_id, flags)") end
  return (flags == ImGui.PopupFlags_AnyPopup and g.popup) or false
end
function ImGui.SetNextWindowBgAlpha(_, a) assert(a >= 0 and a <= 1) end
function ImGui.Begin(_, name, _, flags)
  g.windowFlags, g.title, g.begun = flags, name, true
  return not g.collapsed, not g.closeClick
end
function ImGui.End() end
function ImGui.IsKeyPressed(_, key) return g.keys and g.keys[key] or false end
function ImGui.GetKeyMods() return g.mods or 0 end
-- Text measured as a sans-serif's average: about half its size per letter.
function ImGui.CalcTextSize(_, s) local px = g.font and g.font.size or 13; return #s * px * 0.55, px end
-- Where each item would sit, to catch a row that runs off the window's edge
-- (the mock's window is GetContentRegionAvail's 860 wide).
local AVAIL = 860
local function layout(label, w, wraps)
  local x = g.same and (g.lineX + g.sameGap) or 0
  g.same = false
  if wraps then w = math.min(w, AVAIL - x) end
  g.lineX = x + w
  if x + w > AVAIL + 0.5 or (wraps and x > AVAIL - 1) then g.overflow = g.overflow or label end
end
function ImGui.SameLine(_, _, spacing)
  g.same = true
  g.sameGap = (spacing and spacing >= 0) and spacing or (g.spacing or 8)
end
function ImGui.SeparatorText(_, s)
  local f = g.fontStack[#g.fontStack]
  g.headingFonts[#g.headingFonts + 1] = f and f.bold or false
  layout(s, ImGui.CalcTextSize(nil, s))
  g.headings[#g.headings + 1] = s
  g.order[#g.order + 1] = "heading:" .. s
end
function ImGui.Separator() end
local function text(s, wraps)
  if type(s) ~= "string" then error("Text got a " .. type(s)) end
  g.texts[#g.texts + 1] = s
  g.textInk[#g.texts] = effective(ImGui.Col_Text) or 0xDDE1E7FF
  g.order[#g.order + 1] = "text:" .. s
  layout(s, ImGui.CalcTextSize(nil, s), wraps)
end
function ImGui.Text(_, s) text(s) end
function ImGui.TextWrapped(_, s) text(s, true) end
function ImGui.BeginMenuBar() g.inMenuBar = true; return true end
function ImGui.EndMenuBar() g.inMenuBar = false end
function ImGui.BeginMenu(_, label)
  if not g.inMenuBar then error("BeginMenu outside the menu bar") end
  g.menuOpen = label
  return true
end
function ImGui.EndMenu() g.menuOpen = nil end
-- bool clicked = MenuItem(ctx, label, optional shortcut, optional p_selected, optional enabled)
function ImGui.MenuItem(_, label, shortcut, selected, enabled)
  if not g.menuOpen then error("MenuItem outside a menu") end
  g.menu[#g.menu + 1] = { label = label, shortcut = shortcut, selected = selected,
                          enabled = enabled ~= false }
  return g.menuClick == label and enabled ~= false
end
function ImGui.Dummy(_, w) layout("a gap", w or 0) end
function ImGui.PushID(_, v)
  if v == nil then error("PushID with nil") end
  g.idDepth = g.idDepth + 1
end
function ImGui.PopID()
  g.idDepth = g.idDepth - 1
  if g.idDepth < 0 then error("PopID without a push") end
end
function ImGui.PushStyleColor(_, idx, col)
  if type(idx) ~= "number" then error("PushStyleColor with a " .. type(idx) .. " index") end
  if type(col) ~= "number" or col % 256 == 0 then error("style colour must be an opaque 0xRRGGBBAA") end
  g.colStack[#g.colStack + 1] = { idx = idx, col = col }
  g.colDepth = g.colDepth + 1
  if not g.begun then g.theme[colName[idx] or idx] = col end
end
function ImGui.PopStyleColor(_, n)
  for _ = 1, (n or 1) do g.colStack[#g.colStack] = nil end
  g.colDepth = g.colDepth - (n or 1)
  if g.colDepth < 0 then error("PopStyleColor without a push") end
end
function ImGui.Button(_, label, w)
  if type(label) ~= "string" then error("Button label is a " .. type(label)) end
  g.buttons[#g.buttons + 1] = label
  g.ink[#g.buttons] = { bg = effective(ImGui.Col_Button), text = effective(ImGui.Col_Text) }
  g.widths[#g.buttons] = w or 0
  g.order[#g.order + 1] = "button:" .. label
  local scale = (g.font and g.font.size or 13) / 13
  layout(label, (w and w > 0) and w or ImGui.CalcTextSize(nil, (label:gsub("##.*$", ""))) + 16 * scale)
  if g.clickTarget == #g.buttons then g.clicked = label; return true end
  return false
end
function ImGui.Checkbox(_, label, v)
  g.checkboxes[#g.checkboxes + 1] = label
  g.boxes[#g.boxes + 1] = { edge = effective(ImGui.Col_Border), size = styleVar(ImGui.StyleVar_FrameBorderSize) or 0,
                            fill = g.theme.Col_FrameBg }
  local h = (g.font and g.font.size or 13) + 2 * (g.framePad or 0)
  layout(label, h + (g.inner or 0) + ImGui.CalcTextSize(nil, label))
  if g.toggle then return true, not v end
  return false, v
end
function ImGui.IsItemHovered() return true end
function ImGui.SetTooltip(_, s)
  if type(s) ~= "string" then error("tooltip is a " .. type(s)) end
  g.tips[#g.tips + 1] = s
end
function ImGui.GetContentRegionAvail() return 860, 400 end
function ImGui.GetWindowDrawList() return {} end
function ImGui.GetCursorScreenPos() return 0, 0 end
function ImGui.GetItemRectMin() return 0, 0 end
function ImGui.GetItemRectMax() return 100, 28 end
function ImGui.InvisibleButton(_, id, w) layout(id, w); return false end
function ImGui.DrawList_AddRectFilled(_, x1, y1, x2, y2, col)
  if x2 < x1 or y2 < y1 then error("rect is inside out") end
  g.rects[#g.rects + 1] = col
  if col == 0x14171CFF then g.inkBars = (g.inkBars or 0) + 1 end
end
function ImGui.DrawList_AddLine(_, x1, y1, x2, y2, col, thick)
  for _, v in ipairs({ x1, y1, x2, y2, col }) do
    if type(v) ~= "number" then error("line argument is a " .. type(v)) end
  end
  g.lines[#g.lines + 1] = { col = col, thick = thick or 1, x = x1 }
end
setmetatable(ImGui, { __index = function(_, k)
  error("the script called ImGui." .. tostring(k) .. ", which the mock does not have")
end })

------------------------------------------------------------------------------
-- REAPER, and running the script
------------------------------------------------------------------------------

local tmp = os.tmpname()
os.remove(tmp)
os.execute('mkdir -p "' .. tmp .. '"')
local shim = assert(io.open(tmp .. "/imgui.lua", "w"))
shim:write("return function(version) return _G.__MOCK_IMGUI end\n")
shim:close()
_G.__MOCK_IMGUI = ImGui

P.install()
local deferred, atexitFn
local function absolute(path)
  if path:match("^/") then return path end
  return (os.getenv("PWD") or ".") .. "/" .. path
end
reaper.ImGui_GetBuiltinPath = function() return tmp end
reaper.MB = function(msg) error("the script gave up: " .. tostring(msg)) end
reaper.get_action_context = function() return true, absolute(SCRIPT), 0, 1, 0, 0, 0 end
reaper.defer = function(f) deferred = f end
reaper.atexit = function(f) atexitFn = f end
reaper.set_action_options = function() end
reaper.SetToggleCommandState = function() end
reaper.RefreshToolbar2 = function() end

local function start()
  deferred, atexitFn = nil, nil
  dofile(SCRIPT)
end

-- One frame, optionally clicking the n-th button drawn in it.
local function frame(click, toggle)
  resetFrame()
  if not deferred then error("the window has closed") end
  g.clickTarget, g.clicked, g.toggle = click, nil, toggle
  local f = deferred
  deferred = nil
  f()
  if g.idDepth ~= 0 then error("PushID left unbalanced: " .. g.idDepth) end
  if g.colDepth ~= 0 then error("PushStyleColor left unbalanced: " .. g.colDepth) end
  if g.varDepth ~= 0 then error("PushStyleVar left unbalanced: " .. g.varDepth) end
  if g.fontDepth ~= 0 then error("PushFont left unbalanced: " .. g.fontDepth) end
  return g.clicked
end

local function has(list, text)
  for _, t in ipairs(list) do if t:find(text, 1, true) then return true end end
  return false
end

local function buttonIndex(label)
  for i, b in ipairs(g.buttons) do if b == label then return i end end
end
local function click(label)
  frame()
  local i = buttonIndex(label)
  if not i then error("no button called " .. label) end
  frame(i)
  frame()
end

-- The editor's chord buttons come straight after the list of suggestions.
local function chordButtons()
  local last = 0
  for i, b in ipairs(g.buttons) do if b:match("^%d%.  ") then last = i end end
  local out = {}
  for i = last + 1, #g.buttons do
    local b = g.buttons[i]
    if b == "Put Back as Suggested" or b == "Insert on New Track" or b:match("^Swap") then break end
    out[#out + 1] = { i = i, label = b }
    if #out > 64 then break end
  end
  return out
end
local function clickChord(n)
  frame()
  local c = chordButtons()[n]
  if not c then error("no chord " .. n) end
  frame(c.i)
  frame()
end
local function count(label)
  local n = 0
  for _, b in ipairs(g.buttons) do if b == label then n = n + 1 end end
  return n
end

local function project(fixture, name)
  P.reset()
  local tr = P.track("Piano", 1)
  local item = P.item(tr, 0, 16, F[fixture], name or fixture)
  P.selected = { item }
  return tr
end

-- Every button, every frame: ink on it, and the chosen ones in the accent.
local function checkInk(tag)
  for i, b in ipairs(g.buttons) do
    eq(g.ink[i].text, 0x14171CFF, tag .. ": button '" .. b .. "' wears the dark ink")
  end
end

------------------------------------------------------------------------------
-- Starting with nothing selected
------------------------------------------------------------------------------

P.reset()
start()
ok(deferred ~= nil, "the script defers a frame")
frame()
eq(#g.buttons, 1, "with nothing read there is one button")
ok(has(g.texts, "Import a .mid file"), "and it says what to do")
eq(#g.headings, 1, "only the first step is shown: no dead controls")
click("Use Selected Items")
ok(has(g.texts, "Select a MIDI item first."), "pressing it with nothing selected says so")

------------------------------------------------------------------------------
-- A melody
------------------------------------------------------------------------------

local piano = project("twinkle", "Twinkle")
click("Use Selected Items")
eq(g.headings[3], "Chord Progressions", "a melody gets chord progressions")
ok(has(g.texts, "Sounds like C Major"), "in C major")
ok(has(g.buttons, "1.  I  IV  I  IV  I  V  I"), "and Twinkle's songbook harmony first")
checkInk("melody")
ok(has(g.checkboxes, "Bass Note"), "the bass box is there for chords")

-- The roll shows both layers: the source in grey and the suggestion in yellow.
do
  local grey, yellow = false, false
  for _, c in ipairs(g.rects) do
    if c == 0x6D7581FF then grey = true end
    if c == 0xFFF200FF then yellow = true end
  end
  ok(grey and yellow, "the roll draws the source and the suggestion")
end

-- Insert puts it on a new track under the source.
click("Insert on New Track")
eq(#P.tracks, 2, "a new track")
eq(P.tracks[2].name, "Chords: C F C F C G C", "named for its chords")
ok(#P.tracks[2].items[1].take.notes > 0, "with the chords on it")
ok(has(g.texts, "Inserted on a new track"), "and says so")

-- Audition makes a temporary track and plays; Stop takes it away.
click("Audition")
ok(P.playing, "audition plays")
eq(#P.tracks, 3, "on a temporary track")
frame()
ok(has(g.buttons, "Stop"), "the button turns into Stop")
click("Stop")
ok(not P.playing, "stopped")
eq(#P.tracks, 2, "and the temporary track gone")

-- More Ideas gives another set, and there is a way back.
do
  frame()
  local first = {}
  for _, b in ipairs(g.buttons) do if b:match("^%d%.") then first[#first + 1] = b end end
  click("More Ideas")
  local second = {}
  for _, b in ipairs(g.buttons) do if b:match("^%d%.") then second[#second + 1] = b end end
  ok(table.concat(first, "|") ~= table.concat(second, "|"), "more ideas are different ideas")
  ok(has(g.buttons, "Back to the First Set"), "with a way back")
  click("Back to the First Set")
  local third = {}
  for _, b in ipairs(g.buttons) do if b:match("^%d%.") then third[#third + 1] = b end end
  eq(table.concat(third, "|"), table.concat(first, "|"), "which brings the first set back")
  ok(not has(g.buttons, "Back to the First Set"), "and hides itself")
end

-- Changing the key re-suggests in the new key.
click("G")
ok(has(g.texts, "Sounds like C Major"), "the detected key is still reported")
ok(not has(g.buttons, "1.  I  IV  I  IV  I  V  I"), "but suggestions follow the key chosen")
click("C")

-- Telling it the melody is chords.
click("Chords")
eq(g.headings[3], "Melodies", "overridden to chords, it suggests melodies")
ok(has(g.texts, "(it looked like a melody)"), "and remembers what it found")
click("Melody")
eq(g.headings[3], "Chord Progressions", "and back")

------------------------------------------------------------------------------
-- Editing a progression chord by chord
------------------------------------------------------------------------------

-- Twinkle, one chord a bar, triads: C F C.
local function twinkleCFC()
  P.ext = {}
  project("twinkle", "Twinkle")
  start()
  click("Use Selected Items")
  click("1 a Bar")
  click("Triads")
  frame()
  ok(has(g.buttons, "1.  I  IV  I"), "set up: C F C first")
end

do
  twinkleCFC()
  ok(has(g.texts, "Click a chord to change it"), "the chosen progression's chords can be changed")
  eq(count("C"), 3, "the key's C and the progression's two")
  ok(not has(g.texts, "Swap"), "nothing to swap until a chord is chosen")
  ok(not has(g.buttons, "Split"), "and no Split or Remove yet")

  clickChord(2)
  ok(has(g.texts, "Swap F for"), "choosing F offers what to swap it for")
  ok(has(g.buttons, "Split") and has(g.buttons, "Remove"), "and Split and Remove")
  -- The roll shows which chord is being edited.
  local band = false
  for _, c in ipairs(g.rects) do if c == 0x2A2F37FF then band = true end end
  ok(band, "the roll marks the chord being edited")

  -- Swap F for D minor.
  click("Dmin")
  ok(has(g.buttons, "1.  I  ii  I   (edited)"), "the progression now reads I ii I, marked edited")
  ok(has(g.texts, "C  Dmin  C      fits"), "with its chord names")
  ok(has(g.buttons, "Put Back as Suggested"), "and can be put back")
  ok(not has(g.buttons, "2.  I  ii  I   (edited)"), "only the chosen progression changed")

  -- The bass box re-voices without losing the edit.
  frame(nil, true)
  frame()
  ok(has(g.buttons, "1.  I  ii  I   (edited)"), "toggling the bass keeps the edit")
  frame(nil, true)

  -- Insert takes the edited progression.
  click("Insert on New Track")
  eq(P.tracks[2].name, "Chords: C Dmin C", "the edited progression is what is inserted")

  -- Split the last C: a passing chord appears in its second half.
  clickChord(3)
  ok(has(g.texts, "Swap C for"), "the last C chosen")
  click("Split")
  local row = {}
  for _, c in ipairs(chordButtons()) do row[#row + 1] = c.label end
  eq(#row >= 4 and row[1] .. " " .. row[2] .. " " .. row[3] or "", "C Dmin C", "split keeps the first three")
  ok(row[4] and row[4] ~= "C" and row[4] ~= "Split", "and adds a different chord after them: " .. tostring(row[4]))

  -- Put it back.
  click("Put Back as Suggested")
  ok(has(g.buttons, "1.  I  IV  I"), "put back as suggested")
  ok(not has(g.buttons, "Put Back as Suggested"), "and nothing left to put back")

  -- Remove F: the Cs either side join, leaving one chord - which then
  -- cannot be removed, so Remove is not drawn.
  clickChord(2)
  click("Remove")
  clickChord(1)
  ok(has(g.buttons, "1.  I   (edited)"), "C F C less F is one C")
  ok(not has(g.buttons, "Remove"), "the only chord has no Remove")
  ok(has(g.buttons, "Split"), "but can still be split")

  -- A chord split down to a beat has no Split.
  for _ = 1, 4 do if has(g.buttons, "Split") then click("Split"); clickChord(1) end end
  frame()
  ok(not has(g.buttons, "Split"), "a chord a beat long cannot be split, and the button goes")

  -- Choosing another suggestion leaves the editor closed.
  click("Put Back as Suggested")
  clickChord(2)
  frame()
  local second
  for _, b in ipairs(g.buttons) do if b:match("^2%.") then second = b end end
  click(second)
  ok(not has(g.texts, "Swap"), "choosing another progression closes the chord editor")
end

-- Auto timing is offered and gives chords of different lengths.
do
  P.ext = {}
  project("minorTune", "Tune")
  start()
  click("Use Selected Items")
  click("Auto")
  ok(has(g.buttons, "1.  i  iv  V  i"), "the minor tune, Auto: Amin Dmin E Amin")
  local row = {}
  for _, c in ipairs(chordButtons()) do
    if c.label == "Split" then break end
    row[#row + 1] = c.label
  end
  eq(table.concat(row, " "), "Amin Dmin E Amin", "the chord row follows it")
end

------------------------------------------------------------------------------
-- A chord progression
------------------------------------------------------------------------------

project("popChords", "Loop")
click("Use Selected Items")
eq(g.headings[3], "Melodies", "chords get melodies")
ok(has(g.texts, "Chords:   C   G   Amin   F"), "and the chords are named")
ok(has(g.buttons, "1.  Melody 1"), "melodies are offered")
ok(not has(g.checkboxes, "Bass Note"), "no bass box for melodies: no dead controls")
checkInk("chords")
click("Insert on New Track")
ok(P.tracks[2].name:find("^Melody 1"), "a melody track")

------------------------------------------------------------------------------
-- The sweep: every button, in every state
------------------------------------------------------------------------------

local swept = {}
-- Each state is a fixture and what to do after reading it; the sweep
-- clicks every button of that state, each from a fresh start, so a click
-- that changes the view (Melody to Chords, say) cannot hide the rest.
local STATES = {
  { "twinkle" }, { "popChords" }, { "arpeggios" }, { "minorTune" },
  -- The chord editor, open on a chord, and after an edit.
  { "twinkle", function() click("1 a Bar"); click("Triads"); clickChord(2) end },
  { "twinkle", function() click("1 a Bar"); click("Triads"); clickChord(2); click("Dmin"); clickChord(3) end },
  { "minorTune", function() click("Auto"); click("Colourful"); clickChord(2) end },
}
for _, state in ipairs(STATES) do
  local fixture, prepare = state[1], state[2]
  local function ready()
    P.ext = {}
    project(fixture)
    start()
    click("Use Selected Items")
    if prepare then prepare() end
    frame()
  end
  ready()
  local n = #g.buttons
  for i = 1, n do
    ready()
    local label = g.buttons[i]
    local okRun, err = pcall(frame, i)
    ok(okRun, fixture .. ": clicking '" .. tostring(label) .. "' - " .. tostring(err))
    frame()
    checkInk(fixture .. " after " .. tostring(label))
    ok(not g.overflow, fixture .. " after " .. tostring(label) .. ": nothing runs off the window's edge: "
       .. tostring(g.overflow))
    if label then swept[label] = true end
    if P.playing then click("Stop") end
  end
  -- Every checkbox both ways.
  frame(nil, true)
  frame(nil, true)
end
for _, label in ipairs({ "Use Selected Items", "Melody", "Chords", "C", "Cb", "Major", "Mixolydian",
                         "2 a Bar", "1 per 2 Bars", "Triads", "Colourful", "Sparse", "Busy",
                         "Low", "High", "Insert on New Track", "Audition", "More Ideas",
                         "Auto", "Split", "Remove", "Put Back as Suggested", "Dmin" }) do
  ok(swept[label], "the sweep reached '" .. label .. "'")
end

------------------------------------------------------------------------------
-- Settings outlive the window
------------------------------------------------------------------------------

project("twinkle")
start()
click("Use Selected Items")
click("Sevenths")
click("1 a Bar")
frame(nil, true)            -- the bass box off
atexitFn()
local saved = P.ext["MidiSuggester:state"]
ok(saved and saved:find("colour=2") and saved:find("rhythm=2") and saved:find("bass=0"),
   "saved: " .. tostring(saved))
start()
click("Use Selected Items")
ok(has(g.buttons, "1.  I  vi7  IVmaj7  I"), "reloaded with sevenths, one a bar")
do
  -- Nonsense in the saved state is put back in range, not trusted.
  P.ext["MidiSuggester:state"] = "colour=99;rhythm=-4;bass=7;density=x;register=3.5"
  start()
  click("Use Selected Items")
  frame()
  atexitFn()
  eq(P.ext["MidiSuggester:state"], "rhythm=1;colour=3;bass=1;density=2;register=3;textSize=1",
     "nonsense in the saved state is put back in range, and an unreadable value ignored")
end

------------------------------------------------------------------------------
-- Apple's Human Interface Guidelines (decision 0009)
------------------------------------------------------------------------------

-- WCAG's contrast ratio, which Apple's Accessibility page uses.
local function luminance(col)
  local function ch(v)
    v = v / 255
    return v <= 0.03928 and v / 12.92 or ((v + 0.055) / 1.055) ^ 2.4
  end
  local r = math.floor(col / 16777216) % 256
  local gg = math.floor(col / 65536) % 256
  local b = math.floor(col / 256) % 256
  return 0.2126 * ch(r) + 0.7152 * ch(gg) + 0.0722 * ch(b)
end
local function contrast(a, b)
  local la, lb = luminance(a), luminance(b)
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05)
end
local GROUND = 0x23272EFF

do
  P.ext = {}
  project("twinkle", "Twinkle")
  start()
  frame()
  ok(g.configFlags and g.configFlags & ImGui.ConfigFlags_NavEnableKeyboard ~= 0,
     "the keyboard alone can move through the window: keyboard navigation is on")
  ok(g.windowFlags and g.windowFlags & ImGui.WindowFlags_MenuBar ~= 0, "the window has a menu bar")
  eq(g.font and g.font.size, 13, "text starts at the Mac's default 13 points")
  eq(13 + 2 * (g.framePad or 0), 28, "a control is 28 points tall, Apple's Mac default")
  eq(g.spacing, 12, "with 12 points between controls")

  -- Every line of text, in every state the window has, is 7:1 against the
  -- ground; every button's ink is 7:1 against its fill.
  click("Use Selected Items")
  click("Insert on New Track")
  local worst, which = 99, nil
  for i, t in ipairs(g.texts) do
    local c = contrast(g.textInk[i], GROUND)
    if c < worst then worst, which = c, t end
  end
  ok(worst >= 7, ("every text is 7:1 on the ground (lowest %.2f: %s)"):format(worst, tostring(which)))
  for i, b in ipairs(g.buttons) do
    ok(contrast(g.ink[i].text, g.ink[i].bg or 0xA9AFBAFF) >= 7, "button '" .. b .. "' is 7:1 ink on fill")
  end
  P.ext = {}
  P.reset()
  start()
  click("Use Selected Items")
  local warned = false
  for i, t in ipairs(g.texts) do
    if t:find("Select a MIDI item") then
      warned = true
      ok(contrast(g.textInk[i], GROUND) >= 7, "a warning is 7:1 too, not the house red")
    end
  end
  ok(warned, "the warning was shown")

  -- The message is at the top, above step 1, and stays until dismissed.
  local msg, first
  for i, o in ipairs(g.order) do
    if o:find("Select a MIDI item", 1, true) then msg = msg or i end
    if o:find("^heading:") then first = first or i end
  end
  ok(msg and first and msg < first, "the message sits above the first step")
  for _ = 1, 20 do frame() end
  ok(has(g.texts, "Select a MIDI item first."), "and is still there twenty frames later")
  click("Dismiss")
  ok(not has(g.texts, "Select a MIDI item first."), "until Dismiss takes it away")
end

-- Chosen is not shown by colour alone: each chosen button has an ink bar.
do
  P.ext = {}
  project("twinkle", "Twinkle")
  start()
  click("Use Selected Items")
  local chosen = 0
  for i in ipairs(g.buttons) do if g.ink[i].bg == 0xFFF200FF then chosen = chosen + 1 end end
  ok(chosen >= 5, "several buttons are chosen: " .. chosen)
  eq(g.inkBars, chosen, "and each carries a bar as well as the accent")
end

-- Text Size, from the View menu and the keys.
do
  P.ext = {}
  project("twinkle", "Twinkle")
  start()
  click("Use Selected Items")
  local labels = {}
  for _, m in ipairs(g.menu) do labels[#labels + 1] = m.label end
  eq(table.concat(labels, "|"), "Text Size 100%|Text Size 125%|Text Size 150%|Text Size 200%|Bigger Text|Smaller Text",
     "the View menu offers four sizes, bigger and smaller")
  local before = {}
  for i, b in ipairs(g.buttons) do before[b] = before[b] or g.widths[i] end
  g.menuClick = "Text Size 200%"
  frame()
  g.menuClick = nil
  frame()
  eq(g.font.size, 26, "200% is 26-point text")
  eq(13 * 2 + 2 * g.framePad, 56, "and controls twice as tall")
  local grew = 0
  for i, b in ipairs(g.buttons) do
    if before[b] and before[b] > 0 and g.widths[i] >= 2 * before[b] - 1 then grew = grew + 1 end
  end
  ok(grew > 10, "fixed-width buttons grow with the text: " .. grew)
  for i, b in ipairs(g.buttons) do
    local need = ImGui.CalcTextSize(nil, (b:gsub("##.*$", "")))
    ok(g.widths[i] == 0 or g.widths[i] >= need, "'" .. b .. "' is wide enough for its label at 200%")
  end
  for _, m in ipairs(g.menu) do
    if m.label == "Bigger Text" then ok(not m.enabled, "nothing bigger than 200%") end
  end
  atexitFn()
  ok(P.ext["MidiSuggester:state"]:find("textSize=4"), "the size is remembered")
  start()
  frame()
  eq(g.font.size, 26, "and comes back next time")

  -- Cmd (Ctrl) with -, = and 0.
  g.mods, g.keys = ImGui.Mod_Shortcut, { [ImGui.Key_Minus] = true }
  frame()
  g.mods, g.keys = nil, nil
  frame()
  eq(g.font.size, 20, "Cmd+- makes it smaller")
  g.keys = { [ImGui.Key_Equal] = true }
  frame()
  g.keys = nil
  frame()
  eq(g.font.size, 20, "= alone does nothing: it needs Cmd")
  g.mods, g.keys = ImGui.Mod_Shortcut, { [ImGui.Key_0] = true }
  frame()
  g.mods, g.keys = nil, nil
  frame()
  eq(g.font.size, 13, "Cmd+0 is the actual size")
  P.ext["MidiSuggester:state"] = "textSize=9"
  start()
  frame()
  eq(g.font.size, 26, "a saved size out of range is put back in range")
end


------------------------------------------------------------------------------
-- The final sweep of Apple's Foundations (16 October 2026)
------------------------------------------------------------------------------

local function rgb(col)
  return math.floor(col / 16777216) % 256, math.floor(col / 65536) % 256, math.floor(col / 256) % 256
end

-- The theme: popups a step lighter than the window, every grey blue-shifted,
-- every word on a menu 7:1, every control's edge 3:1.
do
  P.ext = {}
  project("twinkle", "Twinkle")
  start()
  click("Use Selected Items")
  local th = g.theme
  eq(th.Col_PopupBg, 0x2A2F37FF, "menus and tooltips are a step lighter than the window")
  ok(luminance(th.Col_PopupBg) > luminance(th.Col_WindowBg), "lighter, not darker, than the window")
  eq(th.Col_Border, 0x3A404AFF, "with an edge of their own")
  for name, col in pairs(th) do
    local r, gg, b = rgb(col)
    if col ~= 0xFFF200FF then ok(r < gg and gg < b, name .. " is a blue-shifted grey (R < G < B)") end
  end
  for _, name in ipairs({ "Col_MenuBarBg", "Col_Header", "Col_HeaderHovered", "Col_HeaderActive",
                          "Col_ResizeGrip", "Col_ScrollbarGrab" }) do
    ok(th[name], name .. " is the house's, not ImGui's own")
  end
  ok(contrast(th.Col_Text, th.Col_PopupBg) >= 7, "a menu's words are 7:1 on it")
  ok(contrast(th.Col_TextDisabled, th.Col_PopupBg) >= 7, "and so are its keys (Cmd+=), which ImGui writes in TextDisabled")
  for _, name in ipairs({ "Col_MenuBarBg", "Col_HeaderHovered", "Col_HeaderActive" }) do
    ok(contrast(th.Col_Text, th[name]) >= 7, "words are 7:1 on " .. name)
  end
  ok(contrast(th.Col_ScrollbarGrab, th.Col_ScrollbarBg) >= 3, "the scrollbar's thumb is 3:1 on its track")
  ok(contrast(th.Col_ResizeGrip, th.Col_WindowBg) >= 3, "the resize corner is 3:1 on the window")
  ok(contrast(0x6D7581FF, 0x111419FF) >= 3, "the source's notes are 3:1 on the roll")

  -- The Bass Note box has an edge that can be seen before it is ticked.
  local box = g.boxes[1]
  ok(box and box.size >= 1, "the Bass Note box is drawn with an edge")
  ok(box and box.edge and contrast(box.edge, GROUND) >= 3 and contrast(box.edge, box.fill) >= 3,
     "3:1 on the window and on the box's own fill")

  -- Step headings are bold, Apple's Headline style.
  eq(#g.headingFonts, 3, "three headings")
  for i, b in ipairs(g.headingFonts) do ok(b, "heading " .. i .. " is bold") end
  eq(g.font.size, 13, "and the window's own text is still 13 points")

  -- The window's title says what it is working on, and keeps its identity.
  ok(g.title:find("^Midi Suggester — Twinkle###"), "the title names the source: " .. tostring(g.title))

  -- The roll says which notes are which in words, not colour alone.
  ok(has(g.texts, "the darker notes are the source and the bright ones the suggestion"),
     "the roll's notes are told apart in words")

  -- Choices whose names alone do not say what they do have a hint.
  ok(has(g.tips, "The tune decides"), "Auto explains itself")
  ok(has(g.tips, "A chord every bar"), "and so do the other chord rhythms")

  -- Nothing runs off the edge at 200%, in any state the window has.
  g.menuClick = "Text Size 200%"
  frame()
  g.menuClick = nil
  frame()
  ok(not g.overflow, "at 200%, nothing runs off the window's edge: " .. tostring(g.overflow))
  click("More Ideas")
  ok(has(g.buttons, "Back to the First Set") and not g.overflow,
     "nor with Back to the First Set beside More Ideas: " .. tostring(g.overflow))
  click("1 a Bar")
  click("Triads")
  clickChord(2)
  ok(has(g.texts, "Swap ") and not g.overflow,
     "nor with eight alternatives to swap a chord for: " .. tostring(g.overflow))
  ok(has(g.texts, "the shaded stretch is the chord being changed"), "and the shaded stretch is named")
  ok(g.minW == 800 and g.minH == 600, "the window cannot be made too small for its widest button: "
     .. tostring(g.minW) .. "x" .. tostring(g.minH))
  -- The playhead grows with the text.
  click("Audition")
  local thick
  for _, l in ipairs(g.lines) do if l.col == 0xF2F4F7FF then thick = l.thick end end
  eq(thick, 4, "the playhead is twice as thick at 200%")
  click("Stop")
  P.ext = {}
  start()
  frame()
  eq(g.minW, 400, "at 100% the window's least width is 400 points")
end

-- A long message wraps, and Dismiss still fits.
do
  P.ext = {}
  P.reset()
  start()
  click("Use Selected Items")
  ok(not g.overflow, "a message and its Dismiss stay inside the window")
end

-- Escape lets go of what it holds before it closes the window.
do
  P.ext = {}
  project("twinkle")
  start()
  click("Use Selected Items")
  g.focused = true
  frame()
  g.focused = false
  g.keys = { [ImGui.Key_Escape] = true }
  frame()
  g.keys = nil
  ok(deferred ~= nil, "Escape with the keyboard on a control lets go of it, and the window stays")
  g.popup = true
  frame()
  g.popup = false
  g.keys = { [ImGui.Key_Escape] = true }
  frame()
  g.keys = nil
  ok(deferred ~= nil, "Escape with a menu open closes the menu, and the window stays")
  frame()
  g.keys = { [ImGui.Key_Escape] = true }
  frame()
  g.keys = nil
  ok(deferred == nil, "Escape with nothing held closes the window")
end

-- Changes made to a progression are not thrown away without asking.
do
  P.ext = {}
  project("twinkle", "Twinkle")
  start()
  click("Use Selected Items")
  click("1 a Bar")
  click("Triads")
  P.calls.ask = nil
  clickChord(2)
  click("Dmin")
  ok(has(g.buttons, "1.  I  ii  I   (edited)"), "edited")
  P.answer = 2
  click("2 a Bar")
  eq(P.calls.ask, 1, "new suggestions over an edit ask first")
  eq(P.asked and P.asked.kind, 1, "with OK and Cancel")
  ok(P.asked.msg:find("Insert on New Track", 1, true), "and say how to keep the changes")
  ok(has(g.buttons, "1.  I  ii  I   (edited)"), "Cancel keeps the changes")
  click("More Ideas")
  click("G")
  click("Use Selected Items")
  ok(has(g.buttons, "1.  I  ii  I   (edited)"), "and so it does for More Ideas, the key and another item")
  eq(P.calls.ask, 4, "each asking")
  -- Closing the window asks too.
  g.closeClick = true
  frame()
  g.closeClick = false
  ok(deferred ~= nil, "closing the window with changes asks, and Cancel keeps it open")
  eq(P.calls.ask, 5, "asked")
  P.answer = 1
  click("2 a Bar")
  ok(not has(g.buttons, "1.  I  ii  I   (edited)"), "OK lets them go")
  P.answer = nil
  local asked = P.calls.ask
  click("1 a Bar")
  eq(P.calls.ask, asked, "with nothing changed, nothing is asked")
  g.closeClick = true
  frame()
  g.closeClick = false
  ok(deferred == nil, "and closing just closes")
end

-- Putting a progression back as suggested can itself be undone.
do
  P.ext = {}
  project("twinkle", "Twinkle")
  start()
  click("Use Selected Items")
  click("1 a Bar")
  click("Triads")
  clickChord(2)
  click("Dmin")
  click("Put Back as Suggested")
  ok(has(g.buttons, "1.  I  IV  I"), "put back")
  ok(has(g.buttons, "Restore the Changes"), "with a way to bring the changes back")
  click("Restore the Changes")
  ok(has(g.buttons, "1.  I  ii  I   (edited)"), "which brings them back")
  ok(not has(g.buttons, "Restore the Changes") and has(g.buttons, "Put Back as Suggested"),
     "and offers to put them back again")
end

-- A collapsed window draws nothing, but what was pushed before Begin still
-- has to come off after it.
do
  project("twinkle")
  start()
  click("Use Selected Items")
  g.collapsed = true
  local okRun, err = pcall(frame)
  g.collapsed = false
  ok(okRun, "a collapsed window still balances its pushes: " .. tostring(err))
  ok(deferred ~= nil, "and keeps running")
end

-- Quitting mid-audition leaves nothing behind.
project("twinkle")
start()
click("Use Selected Items")
click("Audition")
eq(#P.tracks, 2, "auditioning")
atexitFn()
eq(#P.tracks, 1, "quitting takes the temporary track with it")

os.execute('rm -rf "' .. tmp .. '"')
C.done()
