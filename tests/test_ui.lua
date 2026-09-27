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
  g.rects = {}
end
resetFrame()

local ImGui = {}
local consts = { "Col_Text", "Col_TextDisabled", "Col_WindowBg", "Col_PopupBg", "Col_Border",
  "Col_FrameBg", "Col_FrameBgHovered", "Col_FrameBgActive", "Col_TitleBg", "Col_TitleBgActive",
  "Col_TitleBgCollapsed", "Col_Button", "Col_ButtonHovered", "Col_ButtonActive", "Col_CheckMark",
  "Col_SliderGrab", "Col_SliderGrabActive", "Col_Separator", "Col_ScrollbarBg", "Col_ScrollbarGrab",
  "Col_ScrollbarGrabHovered", "Col_ScrollbarGrabActive", "Cond_FirstUseEver", "Key_Escape" }
for i, k in ipairs(consts) do ImGui[k] = i end

local function effective(idx)
  for i = #g.colStack, 1, -1 do if g.colStack[i].idx == idx then return g.colStack[i].col end end
end

function ImGui.CreateContext(name) return { name = name } end
function ImGui.SetNextWindowSize() end
function ImGui.SetNextWindowBgAlpha(_, a) assert(a >= 0 and a <= 1) end
function ImGui.Begin() return not g.collapsed, true end
function ImGui.End() end
function ImGui.IsKeyPressed() return false end
function ImGui.SeparatorText(_, s) g.headings[#g.headings + 1] = s end
function ImGui.Text(_, s)
  if type(s) ~= "string" then error("Text got a " .. type(s)) end
  g.texts[#g.texts + 1] = s
end
function ImGui.SameLine() end
function ImGui.Dummy() end
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
end
function ImGui.PopStyleColor(_, n)
  for _ = 1, (n or 1) do g.colStack[#g.colStack] = nil end
  g.colDepth = g.colDepth - (n or 1)
  if g.colDepth < 0 then error("PopStyleColor without a push") end
end
function ImGui.Button(_, label)
  if type(label) ~= "string" then error("Button label is a " .. type(label)) end
  g.buttons[#g.buttons + 1] = label
  g.ink[#g.buttons] = { bg = effective(ImGui.Col_Button), text = effective(ImGui.Col_Text) }
  if g.clickTarget == #g.buttons then g.clicked = label; return true end
  return false
end
function ImGui.Checkbox(_, label, v)
  g.checkboxes[#g.checkboxes + 1] = label
  if g.toggle then return true, not v end
  return false, v
end
function ImGui.IsItemHovered() return true end
function ImGui.SetTooltip(_, s) if type(s) ~= "string" then error("tooltip is a " .. type(s)) end end
function ImGui.GetContentRegionAvail() return 860, 400 end
function ImGui.GetWindowDrawList() return {} end
function ImGui.GetCursorScreenPos() return 0, 0 end
function ImGui.InvisibleButton() return false end
function ImGui.DrawList_AddRectFilled(_, x1, y1, x2, y2, col)
  if x2 < x1 or y2 < y1 then error("rect is inside out") end
  g.rects[#g.rects + 1] = col
end
function ImGui.DrawList_AddLine(_, x1, y1, x2, y2, col)
  for _, v in ipairs({ x1, y1, x2, y2, col }) do
    if type(v) ~= "number" then error("line argument is a " .. type(v)) end
  end
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
  g.clickTarget, g.clicked, g.toggle = click, nil, toggle
  local f = deferred
  deferred = nil
  f()
  if g.idDepth ~= 0 then error("PushID left unbalanced: " .. g.idDepth) end
  if g.colDepth ~= 0 then error("PushStyleColor left unbalanced: " .. g.colDepth) end
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
click("Use selected item")
ok(has(g.texts, "Select a MIDI item first."), "pressing it with nothing selected says so")

------------------------------------------------------------------------------
-- A melody
------------------------------------------------------------------------------

local piano = project("twinkle", "Twinkle")
click("Use selected item")
eq(g.headings[3], "Chord progressions", "a melody gets chord progressions")
ok(has(g.texts, "Sounds like C Major"), "in C major")
ok(has(g.buttons, "1.  I  IV  I  IV  I  V  I"), "and Twinkle's songbook harmony first")
checkInk("melody")
ok(has(g.checkboxes, "Bass note"), "the bass box is there for chords")

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
click("Insert on new track")
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

-- More ideas gives another set, and there is a way back.
do
  frame()
  local first = {}
  for _, b in ipairs(g.buttons) do if b:match("^%d%.") then first[#first + 1] = b end end
  click("More ideas")
  local second = {}
  for _, b in ipairs(g.buttons) do if b:match("^%d%.") then second[#second + 1] = b end end
  ok(table.concat(first, "|") ~= table.concat(second, "|"), "more ideas are different ideas")
  ok(has(g.buttons, "Back to the first"), "with a way back")
  click("Back to the first")
  local third = {}
  for _, b in ipairs(g.buttons) do if b:match("^%d%.") then third[#third + 1] = b end end
  eq(table.concat(third, "|"), table.concat(first, "|"), "which brings the first set back")
  ok(not has(g.buttons, "Back to the first"), "and hides itself")
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
eq(g.headings[3], "Chord progressions", "and back")

------------------------------------------------------------------------------
-- A chord progression
------------------------------------------------------------------------------

project("popChords", "Loop")
click("Use selected item")
eq(g.headings[3], "Melodies", "chords get melodies")
ok(has(g.texts, "Chords:   C   G   Amin   F"), "and the chords are named")
ok(has(g.buttons, "1.  Melody 1"), "melodies are offered")
ok(not has(g.checkboxes, "Bass note"), "no bass box for melodies: no dead controls")
checkInk("chords")
click("Insert on new track")
ok(P.tracks[2].name:find("^Melody 1"), "a melody track")

------------------------------------------------------------------------------
-- The sweep: every button, in every state
------------------------------------------------------------------------------

local swept = {}
for _, fixture in ipairs({ "twinkle", "popChords", "arpeggios", "minorTune" }) do
  project(fixture)
  start()
  frame()
  click("Use selected item")
  -- Each button is clicked from a fresh start, so a click that changes the
  -- view (Melody to Chords, say) cannot hide the buttons after it.
  frame()
  local count = #g.buttons
  for i = 1, count do
    project(fixture)
    start()
    click("Use selected item")
    local label = g.buttons[i]
    local okRun, err = pcall(frame, i)
    ok(okRun, fixture .. ": clicking '" .. tostring(label) .. "' - " .. tostring(err))
    frame()
    checkInk(fixture .. " after " .. tostring(label))
    if label then swept[label] = true end
    if P.playing then click("Stop") end
  end
  -- Every checkbox both ways.
  frame(nil, true)
  frame(nil, true)
end
for _, label in ipairs({ "Use selected item", "Melody", "Chords", "C", "Cb", "Major", "Mixolydian",
                         "2 a bar", "1 / 2 bars", "Triads", "Colourful", "Sparse", "Busy",
                         "Low", "High", "Insert on new track", "Audition", "More ideas" }) do
  ok(swept[label], "the sweep reached '" .. label .. "'")
end

------------------------------------------------------------------------------
-- Settings outlive the window
------------------------------------------------------------------------------

project("twinkle")
start()
click("Use selected item")
click("Sevenths")
click("1 a bar")
frame(nil, true)            -- the bass box off
atexitFn()
local saved = P.ext["MidiSuggester:state"]
ok(saved and saved:find("colour=2") and saved:find("rhythm=2") and saved:find("bass=0"),
   "saved: " .. tostring(saved))
start()
click("Use selected item")
ok(has(g.buttons, "1.  I  vi7  IVmaj7  I"), "reloaded with sevenths, one a bar")
do
  -- Nonsense in the saved state is put back in range, not trusted.
  P.ext["MidiSuggester:state"] = "colour=99;rhythm=-4;bass=7;density=x;register=3.5"
  start()
  click("Use selected item")
  frame()
  atexitFn()
  eq(P.ext["MidiSuggester:state"], "rhythm=1;colour=3;bass=1;density=2;register=3",
     "nonsense in the saved state is put back in range, and an unreadable value ignored")
end

-- A collapsed window draws nothing, but what was pushed before Begin still
-- has to come off after it.
do
  project("twinkle")
  start()
  click("Use selected item")
  g.collapsed = true
  local okRun, err = pcall(frame)
  g.collapsed = false
  ok(okRun, "a collapsed window still balances its pushes: " .. tostring(err))
  ok(deferred ~= nil, "and keeps running")
end

-- Quitting mid-audition leaves nothing behind.
project("twinkle")
start()
click("Use selected item")
click("Audition")
eq(#P.tracks, 2, "auditioning")
atexitFn()
eq(#P.tracks, 1, "quitting takes the temporary track with it")

os.execute('rm -rf "' .. tmp .. '"')
C.done()
