--[[ Keys, spelling, finding the key, and naming chords.

       lua5.4 tests/test_theory.lua
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local C = dofile(HERE .. "/check.lua")
local ok, eq, eqList = C.ok, C.eq, C.eqList
local T = dofile(C.SCRIPTS .. "ms_theory.lua")

local function key(root, scale) return T.key(T.rootIndex(root), T.scaleIndex(scale)) end

------------------------------------------------------------------------------
-- The roots and scales are ScaleView's, and have to stay that way
------------------------------------------------------------------------------

do
  -- Copied from ScaleView for REAPER, reascripts/ScaleView Pro.lua. Only the
  -- seven-note scales are offered here, so only those are compared.
  local SCALEVIEW = {
    ["Major"]           = { 0, 2, 4, 5, 7, 9, 11 },
    ["Minor (Natural)"] = { 0, 2, 3, 5, 7, 8, 10 },
    ["Harmonic Minor"]  = { 0, 2, 3, 5, 7, 8, 11 },
    ["Dorian"]          = { 0, 2, 3, 5, 7, 9, 10 },
    ["Phrygian"]        = { 0, 1, 3, 5, 7, 8, 10 },
    ["Lydian"]          = { 0, 2, 4, 6, 7, 9, 11 },
    ["Mixolydian"]      = { 0, 2, 4, 5, 7, 9, 10 },
  }
  for _, sc in ipairs(T.SCALES) do
    eqList(sc.iv, SCALEVIEW[sc.name] or {}, "scale " .. sc.name .. " matches ScaleView")
  end
  local roots = {}
  for _, r in ipairs(T.ROOTS) do roots[#roots + 1] = r.name end
  eqList(roots, { "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G",
                  "G#", "Ab", "A", "A#", "Bb", "B", "Cb" }, "roots match ScaleView")
end

------------------------------------------------------------------------------
-- Spelling
------------------------------------------------------------------------------

local function spelled(k)
  local out = {}
  for d = 0, 6 do out[#out + 1] = T.noteName(k, T.degreePc(k, d)) end
  return out
end

eqList(spelled(key("C#", "Major")), { "C#", "D#", "E#", "F#", "G#", "A#", "B#" }, "C# major")
eqList(spelled(key("Db", "Major")), { "Db", "Eb", "F", "Gb", "Ab", "Bb", "C" }, "Db major")
eqList(spelled(key("F#", "Major")), { "F#", "G#", "A#", "B", "C#", "D#", "E#" }, "F# major")
eqList(spelled(key("A", "Harmonic Minor")), { "A", "B", "C", "D", "E", "F", "G#" }, "A harmonic minor")
eqList(spelled(key("Eb", "Minor (Natural)")), { "Eb", "F", "Gb", "Ab", "Bb", "Cb", "Db" }, "Eb minor")
eq(T.noteName(key("F", "Major"), 1), "Db", "outside notes lean flat in a flat key")
eq(T.noteName(key("D", "Major"), 3), "D#", "and sharp in a sharp key")
eq(key("A", "Minor (Natural)").majorish, false, "a minor key is not majorish")
eq(key("G", "Mixolydian").majorish, true, "Mixolydian is")

------------------------------------------------------------------------------
-- Naming chords: ScaleView Pro's own expectations, from its test suite
--
-- These are the names tests/test_scaleview_pro.lua asserts. If the port had
-- dropped or changed anything in the cost model, these are where it would
-- show. "Clear Scale" there is no key here, which assumes C major the same way.
------------------------------------------------------------------------------

local C3, C4 = 48, 60
local function name(notes, k) return (T.nameChord(notes, k)) end
local function expect(notes, want, k)
  eq(name(notes, k), want, "chord " .. table.concat(notes, ","))
end

expect({C4, C4 + 3, C4 + 7, C4 + 15}, "Cmin")
expect({C4, C4 + 3, C4 + 7, C4 + 10}, "Cmin7")
expect({59, 61, 66}, "Bsus2")
expect({C4, C4 + 4, C4 + 7}, "C")
expect({C4, C4 + 3, C4 + 7}, "Cmin")
expect({C4, C4 + 3, C4 + 6}, "Cdim")
expect({C4, C4 + 4, C4 + 8}, "Caug")
expect({C4, C4 + 5, C4 + 7}, "Csus4")
expect({C4, C4 + 2, C4 + 7}, "Csus2")
expect({C4, C4 + 4, C4 + 7, C4 + 11}, "Cmaj7")
expect({C4, C4 + 4, C4 + 7, C4 + 10}, "C7")
expect({C4, C4 + 3, C4 + 6, C4 + 10}, "Cmin7b5")
expect({C4, C4 + 3, C4 + 6, C4 + 9}, "Cdim7")
expect({C4, C4 + 4, C4 + 7, C4 + 9}, "C6")
expect({C4, C4 + 2, C4 + 4, C4 + 7}, "Cadd9")
expect({C4, C4 + 2, C4 + 4, C4 + 7, C4 + 10}, "C9")
expect({52, C4, 67}, "C/E")
expect({43, C4, 64}, "C/G")
expect({52, 55, C4, 72}, "C")
expect({52, 55, C4}, "C/E")
expect({52, 55, C4, 71}, "Cmaj7/E")
expect({53, 57, 62, 74}, "Dmin/F")
expect({53, 57, 62, 74}, "Dmin", key("D", "Minor (Natural)"))
expect({53, 57, 62}, "Dmin/F", key("D", "Minor (Natural)"))
expect({C4, C4 + 2, C4 + 3, C4 + 6, C4 + 9}, "Cdim9")
expect({C4, C4 + 16, C4 + 18, C4 + 21}, "F#min7b5/C")
expect({C4, C4 + 3, C4 + 7, C4 + 9}, "Cmin6")
expect({62, 63, 67, 69}, "D#maj7b5/D")
expect({64, 70, 74}, "A#(b5)/E")
expect({65, 69, 71}, "F(b5)")
expect({C4, C4 + 7, C4 + 10}, "C7(no3)")
expect({C4, C4 + 4, C4 + 6, C4 + 8, C4 + 11}, "Cmaj7#5#11")
expect({C4, C4 + 14, C4 + 16, C4 + 18, C4 + 20, C4 + 22}, "Caug9#11")
expect({C4, C4 + 4, C4 + 6, C4 + 11}, "Cmaj7b5")
expect({C4, C4 + 4, C4 + 8, C4 + 11}, "Cmaj7#5")
-- ScaleView Pro, October 2026: an altered dominant on its own root keeps its
-- alterations whatever its fifth, and a draw goes to the reading with no slash.
expect({C3, C4 + 4, C4 + 8, C4 + 10, C4 + 13}, "Caug7b9")    -- C7#5b9
expect({C3, C4 + 4, C4 + 6, C4 + 10, C4 + 13}, "C7b5b9")
expect({C3, C4 + 4, C4 + 6, C4 + 10, C4 + 15}, "C7b5#9")
expect({C3, C4 + 4, C4 + 10, C4 + 13, C4 + 20}, "Caug7b9")   -- C7b9b13
expect({C3, C4 + 4, C4 + 8, C4 + 10, C4 + 15}, "Caug7#9")
expect({C3, C4 + 3, C4 + 6, C4 + 10, C4 + 14}, "Cmin9b5")
expect({C3, C4 + 2, C4 + 7, C4 + 10}, "C7sus2")             -- was GminAdd11/C
expect({C3, C4 + 2, C4 + 5, C4 + 7}, "Csus4Add9")           -- was Dmin7(11)/C
expect({45, C4, 64, 67}, "Amin7")
expect({C3, 64, 67, 69}, "C6")
expect({43, C4, 64, 69}, "Amin7/G")
expect({C4}, "C")
expect({C4, C4 + 7}, "C5")
expect({C4, C4 + 4}, "Cmaj(no5)")
expect({71, 74}, "Bmin(no5)")
expect({64, C4 + 12}, "Cmaj(no5)/E")
expect({C4, C4 + 6}, "C F#")
expect({C4, C4 + 2}, "C D")
expect({C4, C4 + 5}, "F5/C")
expect({54, 58, 61}, "Gb", key("Gb", "Major"))
expect({54, 58, 61, 65}, "Gbmaj7", key("Gb", "Major"))
expect({54, 58, 61}, "F#", key("F#", "Major"))
-- ScaleView's Gb minor blues case is not here: that scale has six notes and
-- is not offered. Its A# harmonic minor one is.
expect({C4, C4 + 3, C4 + 9}, "Adim/C", key("A#", "Harmonic Minor"))
expect({59, 63, 66}, "Cb", key("Cb", "Major"))
expect({C4, C4 + 3, C4 + 5}, "CminAdd11", key("C#", "Major"))
expect({61, 66, 67}, "Gmaj7b5(no3)/Db", key("Eb", "Minor (Natural)"))
expect({C4, 61, 66, 69}, "Gbmin#11/C", key("Eb", "Harmonic Minor"))
expect({C4, C4 + 2, C4 + 4}, "Cadd9")
expect({C4, C4 + 4, C4 + 5}, "Cadd11")
expect({C4, C4 + 4, C4 + 5, C4 + 7}, "Cadd11")
expect({C4, C4 + 4, C4 + 6, C4 + 7}, "Cadd#11")
expect({C4, C4 + 4, C4 + 9}, "Amin/C")
expect({C4, C4 + 3, C4 + 9}, "Adim/C")
expect({C4, C4 + 4, C4 + 7, C4 + 8, C4 + 10}, "C7b13")
expect({C4, C4 + 4, C4 + 6, C4 + 7, C4 + 11}, "Cmaj7#11")
expect({C4, C4 + 2, C4 + 4, C4 + 6, C4 + 7, C4 + 11}, "Cmaj9#11")
expect({C4, C4 + 4, C4 + 7, C4 + 9, C4 + 10}, "C7(13)")
expect({C4, C4 + 2, C4 + 4, C4 + 7, C4 + 9, C4 + 10}, "C13")
expect({C4, C4 + 3, C4 + 7, C4 + 9, C4 + 10}, "Cmin7(13)")
expect({C4, C4 + 1, C4 + 4, C4 + 7, C4 + 9, C4 + 10}, "C13b9")
expect({C4, C4 + 2, C4 + 4, C4 + 6, C4 + 7, C4 + 9, C4 + 10}, "C13#11")
expect({C4, C4 + 3, C4 + 4, C4 + 6, C4 + 7, C4 + 10}, "C7#9#11")
expect({C4, C4 + 2, C4 + 4, C4 + 5, C4 + 7}, "Cadd9Add11")
expect({C4, C4 + 2, C4 + 3, C4 + 5, C4 + 7}, "CminAdd9Add11")
expect({C4, C4 + 3, C4 + 5, C4 + 7, C4 + 10}, "Cmin7(11)")
expect({C4, C4 + 2, C4 + 3, C4 + 5, C4 + 7, C4 + 10}, "Cmin11")
expect({C4, C4 + 3, C4 + 5, C4 + 6, C4 + 10}, "Cmin7b5(11)")
expect({69, 71, 77}, "F(b5)/A")
expect({C4, C4 + 2, C4 + 3, C4 + 6, C4 + 11}, "Cbaddb9#9/C", key("Gb", "Major"))
expect({64, 67, 71, 72, 74}, "Cmaj9/E")
expect({64, 67, 70, 72, 74}, "C9/E")
expect({55, 59, 62, 66, 77}, "G7(maj7)")
expect({C4, C4 + 4, C4 + 7, C4 + 8}, "Caddb6")
expect({C4, C4 + 2, C4 + 4, C4 + 8, C4 + 9}, "C6/9#5")
expect({C4, C4 + 4, C4 + 10}, "C7")
expect({C4, C4 + 2, C4 + 7, C4 + 11}, "Cmaj7sus2")
expect({54, 58, 61}, "F#", key("C", "Major"))

-- The root and bass come back as pitch classes, for the reader to use.
do
  local sym, root, bass = T.nameChord({ 52, 60, 67 })
  eq(sym, "C/E", "C/E symbol"); eq(root, 0, "C/E root"); eq(bass, 4, "C/E bass")
  local _, r2 = T.nameChord({ 60, 66 })
  eq(r2, nil, "an interval has no root")
end

-- No three- or four-note set of pitch classes is read out as notes.
do
  local unnamed = 0
  for a = 1, 11 do
    for b = a + 1, 11 do
      if not name({ 60, 60 + a, 60 + b }):find("^[A-G][#b]?[^ ]*$") then unnamed = unnamed + 1 end
      for c = b + 1, 11 do
        if name({ 60, 60 + a, 60 + b, 60 + c }):find(" ") then unnamed = unnamed + 1 end
      end
    end
  end
  eq(unnamed, 0, "every three- and four-note set gets a symbol")
end

------------------------------------------------------------------------------
-- Roman numerals
------------------------------------------------------------------------------

local function set(...) local s = {} for _, v in ipairs({ ... }) do s[v] = true end return s end
local CM = key("C", "Major")
eq(T.numeral(CM, 0, set(0, 4, 7)), "I", "I")
eq(T.numeral(CM, 2, set(0, 3, 7)), "ii", "ii")
eq(T.numeral(CM, 7, set(0, 4, 7, 10)), "V7", "V7")
eq(T.numeral(CM, 11, set(0, 3, 6)), "vii°", "vii dim")
eq(T.numeral(CM, 11, set(0, 3, 6, 10)), "viiø7", "half-diminished")
eq(T.numeral(CM, 0, set(0, 4, 7, 11)), "Imaj7", "Imaj7")
eq(T.numeral(CM, 10, set(0, 4, 7)), "bVII", "borrowed bVII")
eq(T.numeral(CM, 8, set(0, 4, 7)), "bVI", "borrowed bVI")
eq(T.numeral(CM, 5, set(0, 3, 7)), "iv", "borrowed iv")
local AM = key("A", "Minor (Natural)")
eq(T.numeral(AM, 4, set(0, 4, 7)), "V", "major V in minor")
eq(T.numeral(AM, 8, set(0, 3, 6, 9)), "#vii°7", "raised seventh in minor")
eq(T.numeral(AM, 7, set(0, 4, 7)), "VII", "VII in minor")

------------------------------------------------------------------------------
-- Finding the key
------------------------------------------------------------------------------

local F = dofile(HERE .. "/fixtures.lua")
local line = F.line

local function keyOf(notes)
  local best = T.detectKey(notes, notes[1].pitch % 12, notes[#notes].pitch % 12)[1]
  return T.ROOTS[best.root].name .. " " .. T.SCALES[best.scale].name
end

--[[  The fifteen the weights were chosen on. Each is how a musician would
      name the key, and all but one agree. ]]
local TUNES = {
  { "Twinkle", F.twinkle, "C Major" },
  { "Twinkle, first bar alone", line({ {60,1},{60,1},{67,1},{67,1},{69,1},{69,1},{67,2} }), "C Major" },
  { "Twinkle in D", line({ {62,1},{62,1},{69,1},{69,1},{71,1},{71,1},{69,2} }), "D Major" },
  { "Twinkle in Bb", line({ {58,1},{58,1},{65,1},{65,1},{67,1},{67,1},{65,2},{63,1},{63,1},{62,1},{62,1},{60,1},{60,1},{58,2} }), "Bb Major" },
  { "the minor tune", F.minorTune, "A Minor (Natural)" },
  { "E minor tune", line({ {64,1},{67,1},{71,1},{69,1},{67,1},{66,1},{64,1},{66,1},{67,1},{66,1},{64,1},{63,1},{64,1} }), "E Minor (Natural)" },
  -- Lingers round C and falls to A. The profiles alone call it C major; the
  -- final A is what makes it A minor, which is why KEY_END_BONUS exists.
  { "falls to A", line({ {64,1},{65,1},{67,1},{65,1},{64,1},{62,1},{60,1},{62,1},{64,1},{62,1},{60,1},{59,1},{57,1} }), "A Minor (Natural)" },
  { "Happy Birthday", line({ {60,.75},{60,.25},{62,1},{60,1},{65,1},{64,2},{60,.75},{60,.25},{62,1},{60,1},{67,1},{65,2} }), "F Major" },
  { "Greensleeves", line({ {69,1},{72,2},{74,1},{76,1.5},{77,.5},{76,1},{74,2},{71,1},{67,1.5},{69,.5},{71,1},{72,2},{69,1},{69,1.5},{68,.5},{69,1},{71,2},{68,1},{64,2} }), "A Minor (Natural)" },
  { "Mary Had a Little Lamb", line({ {64,1},{62,1},{60,1},{62,1},{64,1},{64,1},{64,2},{62,1},{62,1},{62,2},{64,1},{67,1},{67,2},{64,1},{62,1},{60,1},{62,1},{64,1},{64,1},{64,1},{64,1},{62,1},{62,1},{64,1},{62,1},{60,4} }), "C Major" },
  { "Frere Jacques", line({ {65,1},{67,1},{69,1},{65,1},{65,1},{67,1},{69,1},{65,1},{69,1},{70,1},{72,2},{69,1},{70,1},{72,2},{72,.5},{74,.5},{72,.5},{70,.5},{69,1},{65,1},{72,.5},{74,.5},{72,.5},{70,.5},{69,1},{65,1},{65,1},{60,1},{65,2},{65,1},{60,1},{65,2} }), "F Major" },
  { "a D minor tune", line({ {62,1},{64,1},{65,1},{67,1},{69,2},{65,1},{69,1},{67,1},{64,1},{67,1},{64,1},{65,1},{62,1},{64,1},{61,1},{62,4} }), "D Minor (Natural)" },
  -- Ode to Joy's first three bars end on E, and the profiles and the ending
  -- both say E minor - which has no F natural, and the tune plays two. This
  -- is the case KEY_OUTSIDE is for; nothing else here needs it.
  { "Ode, three bars", line({ {64,1},{64,1},{65,1},{67,1},{67,1},{65,1},{64,1},{62,1},{60,1},{60,1},{62,1},{64,1} }), "C Major" },
  { "Ode, second phrase", line({ {64,1},{64,1},{65,1},{67,1},{67,1},{65,1},{64,1},{62,1},{60,1},{60,1},{62,1},{64,1},{62,1.5},{60,.5},{60,2} }), "C Major" },
  { "I V vi IV", F.popChords, "C Major" },
  { "i iv V i arpeggiated", F.arpeggios, "A Minor (Natural)" },
  { "ii V I", F.walking, "C Major" },
}
for _, t in ipairs(TUNES) do eq(keyOf(t[2]), t[3], "key of " .. t[1]) end

--[[  The one miss, pinned so that it is seen rather than rediscovered. Ode to
      Joy's first phrase ends on D, a half cadence: from the melody alone it
      is as much D minor as C major, and the weights that fix it break Happy
      Birthday. If this line starts failing because the answer became C major,
      check Happy Birthday above before celebrating. ]]
eq(keyOf(F.ode), "D Minor (Natural)", "Ode to Joy's half cadence reads as D minor (known)")

C.done()
