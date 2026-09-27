--[[ Reading imported notes: melody or chords, the line, the chords.

       lua5.4 tests/test_read.lua
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local C = dofile(HERE .. "/check.lua")
local ok, eq, eqList = C.ok, C.eq, C.eqList
local T = dofile(C.SCRIPTS .. "ms_theory.lua")
local R = dofile(C.SCRIPTS .. "ms_read.lua")
local F = dofile(HERE .. "/fixtures.lua")

local function names(segs)
  local out = {}
  for _, s in ipairs(segs) do out[#out + 1] = s.name end
  return out
end
local function starts(segs)
  local out = {}
  for _, s in ipairs(segs) do out[#out + 1] = tostring(s.start) end
  return out
end
local function keyName(r)
  return T.ROOTS[r.keys[1].root].name .. " " .. T.SCALES[r.keys[1].scale].name
end

------------------------------------------------------------------------------
-- Melody or chords
------------------------------------------------------------------------------

for _, case in ipairs({
  { "twinkle", "Melody" }, { "ode", "Melody" }, { "minorTune", "Melody" },
  { "popChords", "Chords" }, { "strummed", "Chords" }, { "arpeggios", "Chords" },
  { "walking", "Chords" },
}) do
  eq((R.classify(F[case[1]])), case[2], case[1] .. " is " .. case[2])
end

-- The arpeggios are the case the density exists for: no two notes are
-- struck together, so the share of chordal events is nothing.
do
  local _, share, density = R.classify(F.arpeggios)
  eq(share, 0, "arpeggios strike one note at a time")
  ok(density >= R.CHORD_DENSITY, "but ring into each other: " .. density)
end

-- A melody with a double-stop in it is still a melody.
do
  local m = {}
  for i, n in ipairs(F.twinkle) do m[i] = n end
  m[#m + 1] = { pitch = 55, start = 0, len = 1, vel = 100 }
  m[#m + 1] = { pitch = 52, start = 0, len = 1, vel = 100 }
  eq((R.classify(m)), "Melody", "one three-note event among fourteen is a melody")
end

eq((R.classify({})), nil, "nothing is neither")

------------------------------------------------------------------------------
-- The line
------------------------------------------------------------------------------

do
  -- A harmony note under the tune is dropped, and a note that rings past
  -- the next one is cut where the next one starts.
  local notes = {
    { pitch = 67, start = 0, len = 3, vel = 100 },
    { pitch = 60, start = 0.05, len = 1, vel = 100 },
    { pitch = 69, start = 1, len = 1, vel = 90 },
  }
  local l = R.melodyLine(notes)
  eq(#l, 2, "two events, two notes")
  eq(l[1].pitch, 67, "the top note of a double-stop")
  eq(l[1].len, 1, "cut where the next note starts")
  eq(l[2].vel, 90, "velocity carried")
end

------------------------------------------------------------------------------
-- Cutting and naming chords
------------------------------------------------------------------------------

local function read(fixture)
  return R.analyse(F[fixture], 4, T)
end

do
  local r = read("popChords")
  eqList(names(r.chords), { "C", "G", "Amin", "F" }, "block chords, named")
  eqList(starts(r.chords), { "0", "4", "8", "12" }, "one a bar")
  eq(keyName(r), "C Major", "in C")
  eq(r.beats, 16, "four bars")
end

do
  local r = read("strummed")
  eqList(names(r.chords), { "C", "G/B", "Amin/C", "F/C" }, "a strum is one chord held")
  eqList(starts(r.chords), { "0", "4", "8", "12" }, "and changes where the chord does")
  eq(r.chords[1].len, 4, "held for the bar")
end

do
  local r = read("arpeggios")
  eqList(names(r.chords), { "Amin", "Dmin", "E", "Amin" }, "arpeggios, cut by the bar")
  eq(keyName(r), "A Minor (Natural)", "in A minor")
end

do
  local r = read("walking")
  eqList(names(r.chords), { "Dmin7", "G7", "Cmaj7" }, "the walking bass does not cut the chords")
  eqList(starts(r.chords), { "0", "4", "8" }, "they change where they are struck")
  eq(r.chords[3].len, 8, "the last lasts to the end")
  eq(keyName(r), "C Major", "ii V I is in C")
end

-- A key change re-spells without re-cutting.
do
  local r = read("popChords")
  R.nameSegments(r.chords, T.key(T.rootIndex("C"), T.MINOR), T)
  eq(#r.chords, 4, "still four")
end

-- Forcing the kind is honoured, whatever the notes look like.
do
  local r = R.analyse(F.popChords, 4, T, "Melody")
  eq(r.kind, "Melody", "forced to a melody")
  eq(r.detected, "Chords", "but it knows what it found")
  eq(#r.line, 4, "the top notes of four chords")
  local r2 = R.analyse(F.twinkle, 4, T, "Chords")
  ok(#r2.chords >= 1, "a melody forced to chords is cut by the bar")
end

do
  local r = read("twinkle")
  eq(r.kind, "Melody", "twinkle is a melody")
  eq(#r.line, 14, "fourteen notes")
  eq(r.firstPc, 0, "starts on C"); eq(r.lastPc, 0, "ends on C")
  eq(keyName(r), "C Major", "in C")
end

do
  local r = read("minorTune")
  eq(keyName(r), "A Minor (Natural)", "the minor tune is in A minor")
end

-- A piece that stops short of a bar line is still a whole number of bars.
do
  local r = R.analyse({ { pitch = 60, start = 0, len = 5, vel = 100 } }, 4, T)
  eq(r.beats, 8, "five beats round up to two bars")
end

C.done()
