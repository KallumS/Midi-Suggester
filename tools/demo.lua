--[[ What the engine suggests for the test tunes, printed.

       lua5.4 tools/demo.lua

     No REAPER needed. This is the quickest way to see what a change to a
     weight in ms_harmony.lua or ms_melody.lua does to real music: run it
     before and after, and diff the two.
]]

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local S = HERE .. "/../reascripts/"
local T = dofile(S .. "ms_theory.lua")
local R = dofile(S .. "ms_read.lua")
local H = dofile(S .. "ms_harmony.lua")
local Mel = dofile(S .. "ms_melody.lua")
local F = dofile(HERE .. "/../tests/fixtures.lua")

local function keyOf(r)
  return T.key(r.keys[1].root, r.keys[1].scale)
end

for _, name in ipairs({ "twinkle", "ode", "minorTune" }) do
  local r = R.analyse(F[name], 4, T)
  local key = keyOf(r)
  print(("%s  -  %s, %s"):format(name, r.kind, key.label))
  for colour = 1, 3 do
    print("  " .. H.COLOURS[colour])
    local sugs = H.suggest(r.line, T, { key = key, beats = r.beats, barBeats = 4,
                                        rhythm = 1, colour = colour })
    for _, s in ipairs(sugs) do
      print(("    %-34s %-40s fits %3d%%"):format(table.concat(s.numerals, " "),
            table.concat(s.symbols, " "), math.floor(s.match * 100 + 0.5)))
    end
  end
  print()
end

local function show(notes, key)
  local out = {}
  for _, n in ipairs(notes) do
    out[#out + 1] = ("%s%d@%g"):format(T.noteName(key, n.pitch % 12), n.pitch // 12 - 1, n.start)
  end
  return table.concat(out, " ")
end

for _, name in ipairs({ "popChords", "arpeggios", "walking" }) do
  local r = R.analyse(F[name], 4, T)
  local key = keyOf(r)
  local syms = {}
  for _, c in ipairs(r.chords) do syms[#syms + 1] = c.name end
  print(("%s  -  %s, %s:  %s"):format(name, r.kind, key.label, table.concat(syms, " ")))
  for density = 1, #Mel.DENSITIES do
    print("  " .. Mel.DENSITIES[density].name)
    local sugs = Mel.suggest(r.chords, T, { key = key, beats = r.beats, barBeats = 4,
                                             density = density, register = 2 })
    for _, s in ipairs(sugs) do
      print(("    %3d  %s"):format(math.floor(s.score * 10 + 0.5), show(s.notes, key)))
    end
  end
  print()
end
