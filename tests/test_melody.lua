--[[ Melodies for a chord progression.

       lua5.4 tests/test_melody.lua
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local C = dofile(HERE .. "/check.lua")
local ok, eq, eqList = C.ok, C.eq, C.eqList
local T = dofile(C.SCRIPTS .. "ms_theory.lua")
local R = dofile(C.SCRIPTS .. "ms_read.lua")
local Mel = dofile(C.SCRIPTS .. "ms_melody.lua")
local F = dofile(HERE .. "/fixtures.lua")

local function read(name, barBeats)
  local r = R.analyse(F[name], barBeats or 4, T)
  return r, T.key(r.keys[1].root, r.keys[1].scale)
end

local function suggest(name, density, register, variation)
  local r, key = read(name)
  return Mel.suggest(r.chords, T, { key = key, beats = r.beats, barBeats = 4,
                                    density = density or 2, register = register or 2,
                                    variation = variation or 0 }), r, key
end

local function chordAt(chords, t)
  local found = chords[1]
  for _, c in ipairs(chords) do if c.start <= t + 1e-9 then found = c end end
  return found
end

local function sig(notes)
  local o = {}
  for _, n in ipairs(notes) do o[#o + 1] = n.start .. ":" .. n.pitch end
  return table.concat(o, " ")
end

------------------------------------------------------------------------------
-- The rules, held over everything it can be asked for
------------------------------------------------------------------------------

for _, name in ipairs({ "popChords", "arpeggios", "walking", "strummed" }) do
  for density = 1, #Mel.DENSITIES do
    for register = 1, #Mel.REGISTERS do
      for variation = 0, 2 do
        local tag = ("%s %s %s v%d"):format(name, Mel.DENSITIES[density].name,
                                            Mel.REGISTERS[register].name, variation)
        local sugs, r, key = suggest(name, density, register, variation)
        eq(#sugs, Mel.SUGGESTIONS, tag .. ": a full list")
        local centre = Mel.REGISTERS[register].centre
        for si, s in ipairs(sugs) do
          local t = tag .. " #" .. si
          local notes = s.notes
          ok(#notes > 0, t .. ": has notes")

          -- One line, in order, inside the piece.
          for i, n in ipairs(notes) do
            ok(n.len > 0, t .. ": note " .. i .. " has length")
            ok(n.start + n.len <= r.beats + 1e-9, t .. ": note " .. i .. " inside the piece")
            if i > 1 then
              ok(n.start >= notes[i - 1].start + notes[i - 1].len - 1e-9,
                 t .. ": note " .. i .. " does not overlap the one before")
            end
            eq(n.vel, 100, t .. ": one velocity")
          end
          local last = notes[#notes]
          ok(math.abs(last.start + last.len - r.beats) < 1e-9, t .. ": the last note reaches the end")

          -- Home at the end.
          eq(last.pitch % 12, key.tonic, t .. ": ends on the tonic")

          -- In range, and every note either a chord tone or in the key.
          local strong, strongOn, nct, nctStepped = 0, 0, 0, 0
          for i, n in ipairs(notes) do
            ok(n.pitch >= centre - Mel.RANGE_BELOW and n.pitch <= centre + Mel.RANGE_ABOVE,
               t .. ": note " .. i .. " in range")
            local ch = chordAt(r.chords, n.start)
            ok(ch.pcs[n.pitch % 12] or key.pcs[n.pitch % 12],
               t .. ": note " .. i .. " is a chord tone or in the key")
            local inBar = n.start % 4
            local onChange = false
            for _, c in ipairs(r.chords) do if math.abs(c.start - n.start) < 1e-9 then onChange = true end end
            if inBar < 1e-9 or math.abs(inBar - 2) < 1e-9 or onChange then
              strong = strong + 1
              if ch.pcs[n.pitch % 12] then strongOn = strongOn + 1 end
            elseif not ch.pcs[n.pitch % 12] then
              nct = nct + 1
              if i > 1 and math.abs(n.pitch - notes[i - 1].pitch) <= 2 then nctStepped = nctStepped + 1 end
            end
          end
          ok(strong == 0 or strongOn / strong >= 0.9,
             ("%s: strong beats on chord tones, %d of %d"):format(t, strongOn, strong))
          ok(nct == 0 or nctStepped / nct >= 0.8,
             ("%s: passing notes reached by step, %d of %d"):format(t, nctStepped, nct))
        end
        -- Different from each other: at least DISTINCT of their notes, by
        -- start and pitch, not shared.
        for i = 1, #sugs do
          for j = i + 1, #sugs do
            local set, shared = {}, 0
            for _, n in ipairs(sugs[i].notes) do set[n.start .. ":" .. n.pitch] = true end
            for _, n in ipairs(sugs[j].notes) do if set[n.start .. ":" .. n.pitch] then shared = shared + 1 end end
            local apart = 1 - shared / math.max(#sugs[i].notes, #sugs[j].notes)
            ok(apart >= Mel.DISTINCT - 1e-9,
               ("%s: #%d and #%d are %.0f%% apart"):format(tag, i, j, apart * 100))
          end
        end
      end
    end
  end
end

------------------------------------------------------------------------------
-- The controls do what they say
------------------------------------------------------------------------------

do
  local function average(field)
    local out = {}
    for d = 1, #Mel.DENSITIES do
      local total, count = 0, 0
      for v = 0, 3 do
        for _, s in ipairs((suggest("popChords", d, 2, v))) do
          total, count = total + field(s), count + 1
        end
      end
      out[d] = total / count
    end
    return out
  end
  local n = average(function(s) return #s.notes end)
  ok(n[1] < n[2] and n[2] < n[3],
     ("sparse < medium < busy in notes: %.1f %.1f %.1f"):format(n[1], n[2], n[3]))
end

do
  local means = {}
  for reg = 1, #Mel.REGISTERS do
    local total, count = 0, 0
    for _, s in ipairs((suggest("popChords", 2, reg))) do
      for _, n in ipairs(s.notes) do total, count = total + n.pitch, count + 1 end
    end
    means[reg] = total / count
  end
  ok(means[1] < means[2] and means[2] < means[3],
     ("low < mid < high: %.1f %.1f %.1f"):format(means[1], means[2], means[3]))
end

-- The same request gives the same melodies; more ideas give others.
do
  local a = suggest("popChords", 2, 2, 0)
  local b = suggest("popChords", 2, 2, 0)
  local c = suggest("popChords", 2, 2, 1)
  eq(sig(a[1].notes), sig(b[1].notes), "repeatable")
  ok(sig(a[1].notes) ~= sig(c[1].notes), "a variation gives another tune")
end

------------------------------------------------------------------------------
-- Pieces of it
------------------------------------------------------------------------------

-- Repetition: a four-bar phrase repeats its first bar's rhythm in its third.
do
  local rnd = (function()
    local s = 12345
    return function() s = (s * 48271) % 2147483647; return s / 2147483647 end
  end)()
  for density = 1, #Mel.DENSITIES do
    local ev = Mel.rhythm(rnd, density, 4, 16)
    local bars = {}
    for _, e in ipairs(ev) do
      bars[e.bar] = bars[e.bar] or {}
      table.insert(bars[e.bar], (e.start - e.bar * 4) .. "/" .. e.len)
    end
    eq(table.concat(bars[2] or {}, " "), table.concat(bars[0] or {}, " "),
       Mel.DENSITIES[density].name .. ": bar three repeats bar one")
    -- And the phrase ends on a held note from the half bar.
    local last = ev[#ev]
    eq(last.start, 14, Mel.DENSITIES[density].name .. ": the cadence note is on the half bar")
    eq(last.len, 2, Mel.DENSITIES[density].name .. ": and held to the end")
  end
end

-- The note-by-note rule, before the whole-melody score has chosen among the
-- drafts: a strong beat takes a chord tone. The final choice hides this -
-- the scoring would prefer such drafts anyway - so it is checked on the raw
-- drafts, where taking STRONG_OTHER away drops the share to about 97%.
do
  local on, all = 0, 0
  for _, name in ipairs({ "popChords", "arpeggios", "walking" }) do
    local r, key = read(name)
    for seed = 1, 200 do
      local s = seed * 7919
      local rnd = function() s = (s * 48271) % 2147483647; return s / 2147483647 end
      local ev = Mel.rhythm(rnd, 2, 4, r.beats)
      for _, n in ipairs(Mel.pitches(rnd, ev, r.chords, key, 4, 67, r.beats)) do
        if n.strong then
          all = all + 1
          if chordAt(r.chords, n.start).pcs[n.pitch % 12] then on = on + 1 end
        end
      end
    end
  end
  ok(on / all >= 0.995, ("raw drafts put %.2f%% of strong beats on chord tones"):format(100 * on / all))
end

-- Over a chord borrowed from outside the key, the key's clashing note is no
-- longer a passing note: E major in A minor has G#, so no G natural.
do
  for v = 0, 3 do
    for d = 1, 3 do
      local sugs, r = suggest("arpeggios", d, 2, v)
      for _, s in ipairs(sugs) do
        for _, n in ipairs(s.notes) do
          if n.start >= 8 and n.start < 12 then
            ok(n.pitch % 12 ~= 7, ("no G natural over E major (d%d v%d, beat %g)"):format(d, v, n.start))
          end
        end
      end
    end
  end
end

-- Any bar length is filled, not only four beats.
for _, bb in ipairs({ 3, 2.5, 6 }) do
  local r = R.analyse(F.popChords, bb, T)
  local key = T.key(r.keys[1].root, r.keys[1].scale)
  local sugs = Mel.suggest(r.chords, T, { key = key, beats = r.beats, barBeats = bb, density = 2, register = 2 })
  ok(#sugs >= 1, "bars of " .. bb .. " beats")
  local last = sugs[1].notes[#sugs[1].notes]
  ok(math.abs(last.start + last.len - r.beats) < 1e-9, "bars of " .. bb .. ": fills to the end")
end

C.done()
