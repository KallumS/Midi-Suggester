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

-- A minor key's rare chord is its diminished ii, not its VII. The degree
-- costs were once written for major alone and charged G major in A minor as
-- if it were a diminished vii: one chord a bar came out Amin Bdim Emin Amin.
do
  local s = suggest(F.minorTune, AM, 2, 1)
  eq(syms(s[1]), "Amin G Amin", "the minor tune, one a bar: VII, not ii dim")
  for i = 1, 2 do
    ok(not syms(s[i]):find("dim"), "no diminished chord in the first two: " .. syms(s[i]))
  end
end

------------------------------------------------------------------------------
-- Auto timing: the melody decides where the chords change
------------------------------------------------------------------------------

local AUTO = #H.RHYTHMS
eq(H.RHYTHMS[AUTO].name, "Auto", "Auto is last, so saved choices of the others keep their place")

local function timing(s)
  local o = {}
  for _, c in ipairs(s.chords) do o[#o + 1] = ("%s@%g"):format(c.chord.symbol, c.start) end
  return table.concat(o, " ")
end

-- Twinkle's songbook harmony, with the chords where the tune moves.
eq(timing(suggest(F.twinkle, CM, AUTO, 1)[1]), "C@0 F@4 C@6 F@8 C@10 G@12 C@14", "Twinkle, Auto")

-- The minor tune sits on A minor for its last two bars, and Auto holds it
-- there: chords of a bar, half a bar and two bars. At CHANGE_HALF = 0 the
-- last two bars split into Dmin and Amin halves instead.
do
  local s = suggest(F.minorTune, AM, AUTO, 1)[1]
  eq(timing(s), "Amin@0 Dmin@4 E@6 Amin@8", "the minor tune, Auto")
  eq(s.chords[4].len, 8, "the last chord held two bars")
end

-- Every change on a bar line or a half bar, in every suggestion.
for _, case in ipairs({ { "twinkle", CM }, { "ode", CM }, { "minorTune", AM } }) do
  for colour = 1, #H.COLOURS do
    for _, s in ipairs(suggest(F[case[1]], case[2], AUTO, colour)) do
      for _, c in ipairs(s.chords) do
        ok(c.start % 2 == 0, case[1] .. " Auto: a change at " .. c.start .. " is on a bar or half bar")
      end
    end
  end
end

-- A bar that does not halve on a beat - 3/4 - changes only on bar lines.
do
  local waltz = F.line({ { 60, 2 }, { 64, 1 }, { 67, 3 }, { 65, 2 }, { 62, 1 }, { 60, 3 } })
  local w = H.suggest(waltz, T, { key = CM, beats = 12, barBeats = 3, pulse = 1, rhythm = AUTO, colour = 1 })
  for _, s in ipairs(w) do
    for _, c in ipairs(s.chords) do ok(c.start % 3 == 0, "3/4 Auto changes on bar lines: " .. c.start) end
  end
  -- 6/8 halves on its dotted quarters.
  local six = H.suggest(waltz, T, { key = CM, beats = 12, barBeats = 3, pulse = 1.5, rhythm = AUTO, colour = 1 })
  ok(#six >= 1, "6/8 Auto suggests")
end

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
        ok(s.chords[#s.chords].chord.kind ~= "secondary", tag .. " #" .. si .. ": does not end on a secondary dominant")
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
-- Editing a progression chord by chord
------------------------------------------------------------------------------

local function tiles(sg, beats, tag)
  local t = 0
  for _, c in ipairs(sg.chords) do
    if math.abs(c.start - t) > 1e-9 then ok(false, tag .. ": gap or overlap at " .. t) end
    ok(c.len > 0, tag .. ": every chord has length")
    t = c.start + c.len
  end
  ok(math.abs(t - beats) < 1e-9, tag .. ": still fills the piece")
end

do
  local function fresh(colour) return H.suggest(F.twinkle, T, { key = CM, beats = 16, barBeats = 4,
                                                              pulse = 1, rhythm = 2, colour = colour or 1 })[1] end

  -- Alternatives: never the chord already there, best first, and each one
  -- a chord that could stand there.
  local sg = fresh(2)
  eq(timing(sg), "C@0 Amin7@4 Fmaj7@8 C@12", "Twinkle, sevenths, one a bar")
  local alts = H.alternatives(sg, 2, F.twinkle)
  ok(#alts >= 1 and #alts <= H.ALTERNATIVES, "some alternatives, not too many")
  for k, a in ipairs(alts) do
    ok(a.chord.symbol ~= "Amin7", "the chord already there is not offered")
    if k > 1 then ok(a.score <= alts[k - 1].score + 1e-9, "best first") end
    ok(a.match >= 0 and a.match <= 1, "each with its fit")
  end
  eq(alts[1].chord.symbol, "F", "under A A G the best other chord is F")

  -- Swap: that chord changes and nothing else does.
  local sw = H.copy(sg)
  H.replace(sw, 2, alts[1].chord, F.twinkle)
  eq(timing(sw), "C@0 F@4 Fmaj7@8 C@12", "swapped the second chord")
  eq(table.concat(sw.symbols, " "), "C F Fmaj7 C", "the symbols follow")
  eq(table.concat(sw.numerals, " "), "I IV IVmaj7 I", "and the numerals")
  eq(timing(sg), "C@0 Amin7@4 Fmaj7@8 C@12", "the original is untouched by editing a copy")

  -- Split: a beat-aligned halving, with a passing chord leading on.
  local sp = H.copy(sg)
  local j = H.split(sp, 1, F.twinkle)
  eq(j, 2, "the new chord is the second")
  eq(timing(sp), "C@0 G@2 Amin7@4 Fmaj7@8 C@12", "C split, with G passing into Amin7")
  tiles(sp, 16, "after a split")

  -- In Colourful, a chord before F splits into its own dominant: C C7 | F.
  do
    local cs = H.copy(fresh(3))
    local f
    for _, ch in ipairs(cs.palette) do if ch.symbol == "F" then f = ch end end
    H.replace(cs, 1, cs.palette[1], F.twinkle)          -- C
    H.replace(cs, 2, f, F.twinkle)                      -- F
    eq(cs.chords[1].chord.symbol .. " " .. cs.chords[2].chord.symbol, "C F", "set up C then F")
    local k = H.split(cs, 1, F.twinkle)
    eq(cs.chords[k].chord.numeral, "V7/IV", "C before F splits into C7, the V7 of IV")
    eq(cs.chords[k].chord.symbol, "C7", "spelled C7")
  end

  -- A split lands on a beat, even when the middle of the chord does not:
  -- a chord three beats long splits after one beat or two, never at 1.5.
  do
    local odd = H.copy(sg)
    odd.chords[1].len = 3
    odd.chords[2].start, odd.chords[2].len = 3, odd.chords[2].len + 1
    H.split(odd, 1, F.twinkle)
    local at = odd.chords[2].start
    ok(at == 1 or at == 2, "a three-beat chord splits on a beat, not at " .. at)
    tiles(odd, 16, "after splitting a three-beat chord")
  end

  -- Splitting stops at a beat.
  local one = H.copy(sg)
  for _ = 1, 3 do if H.canSplit(one, 1) then H.split(one, 1, F.twinkle) end end
  eq(one.chords[1].len, 1, "split down to a beat")
  ok(not H.canSplit(one, 1), "and no further")
  eq(H.split(one, 1, F.twinkle), nil, "a split asked for anyway does nothing")
  tiles(one, 16, "after splitting down to a beat")

  -- Remove: the chord before plays on; the first gives way to the second.
  local rm = H.copy(sg)
  eq(H.remove(rm, 3, F.twinkle), 2, "removing the third grows the second")
  eq(timing(rm), "C@0 Amin7@4 C@12", "Fmaj7 gone, Amin7 held on")
  eq(rm.chords[2].len, 8, "for two bars")
  local rm1 = H.copy(sg)
  H.remove(rm1, 1, F.twinkle)
  eq(timing(rm1), "Amin7@0 Fmaj7@8 C@12", "removing the first starts the second at the top")
  tiles(rm1, 16, "after removing the first")

  -- Removing F from C F C leaves one C, not two side by side.
  local cfc = fresh(1)
  eq(timing(cfc), "C@0 F@4 C@12", "Twinkle, triads, one a bar")
  H.remove(cfc, 2, F.twinkle)
  eq(timing(cfc), "C@0", "the Cs either side join up")
  eq(cfc.chords[1].len, 16, "into one held chord")
  ok(not H.canRemove(cfc), "the only chord cannot be removed")
  eq(H.remove(cfc, 1, F.twinkle), nil, "and asking does nothing")

  -- The fit follows the edits.
  local worse = H.copy(sg)
  H.replace(worse, 2, alts[#alts].chord, F.twinkle)
  ok(worse.match <= sg.match, "a worse chord lowers the fit")
end

-- After a secondary dominant, only its target is offered; and a secondary
-- dominant is only offered where its target follows.
do
  local col = H.suggest(F.twinkle, T, { key = CM, beats = 16, barBeats = 4, pulse = 1, rhythm = 1, colour = 3 })
  for _, sg in ipairs(col) do
    for i = 1, #sg.chords do
      local prev = sg.chords[i - 1] and sg.chords[i - 1].chord
      local nxt = sg.chords[i + 1] and sg.chords[i + 1].chord
      for _, a in ipairs(H.alternatives(sg, i, F.twinkle)) do
        if prev and prev.kind == "secondary" then
          ok(a.chord.root == prev.target or a.chord.id == prev.id,
             "after " .. prev.symbol .. " only its target, or itself held longer")
        end
        if a.chord.kind == "secondary" then
          ok(nxt and (nxt.root == a.chord.target or nxt.id == a.chord.id),
             a.chord.symbol .. " offered only before its target, or before itself held on")
        end
      end
    end
  end
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
