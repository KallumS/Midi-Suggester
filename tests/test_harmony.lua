--[[ Chords for a melody.

       lua5.4 tests/test_harmony.lua
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local C = dofile(HERE .. "/check.lua")
local ok, eq, eqList = C.ok, C.eq, C.eqList
local T = dofile(C.SCRIPTS .. "ms_theory.lua")
local H = dofile(C.SCRIPTS .. "ms_harmony.lua")
local F = dofile(HERE .. "/fixtures.lua")

local CM = T.key(T.rootIndex("C"), T.MAJOR)
local AM = T.key(T.rootIndex("A"), T.MINOR)

local function suggest(line, key, rhythm, colour, variation)
  return H.suggest(line, T, { key = key, beats = 16, barBeats = 4,
                              rhythm = rhythm or 1, colour = colour or 1,
                              variation = variation })
end
local function nums(s) return table.concat(s.numerals, " ") end
local function syms(s) return table.concat(s.symbols, " ") end

------------------------------------------------------------------------------
-- The palette
------------------------------------------------------------------------------

local function paletteSymbols(key, colour)
  local out = {}
  for _, ch in ipairs(H.palette(key, T, colour)) do out[#out + 1] = ch.symbol end
  return table.concat(out, " ")
end

eq(paletteSymbols(CM, 1), "C Dmin Emin F G Amin Bdim", "C major triads")
eq(paletteSymbols(AM, 1), "Amin Bdim C Dmin Emin F G E", "A minor triads, plus the major V")
eq(paletteSymbols(T.key(T.rootIndex("A"), T.scaleIndex("Harmonic Minor")), 1),
   "Amin Bdim Dmin E F G#dim", "harmonic minor has no augmented III, and needs no extra V")
eq(paletteSymbols(CM, 2),
   "C Dmin Emin F G Amin Bdim Cmaj7 Dmin7 Emin7 Fmaj7 G7 Amin7 Bmin7b5",
   "sevenths add the diatonic sevenths")
eq(paletteSymbols(CM, 3),
   "C Dmin Emin F G Amin Bdim Cmaj7 Dmin7 Emin7 Fmaj7 G7 Amin7 Bmin7b5 " ..
   "Fmin Ab Bb Eb A7 C7 D7 E7",
   "colourful borrows iv bVI bVII bIII and adds V7 of ii IV V vi")
eq(paletteSymbols(AM, 3),
   "Amin Bdim C Dmin Emin F G E Amin7 Bmin7b5 Cmaj7 Dmin7 Emin7 Fmaj7 G7 E7 " ..
   "D Bb A7 B7 C7",
   "a minor key borrows IV and the Neapolitan instead")

do
  local num = {}
  for _, ch in ipairs(H.palette(CM, T, 3)) do num[ch.symbol] = ch.numeral end
  eq(num["Bb"], "bVII", "Bb is bVII")
  eq(num["Fmin"], "iv", "Fmin is iv")
  eq(num["D7"], "V7/V", "D7 is V7/V")
  eq(num["E7"], "V7/vi", "E7 is V7/vi")
  eq(num["Bmin7b5"], "viiø7", "the half-diminished")
end

-- Spelled for the key, and a borrowed root spelled the way its numeral is.
do
  local EbM = T.key(T.rootIndex("Eb"), T.MAJOR)
  eq(paletteSymbols(EbM, 1), "Eb Fmin Gmin Ab Bb Cmin Ddim", "Eb major spells flat")
  local num = {}
  for _, ch in ipairs(H.palette(T.key(T.rootIndex("E"), T.MAJOR), T, 3)) do num[ch.numeral] = ch.symbol end
  eq(num["bVII"], "D", "bVII of E is D")
  eq(num["bIII"], "G", "bIII of E is G")
  eq(num["bVI"], "C", "bVI of E is C")
end

------------------------------------------------------------------------------
-- What it suggests
------------------------------------------------------------------------------

-- Twinkle, two chords a bar, triads: the harmonisation in every songbook.
do
  local s = suggest(F.twinkle, CM, 1, 1)
  eq(nums(s[1]), "I IV I IV I V I", "Twinkle, first suggestion")
  eq(syms(s[1]), "C F C F C G C", "in chord symbols")
  eq(s[1].match, 1, "every note of Twinkle sits on its chord")
  eq(#s, H.SUGGESTIONS, "a full list")
end

-- Ode to Joy, one chord a bar. Its first phrase ends on D, a half cadence,
-- and the first suggestion hears it.
eq(nums(suggest(F.ode, CM, 2, 1)[1]), "I V I V", "Ode to Joy's half cadence")

-- The minor tune: its G# is the raised seventh, so the V is major.
eq(nums(suggest(F.minorTune, AM, 1, 1)[1]), "i iv V i iv i", "the minor tune")

-- A melody that arpeggiates Bb in C. Triads have nothing for it but to
-- clash; colourful borrows the chord the melody is spelling.
do
  local bvii = F.line({ {60,1},{64,1},{67,1},{64,1},{65,1},{69,1},{72,1},{69,1},
                        {70,1},{74,1},{77,1},{74,1},{72,4} })
  eq(nums(suggest(bvii, CM, 2, 3)[1]), "I IV bVII I", "colourful finds the borrowed bVII")
  eq(syms(suggest(bvii, CM, 2, 3)[1]), "C F Bb C", "spelled Bb")
  ok(suggest(bvii, CM, 2, 3)[1].match > suggest(bvii, CM, 2, 1)[1].match,
     "and fits better than anything triads could offer")
end

-- The final note is where the cadence is heard. Twinkle one chord a bar ends
-- D D C C, and without the final note's weight the D's won: it ended on V.
eq(suggest(F.twinkle, CM, 2, 1)[1].numerals[#suggest(F.twinkle, CM, 2, 1)[1].numerals],
   "I", "Twinkle one a bar still ends home")

------------------------------------------------------------------------------
-- Properties of every suggestion
------------------------------------------------------------------------------

for _, case in ipairs({ { "twinkle", CM }, { "ode", CM }, { "minorTune", AM } }) do
  for rhythm = 1, #H.RHYTHMS do
    for colour = 1, #H.COLOURS do
      local tag = ("%s, %s, %s"):format(case[1], H.RHYTHMS[rhythm].name, H.COLOURS[colour])
      local sugs = suggest(F[case[1]], case[2], rhythm, colour)
      ok(#sugs >= 1, tag .. ": suggests something")
      for si, s in ipairs(sugs) do
        -- The chords tile the whole piece, with no gap and no overlap.
        local t = 0
        for _, c in ipairs(s.chords) do
          if math.abs(c.start - t) > 1e-9 then ok(false, tag .. " #" .. si .. ": gap at " .. t) end
          t = c.start + c.len
        end
        ok(math.abs(t - 16) < 1e-9, tag .. " #" .. si .. ": fills all 16 beats")
        -- A held chord is one chord: no chord follows itself.
        for i = 2, #s.chords do
          if s.chords[i].chord.id == s.chords[i - 1].chord.id then
            ok(false, tag .. " #" .. si .. ": a chord repeated rather than held")
          end
        end
        -- A secondary dominant goes where it points.
        for i = 1, #s.chords - 1 do
          local ch = s.chords[i].chord
          if ch.kind == "secondary" then
            eq(s.chords[i + 1].chord.root, ch.target, tag .. " #" .. si .. ": " .. ch.numeral .. " resolves")
          end
        end
        eq(#s.numerals, #s.chords, tag .. ": a numeral per chord")
      end
      -- Best first.
      for i = 2, #sugs do
        if sugs[i].score > sugs[i - 1].score + 1e-9 then ok(false, tag .. ": out of order") end
      end
    end
  end
end

-- No two suggestions are the same progression.
do
  local sugs = suggest(F.twinkle, CM, 1, 3)
  local seen = {}
  for _, s in ipairs(sugs) do
    ok(not seen[nums(s)], "twinkle colourful: " .. nums(s) .. " offered once")
    seen[nums(s)] = true
  end
end

------------------------------------------------------------------------------
-- More ideas
------------------------------------------------------------------------------

do
  local a1 = suggest(F.twinkle, CM, 1, 1, 1)
  local a2 = suggest(F.twinkle, CM, 1, 1, 1)
  local b  = suggest(F.twinkle, CM, 1, 1, 2)
  local base = suggest(F.twinkle, CM, 1, 1, 0)
  local function all(list) local o = {} for _, s in ipairs(list) do o[#o + 1] = nums(s) end return table.concat(o, " | ") end
  eq(all(a1), all(a2), "the same variation gives the same ideas")
  ok(all(a1) ~= all(base), "a variation gives different ideas from the first set")
  ok(all(a1) ~= all(b), "and each variation from the next")
end

------------------------------------------------------------------------------
-- Voicing
------------------------------------------------------------------------------

do
  local s = suggest(F.twinkle, CM, 1, 2)[1]
  local notes = H.voice(s, F.twinkle, true)
  -- Every chord tone is sounded, and nothing else.
  for _, c in ipairs(s.chords) do
    local sounded, upper, bass = {}, {}, nil
    for _, n in ipairs(notes) do
      if n.start == c.start then
        sounded[n.pitch % 12] = true
        if n.pitch >= H.VOICE_FLOOR then upper[#upper + 1] = n.pitch else bass = n.pitch end
      end
      eq(n.vel, 100, "one velocity")
    end
    for pc in pairs(c.chord.pcs) do ok(sounded[pc], c.chord.symbol .. ": sounds " .. pc) end
    for pc in pairs(sounded) do ok(c.chord.pcs[pc], c.chord.symbol .. ": nothing extra") end
    eq(bass and bass % 12, c.chord.root, c.chord.symbol .. ": the root in the bass")
    ok(bass and bass >= H.BASS_LOW and bass < H.BASS_LOW + 12, c.chord.symbol .. ": bass in its octave")
    -- Under the tune while the chord sounds.
    local lowest = 999
    for _, n in ipairs(F.twinkle) do
      if n.start < c.start + c.len and n.start + n.len > c.start then lowest = math.min(lowest, n.pitch) end
    end
    for _, p in ipairs(upper) do ok(p < lowest, c.chord.symbol .. ": under the melody, " .. p) end
  end
  -- Close voice-leading, checked against a brute force written apart from
  -- the code: every set of pitches that holds each chord tone once, spans
  -- less than an octave, sits on or over the floor and under the melody. The
  -- voicing chosen must move no further from the chord before than the best
  -- of those.
  local byStart = {}
  for _, n in ipairs(notes) do
    if n.pitch >= H.VOICE_FLOOR then
      byStart[n.start] = byStart[n.start] or {}
      table.insert(byStart[n.start], n.pitch)
    end
  end
  local function moved(a, b)
    local d = 0
    for i = 1, #a do d = d + math.abs(a[i] - b[i]) end
    return d
  end
  local prev
  for _, c in ipairs(s.chords) do
    local v = byStart[c.start]
    table.sort(v)
    local lowest = 999
    for _, n in ipairs(F.twinkle) do
      if n.start < c.start + c.len and n.start + n.len > c.start then lowest = math.min(lowest, n.pitch) end
    end
    if prev and #prev == #v then
      local best = math.huge
      local pcs = {}
      for pc in pairs(c.chord.pcs) do pcs[#pcs + 1] = pc end
      for low = H.VOICE_FLOOR, lowest - 1 do
        -- every voicing whose lowest note is `low`
        local set = { low }
        local okSet = c.chord.pcs[low % 12]
        if okSet then
          local have = { [low % 12] = true }
          for p = low + 1, low + 11 do
            if c.chord.pcs[p % 12] and not have[p % 12] then have[p % 12] = true; set[#set + 1] = p end
          end
          if #set == #pcs and set[#set] < lowest then best = math.min(best, moved(set, prev)) end
        end
      end
      eq(moved(v, prev), best, c.chord.symbol .. " at " .. c.start .. " moves as little as it can")
    end
    prev = v
  end
  -- No bass unless asked for.
  for _, n in ipairs(H.voice(s, F.twinkle, false)) do
    ok(n.pitch >= H.VOICE_FLOOR, "without the bass, nothing below the floor")
  end
end

------------------------------------------------------------------------------
-- Edges
------------------------------------------------------------------------------

do
  -- A melody shorter than one chord's worth still gets one chord.
  local s = H.suggest(F.line({ { 60, 1 }, { 64, 1 } }), T,
                      { key = CM, beats = 4, barBeats = 4, rhythm = 3, colour = 1 })
  ok(#s >= 1, "one bar at one chord per two bars")
  eq(s[1].chords[1].len, 4, "the chord is cut to the piece")
  -- A 3/4 tune.
  local waltz = F.line({ { 60, 2 }, { 64, 1 }, { 67, 3 }, { 65, 2 }, { 62, 1 }, { 60, 3 } })
  local w = H.suggest(waltz, T, { key = CM, beats = 12, barBeats = 3, rhythm = 2, colour = 1 })
  eq(w[1].chords[#w[1].chords].start + w[1].chords[#w[1].chords].len, 12, "3/4 fills four bars of three")
end

C.done()
