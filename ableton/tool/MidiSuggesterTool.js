/* Midi Suggester - built by ableton/kit/build.py from ableton/tool.json. Do not edit; edit the sources and rebuild. */
var DEVICE = {"beside": true, "generator": "midi-suggester", "keyless": true, "result": "Suggestion", "title": "Midi Suggester", "tool": "transform"};
DEVICE.files = {"adapters/common.lua": "--[[ Noterator - what every generator adapter shares.\n\n     The engines in the folders beside this one are the family's own, copied\n     unchanged from their repositories. An adapter is the only thing written\n     for Noterator: it turns one engine's settings into lists the app can show\n     and its output into parts the app can drop into a score. The app speaks\n     to every adapter the same way:\n\n       A.id, A.name, A.description\n       A.input                 \"none\", or \"selection\" when it works on music\n                               the user has selected\n       A.panel                 \"generate\", \"toolbox\", or nil: not shown\n       A.newState()            a fresh table of settings\n       A.settings(st, ctx)     the settings to show now, each\n                               { id, label, names = {...}, index, hint, hints = {...}, group }\n       A.set(st, id, index)    choose the index-th value of a setting\n       A.useKey(st, root, scale)   follow the score's key (1-based ScaleView indices)\n       A.generate(st, ctx, seed, count)\n                               { results = { { title, detail, beats, parts = {\n                                   { name, drums, instrument, notes = { {start, len, pitch, vel} } } } } },\n                                 message }\n\n     Times are quarter notes from the start of the result. `ctx` is\n       { root, scale, num, den, barBeats, bpm, inst, catalogueId, bars,\n         selection = { notes, beats, drums } } ]]\n\nlocal C = {}\n\nfunction C.indexOf(list, v)\n  for i, x in ipairs(list) do if x == v then return i end end\n  return nil\nend\n\n-- A setting: `values` are what the engine stores, `names` what the window\n-- shows. `when(st)` hides it when it does nothing (no dead controls).\nfunction C.setting(id, label, values, names, opts)\n  opts = opts or {}\n  local shown = {}\n  for i, v in ipairs(values) do shown[i] = names and names[i] or tostring(v) end\n  return { id = id, label = label, values = values, names = shown, hint = opts.hint,\n           hints = opts.hints, when = opts.when, group = opts.group, dynamic = opts.dynamic }\nend\n\nfunction C.onOff(id, label, opts)\n  return C.setting(id, label, { true, false }, { \"On\", \"Off\" }, opts)\nend\n\n-- What the window draws: the settings that apply to this state.\nfunction C.describe(list, st, ctx)\n  local out = {}\n  for _, s in ipairs(list) do\n    if not s.when or s.when(st) then\n      local values, names, hints = s.values, s.names, s.hints\n      if s.dynamic then values, names, hints = s.dynamic(st, ctx) end\n      local index = C.indexOf(values, st[s.id]) or 1\n      out[#out + 1] = { id = s.id, label = s.label, names = names, index = index,\n                        hint = s.hint or \"\", hints = hints or {}, group = s.group or \"\" }\n    end\n  end\n  return out\nend\n\nfunction C.set(list, st, id, index, ctx)\n  for _, s in ipairs(list) do\n    if s.id == id then\n      local values = s.values\n      if s.dynamic then values = s.dynamic(st, ctx) end\n      if values[index] ~= nil then st[id] = values[index] end\n      return true\n    end\n  end\n  return false\nend\n\n-- Notes as the app wants them, whatever the engine called the fields.\nfunction C.notes(list, chan)\n  local out = {}\n  for _, n in ipairs(list or {}) do\n    if not chan or (n.chan or 0) == chan then\n      out[#out + 1] = { start = n.start, len = n.len, pitch = n.pitch, vel = n.vel or 100 }\n    end\n  end\n  table.sort(out, function(a, b)\n    if a.start ~= b.start then return a.start < b.start end\n    return a.pitch < b.pitch\n  end)\n  return out\nend\n\nfunction C.finish(notes)\n  local e = 0\n  for _, n in ipairs(notes) do e = math.max(e, n.start + n.len) end\n  return e\nend\n\nreturn C\n", "adapters/index.lua": "return { \"adapters/midi_suggester.lua\" }\n", "adapters/midi_suggester.lua": "--[[ Midi Suggester, in Noterator.\n\n     Select some music and it works out whether it is a melody or a chord\n     progression, and what key it is in - its own reading, as in REAPER - then\n     suggests chords to go under a melody or melodies to go over chords. ]]\n\nlocal C = engine(\"adapters/common.lua\")\nlocal T = engine(\"midi-suggester/ms_theory.lua\")\nlocal R = engine(\"midi-suggester/ms_read.lua\")\nlocal H = engine(\"midi-suggester/ms_harmony.lua\")\nlocal Mel = engine(\"midi-suggester/ms_melody.lua\")\n\nlocal A = {\n  id = \"midi-suggester\",\n  name = \"Suggest Notes\",    -- Midi Suggester (decision 0025)\n  description = \"Select a melody and get chord progressions to go under it, or select chords and get melodies to go over them.\",\n  input = \"selection\",\n  panel = \"generate\",\n}\n\nlocal function names(list)\n  local out = {}\n  for i, x in ipairs(list) do out[i] = x.name or x end\n  return out\nend\nlocal function range(n) local out = {} for i = 1, n do out[i] = i end return out end\n\nlocal LIST = {\n  C.setting(\"what\", \"Suggest\", { \"Auto\", \"Melody\", \"Chords\" },\n    { \"Whatever fits\", \"Chords under it\", \"A melody over it\" },\n    { hint = \"Auto reads the selection: a tune gets chords, chords get a tune.\" }),\n  C.setting(\"rhythm\", \"Chord pace\", range(#H.RHYTHMS), names(H.RHYTHMS), {\n    group = \"Chords\", when = function(st) return st.what ~= \"Chords\" end }),\n  C.setting(\"colour\", \"Colour\", range(#H.COLOURS), H.COLOURS, {\n    group = \"Chords\", when = function(st) return st.what ~= \"Chords\" end }),\n  C.setting(\"bass\", \"Bass line\", { true, false }, { \"Yes\", \"No\" }, {\n    group = \"Chords\", when = function(st) return st.what ~= \"Chords\" end }),\n  C.setting(\"density\", \"Density\", range(#Mel.DENSITIES), names(Mel.DENSITIES), {\n    group = \"Melody\", when = function(st) return st.what ~= \"Melody\" end }),\n  C.setting(\"register\", \"Register\", range(#Mel.REGISTERS), names(Mel.REGISTERS), {\n    group = \"Melody\", when = function(st) return st.what ~= \"Melody\" end }),\n}\n\nfunction A.newState()\n  return { what = \"Auto\", rhythm = #H.RHYTHMS, colour = 1, bass = true, density = 2, register = 2 }\nend\nfunction A.settings(st, ctx) return C.describe(LIST, st, ctx) end\nfunction A.set(st, id, index, ctx) C.set(LIST, st, id, index, ctx) end\nfunction A.useKey() end   -- it reads the key from the music itself\n\nfunction A.generate(st, ctx, seed, count)\n  local sel = ctx.selection\n  if not sel or #sel.notes == 0 then\n    return { results = {}, message = \"Select some music in the score first - a melody, or some chords.\" }\n  end\n  local barBeats = ctx.barBeats\n  local forced = (st.what == \"Melody\" and \"Melody\") or (st.what == \"Chords\" and \"Chords\") or nil\n  -- \"Suggest a melody\" means the selection is the chords, and vice versa.\n  if st.what == \"Melody\" then forced = \"Chords\" elseif st.what == \"Chords\" then forced = \"Melody\" end\n  local r = R.analyse(sel.notes, barBeats, T, forced)\n  if not r then return { results = {}, message = \"Nothing to read in the selection.\" } end\n  r.beats = math.max(r.beats, sel.beats or 0)\n  local key = T.key(r.keys[1].root, r.keys[1].scale)\n\n  local out = {}\n  if r.kind == \"Melody\" then\n    local sugs = H.suggest(r.line, T, { key = key, beats = r.beats, barBeats = barBeats,\n                                        rhythm = st.rhythm, colour = st.colour, variation = seed - 1 })\n    for _, s in ipairs(sugs) do\n      local parts = { { name = \"Chords\", notes = C.notes(H.voice(s, r.line, false)) } }\n      if st.bass then\n        local bass = {}\n        for _, c in ipairs(s.chords) do\n          bass[#bass + 1] = { start = c.start, len = c.len,\n                              pitch = H.BASS_LOW + (c.chord.root - H.BASS_LOW) % 12, vel = H.VELOCITY or 100 }\n        end\n        parts[2] = { name = \"Bass\", notes = C.notes(bass) }\n      end\n      out[#out + 1] = { title = table.concat(s.symbols, \"  \"),\n                        detail = (\"%s  -  fits the tune %d%%\"):format(table.concat(s.numerals, \" \"), math.floor(s.match * 100 + 0.5)),\n                        beats = r.beats, parts = parts }\n      if #out >= (count or 6) then break end\n    end\n  else\n    local sugs = Mel.suggest(r.chords, T, { key = key, beats = r.beats, barBeats = barBeats,\n                                            density = st.density, register = st.register, variation = seed - 1 })\n    for i, s in ipairs(sugs) do\n      out[#out + 1] = { title = (\"Melody %d\"):format(i),\n                        detail = (\"%d notes, %s to %s\"):format(#s.notes, T.noteName(key, s.low % 12) .. (s.low // 12 - 1),\n                                                               T.noteName(key, s.high % 12) .. (s.high // 12 - 1)),\n                        beats = r.beats, parts = { { name = \"Melody\", notes = C.notes(s.notes) } } }\n      if #out >= (count or 6) then break end\n    end\n  end\n  local chordNames = {}\n  if r.chords then for _, c in ipairs(r.chords) do chordNames[#chordNames + 1] = c.name end end\n  local msg = (\"Read the selection as %s in %s%s\"):format(r.kind == \"Melody\" and \"a melody\" or \"chords\", key.label,\n              #chordNames > 0 and (\": \" .. table.concat(chordNames, \" \")) or \"\")\n  return { results = out, message = msg }\nend\n\nreturn A\n", "midi-suggester/ms_harmony.lua": "--[[ Midi Suggester - chords for a melody.\n\n     Pure Lua: no reaper., no ImGui.\n\n     The melody is cut into slots, one per chord change, and every chord the\n     key offers is scored against every slot for how well it fits the notes\n     over it. A progression is then a path through the slots, and its score\n     is how well each chord fits plus how well each chord leads to the next.\n     The best few paths that differ enough from each other are the\n     suggestions.\n\n     How well a chord leads to the next is common-practice harmonic syntax:\n     tonic, subdominant and dominant, cycling T -> S -> D -> T, a phrase\n     that starts on the tonic and ends on a cadence. That is the model Open\n     Music Theory teaches (\"Harmonic syntax - the idealized phrase\", \"Harmonic\n     functions\"), with the pop schemata it lists - I V vi IV and the rest -\n     all scoring well under it, because each of their moves is one it rewards.\n\n     Every number that makes a musical judgement is a named constant at the\n     top, so the judgement can be read in one place and tuned in one place.\n]]\n\nlocal M = {}\n\n------------------------------------------------------------------------------\n-- Choices offered\n------------------------------------------------------------------------------\n\n-- How often the chord changes. Bars, not beats: a harmony moving every beat\n-- under a melody is a reharmonisation exercise rather than a suggestion.\nM.RHYTHMS = {\n  { name = \"2 a Bar\",    bars = 0.5 },\n  { name = \"1 a Bar\",    bars = 1 },\n  { name = \"1 per 2 Bars\", bars = 2 },\n  -- Auto: the melody decides. It is read in half bars, a change on the bar\n  -- line is free and one on the half bar has to be earned (CHANGE_HALF), and\n  -- a chord may hold for as long as the tune lets it - so chords come out\n  -- half a bar, a bar, two bars long, wherever the melody puts them. Last in\n  -- the list so a saved choice of the other three still means what it meant.\n  { name = \"Auto\",      auto = true },\n}\n\n-- How far past plain triads the palette reaches. Each includes the one\n-- before it.\nM.COLOURS = { \"Triads\", \"Sevenths\", \"Colourful\" }\n\nM.SUGGESTIONS = 6\n\n------------------------------------------------------------------------------\n-- The judgement\n------------------------------------------------------------------------------\n\n-- How much a melody note counts, by where it falls. A note on the chord\n-- change is heard against the chord most of all; one tied over from before\n-- the change least.\nM.ACCENT_CHANGE = 2.0\nM.ACCENT_BEAT   = 1.4\nM.ACCENT_OFF    = 1.0\nM.ACCENT_TIED   = 0.8\n-- And the tune's last note most of all: it is where the cadence is heard, so\n-- a chord that clashes with it is the one clash nobody will miss.\nM.ACCENT_FINAL  = 2.0\n\n-- What a melody note is worth against a chord, per unit of weight.\nM.TONE_CHORD      =  1.0    -- a chord tone\nM.TONE_SEVENTH    =  0.9    -- the seventh of a seventh chord: a chord tone, just\nM.TONE_PASSING    = -0.25   -- a scale note that is not in the chord\nM.TONE_ACCENTED   = -0.6    -- the same, struck on the change: an appoggiatura\nM.TONE_AVOID      = -0.25   -- extra, a semitone over a chord tone: F over E\nM.TONE_CHROMATIC  = -0.8    -- a note from outside the key and the chord\n\n-- What reaching further costs, before the melody earns it back.\n--\n-- The primary triads, I IV and V, harmonise almost any diatonic tune, and\n-- a harmonisation built from them is the one a musician reaches for first.\n-- vi and ii are the next commonest; iii is rare; the diminished vii, as a\n-- chord in its own right, rarer still. Without these costs every chord that\n-- happened to hold the melody note scored alike, and Twinkle came out as\n-- I iii ii V vii iii V I.\n--\n-- Which chords are rare depends on the mode. In a major key iii is the rare\n-- one; in a minor key III, VI and VII are major chords, as common as any -\n-- the relative major and the chords either side of it. The diminished triad\n-- is rare in both, and is charged for being diminished rather than for the\n-- degree it sits on: this table was once indexed by degree alone, written\n-- for major, and in A minor it charged G major (VII) the diminished\n-- chord's price while B diminished (ii) went nearly free. The minor tune\n-- at a chord a bar came out Amin Bdim Emin Amin.\nM.COST_DEGREE       = { [0] = 0, 0.04, 0.10, 0, 0, 0.04, 0.04 }   -- a major key\nM.COST_DEGREE_MINOR = { [0] = 0, 0.04, 0.04, 0, 0, 0.04, 0.04 }   -- a minor key\nM.COST_DIMINISHED   = 0.26   -- a diminished triad, on any degree\nM.COST_SEVENTH    = 0.06    -- waived when the melody plays the seventh\n-- A minor dominant - v in natural minor - has no leading tone, and the\n-- leading tone is what makes a dominant pull home (Open Music Theory,\n-- \"Harmonic functions\": ti is the dominant's trigger). Where the melody does\n-- not choose between v and V, V wins by this much.\nM.COST_MINOR_DOMINANT = 0.03\nM.COST_BORROWED   = 0.20\nM.COST_SECONDARY  = 0.15\n\n-- Moves between functions (T, S, D), after Open Music Theory's T-S-D-T\n-- cycle: the forward moves score, D back to S is a retrogression.\nM.FUNCTION_MOVE = {\n  T = { T = 0.05, S = 0.30, D = 0.20 },\n  S = { T = 0.10, S = 0.10, D = 0.35 },\n  D = { T = 0.40, S = -0.25, D = 0.05 },\n}\n-- Root motion, in semitones up from one root to the next.\nM.ROOT_MOVE = { [5] = 0.20, [2] = 0.05, [9] = 0.05, [8] = 0.05, [6] = -0.20 }\nM.SAME_CHORD      = 0.1   -- holding a chord across a change is allowed\n\n-- Auto timing: what changing chord on the half bar costs. It was first\n-- tried a beat at a time, with a cost for each beat by how strong it is, and\n-- abandoned: every change also collects a reward for moving well, so the\n-- finer the grid the more changes paid for themselves, and the minor tune\n-- changed chord on nine of its sixteen beats at every cost tried short of\n-- forbidding it. Half bars are where tonal harmony changes anyway.\nM.CHANGE_HALF = -0.25\n-- A secondary dominant resolving to its target, on top of scoring as a\n-- dominant going home (see M.move). It was 0.6 while the resolution was\n-- wrongly scored by the target's function; once that was fixed, 0.6 put two\n-- or three in every Colourful suggestion, and 0.2 leaves one or two. At 0\n-- a C before F no longer splits into C7.\nM.SECONDARY_HOME  =  0.2\n-- And one that does not is not offered at all. It was a cost of -0.5 at\n-- first, which held in the fixed rhythms by luck and gave way in Auto,\n-- where a B7 in A minor went to A minor instead of E. A secondary dominant\n-- exists to lead to its chord; one that does not reads as a wrong note.\nM.SECONDARY_LOST  = -1e6\nM.PLAGAL_POP      =  0.20   -- bVII-I and iv-I, rock's and pop's own cadences\n\nM.START_TONIC     =  0.40   -- begin on I\nM.START_T         =  0.10   -- or on another tonic-function chord\nM.START_D         = -0.20\nM.END_TONIC       =  0.60   -- an authentic or plagal cadence home\nM.END_HALF        =  0.25   -- a half cadence, ending on V\nM.END_OTHER       = -0.20\n\nM.W_FIT, M.W_MOVE = 1.0, 0.6\n\nM.KEEP_PER_CHORD  = 24      -- paths kept ending on each chord, per slot\nM.NOISE           = 0.08    -- how far \"More Ideas\" shakes the fit scores\n\n------------------------------------------------------------------------------\n-- The palette\n------------------------------------------------------------------------------\n\n-- The function of each diatonic degree: I, iii and vi are tonic, ii and IV\n-- subdominant, V and vii dominant (Open Music Theory, \"Harmonic functions\").\nlocal DEGREE_FUNCTION = { [0] = \"T\", \"S\", \"T\", \"S\", \"D\", \"T\", \"D\" }\n\nlocal function chordOf(root, ivs)\n  local has, pcs, list = {}, {}, {}\n  for _, iv in ipairs(ivs) do\n    has[iv % 12] = true\n    pcs[(root + iv) % 12] = true\n    list[#list + 1] = iv % 12\n  end\n  return { root = root, has = has, pcs = pcs, ivs = list, size = #list }\nend\n\nlocal function sig(ch)\n  local l = {}\n  for pc in pairs(ch.pcs) do l[#l + 1] = pc end\n  table.sort(l)\n  return ch.root .. \":\" .. table.concat(l, \",\")\nend\n\n-- Stack every other note of the scale on degree d.\nlocal function stacked(key, T, d, count)\n  local root = T.degreePc(key, d)\n  local ivs = {}\n  for i = 0, count - 1 do ivs[#ivs + 1] = (T.degreePc(key, d + 2 * i) - root) % 12 end\n  return chordOf(root, ivs)\nend\n\nlocal MAJOR, MINOR, DOM7 = { 0, 4, 7 }, { 0, 3, 7 }, { 0, 4, 7, 10 }\n\n--[[  Every chord a progression may use in this key, at this colour.\n\n      Triads: the seven built from the scale, bar an augmented one - III+ in\n      harmonic minor is a chord nobody reaches for.\n\n      A minor-ish key also gets the major V, from the harmonic minor, which\n      is the chord that makes a minor key cadence at all.\n\n      Sevenths add the seven diatonic sevenths.\n\n      Colourful adds what pop and rock borrow from the parallel key - iv,\n      bVI, bVII and bIII in a major key; IV and the Neapolitan bII in a minor\n      one - and the secondary dominants: V7 of ii, IV, V and vi. ]]\nfunction M.palette(key, T, colour)\n  colour = colour or 1\n  local out, seen = {}, {}\n  local function add(ch, fields)\n    local s = sig(ch)\n    if seen[s] then return end\n    seen[s] = true\n    for k, v in pairs(fields) do ch[k] = v end\n    ch.numeral = ch.numeral or T.numeral(key, ch.root, ch.has)\n    local pitches = {}\n    for _, iv in ipairs(ch.ivs) do pitches[#pitches + 1] = 48 + ch.root + iv end\n    ch.symbol = T.nameChord(pitches, key)\n    -- A root from outside the key is spelled the way its numeral says: bVII\n    -- in C is Bb, not the A# that C major's sharp-leaning names would give.\n    if not key.pcs[ch.root] then\n      local plain = T.chordNoteName(key, ch.root)\n      local numeral = T.numeral(key, ch.root, ch.has)\n      local names = numeral:sub(1, 1) == \"#\" and T.SHARP_NAMES or T.FLAT_NAMES\n      ch.symbol = names[ch.root + 1] .. ch.symbol:sub(#plain + 1)\n    end\n    ch.id = #out + 1\n    out[#out + 1] = ch\n  end\n\n  for d = 0, 6 do\n    local ch = stacked(key, T, d, 3)\n    if not (ch.has[4] and ch.has[8]) then\n      add(ch, { degree = d, func = DEGREE_FUNCTION[d], kind = \"diatonic\" })\n    end\n  end\n  local dom = key.degreePc[4]\n  if not key.pcs[(dom + 4) % 12] then\n    add(chordOf(dom, MAJOR), { degree = 4, func = \"D\", kind = \"raised\" })\n  end\n\n  if colour >= 2 then\n    for d = 0, 6 do\n      add(stacked(key, T, d, 4), { degree = d, func = DEGREE_FUNCTION[d], kind = \"diatonic\" })\n    end\n    if not key.pcs[(dom + 4) % 12] then\n      add(chordOf(dom, DOM7), { degree = 4, func = \"D\", kind = \"raised\" })\n    end\n  end\n\n  if colour >= 3 then\n    local t = key.tonic\n    if key.majorish then\n      add(chordOf((t + 5) % 12, MINOR),  { func = \"S\", kind = \"borrowed\" })   -- iv\n      add(chordOf((t + 8) % 12, MAJOR),  { func = \"S\", kind = \"borrowed\" })   -- bVI\n      add(chordOf((t + 10) % 12, MAJOR), { func = \"S\", kind = \"borrowed\", plagal = true }) -- bVII\n      add(chordOf((t + 3) % 12, MAJOR),  { func = \"T\", kind = \"borrowed\" })   -- bIII\n    else\n      add(chordOf((t + 5) % 12, MAJOR),  { func = \"S\", kind = \"borrowed\" })   -- IV\n      add(chordOf((t + 1) % 12, MAJOR),  { func = \"S\", kind = \"borrowed\" })   -- bII\n    end\n    for _, d in ipairs({ 1, 3, 4, 5 }) do\n      local target = stacked(key, T, d, 3)\n      -- Only a chord that can be a key can be tonicised: not a diminished one.\n      if not target.has[6] then\n        local ch = chordOf((target.root + 7) % 12, DOM7)\n        add(ch, { func = \"D\", kind = \"secondary\", target = target.root,\n                  numeral = \"V7/\" .. T.numeral(key, target.root, target.has) })\n      end\n    end\n  end\n\n  -- iv and bVII lead home in the plagal way pop does.\n  for _, ch in ipairs(out) do\n    if ch.kind == \"borrowed\" and ch.func == \"S\" and ch.root == (key.tonic + 5) % 12 then\n      ch.plagal = true\n    end\n  end\n  return out\nend\n\n------------------------------------------------------------------------------\n-- Fitting a chord to a slot\n------------------------------------------------------------------------------\n\n--[[  The melody notes over the stretch a to b, weighted: { start, len,\n      notes = { {pc, w, dur, changed} } }. A note that starts on a is heard\n      on the change; one tied over from before it least. ]]\nfunction M.span(line, a, b, pulse)\n  pulse = pulse or 1\n  local final = line[#line]\n  local s = { start = a, len = b - a, notes = {} }\n  for _, note in ipairs(line) do\n    local lo, hi = math.max(a, note.start), math.min(b, note.start + note.len)\n    if hi - lo > 1e-9 then\n      local accent\n      if note.start < a - 1e-9 then accent = M.ACCENT_TIED\n      elseif math.abs(note.start - a) < 1e-6 then accent = M.ACCENT_CHANGE\n      elseif math.abs((note.start / pulse) - math.floor(note.start / pulse + 0.5)) < 1e-6 then\n        accent = M.ACCENT_BEAT\n      else accent = M.ACCENT_OFF end\n      local w = (hi - lo) * accent\n      if note == final then w = w * M.ACCENT_FINAL end\n      s.notes[#s.notes + 1] = { pc = note.pitch % 12, w = w,\n                                dur = hi - lo, changed = accent == M.ACCENT_CHANGE }\n    end\n  end\n  return s\nend\n\n-- The melody cut into equal slots, one per chord change.\nfunction M.slots(line, beats, slotLen, pulse)\n  local n = math.max(1, math.ceil(beats / slotLen - 1e-6))\n  local out = {}\n  for i = 0, n - 1 do\n    local a = i * slotLen\n    out[#out + 1] = M.span(line, a, math.min(beats, a + slotLen), pulse)\n  end\n  return out\nend\n\n-- How well a chord fits the notes over a slot, from -1 to 1. An empty slot\n-- fits everything equally, and leaves the choice to the moves either side.\nfunction M.fit(ch, slot, key)\n  local total, sum, playsSeventh = 0, 0, false\n  for _, n in ipairs(slot.notes) do\n    local v\n    if ch.pcs[n.pc] then\n      local iv = (n.pc - ch.root) % 12\n      if iv == 10 or iv == 11 or (iv == 9 and ch.size >= 4) then\n        v, playsSeventh = M.TONE_SEVENTH, true\n      else\n        v = M.TONE_CHORD\n      end\n    else\n      if key.pcs[n.pc] then\n        v = n.changed and M.TONE_ACCENTED or M.TONE_PASSING\n      else\n        v = M.TONE_CHROMATIC\n      end\n      if ch.pcs[(n.pc - 1) % 12] then v = v + M.TONE_AVOID end\n    end\n    sum, total = sum + v * n.w, total + n.w\n  end\n  local f = total > 0 and sum / total or 0\n\n  if ch.kind == \"diatonic\" then\n    f = f - (key.majorish and M.COST_DEGREE or M.COST_DEGREE_MINOR)[ch.degree]\n  end\n  if ch.size == 3 and ch.has[3] and ch.has[6] then f = f - M.COST_DIMINISHED end\n  if ch.func == \"D\" and ch.degree == 4 and ch.has[3] then f = f - M.COST_MINOR_DOMINANT end\n  if ch.size >= 4 and not playsSeventh then f = f - M.COST_SEVENTH end\n  if ch.kind == \"borrowed\" then f = f - M.COST_BORROWED end\n  if ch.kind == \"secondary\" then f = f - M.COST_SECONDARY end\n  return f\nend\n\n-- The share of the melody's sounding time spent on chord tones. This is what\n-- the window shows as \"fits\", because it is the one number a musician can\n-- check by ear: how often the tune is sitting on the chord.\nfunction M.match(chords, slots)\n  local on, all = 0, 0\n  for i, s in ipairs(slots) do\n    for _, n in ipairs(s.notes) do\n      all = all + n.dur\n      if chords[i].pcs[n.pc] then on = on + n.dur end\n    end\n  end\n  return all > 0 and on / all or 1\nend\n\n------------------------------------------------------------------------------\n-- Moving from chord to chord\n------------------------------------------------------------------------------\n\nfunction M.move(a, b, key)\n  if a.id == b.id then return M.SAME_CHORD end\n  local v = M.FUNCTION_MOVE[a.func][b.func] or 0\n  if a.kind == \"secondary\" and b.root == a.target then\n    -- A secondary dominant resolving is a dominant going to its tonic, for\n    -- the moment. Scored by b's function, V7/IV into IV read as D into S -\n    -- a retrogression - and cost the C7 in C C7 | F its place to Cmaj7.\n    v = M.FUNCTION_MOVE.D.T\n  end\n  v = v + (M.ROOT_MOVE[(b.root - a.root) % 12] or 0)\n  if a.kind == \"secondary\" then\n    v = v + ((b.root == a.target) and M.SECONDARY_HOME or M.SECONDARY_LOST)\n  end\n  if a.plagal and b.root == key.tonic and b.func == \"T\" then v = v + M.PLAGAL_POP end\n  return v\nend\n\nlocal function startScore(ch, key)\n  if ch.func == \"T\" and ch.root == key.tonic then return M.START_TONIC end\n  if ch.func == \"T\" then return M.START_T end\n  if ch.func == \"D\" then return M.START_D end\n  return 0\nend\n\nlocal function endScore(ch, key)\n  if ch.kind == \"secondary\" then return M.SECONDARY_LOST end\n  if ch.root == key.tonic and ch.func == \"T\" then return M.END_TONIC end\n  if ch.func == \"D\" and ch.root == key.degreePc[4] and ch.kind ~= \"secondary\" then\n    return M.END_HALF\n  end\n  return M.END_OTHER\nend\n\n------------------------------------------------------------------------------\n-- The search\n------------------------------------------------------------------------------\n\n-- A small, fixed random number generator, so \"More Ideas\" gives the same\n-- ideas in the same order every time and the tests can hold it to that.\nlocal function rng(seed)\n  local s = (seed or 1) % 2147483647\n  if s <= 0 then s = s + 2147483646 end\n  return function()\n    s = (s * 48271) % 2147483647\n    return s / 2147483647\n  end\nend\nM.rng = rng\n\nlocal function differs(a, b)\n  local d = 0\n  for i = 1, #a do if a[i].id ~= b[i].id then d = d + 1 end end\n  return d\nend\n\n--[[  The suggestions for a melody.\n\n      opts: { key, beats, barBeats, pulse, rhythm (index into RHYTHMS),\n              colour (index into COLOURS), variation (0 for the best, then\n              1, 2, ... for more ideas) }\n\n      Returns a list of suggestions, best first, each\n        { chords = { {start, len, chord} ... }  -- repeats merged\n          numerals, symbols (strings), score, match (0..1) } ]]\nfunction M.suggest(line, T, opts)\n  local key = opts.key\n  local rhythm = M.RHYTHMS[opts.rhythm or 2]\n  local pulse = opts.pulse or 1\n  -- Auto reads half bars where a bar divides into two equal halves of beats\n  -- (4/4, 6/8, 2/2), and whole bars where it does not (3/4, 5/8).\n  local pulses = math.floor(opts.barBeats / pulse + 0.5)\n  local halves = rhythm.auto and pulses % 2 == 0\n  local slotLen = rhythm.auto and (halves and opts.barBeats / 2 or opts.barBeats)\n                  or opts.barBeats * rhythm.bars\n  local slots = M.slots(line, opts.beats, slotLen, pulse)\n  local change = {}\n  for i, s in ipairs(slots) do\n    local onBar = math.abs(s.start / opts.barBeats - math.floor(s.start / opts.barBeats + 0.5)) < 1e-6\n    change[i] = (rhythm.auto and not onBar) and M.CHANGE_HALF or 0\n  end\n  local pal = M.palette(key, T, opts.colour or 1)\n  local random = (opts.variation or 0) > 0 and rng(opts.variation * 7919) or nil\n\n  local fits = {}\n  for i, s in ipairs(slots) do\n    fits[i] = {}\n    for _, ch in ipairs(pal) do\n      local f = M.fit(ch, s, key)\n      if random then f = f + (random() * 2 - 1) * M.NOISE end\n      fits[i][ch.id] = f * M.W_FIT\n    end\n  end\n\n  -- Paths, kept per the chord they end on so that a strong chord cannot\n  -- crowd every other ending out of the search. Each path is its last chord\n  -- and a link to the path it grew from, so growing one copies nothing.\n  local paths = {}\n  for _, ch in ipairs(pal) do\n    paths[ch.id] = { { score = fits[1][ch.id] + startScore(ch, key), ch = ch, n = 1 } }\n  end\n\n  local moves = {}\n  for _, a in ipairs(pal) do\n    moves[a.id] = {}\n    for _, b in ipairs(pal) do\n      moves[a.id][b.id] = M.move(a, b, key) * M.W_MOVE\n    end\n  end\n  local function better(x, y) return x.score > y.score end\n\n  for i = 2, #slots do\n    local nextPaths = {}\n    for _, b in ipairs(pal) do\n      -- Each chord's paths are already best first, so the best ways into b\n      -- are a merge of those lists, not a sort of all of them together.\n      local cands, fb, at, cc = {}, fits[i][b.id], {}, change[i]\n      for _, a in ipairs(pal) do at[a.id] = 1 end\n      for k = 1, M.KEEP_PER_CHORD do\n        local bestA, bestScore\n        for _, a in ipairs(pal) do\n          local p = paths[a.id][at[a.id]]\n          if p then\n            local sc = p.score + moves[a.id][b.id] + (a.id ~= b.id and cc or 0)\n            if not bestScore or sc > bestScore then bestA, bestScore = a, sc end\n          end\n        end\n        if not bestA then break end\n        local p = paths[bestA.id][at[bestA.id]]\n        at[bestA.id] = at[bestA.id] + 1\n        cands[k] = { score = bestScore + fb, ch = b, prev = p, n = i }\n      end\n      nextPaths[b.id] = cands\n    end\n    paths = nextPaths\n  end\n\n  local all = {}\n  for _, ch in ipairs(pal) do\n    for _, p in ipairs(paths[ch.id]) do\n      local chords, q = {}, p\n      while q do chords[q.n] = q.ch; q = q.prev end\n      all[#all + 1] = { score = p.score + endScore(ch, key), chords = chords }\n    end\n  end\n  table.sort(all, better)\n\n  -- Distinct enough to be worth offering: a suggestion has to change at\n  -- least a quarter of the chords of every one already chosen.\n  local need = math.max(1, math.floor(#slots / 4))\n  local chosen = {}\n  for _, p in ipairs(all) do\n    local fresh = true\n    for _, q in ipairs(chosen) do\n      if differs(p.chords, q.chords) < need then fresh = false; break end\n    end\n    if fresh then\n      chosen[#chosen + 1] = p\n      if #chosen >= M.SUGGESTIONS then break end\n    end\n  end\n\n  local out = {}\n  for _, p in ipairs(chosen) do\n    local sug = { score = p.score, chords = {}, palette = pal, key = key, pulse = pulse }\n    for i, ch in ipairs(p.chords) do\n      local last = sug.chords[#sug.chords]\n      if last and last.chord.id == ch.id then\n        last.len = last.len + slots[i].len\n      else\n        sug.chords[#sug.chords + 1] = { start = slots[i].start, len = slots[i].len, chord = ch }\n      end\n    end\n    M.describe(sug, line)\n    out[#out + 1] = sug\n  end\n  return out\nend\n\n------------------------------------------------------------------------------\n-- Editing one progression, chord by chord\n--\n-- Once a progression is chosen, any one chord can be swapped for another,\n-- split in two with a passing chord in its second half, or removed and its\n-- time given to a neighbour. Everything else in the progression stays put.\n-- The alternatives are judged the way the search judged the chord: how it\n-- fits the melody over it, and how it moves from the chord before and into\n-- the chord after.\n------------------------------------------------------------------------------\n\n-- Numerals, symbols and the \"fits\" share, from the chords as they now stand.\nfunction M.describe(sug, line)\n  local numerals, symbols, on, all = {}, {}, 0, 0\n  for _, c in ipairs(sug.chords) do\n    numerals[#numerals + 1] = c.chord.numeral\n    symbols[#symbols + 1] = c.chord.symbol\n    for _, n in ipairs(M.span(line, c.start, c.start + c.len, sug.pulse).notes) do\n      all = all + n.dur\n      if c.chord.pcs[n.pc] then on = on + n.dur end\n    end\n  end\n  sug.numerals, sug.symbols = numerals, symbols\n  sug.match = all > 0 and on / all or 1\n  return sug\nend\n\n--[[  Other chords for chord i, best first, each { chord, score, match }.\n      A chord that could not stand there is not offered: a secondary dominant\n      not followed by its target, or anything after one that is not its\n      target. The chord already there is left out. ]]\nM.ALTERNATIVES = 8\nfunction M.alternatives(sug, i, line)\n  local c = sug.chords[i]\n  local key = sug.key\n  local span = M.span(line, c.start, c.start + c.len, sug.pulse)\n  local prev = sug.chords[i - 1] and sug.chords[i - 1].chord\n  local nxt = sug.chords[i + 1] and sug.chords[i + 1].chord\n  local out = {}\n  for _, ch in ipairs(sug.palette) do\n    if ch.id ~= c.chord.id then\n      local score = M.fit(ch, span, key) * M.W_FIT\n      score = score + (prev and M.move(prev, ch, key) * M.W_MOVE or startScore(ch, key))\n      score = score + (nxt and M.move(ch, nxt, key) * M.W_MOVE or endScore(ch, key))\n      if score > M.SECONDARY_LOST / 2 then\n        local on, all = 0, 0\n        for _, n in ipairs(span.notes) do\n          all = all + n.dur\n          if ch.pcs[n.pc] then on = on + n.dur end\n        end\n        out[#out + 1] = { chord = ch, score = score, match = all > 0 and on / all or 1 }\n      end\n    end\n  end\n  table.sort(out, function(a, b)\n    if a.score ~= b.score then return a.score > b.score end\n    return a.chord.id < b.chord.id\n  end)\n  for k = #out, M.ALTERNATIVES + 1, -1 do out[k] = nil end\n  return out\nend\n\nfunction M.replace(sug, i, ch, line)\n  sug.chords[i].chord = ch\n  return M.describe(sug, line)\nend\n\n-- The shortest chord a split may leave: a beat.\nfunction M.canSplit(sug, i)\n  return sug.chords[i].len >= 2 * sug.pulse - 1e-9\nend\n\n--[[  Splits chord i in two, on the beat nearest its middle, and puts the best\n      alternative in the second half - a passing chord, leading into the\n      chord after. Returns the new chord's index, or nil if it is too short\n      to split. ]]\nfunction M.split(sug, i, line)\n  if not M.canSplit(sug, i) then return nil end\n  local c = sug.chords[i]\n  local p = sug.pulse\n  local half = math.floor(c.len / 2 / p + 0.5) * p\n  half = math.max(p, math.min(c.len - p, half))\n  table.insert(sug.chords, i + 1, { start = c.start + half, len = c.len - half, chord = c.chord })\n  c.len = half\n  local best = M.alternatives(sug, i + 1, line)[1]\n  if best then sug.chords[i + 1].chord = best.chord end\n  M.describe(sug, line)\n  return i + 1\nend\n\nfunction M.canRemove(sug) return #sug.chords > 1 end\n\n--[[  Removes chord i. The chord before it takes its time; the first chord\n      gives its time to the one after. If that leaves the same chord twice in\n      a row - removing F from C F C - the two become one held chord, because\n      removing a chord is asking for fewer of them. Returns the index of the\n      chord that grew, or nil if it is the only chord. ]]\nfunction M.remove(sug, i, line)\n  if not M.canRemove(sug) then return nil end\n  local c = sug.chords[i]\n  local grew\n  if i > 1 then\n    sug.chords[i - 1].len = sug.chords[i - 1].len + c.len\n    grew = i - 1\n  else\n    sug.chords[2].start = c.start\n    sug.chords[2].len = sug.chords[2].len + c.len\n    grew = 1\n  end\n  table.remove(sug.chords, i)\n  local after = sug.chords[grew + 1]\n  if after and after.chord.id == sug.chords[grew].chord.id then\n    sug.chords[grew].len = sug.chords[grew].len + after.len\n    table.remove(sug.chords, grew + 1)\n  end\n  M.describe(sug, line)\n  return grew\nend\n\n-- A copy deep enough to edit without touching the original, so a progression\n-- can be put back the way it was suggested.\nfunction M.copy(sug)\n  local c = {}\n  for k, v in pairs(sug) do c[k] = v end\n  c.chords = {}\n  for i, ch in ipairs(sug.chords) do c.chords[i] = { start = ch.start, len = ch.len, chord = ch.chord } end\n  c.numerals, c.symbols = {}, {}\n  for i, v in ipairs(sug.numerals) do c.numerals[i] = v end\n  for i, v in ipairs(sug.symbols) do c.symbols[i] = v end\n  return c\nend\n\n------------------------------------------------------------------------------\n-- Voicing\n------------------------------------------------------------------------------\n\nM.VOICE_FLOOR   = 48   -- C3: the lowest an upper voice goes\nM.VOICE_CEILING = 76   -- E5\nM.BASS_LOW      = 36   -- C2 to B2 for the bass\nM.VELOCITY      = 100\n\n-- Every close-position voicing of the chord, each a sorted list of pitches,\n-- with its top at or under `hi` and its bottom at or over the floor.\nlocal function closeVoicings(ch, hi)\n  local pcs = {}\n  for _, iv in ipairs(ch.ivs) do pcs[#pcs + 1] = (ch.root + iv) % 12 end\n  table.sort(pcs, function(a, b) return (a - ch.root) % 12 < (b - ch.root) % 12 end)\n  local out = {}\n  for inv = 0, #pcs - 1 do\n    for base = M.VOICE_FLOOR, M.VOICE_FLOOR + 11 do\n      if base % 12 == pcs[inv + 1] then\n        for oct = 0, 2 do\n          local v, p = {}, base + oct * 12\n          for k = 0, #pcs - 1 do\n            local pc = pcs[(inv + k) % #pcs + 1]\n            while p % 12 ~= pc do p = p + 1 end\n            v[#v + 1] = p\n            p = p + 1\n          end\n          if v[#v] <= hi then out[#out + 1] = v end\n        end\n      end\n    end\n  end\n  return out\nend\n\nlocal function distance(a, b)\n  if #a == #b then\n    local d = 0\n    for i = 1, #a do d = d + math.abs(a[i] - b[i]) end\n    return d\n  end\n  local ca, cb = 0, 0\n  for _, p in ipairs(a) do ca = ca + p end\n  for _, p in ipairs(b) do cb = cb + p end\n  return math.abs(ca / #a - cb / #b) * math.max(#a, #b)\nend\n\n--[[  The notes of a suggestion: each chord in close position, under the\n      melody where there is room, moving as little as it can from the chord\n      before - which is what makes block chords sound like a part rather than\n      a column of shapes. And the root in the bass, if asked for. ]]\nfunction M.voice(sug, line, withBass)\n  local notes, prev = {}, nil\n  for _, c in ipairs(sug.chords) do\n    local lowest\n    for _, n in ipairs(line) do\n      if n.start < c.start + c.len and n.start + n.len > c.start then\n        lowest = math.min(lowest or 999, n.pitch)\n      end\n    end\n    local hi = math.min(M.VOICE_CEILING, (lowest or 999) - 1)\n    local options = closeVoicings(c.chord, hi)\n    if #options == 0 then options = closeVoicings(c.chord, M.VOICE_CEILING) end\n    local best, bestD\n    for _, v in ipairs(options) do\n      -- The first chord sits as high under the tune as it can, near middle C.\n      local d = prev and distance(v, prev) or math.abs(v[#v] - math.min(hi, 67))\n      if not best or d < bestD then best, bestD = v, d end\n    end\n    for _, p in ipairs(best) do\n      notes[#notes + 1] = { pitch = p, start = c.start, len = c.len, vel = M.VELOCITY }\n    end\n    if withBass then\n      local b = M.BASS_LOW + (c.chord.root - M.BASS_LOW) % 12\n      notes[#notes + 1] = { pitch = b, start = c.start, len = c.len, vel = M.VELOCITY }\n    end\n    prev = best\n  end\n  return notes\nend\n\nreturn M\n", "midi-suggester/ms_melody.lua": "--[[ Midi Suggester - melodies for a chord progression.\n\n     Pure Lua: no reaper., no ImGui.\n\n     A melody here is built the way a songwriter builds one, in two passes.\n\n     Rhythm first. One bar of rhythm - the motif - is drawn from cells of a\n     beat or two, and the phrase is made by repeating it: A, A again with\n     its end changed, A, then a cadence bar that states half the motif and\n     holds a long note. Repetition is most of what makes a tune sound like a\n     tune rather than a sequence of notes.\n\n     Then pitch, one note at a time, with the rules every melody-writing text\n     gives (Open Music Theory, \"Embellishing tones\", for the passing and\n     neighbour notes):\n\n       - a note on a strong beat is a chord tone;\n       - a note off the beat may be a scale note, but only if it is reached\n         by step - a passing or neighbour note - and not left hanging;\n       - most moves are steps, a leap is answered by a step back the other\n         way, and the line arches up and comes home;\n       - the repeated bars repeat the motif's shape, in scale steps, wherever\n         the chord lets them;\n       - the last note is the tonic.\n\n     Many candidates are drawn this way, each is scored against the same\n     rules as a whole, and the best few that differ from each other are the\n     suggestions.\n]]\n\nlocal M = {}\n\n------------------------------------------------------------------------------\n-- Choices offered\n------------------------------------------------------------------------------\n\n--[[  Rhythm cells: a length in beats and the notes in it, each an offset and\n      a length. A cell with no notes is a rest. `w` is how often it is drawn. ]]\nlocal Q, E, S = 1, 0.5, 0.25\nM.DENSITIES = {\n  { name = \"Sparse\", cells = {\n      { len = 2, notes = { { 0, 2 } },                 w = 4 },\n      { len = 1, notes = { { 0, 1 } },                 w = 4 },\n      { len = 4, notes = { { 0, 4 } },                 w = 1 },\n      { len = 2, notes = { { 0, 1.5 }, { 1.5, 0.5 } }, w = 2 },\n      { len = 1, notes = {},                           w = 1 },\n  } },\n  { name = \"Medium\", cells = {\n      { len = 1, notes = { { 0, Q } },                 w = 4 },\n      { len = 1, notes = { { 0, E }, { E, E } },       w = 4 },\n      { len = 1, notes = { { 0, 0.75 }, { 0.75, S } }, w = 1 },\n      { len = 1, notes = { { E, E } },                 w = 1 },\n      { len = 2, notes = { { 0, 1.5 }, { 1.5, E } },   w = 2 },\n      { len = 2, notes = { { 0, 2 } },                 w = 2 },\n  } },\n  { name = \"Busy\", cells = {\n      { len = 1, notes = { { 0, S }, { S, S }, { E, S }, { 0.75, S } }, w = 2 },\n      { len = 1, notes = { { 0, E }, { E, S }, { 0.75, S } },           w = 2 },\n      { len = 1, notes = { { 0, S }, { S, S }, { E, E } },              w = 2 },\n      { len = 1, notes = { { 0, E }, { E, E } },                        w = 3 },\n      { len = 1, notes = { { 0, Q } },                                  w = 2 },\n      { len = 1, notes = { { E, E } },                                  w = 1 },\n  } },\n}\n\n-- Where the tune sits: the note it arches up from and comes home to.\nM.REGISTERS = {\n  { name = \"Low\",  centre = 60 },\n  { name = \"Mid\",  centre = 67 },\n  { name = \"High\", centre = 74 },\n}\nM.RANGE_BELOW, M.RANGE_ABOVE = 7, 12\n\nM.SUGGESTIONS = 4\nM.CANDIDATES  = 48\nM.VELOCITY    = 100\n\n------------------------------------------------------------------------------\n-- The judgement, note by note\n------------------------------------------------------------------------------\n\nM.STRONG_CHORD    =  3.0   -- a chord tone on a strong beat\nM.STRONG_OTHER    = -4.0   -- anything else there\nM.WEAK_CHORD      =  1.0   -- a chord tone off the beat\nM.WEAK_STEPPED    =  0.3   -- a scale note off the beat, reached by step\nM.WEAK_LEAPT      = -3.0   -- a scale note off the beat, reached by leap\nM.MOVE = { [0] = -0.5, 2, 2, 1, 1, 0, 0, 0, -2, -2, -2, -2, -2 }  -- by semitones\nM.MOVE_FAR        = -6.0   -- past an octave\nM.RECOVER         =  1.5   -- a step back the other way after a leap\nM.NOT_RECOVERED   = -1.5   -- carrying on the same way after one\nM.CONTOUR         = -0.25  -- per semitone from where the arch wants to be\nM.ECHO            =  2.0   -- following the motif's shape in a repeated bar\nM.TEMPERATURE     =  0.6   -- how freely the next note is drawn\n\n------------------------------------------------------------------------------\n-- The judgement, whole melodies\n------------------------------------------------------------------------------\n\nM.SCORE_STRONG    = 3.0    -- per share of strong notes on chord tones\nM.SCORE_STEPS     = 2.0    -- lost per unit the share of steps is off 0.65\nM.STEP_SHARE      = 0.65\nM.SCORE_SPAN      = 0.2    -- per semitone of span past a tenth\nM.SCORE_STUCK     = 0.5    -- per note repeating two before it\nM.SCORE_LEAP      = 0.3    -- per leap past a fifth\n\n------------------------------------------------------------------------------\n-- Randomness that can be repeated\n------------------------------------------------------------------------------\n\nlocal function rng(seed)\n  local s = (seed or 1) % 2147483647\n  if s <= 0 then s = s + 2147483646 end\n  return function()\n    s = (s * 48271) % 2147483647\n    return s / 2147483647\n  end\nend\n\nlocal function weighted(random, items, weightOf)\n  local total = 0\n  for _, it in ipairs(items) do total = total + weightOf(it) end\n  local r = random() * total\n  for _, it in ipairs(items) do\n    r = r - weightOf(it)\n    if r <= 0 then return it end\n  end\n  return items[#items]\nend\n\n------------------------------------------------------------------------------\n-- Rhythm\n------------------------------------------------------------------------------\n\n-- Short fillers, so any bar length can be filled - a 5/8 bar is 2.5 beats.\nlocal FILL = { { len = E, notes = { { 0, E } }, w = 1 }, { len = S, notes = { { 0, S } }, w = 1 } }\n\n-- One bar of cells, as a list of { start, len } offsets within the bar.\nlocal function drawBar(random, cells, barBeats)\n  local out, t = {}, 0\n  while t < barBeats - 1e-9 do\n    local left = barBeats - t\n    local fits = {}\n    for _, c in ipairs(cells) do if c.len <= left + 1e-9 then fits[#fits + 1] = c end end\n    if #fits == 0 then\n      for _, c in ipairs(FILL) do if c.len <= left + 1e-9 then fits[#fits + 1] = c end end\n    end\n    if #fits == 0 then break end\n    local c = weighted(random, fits, function(x) return x.w end)\n    for _, n in ipairs(c.notes) do out[#out + 1] = { start = t + n[1], len = n[2] } end\n    t = t + c.len\n  end\n  return out\nend\n\n-- A cadence bar: the motif up to half-way, then one note held to the end.\nlocal function cadenceBar(motif, barBeats)\n  local out, half = {}, barBeats / 2\n  for _, n in ipairs(motif) do\n    if n.start + 1e-9 < half then out[#out + 1] = { start = n.start, len = math.min(n.len, half - n.start) } end\n  end\n  out[#out + 1] = { start = half, len = barBeats - half }\n  return out\nend\n\n-- The same bar with its last beat redrawn: A', the repeat that answers.\nlocal function varied(random, cells, motif, barBeats)\n  local keepTo = math.max(0, barBeats - 1)\n  local out = {}\n  for _, n in ipairs(motif) do\n    if n.start + n.len <= keepTo + 1e-9 then out[#out + 1] = { start = n.start, len = n.len } end\n  end\n  local tail = drawBar(random, cells, barBeats - keepTo)\n  for _, n in ipairs(tail) do out[#out + 1] = { start = keepTo + n.start, len = n.len } end\n  return out\nend\n\n--[[  The rhythm of the whole melody, as events { start, len, bar, role, k }\n      where role is \"A\", \"A'\", \"B\" or \"C\" and k is the event's place in its\n      bar - which is how a repeated bar knows which note of the motif it is\n      echoing. Phrases are four bars; a shorter tail is A then C. ]]\nfunction M.rhythm(random, density, barBeats, beats)\n  local cells = M.DENSITIES[density].cells\n  local motif = drawBar(random, cells, barBeats)\n  -- A motif that is all rest is no motif. Draw again; a few tries is plenty.\n  for _ = 1, 8 do\n    if #motif > 0 then break end\n    motif = drawBar(random, cells, barBeats)\n  end\n  local bars = math.max(1, math.ceil(beats / barBeats - 1e-6))\n  local events = {}\n  local bar = 0\n  while bar < bars do\n    local left = bars - bar\n    local plan\n    if left >= 4 then\n      plan = random() < 0.5 and { \"A\", \"A'\", \"A\", \"C\" } or { \"A\", \"B\", \"A\", \"C\" }\n    elseif left == 3 then plan = { \"A\", \"A'\", \"C\" }\n    elseif left == 2 then plan = { \"A\", \"C\" }\n    else plan = { \"C\" } end\n    local b = nil\n    for _, role in ipairs(plan) do\n      local r\n      if role == \"A\" then r = motif\n      elseif role == \"A'\" then r = varied(random, cells, motif, barBeats)\n      elseif role == \"B\" then b = b or drawBar(random, cells, barBeats); r = b\n      else r = cadenceBar(motif, barBeats) end\n      for k, n in ipairs(r) do\n        local start = bar * barBeats + n.start\n        if start < beats - 1e-9 then\n          events[#events + 1] = { start = start, len = math.min(n.len, beats - start),\n                                  bar = bar, role = role, k = k }\n        end\n      end\n      bar = bar + 1\n    end\n  end\n  return events\nend\n\n------------------------------------------------------------------------------\n-- Pitch\n------------------------------------------------------------------------------\n\nlocal function chordAt(chords, t)\n  local found = chords[1]\n  for _, c in ipairs(chords) do\n    if c.start <= t + 1e-9 then found = c else break end\n  end\n  return found\nend\n\n-- The scale notes that may pass over a chord: the key's, less any that sit\n-- a semitone from a chord tone borrowed from outside the key. Over E major\n-- in A minor the G# is a chord tone, so G natural is no longer a passing\n-- note - it would clash with it.\nlocal function localScale(key, chord)\n  local ok = {}\n  for pc in pairs(key.pcs) do ok[pc] = true end\n  for pc in pairs(chord.pcs) do\n    if not key.pcs[pc] then\n      for _, near in ipairs({ (pc + 1) % 12, (pc + 11) % 12 }) do\n        if near ~= key.tonic then ok[near] = nil end\n      end\n      ok[pc] = true\n    end\n  end\n  return ok\nend\n\n-- A pitch's place counted in scale steps, for echoing a shape: notes outside\n-- the key take the step of the scale note below them.\nlocal function stepOf(key, p)\n  local pc, oct = p % 12, p // 12\n  for back = 0, 11 do\n    local d = key.degree[(pc - back) % 12]\n    if d then\n      local o = oct - (((pc - back) < 0) and 1 or 0)\n      return o * 7 + d\n    end\n  end\n  return oct * 7\nend\n\n-- Strong: on the bar line, on the half bar, or where the chord changes.\nlocal function isStrong(ev, chords, barBeats)\n  local inBar = ev.start - ev.bar * barBeats\n  if inBar < 1e-9 or math.abs(inBar - barBeats / 2) < 1e-9 then return true end\n  for _, c in ipairs(chords) do\n    if math.abs(c.start - ev.start) < 1e-9 then return true end\n  end\n  return false\nend\n\nlocal function arch(t, total, centre, height)\n  -- Up from the centre to a peak about two thirds of the way, and home.\n  local x = t / math.max(total, 1e-9)\n  local shape = x < 0.66 and (x / 0.66) or ((1 - x) / 0.34)\n  return centre + height * shape\nend\n\n--[[  Pitches for a rhythm. Returns the notes, each { pitch, start, len, vel,\n      strong }. ]]\nfunction M.pitches(random, events, chords, key, barBeats, centre, beats)\n  local lo, hi = centre - M.RANGE_BELOW, centre + M.RANGE_ABOVE\n  local height = 4 + math.floor(random() * 5)          -- a fourth to a sixth\n  local notes = {}\n  local motifSteps = {}          -- k -> scale steps from the note before, in bar A\n  local prev, lastMove = nil, 0\n  local prevStep\n\n  for i, ev in ipairs(events) do\n    local chord = chordAt(chords, ev.start)\n    local strong = isStrong(ev, chords, barBeats)\n    local scale = localScale(key, chord)\n    local target = arch(ev.start, beats, centre, height)\n    local final = i == #events\n\n    local options = {}\n    for p = lo, hi do\n      local pc = p % 12\n      local isChord = chord.pcs[pc] == true\n      if isChord or scale[pc] then\n        local v = 0\n        if final then\n          -- Home: the tonic if the last chord holds it, its root if not.\n          local home = chord.pcs[key.tonic] and key.tonic or (chord.root or key.tonic)\n          v = (pc == home) and 10 or -100\n        end\n        local d = prev and math.abs(p - prev) or 0\n        if strong then\n          v = v + (isChord and M.STRONG_CHORD or M.STRONG_OTHER)\n        elseif isChord then\n          v = v + M.WEAK_CHORD\n        else\n          v = v + ((prev and d <= 2) and M.WEAK_STEPPED or M.WEAK_LEAPT)\n        end\n        if prev then\n          v = v + (M.MOVE[d] or M.MOVE_FAR)\n          if math.abs(lastMove) >= 5 then\n            local back = (p - prev) * lastMove < 0 and d <= 2\n            v = v + (back and M.RECOVER or M.NOT_RECOVERED)\n          end\n        end\n        v = v + M.CONTOUR * math.abs(p - target)\n        if (ev.role == \"A\" or ev.role == \"A'\") and ev.bar > 0 and motifSteps[ev.k] and prevStep then\n          if stepOf(key, p) - prevStep == motifSteps[ev.k] then v = v + M.ECHO end\n        end\n        options[#options + 1] = { p = p, v = v }\n      end\n    end\n\n    -- Drawn rather than taken: the best note most often, but not always.\n    local best = -math.huge\n    for _, o in ipairs(options) do best = math.max(best, o.v) end\n    local pick = weighted(random, options, function(o)\n      return math.exp((o.v - best) / M.TEMPERATURE)\n    end)\n    local p = pick.p\n\n    local step = stepOf(key, p)\n    if ev.bar == 0 and prevStep then motifSteps[ev.k] = step - prevStep end\n    if prev then lastMove = p - prev end\n    prev, prevStep = p, step\n    notes[#notes + 1] = { pitch = p, start = ev.start, len = ev.len, vel = M.VELOCITY,\n                          strong = strong }\n  end\n  return notes\nend\n\n------------------------------------------------------------------------------\n-- Scoring and choosing\n------------------------------------------------------------------------------\n\nfunction M.score(notes, chords)\n  if #notes == 0 then return -math.huge end\n  local strong, strongOn, steps, moves, stuck, leaps = 0, 0, 0, 0, 0, 0\n  local lo, hi = 999, -1\n  for i, n in ipairs(notes) do\n    lo, hi = math.min(lo, n.pitch), math.max(hi, n.pitch)\n    if n.strong then\n      strong = strong + 1\n      if chordAt(chords, n.start).pcs[n.pitch % 12] then strongOn = strongOn + 1 end\n    end\n    if i > 1 then\n      local d = math.abs(n.pitch - notes[i - 1].pitch)\n      moves = moves + 1\n      if d >= 1 and d <= 2 then steps = steps + 1 end\n      if d > 7 then leaps = leaps + 1 end\n      if i > 2 and n.pitch == notes[i - 1].pitch and n.pitch == notes[i - 2].pitch then\n        stuck = stuck + 1\n      end\n    end\n  end\n  local s = 0\n  if strong > 0 then s = s + M.SCORE_STRONG * strongOn / strong end\n  if moves > 0 then s = s - M.SCORE_STEPS * math.abs(steps / moves - M.STEP_SHARE) end\n  s = s - M.SCORE_SPAN * math.max(0, (hi - lo) - 16)\n  s = s - M.SCORE_STUCK * stuck - M.SCORE_LEAP * leaps\n  return s\nend\n\n-- The share of two melodies' notes, by start and pitch, that are not shared.\nlocal function difference(a, b)\n  local set, shared = {}, 0\n  for _, n in ipairs(a) do set[n.start .. \":\" .. n.pitch] = true end\n  for _, n in ipairs(b) do if set[n.start .. \":\" .. n.pitch] then shared = shared + 1 end end\n  return 1 - shared / math.max(#a, #b, 1)\nend\n\nM.DISTINCT = 0.4   -- at least this share of notes must differ between two suggestions\n\n--[[  The suggestions for a progression.\n\n      chords: the reader's segments, each { start, len, pcs, root }.\n      opts: { key, beats, barBeats, density, register, variation }\n\n      Returns up to SUGGESTIONS, best first, each { notes, score, low, high }. ]]\nfunction M.suggest(chords, T, opts)\n  local key = opts.key\n  -- The centre is left where the register puts it, not moved to a tonic:\n  -- the three registers are closer together than an octave, so snapping\n  -- them to a tonic put two of them on the same note. The last note is what\n  -- comes home, and it finds the tonic nearest the centre by itself.\n  local centre = M.REGISTERS[opts.register or 2].centre\n\n  local base = 1 + (opts.variation or 0) * 1009\n  local cands = {}\n  for c = 1, M.CANDIDATES do\n    local random = rng(base * 7919 + c * 104729)\n    local events = M.rhythm(random, opts.density or 2, opts.barBeats, opts.beats)\n    local notes = M.pitches(random, events, chords, key, opts.barBeats, centre, opts.beats)\n    cands[#cands + 1] = { notes = notes, score = M.score(notes, chords), seed = c }\n  end\n  table.sort(cands, function(a, b)\n    if a.score ~= b.score then return a.score > b.score end\n    return a.seed < b.seed\n  end)\n\n  local out = {}\n  for _, c in ipairs(cands) do\n    local fresh = #c.notes > 0\n    for _, o in ipairs(out) do\n      if difference(c.notes, o.notes) < M.DISTINCT then fresh = false; break end\n    end\n    if fresh then\n      local lo, hi = 999, -1\n      for _, n in ipairs(c.notes) do\n        lo, hi = math.min(lo, n.pitch), math.max(hi, n.pitch)\n        n.strong = nil\n      end\n      c.low, c.high, c.seed = lo, hi, nil\n      out[#out + 1] = c\n      if #out >= M.SUGGESTIONS then break end\n    end\n  end\n  return out\nend\n\nreturn M\n", "midi-suggester/ms_read.lua": "--[[ Midi Suggester - reading what was imported.\n\n     Pure Lua: no reaper., no ImGui. The notes arrive as plain tables, in\n     quarter notes counted from the first bar line at or before the music:\n\n       { pitch = 60, start = 0.0, len = 1.0, vel = 100 }\n\n     and this file decides three things about them. Is it a melody or a chord\n     progression? If a melody, what is the line - the one note at a time that\n     a chord has to fit? If chords, where does each chord start and stop, and\n     what is it called?\n]]\n\nlocal M = {}\n\n-- Notes struck within this many quarter notes of each other are one event.\n-- A played chord is never exactly together, and a thirty-second at 120bpm is\n-- about the spread of a human strum.\nM.ONSET_TOLERANCE = 0.125\n\n-- The share of events that have to be three or more notes before the music\n-- is called chords. Low on purpose: a progression with a moving bass line\n-- strikes single bass notes between its chords, and is still a progression.\nM.CHORD_SHARE = 0.3\n\n-- Or this many notes sounding at once, on average, whenever anything is\n-- sounding. That is what catches an arpeggiated progression, which strikes\n-- one note at a time but lets them ring into each other.\nM.CHORD_DENSITY = 2.5\n\nlocal function byStart(a, b)\n  if a.start ~= b.start then return a.start < b.start end\n  return a.pitch < b.pitch\nend\n\nlocal function sorted(notes)\n  local out = {}\n  for i, n in ipairs(notes) do out[i] = n end\n  table.sort(out, byStart)\n  return out\nend\n\n-- Groups notes into events: everything struck within ONSET_TOLERANCE of the\n-- event's first note. Returns { { start, notes = {...} }, ... } in order.\nfunction M.events(notes)\n  local out = {}\n  for _, n in ipairs(sorted(notes)) do\n    local last = out[#out]\n    if last and n.start - last.start <= M.ONSET_TOLERANCE then\n      last.notes[#last.notes + 1] = n\n    else\n      out[#out + 1] = { start = n.start, notes = { n } }\n    end\n  end\n  return out\nend\n\n-- Where the music stops, in quarter notes.\nfunction M.finish(notes)\n  local e = 0\n  for _, n in ipairs(notes) do e = math.max(e, n.start + n.len) end\n  return e\nend\n\n-- The average number of notes sounding, over the time anything is sounding.\nfunction M.density(notes)\n  local edges = {}\n  for _, n in ipairs(notes) do\n    edges[#edges + 1] = { t = n.start, d = 1 }\n    edges[#edges + 1] = { t = n.start + n.len, d = -1 }\n  end\n  table.sort(edges, function(a, b)\n    if a.t ~= b.t then return a.t < b.t end\n    return a.d < b.d          -- a note ending lets go before the next begins\n  end)\n  local sounding, busy, weighted, last = 0, 0, 0, nil\n  for _, e in ipairs(edges) do\n    if last and sounding > 0 then\n      busy = busy + (e.t - last)\n      weighted = weighted + (e.t - last) * sounding\n    end\n    sounding, last = sounding + e.d, e.t\n  end\n  if busy <= 0 then return 0 end\n  return weighted / busy\nend\n\n--[[  \"Melody\" or \"Chords\", and the two measurements that decided it, so the\n      window can say why. ]]\nfunction M.classify(notes)\n  if #notes == 0 then return nil, 0, 0 end\n  local events, chordal = M.events(notes), 0\n  for _, ev in ipairs(events) do\n    local pcs, count = {}, 0\n    for _, n in ipairs(ev.notes) do\n      if not pcs[n.pitch % 12] then pcs[n.pitch % 12] = true; count = count + 1 end\n    end\n    if count >= 3 then chordal = chordal + 1 end\n  end\n  local share, density = chordal / #events, M.density(notes)\n  local kind = (share >= M.CHORD_SHARE or density >= M.CHORD_DENSITY) and \"Chords\" or \"Melody\"\n  return kind, share, density\nend\n\n--[[  The melody: the top note of each event, held until the next event\n      starts or it ends, whichever is sooner. That is what an ear follows,\n      and it means a melody imported with the odd double-stop still reads as\n      one line. ]]\nfunction M.melodyLine(notes)\n  local events, line = M.events(notes), {}\n  for i, ev in ipairs(events) do\n    local top = ev.notes[1]\n    for _, n in ipairs(ev.notes) do if n.pitch > top.pitch then top = n end end\n    local len = top.len\n    local nxt = events[i + 1]\n    if nxt then len = math.min(len, nxt.start - ev.start) end\n    line[#line + 1] = { pitch = top.pitch, start = ev.start, len = len, vel = top.vel or 100 }\n  end\n  return line\nend\n\n------------------------------------------------------------------------------\n-- Cutting a progression into chords\n------------------------------------------------------------------------------\n\nlocal function pcSig(pitches)\n  local seen, list = {}, {}\n  for _, p in ipairs(pitches) do\n    if not seen[p % 12] then seen[p % 12] = true; list[#list + 1] = p % 12 end\n  end\n  table.sort(list)\n  return table.concat(list, \",\"), #list\nend\n\nlocal function lowest(pitches)\n  local lo\n  for _, p in ipairs(pitches) do if not lo or p < lo then lo = p end end\n  return lo\nend\n\n-- Arpeggios strike one note at a time, so there are no events to cut at.\n-- They are cut by the bar instead, and a bar holding more than four pitch\n-- classes is tried in halves in case the harmony changed in the middle.\nlocal function byBar(notes, barBeats, finish)\n  local segs = {}\n  local function collect(a, b)\n    local ps = {}\n    for _, n in ipairs(notes) do\n      if n.start >= a - 1e-9 and n.start < b - 1e-9 then ps[#ps + 1] = n.pitch end\n    end\n    return ps\n  end\n  local bars = math.ceil(finish / barBeats - 1e-9)\n  for bar = 0, bars - 1 do\n    local a, b = bar * barBeats, (bar + 1) * barBeats\n    local ps = collect(a, b)\n    local _, count = pcSig(ps)\n    local mid = a + barBeats / 2\n    local left, right = collect(a, mid), collect(mid, b)\n    local _, cl = pcSig(left)\n    local _, cr = pcSig(right)\n    if count > 4 and cl >= 3 and cr >= 3 then\n      segs[#segs + 1] = { start = a, len = mid - a, pitches = left }\n      segs[#segs + 1] = { start = mid, len = b - mid, pitches = right }\n    elseif #ps > 0 then\n      segs[#segs + 1] = { start = a, len = b - a, pitches = ps }\n    end\n  end\n  return segs\nend\n\n--[[  Each chord is struck: an event of two or more notes starts one, and it\n      lasts until the next one starts. Single notes in between - a bass\n      walking, a note of melody on top - are left out of the name. ]]\nlocal function byEvent(notes, finish)\n  local strikes = {}\n  for _, ev in ipairs(M.events(notes)) do\n    if #ev.notes >= 2 then strikes[#strikes + 1] = ev end\n  end\n  if #strikes == 0 then return nil end\n  local segs = {}\n  for i, ev in ipairs(strikes) do\n    local stop = strikes[i + 1] and strikes[i + 1].start or finish\n    local ps = {}\n    for _, n in ipairs(ev.notes) do ps[#ps + 1] = n.pitch end\n    segs[#segs + 1] = { start = ev.start, len = stop - ev.start, pitches = ps }\n  end\n  return segs\nend\n\n--[[  The chords, each { start, len, pitches, pcs (a set), bass (a pitch),\n      name, root (pitch class, or nil where the notes are only an interval) }.\n      The same chord struck again straight after itself - a strummed rhythm\n      - is one chord held, not several. ]]\nfunction M.chordSegments(notes, key, T, barBeats)\n  local finish = M.finish(notes)\n  local segs = byEvent(notes, finish) or byBar(notes, barBeats, finish)\n\n  local merged = {}\n  for _, s in ipairs(segs) do\n    local prev = merged[#merged]\n    local sig = pcSig(s.pitches)\n    local bass = lowest(s.pitches) % 12\n    if prev and prev.sig == sig and prev.bassPc == bass then\n      prev.len = s.start + s.len - prev.start\n    else\n      s.sig, s.bassPc = sig, bass\n      merged[#merged + 1] = s\n    end\n  end\n\n  for _, s in ipairs(merged) do\n    s.pcs = {}\n    for _, p in ipairs(s.pitches) do s.pcs[p % 12] = true end\n    s.bass = lowest(s.pitches)\n    s.sig, s.bassPc = nil, nil\n  end\n  M.nameSegments(merged, key, T)\n  return merged\nend\n\n-- Naming depends on the key only for spelling and for settling a genuine\n-- draw, so a change of key re-names without re-cutting.\nfunction M.nameSegments(segs, key, T)\n  for _, s in ipairs(segs) do\n    s.name, s.root = T.nameChord(s.pitches, key)\n  end\nend\n\n------------------------------------------------------------------------------\n-- All of it at once\n------------------------------------------------------------------------------\n\n--[[  Everything the window needs to know about some notes. `kind` may be\n      forced (\"Melody\" or \"Chords\") when the user has said which it is;\n      otherwise it is decided here.\n\n      Returns { kind, share, density, beats, line | chords, firstPc, lastPc,\n      keys } where keys is detectKey's ranking, best first. ]]\nfunction M.analyse(notes, barBeats, T, kind)\n  local r = { notes = notes, barBeats = barBeats }\n  local detected\n  detected, r.share, r.density = M.classify(notes)\n  r.detected = detected\n  r.kind = kind or detected\n  if not r.kind then return nil end\n\n  -- A whole number of bars, so what gets suggested fills the last one.\n  r.beats = math.max(barBeats, math.ceil(M.finish(notes) / barBeats - 1e-6) * barBeats)\n\n  if r.kind == \"Melody\" then\n    r.line = M.melodyLine(notes)\n    r.firstPc = r.line[1].pitch % 12\n    r.lastPc = r.line[#r.line].pitch % 12\n    r.keys = T.detectKey(r.line, r.firstPc, r.lastPc)\n  else\n    -- The key comes first because spelling a chord needs one; the chords\n    -- are then cut, and their basses settle a relative major against its\n    -- minor the way a melody's last note does.\n    local guess = T.detectKey(notes)[1]\n    local provisional = T.key(guess.root, guess.scale)\n    local segs = M.chordSegments(notes, provisional, T, barBeats)\n    r.firstPc = segs[1].bass % 12\n    r.lastPc = segs[#segs].bass % 12\n    r.keys = T.detectKey(notes, r.firstPc, r.lastPc)\n    r.chords = segs\n    M.nameSegments(segs, T.key(r.keys[1].root, r.keys[1].scale), T)\n  end\n  return r\nend\n\nreturn M\n", "midi-suggester/ms_theory.lua": "--[[ Midi Suggester - keys, note names, and reading a chord.\n\n     Pure Lua. Nothing in this file touches REAPER or ImGui, so that\n     tests/test_theory.lua can run it and check it rather than only read it.\n\n     Three things live here, because everything else leans on all three:\n\n       - Keys: ScaleView for REAPER's eighteen spelled roots and its\n         seven-note scales, with notes spelled the way ScaleView spells them.\n       - Finding the key of some notes, which ScaleView never had to do.\n       - Naming a chord from its notes. That is ScaleView Pro's reader, ported\n         unchanged, so a chord is called the same thing in both tools - and so\n         the chords this script suggests are named by the same code that names\n         the chords it reads.\n\n     Scale degrees are 0-based (0 is the tonic) because the arithmetic wants\n     them that way. Table indices are 1-based, like Lua.\n]]\n\nlocal M = {}\n\n------------------------------------------------------------------------------\n-- Keys\n--\n-- ScaleView's roots and scales, so the tools agree on what a key is and what\n-- its notes are called. Both spellings of every black key are here plus Cb,\n-- because C# major and Db major are the same seven notes written differently.\n--\n-- Only the seven-note scales are offered. Chords are built by stacking every\n-- other scale note, and a five- or six-note scale has no thirds to stack:\n-- a \"triad\" of the minor pentatonic is a pile of fourths.\n------------------------------------------------------------------------------\n\nlocal LETTER_PC  = { 0, 2, 4, 5, 7, 9, 11 }        -- C D E F G A B\nlocal LETTERS    = { \"C\", \"D\", \"E\", \"F\", \"G\", \"A\", \"B\" }\nlocal ACCIDENTAL = { [-2] = \"bb\", [-1] = \"b\", [0] = \"\", [1] = \"#\", [2] = \"x\" }\n\nM.SHARP_NAMES = { \"C\", \"C#\", \"D\", \"D#\", \"E\", \"F\", \"F#\", \"G\", \"G#\", \"A\", \"A#\", \"B\" }\nM.FLAT_NAMES  = { \"C\", \"Db\", \"D\", \"Eb\", \"E\", \"F\", \"Gb\", \"G\", \"Ab\", \"A\", \"Bb\", \"B\" }\n\n-- letter is 0-based into LETTERS.\nM.ROOTS = {\n  { name = \"C\",  letter = 0, acc =  0 }, { name = \"C#\", letter = 0, acc =  1 },\n  { name = \"Db\", letter = 1, acc = -1 }, { name = \"D\",  letter = 1, acc =  0 },\n  { name = \"D#\", letter = 1, acc =  1 }, { name = \"Eb\", letter = 2, acc = -1 },\n  { name = \"E\",  letter = 2, acc =  0 }, { name = \"F\",  letter = 3, acc =  0 },\n  { name = \"F#\", letter = 3, acc =  1 }, { name = \"Gb\", letter = 4, acc = -1 },\n  { name = \"G\",  letter = 4, acc =  0 }, { name = \"G#\", letter = 4, acc =  1 },\n  { name = \"Ab\", letter = 5, acc = -1 }, { name = \"A\",  letter = 5, acc =  0 },\n  { name = \"A#\", letter = 5, acc =  1 }, { name = \"Bb\", letter = 6, acc = -1 },\n  { name = \"B\",  letter = 6, acc =  0 }, { name = \"Cb\", letter = 0, acc = -1 },\n}\n\n-- iv is semitones from the tonic. Every scale here walks the letters in\n-- order, so the spelling needs no table of its own.\nM.SCALES = {\n  { name = \"Major\",           iv = { 0, 2, 4, 5, 7, 9, 11 } },\n  { name = \"Minor (Natural)\", iv = { 0, 2, 3, 5, 7, 8, 10 } },\n  { name = \"Harmonic Minor\",  iv = { 0, 2, 3, 5, 7, 8, 11 } },\n  { name = \"Dorian\",          iv = { 0, 2, 3, 5, 7, 9, 10 } },\n  { name = \"Phrygian\",        iv = { 0, 1, 3, 5, 7, 8, 10 } },\n  { name = \"Lydian\",          iv = { 0, 2, 4, 6, 7, 9, 11 } },\n  { name = \"Mixolydian\",      iv = { 0, 2, 4, 5, 7, 9, 10 } },\n}\nM.MAJOR, M.MINOR = 1, 2\n\nfunction M.rootIndex(name)\n  for i, r in ipairs(M.ROOTS) do if r.name == name then return i end end\nend\nfunction M.scaleIndex(name)\n  for i, s in ipairs(M.SCALES) do if s.name == name then return i end end\nend\n\nfunction M.rootPc(root) return (LETTER_PC[root.letter + 1] + root.acc) % 12 end\n\n-- Spell pitch class pc on the given letter (0-based, any integer), or nil\n-- when that would take more than a double accidental.\nlocal function spellAs(letter, pc)\n  letter = letter % 7\n  local offset = ((pc - LETTER_PC[letter + 1] + 6) % 12) - 6\n  local acc = ACCIDENTAL[offset]\n  if not acc then return nil end\n  return LETTERS[letter + 1] .. acc\nend\n\n--[[  A key, built once and handed around.\n\n      pcs[pc] is true for the scale's notes; degree[pc] is which degree a note\n      is (0-based); names[pc] is how it is written in this key. The notes\n      outside the scale have no spelling of their own, so they lean whichever\n      way the key does - exactly as ScaleView names them. ]]\nfunction M.key(rootIdx, scaleIdx)\n  local root, scale = M.ROOTS[rootIdx], M.SCALES[scaleIdx]\n  local k = {\n    root = rootIdx, scale = scaleIdx,\n    tonic = M.rootPc(root),\n    pcs = {}, degree = {}, degreePc = {}, names = {},\n    label = root.name .. \" \" .. scale.name,\n  }\n  local sharps, flats = 0, 0\n  for d, iv in ipairs(scale.iv) do\n    local pc = (k.tonic + iv) % 12\n    local name = spellAs(root.letter + d - 1, pc)\n    k.pcs[pc], k.degree[pc], k.degreePc[d - 1] = true, d - 1, pc\n    k.names[pc] = name\n    if name then\n      if name:find(\"#\") or name:find(\"x\") then sharps = sharps + 1 end\n      if name:find(\"b\", 2) then flats = flats + 1 end   -- skip the letter B\n    end\n  end\n  k.flats = flats > sharps\n  local outside = k.flats and M.FLAT_NAMES or M.SHARP_NAMES\n  for pc = 0, 11 do\n    if not k.names[pc] then k.names[pc] = outside[pc + 1] end\n  end\n  -- Whether the third above the tonic is major. The chord palette borrows\n  -- from the parallel key, and which way it borrows depends on this alone.\n  k.majorish = k.pcs[(k.tonic + 4) % 12] == true\n  return k\nend\n\n-- The pitch class of scale degree d, for any integer d: 7 is the tonic again.\nfunction M.degreePc(key, d) return key.degreePc[d % 7] end\n\nfunction M.noteName(key, pc) return key.names[pc % 12] end\n\n------------------------------------------------------------------------------\n-- Finding the key\n--\n-- Krumhansl and Kessler's key profiles: how well each of the twelve pitch\n-- classes was judged to fit a major and a minor key, measured by listening\n-- experiment (Krumhansl, Cognitive Foundations of Musical Pitch, 1990). The\n-- notes are counted by how long they sound, and the key whose profile\n-- correlates best with that count wins.\n--\n-- The profiles cannot tell a key from its relative minor very well - the two\n-- share all seven notes - so the note a piece ends on settles it, and the note\n-- it starts on helps. That is how a musician settles it too.\n------------------------------------------------------------------------------\n\nlocal PROFILE = {\n  [M.MAJOR] = { 6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88 },\n  [M.MINOR] = { 6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17 },\n}\n\n-- How a key on each pitch class is conventionally written: the spelling with\n-- fewer accidentals, and the sharp side of the six-and-six tie in major only\n-- because F# major is the one more often seen.\nlocal MAJOR_ROOT = { \"C\", \"Db\", \"D\", \"Eb\", \"E\", \"F\", \"F#\", \"G\", \"Ab\", \"A\", \"Bb\", \"B\" }\nlocal MINOR_ROOT = { \"C\", \"C#\", \"D\", \"Eb\", \"E\", \"F\", \"F#\", \"G\", \"G#\", \"A\", \"Bb\", \"B\" }\n\n--[[  The profiles alone are not enough for a short tune. Ode to Joy's first\n      phrase is five notes, C to G, and correlates best with E minor - which\n      has no F natural in it, and the phrase has two. So two more things are\n      asked, both of them things a musician asks:\n\n        - Is every note in the key? Time spent outside the scale counts\n          against it. (The raised seventh does not, in minor: the harmonic\n          minor's leading tone is part of a minor key.)\n        - Does the tune sit on the key's tonic chord? Time spent on its 1, 3\n          and 5 counts for it.\n\n      Measured over fifteen tunes and progressions (see the session log),\n      every setting of these weights misses one. This one misses Ode to Joy,\n      whose first phrase ends on D - a half cadence, which from the melody\n      alone is as good as D minor. The setting that gets Ode right misses\n      Happy Birthday instead, which ends on its tonic, and a tune ending on\n      its tonic is far the commoner case. The key is always the user's to\n      change. ]]\nM.KEY_OUTSIDE     = 1.0    -- per share of time on notes outside the scale\nM.KEY_TRIAD       = 0.6    -- per share of time on the tonic triad\nM.KEY_END_BONUS   = 0.2    -- the last note (or last bass) is the tonic\nM.KEY_START_BONUS = 0.05   -- and so is the first\n\nlocal function correlate(xs, ys)\n  local n, mx, my = #xs, 0, 0\n  for i = 1, n do mx, my = mx + xs[i], my + ys[i] end\n  mx, my = mx / n, my / n\n  local sxy, sxx, syy = 0, 0, 0\n  for i = 1, n do\n    local dx, dy = xs[i] - mx, ys[i] - my\n    sxy, sxx, syy = sxy + dx * dy, sxx + dx * dx, syy + dy * dy\n  end\n  if sxx == 0 or syy == 0 then return 0 end\n  return sxy / math.sqrt(sxx * syy)\nend\n\n--[[  notes: { {pitch, start, len}, ... }. firstPc / lastPc are the pitch\n      classes that open and close the music - the reader decides what those\n      are (a melody's first and last notes, a progression's first and last\n      bass). Returns the ranked candidates, best first, each\n      { root = index into ROOTS, scale = MAJOR or MINOR, score = number }. ]]\nfunction M.detectKey(notes, firstPc, lastPc)\n  local hist, total = {}, 0\n  for pc = 1, 12 do hist[pc] = 0 end\n  for _, n in ipairs(notes) do\n    local pc = n.pitch % 12 + 1\n    -- A very short note still counts for something: a run of sixteenths is\n    -- as much a statement of the key as one long note.\n    local w = math.max(n.len, 0.25)\n    hist[pc], total = hist[pc] + w, total + w\n  end\n  if total <= 0 then total = 1 end\n  local function at(pc) return hist[pc % 12 + 1] end\n\n  local ranked = {}\n  for tonic = 0, 11 do\n    for _, mode in ipairs({ M.MAJOR, M.MINOR }) do\n      local rotated = {}\n      for i = 0, 11 do rotated[i + 1] = PROFILE[mode][(i - tonic) % 12 + 1] end\n      local score = correlate(hist, rotated)\n\n      local inScale, outside = {}, 0\n      for _, iv in ipairs(M.SCALES[mode].iv) do inScale[(tonic + iv) % 12] = true end\n      if mode == M.MINOR then inScale[(tonic + 11) % 12] = true end\n      for pc = 0, 11 do if not inScale[pc] then outside = outside + at(pc) end end\n      local third = mode == M.MAJOR and 4 or 3\n      local triad = at(tonic) + at(tonic + third) + at(tonic + 7)\n      score = score - M.KEY_OUTSIDE * outside / total + M.KEY_TRIAD * triad / total\n\n      if lastPc == tonic then score = score + M.KEY_END_BONUS end\n      if firstPc == tonic then score = score + M.KEY_START_BONUS end\n      local rootName = (mode == M.MAJOR and MAJOR_ROOT or MINOR_ROOT)[tonic + 1]\n      ranked[#ranked + 1] = { root = M.rootIndex(rootName), scale = mode, score = score }\n    end\n  end\n  table.sort(ranked, function(a, b)\n    if a.score ~= b.score then return a.score > b.score end\n    if a.root ~= b.root then return a.root < b.root end\n    return a.scale < b.scale\n  end)\n  return ranked\nend\n\n------------------------------------------------------------------------------\n-- Reading a chord\n--\n-- Everything from here to `nameChord` is ScaleView Pro's chord reader,\n-- copied from `reascripts/ScaleView Pro.lua` at commit f9e2691 - its\n-- CORE_RANK table through `analyse`, unchanged, comments and all. The\n-- comments are its own and refer to its measurements, which are the reason\n-- the weights are what they are. Do not retune them here: a change belongs in\n-- ScaleView first, with its corpora, and is then copied across.\n-- tests/test_theory.lua holds ScaleView's own expected names to prove the copy.\n-- `nameChord` below is Pro's detectChord with the key passed in; its tiebreak\n-- (key, then no slash, then rank) is Pro's at the same commit.\n------------------------------------------------------------------------------\n\nlocal CORE_RANK = {\n  [\"maj/P/none\"]  =  1, [\"min/P/none\"]  =  2,\n  [\"maj/P/b7\"]    =  3, [\"min/P/b7\"]    =  4, [\"maj/P/maj7\"] =  5,\n  [\"min/b/b7\"]    =  6, [\"min/b/bb7\"]   =  7, [\"min/b/none\"] =  8,\n  [\"maj/#/none\"]  =  9,\n  [\"sus4/P/none\"] = 10, [\"sus2/P/none\"] = 11,\n  [\"min/P/maj7\"]  = 12,\n  [\"maj/#/b7\"]    = 13, [\"maj/b/b7\"]    = 14, [\"maj/#/maj7\"] = 15,\n  --[[  maj7b5 belongs in this list and was missing from it. The note above\n      says every altered fifth carrying a seventh that musicians play is named\n      here - 7b5, aug7, min7b5, maj7#5 - and players write maj7b5 constantly,\n      as the Lydian tonic. Without it the quality paid RANK_UNNAMED plus\n      RANK_TWICE_ODD, 37 before any slash, and lost to readings with no third\n      in them at all: D D# G A read Dsus4b9 rather than D#maj7b5/D. ]]\n  [\"maj/b/maj7\"]  = 16,\n  [\"sus4/P/b7\"]   = 17, [\"sus2/P/b7\"]   = 18,\n  [\"sus4/P/maj7\"] = 19, [\"sus2/P/maj7\"] = 20,\n\n  --[[  A missing third is a different chord, not a thinner one, so these sit\n      well below anything with a third in it.\n\n      Below, and by more than a slash costs. A third-less shape with a perfect\n      fifth is a real voicing - a seventh over a bare fifth is what a guitarist\n      plays - but one whose fifth is *also* altered is odd twice over, exactly\n      as RANK_TWICE_ODD has it for the qualities that keep their third. Those\n      two sit past COST_INVERSION from an unnamed quality with a third in it\n      (25), so D E A# reads Bb(b5)/E rather than E7b5(no3), the same way F A B\n      reads F(b5) rather than B7b5(no3). The perfect-fifth pair are left where\n      they were, which is what keeps C G Bb reading C7(no3). ]]\n  [\"none/P/b7\"]   = 30, [\"none/P/maj7\"] = 31, [\"none/P/none\"] = 34,\n  [\"none/b/maj7\"] = 41, [\"none/b/b7\"]   = 42,\n}\n\n--[[  A quality the table does not name is still ranked by the interval that\n    decides most about a chord: the third. A real third - major or minor -\n    keeps a chord readable however odd the rest of it is, so F A B reads\n    F(b5) rather than losing to B7b5(no3), which has no third in it at all.\n    A suspension is not a third but a stand-in for one, and a shape with\n    neither is the last thing to reach for. ]]\nlocal RANK_UNNAMED   = {maj = 25, min = 25, sus4 = 70, sus2 = 70, none = 90}\n--[[  Except that a third only excuses one oddity. Every altered fifth carrying\n    a seventh that musicians actually play is named in the table above - 7b5,\n    aug7, min7b5, maj7#5 - so a combination that is not there is strange twice\n    over, and should not win on the strength of its third alone. Without this\n    C D Eb Gb Cb read CminMaj9b5. ]]\nlocal RANK_TWICE_ODD =  12\n--[[  A missing fifth is never spoken, but it is not equally unremarkable. A\n    seventh chord is routinely voiced without one - that is the standard shell -\n    while a triad with no fifth is two notes and a guess, so the two are\n    charged differently. ]]\nlocal RANK_NO_FIFTH  =  20  -- a triad that has lost its fifth\nlocal RANK_NO_FIFTH7 =   4  -- a seventh chord voiced as a shell\nlocal RANK_ELEVENTH  =   6  -- a sus4 carrying a seventh and a ninth: C11\nlocal COST_INVERSION =  14  -- naming the bass after a slash\nlocal COST_NATURAL   =   1  -- a ninth/eleventh/thirteenth the number implies\nlocal COST_ADD       =   2  -- one that has to be spelled out as an add\nlocal COST_CLASH     =   6  -- a natural eleventh fighting a major third\nlocal COST_ALTERED   =   5  -- b9, #9, #11, b13 colouring a plain chord\n--[[  An alteration that does not belong to the chord it is sitting on costs\n    far more, because it usually means the root has been guessed wrong and the\n    notes belong to some plainer chord standing on one of the others. A b9, a\n    #9 and a b13 are the dominant's alterations: over a minor seventh or a\n    plain triad they are not colours a musician hears. A sharpened eleventh is\n    the exception - it is at home on almost anything with a perfect fifth -\n    and any alteration over a fifth that is already altered is suspect. ]]\nlocal COST_CLASHING  =  18\n--[[  A suspension replaces the third rather than decorating it, so it does not\n    carry added tones. \"sus4 add6 add9\" is not a chord anybody writes; those\n    notes are an inversion of something with a third in it. ]]\nlocal COST_SUS_EXTRA =  12\nlocal COST_SIXTH     =   4  -- enough that C E A stays Amin/C\n--[[  A minor sixth is charged one more than any other, because it is the one\n    sixth that is also something else: A C E F# is Amin6 and it is equally the\n    half-diminished on its third, F#min7b5. Those two readings tie exactly at\n    4, and the half-diminished is the name Scaler prints, the name jazznet's\n    labels carry, and the name some 880 analyst labels across DCML and When in\n    Rome give it. One point settles the tie without touching any other sixth. ]]\nlocal COST_MIN_SIXTH =   5\n\n--[[  Reading the intervals present into a third, a fifth and a seventh.\n\n    Where both a flattened and a raised fifth are sounding, which one is *the*\n    fifth is a real choice and not a lookup, so `preferSharpFive` lets the\n    caller ask for the other reading and cost them both. C E F# G# B was named\n    Cmaj7b5b13 because the flattened fifth was taken greedily, leaving the G#\n    to be described as a b13 over a chord that is not at home with one; read\n    the other way round it is Cmaj7#5#11, which costs 14 less. ]]\nlocal function core(has, preferSharpFive)\n  local third, fifth, seventh\n  local used = {[0] = true}\n\n  if     has[4] then third, used[4] = \"maj\",  true\n  elseif has[3] then third, used[3] = \"min\",  true\n  elseif has[5] then third, used[5] = \"sus4\", true\n  elseif has[2] then third, used[2] = \"sus2\", true\n  else               third = \"none\" end\n\n  if has[7] then fifth, used[7] = \"P\", true\n  elseif has[6] and has[8] and preferSharpFive then fifth, used[8] = \"#\", true\n  elseif has[6] then fifth, used[6] = \"b\", true\n  elseif has[8] then fifth, used[8] = \"#\", true\n  else               fifth = \"none\" end\n\n  -- A diminished triad takes the 9 as a doubly flattened seventh.\n  if     has[10] then seventh, used[10] = \"b7\",   true\n  elseif has[11] then seventh, used[11] = \"maj7\", true\n  elseif third == \"min\" and fifth == \"b\" and has[9] then\n                      seventh, used[9]  = \"bb7\",  true\n  else                seventh = \"none\" end\n\n  return third, fifth, seventh, used\nend\n\n-- The name of a core quality. Most are built from their parts; the handful\n-- with names of their own are named.\nlocal SPECIAL = {\n  [\"min/b/none\"] = \"dim\",  [\"min/b/bb7\"]  = \"dim7\", [\"min/b/b7\"] = \"min7b5\",\n  [\"maj/#/none\"] = \"aug\",  [\"maj/#/b7\"]   = \"aug7\", [\"maj/#/maj7\"] = \"maj7#5\",\n  [\"maj/b/b7\"]   = \"7b5\",  [\"min/P/maj7\"] = \"minMaj7\", [\"min/none/maj7\"] = \"minMaj7\",\n}\n\nlocal function coreName(third, fifth, seventh)\n  local special = SPECIAL[third .. \"/\" .. fifth .. \"/\" .. seventh]\n  if special then return special end\n\n  local base = (third == \"min\" and \"min\") or (third == \"sus4\" and \"sus4\")\n            or (third == \"sus2\" and \"sus2\") or \"\"\n  local sev  = (seventh == \"b7\" and \"7\") or (seventh == \"bb7\" and \"dim7\")\n            or (seventh == \"maj7\" and (third == \"min\" and \"Maj7\" or \"maj7\")) or \"\"\n  local alt  = (fifth == \"b\" and \"b5\") or (fifth == \"#\" and \"#5\") or \"\"\n\n  -- Sevenths are written before a sus, not after it: 7sus4, never sus47.\n  local name = (third == \"sus4\" or third == \"sus2\") and (sev .. base)\n                                                     or (base .. sev)\n  name = name .. alt\n  -- A bare altered fifth has to be bracketed or the symbol reads as a note\n  -- name: C(b5) is a chord on C, Cb5 looks like one on C flat.\n  if name == alt and alt ~= \"\" then name = \"(\" .. alt .. \")\" end\n  return name\nend\n\nlocal function rankOf(third, fifth, seventh)\n  if fifth == \"none\" then\n    local rank = CORE_RANK[third .. \"/P/\" .. seventh] or RANK_UNNAMED[third]\n    return rank + (seventh == \"none\" and RANK_NO_FIFTH or RANK_NO_FIFTH7)\n  end\n  local rank = CORE_RANK[third .. \"/\" .. fifth .. \"/\" .. seventh]\n  if rank then return rank end\n  return RANK_UNNAMED[third] + (seventh ~= \"none\" and RANK_TWICE_ODD or 0)\nend\n\n-- What is left over once the core has taken its notes.\n-- interval -> {how it is written, whether it is an alteration, which degree}\nlocal EXTENSION = {\n  [1] = {\"b9\",  true},  [2] = {\"9\",  false, 9},  [3] = {\"#9\",  true},\n  [5] = {\"11\",  false, 11}, [6] = {\"#11\", true}, [8] = {\"b13\", true},\n}\n\nlocal function analyseAs(has, root, bass, preferSharpFive)\n  local third, fifth, seventh, used = core(has, preferSharpFive)\n  local rank = rankOf(third, fifth, seventh)\n  local name, cost = coreName(third, fifth, seventh), rank\n\n  local naturals, altered, sixth = {}, {}, false\n  local asEleventh = false  -- read as an 11 chord, so not a suspension at all\n  for i = 1, 11 do\n    if has[i] and not used[i] then\n      if i == 9 then\n        if seventh == \"none\" then sixth = true else naturals[13] = true end\n      else\n        local ext = EXTENSION[i]\n        if ext and ext[2] then altered[#altered + 1] = ext[1]\n        elseif ext then naturals[ext[3]] = true\n        else\n          -- Only 11 can arrive here: core() always takes 4, 7 and 10 when they\n          -- are present, and 9 was dealt with above. So this is the major\n          -- seventh left over when a flattened one took the seventh's place.\n          altered[#altered + 1] = \"maj7\"\n        end\n      end\n    end\n  end\n\n  if seventh ~= \"none\" and seventh ~= \"bb7\" then\n    --[[  With a seventh underneath, the highest natural extension names the\n        chord - but a stacked number claims everything under it, so it may only\n        be used when the ninth is actually being played. Hutchinson's chord\n        list (Music Theory for the 21st-Century Classroom, 31.4) prints Cm11\n        and Cm7(11) side by side, six noteheads against five: the first has the\n        ninth in it, the second does not. So a ninth that is not there is named\n        in brackets after the seventh instead of being swallowed by a number.\n\n        A natural eleventh over a major third is the other exception: it\n        clashes, so it is bracketed rather than promoted whatever else is\n        present. ]]\n    --[[  A ninth that has been altered still fills its place in the stack: the\n        same list prints C13sus(b9) with six noteheads, the b9 standing where\n        the natural ninth would. So a b9 or a #9 lets the number rise too. ]]\n    local ninth = naturals[9]\n    for _, token in ipairs(altered) do\n      if token == \"b9\" or token == \"#9\" then ninth = true end\n    end\n\n    local number\n    if ninth and naturals[13] then number = 13\n    elseif ninth and naturals[11] and third ~= \"maj\" then number = 11\n    elseif naturals[9] then number = 9 end\n\n    if third == \"sus4\" and seventh == \"b7\" and naturals[9]\n       and (fifth == \"P\" or fifth == \"none\") then\n      -- A sus4 carrying a seventh and a ninth is how an eleventh chord is\n      -- voiced - the third is left out precisely because it would clash with\n      -- the eleventh - so it is named as one rather than as a suspension.\n      name, number, asEleventh = \"11\", 11, true\n      naturals[11] = true\n      cost = RANK_ELEVENTH + (fifth == \"none\" and RANK_NO_FIFTH7 or 0)\n    elseif number then\n      name = name:gsub(\"7\", tostring(number), 1)\n    end\n\n    local spare = {}\n    for _, degree in ipairs({9, 11, 13}) do\n      if naturals[degree] then\n        local implied = number and degree <= number\n                        and not (degree == 11 and third == \"maj\")\n        if implied then cost = cost + COST_NATURAL\n        else\n          cost = cost + (degree == 11 and third == \"maj\" and COST_CLASH or COST_ADD)\n          spare[#spare + 1] = degree\n        end\n      end\n    end\n    -- Everything the number did not account for, bracketed as the chord lists\n    -- print it: Cm7(11), C7(13), C7(11,13).\n    if #spare > 0 then name = name .. \"(\" .. table.concat(spare, \",\") .. \")\" end\n  else\n    -- No seventh, so nothing stacks: everything above the triad is an add.\n    if sixth then\n      cost = cost + ((third == \"min\" and fifth == \"P\") and COST_MIN_SIXTH\n                                                        or COST_SIXTH)\n      --[[  The sixth stands where a seventh would, so the symbol is rebuilt\n          around it rather than having a 6 pasted on the end. An altered fifth\n          has to survive that: C Eb G# A is min6#5, and naming it Cmin6 claims\n          a perfect fifth that is not being played. ]]\n      local mark = (fifth == \"b\" and \"b5\") or (fifth == \"#\" and \"#5\") or \"\"\n      if naturals[9] and (third == \"maj\" or third == \"min\") then\n        naturals[9] = nil\n        name = (third == \"min\" and \"min6/9\" or \"6/9\") .. mark\n        cost = cost + COST_ADD\n      elseif third == \"min\"  then name = \"min6\" .. mark\n      elseif third == \"maj\"  then name = (fifth == \"#\" and \"aug6\") or (\"6\" .. mark)\n      elseif third == \"none\" then name = \"6\" .. mark\n      else name = name .. \"(add6)\" end\n    end\n    --[[  A diminished seventh carrying a ninth is a dim9, not a dim7 with a\n        note stuck on the end. The number rises the way it does under every\n        other seventh - the bb7 only sat in the \"no seventh\" branch here\n        because it is spelled as a sixth - and Cdim9 is what the chord lists\n        and Scaler both print. ]]\n    --  Only the spelling changes. It still costs what an added tone costs, so\n    --  which reading wins is untouched: this renames, it does not re-rank.\n    if seventh == \"bb7\" and naturals[9] then\n      naturals[9] = nil\n      name = name:gsub(\"dim7\", \"dim9\", 1)\n      cost = cost + COST_ADD\n    end\n    for _, degree in ipairs({9, 11, 13}) do\n      if naturals[degree] then\n        cost = cost + (degree == 11 and third == \"maj\" and COST_CLASH or COST_ADD)\n        name = name .. (name == \"\" and \"add\" or \"Add\") .. degree\n      end\n    end\n  end\n\n  --[[  An alteration is written straight onto the symbol - C7b9, Cmin#11 -\n      except where that would read as a note name. \"C#11\" is a chord on C#,\n      so a bare triad says add instead: Cadd#11. ]]\n  --[[  Alt 2 differs from Alt here, and only here. Alt asks whether an\n      alteration belongs to the chord under it, and only a dominant is at home\n      with a b9, a #9 or a b13. Alt 2 also accepts a complete triad - a real\n      third with a perfect fifth underneath it - which is what Scaler 3 does:\n      given the choice it names the chord that has a whole triad in it and\n      hangs the odd notes off that, rather than the thinner reading that needs\n      fewer of them. C D Eb Gb Cb is the case that separates them: Alt reads\n      D13b9/C, Alt 2 and Scaler read Cbaddb9#9/C. ]]\n  local dominant = third == \"maj\" and seventh == \"b7\"\n  local triad = (third == \"maj\" or third == \"min\") and fifth == \"P\"\n  for _, token in ipairs(altered) do\n    --[[  A b13 is excluded from the concession, and measurably so. It is the\n        one alteration whose note is almost always a chord tone of something\n        plainer: E G B with a C in it is Cmaj7 in first inversion, not Emin\n        wearing a b13. Letting a complete triad take one cost 207 misnamed\n        sonorities across the Bach chorales and 7 points of accuracy on\n        inverted jazz voicings, and bought nothing - the chord Alt 2 exists\n        for, Cb maj b9 #9, carries a b9 and a #9, not a b13. ]]\n    --[[  An altered fifth is no bar on a dominant standing on its own root.\n        A b9 or #9 over a b5 or #5 usually means the root has been guessed\n        wrong, but over a major third and a flat seventh with the root in the\n        bass it is the altered dominant - 7#5b9, 7b5#9, 7b9b13 - which every\n        lead sheet writes. Barring it read C7#5b9 as A#min9b5/C. Only from the\n        bass, because that is how the chord is played - the bass takes the\n        root, the hands take the alterations - and allowing it from an\n        inversion as well read F A C G C# over C as Aaug7#9/C, a #9 in the\n        bass, and moved 790 names in the sweep where this moves 455. ]]\n    local plainFifth = fifth ~= \"b\" and fifth ~= \"#\"\n    local athome = token ~= \"maj7\"\n                   and ((dominant and (plainFifth or root == bass))\n                        or (plainFifth and (token == \"#11\"\n                                            or (triad and token ~= \"b13\"))))\n\n    --[[  A flattened sixth is a b13 only when a seventh is under it. Without\n        one it is an added flat sixth, exactly as a natural sixth is a 6 rather\n        than a 13 - \"C#(add b6) means a C# major triad with the b6 added\"\n        (Hutchinson, Music Theory for the 21st-Century Classroom, 31.1-31.2).\n        Only the printed name changes: the cost still reads it as a b13, which\n        is what keeps E G B C reading Cmaj7/E rather than Emin wearing one. ]]\n    --[[  Both sevenths at once is a semitone cluster rather than a colour, and\n        it turns up in real music as a passing note against a seventh chord -\n        G B D F with an F# over it, 83 voicings across the Beethoven quartets\n        and the Chopin mazurkas. Bracket it, or the two seventh names run\n        together into \"G7maj7\", which is not a symbol anybody could read. ]]\n    local shown = (token == \"b13\" and seventh == \"none\") and \"b6\"\n                  or (token == \"maj7\" and \"(maj7)\") or token\n    cost = cost + (athome and COST_ALTERED or COST_CLASHING)\n    name = name .. ((name == \"\" and seventh == \"none\") and \"add\" or \"\") .. shown\n  end\n\n  if (third == \"sus4\" or third == \"sus2\") and not asEleventh then\n    local carried = #altered\n    for _, degree in ipairs({9, 11, 13}) do\n      if naturals[degree] then carried = carried + 1 end\n    end\n    if sixth then carried = carried + 1 end\n    cost = cost + carried * COST_SUS_EXTRA\n  end\n\n  --[[  A missing third is the one omission that has to be said out loud, and\n      it is said last, so the symbol reads as a chord with a note taken out of\n      it: maj7b5(no3), not maj7(no3)b5. A bare fifth with nothing above it is\n      the one chord that is only its root and fifth. ]]\n  if third == \"none\" then name = (name == \"\" and \"5\" or name .. \"(no3)\") end\n\n  if root ~= bass then cost = cost + COST_INVERSION end\n  -- Two readings can cost the same - Emin6 and C#min7b5 are the same four\n  -- notes - so the commoner quality settles it rather than the loop order.\n  return name, cost, rank\nend\n\n--[[  With both fifths sounding and no perfect one between them, neither is\n    obviously the fifth, so both readings are costed and the cheaper wins.\n    Everywhere else there is nothing to choose and the second reading is not\n    even built. ]]\nlocal function analyse(has, root, bass)\n  local name, cost, rank = analyseAs(has, root, bass, false)\n  if has[6] and has[8] and not has[7] then\n    local altName, altCost, altRank = analyseAs(has, root, bass, true)\n    if altCost < cost then return altName, altCost, altRank end\n  end\n  return name, cost, rank\nend\n\n------------------------------------------------------------------------------\n-- End of the copy. What follows is ScaleView Pro's `detectChord`, with the\n-- one change a port needs: it read the notes held and the key selected from\n-- the script's globals, and here both are passed in. With no key it assumes\n-- C major, as ScaleView does, and for the same reason: it is what the names\n-- fall back to anyway.\n------------------------------------------------------------------------------\n\nlocal ASSUMED = M.key(1, M.MAJOR)\n\n-- A chord root is named from the eighteen spellings ROOTS offers, the roots\n-- real keys are built on; anything else falls back to a plain name leaning\n-- the way the key does, so no chord symbol carries a double accidental.\nlocal CHORD_ROOT_NAMES = {}\nfor _, root in ipairs(M.ROOTS) do CHORD_ROOT_NAMES[root.name] = true end\n\nlocal function chordNoteName(key, pc)\n  local name = key.names[pc]\n  if CHORD_ROOT_NAMES[name] then return name end\n  return (key.flats and M.FLAT_NAMES or M.SHARP_NAMES)[pc + 1]\nend\nM.chordNoteName = function(key, pc) return chordNoteName(key or ASSUMED, pc % 12) end\n\n-- A doubled first, third or fifth degree of the key claims the bass: E G C C\n-- is C, not C/E. It can only remove a slash, never invent one.\nlocal function readAsRootPosition(key, root, bass, voices)\n  if root == bass then return true end\n  if (voices[root] or 0) < 2 then return false end\n  return root == key.degreePc[0] or root == key.degreePc[2] or root == key.degreePc[4]\nend\n\n--[[  pitches: a list of MIDI note numbers sounding together. Returns the\n      symbol, the root's pitch class and the bass's pitch class. Where the\n      notes are an interval rather than a chord, the symbol reads them out and\n      the root is nil. ]]\nfunction M.nameChord(pitches, key)\n  key = key or ASSUMED\n  local classes, bassNote, voices = {}, nil, {}\n  for _, p in ipairs(pitches) do\n    local pc = p % 12\n    classes[pc] = true\n    voices[pc] = (voices[pc] or 0) + 1\n    if not bassNote or p < bassNote then bassNote = p end\n  end\n  if not bassNote then return nil end\n  local bass = bassNote % 12\n\n  local count = 0\n  for _ in pairs(classes) do count = count + 1 end\n  if count == 1 then return chordNoteName(key, bass), bass, bass end\n\n  local function spellOut()\n    local spelled = {}\n    for pc = 0, 11 do\n      if classes[pc] then spelled[#spelled + 1] = chordNoteName(key, pc) end\n    end\n    return table.concat(spelled, \" \")\n  end\n\n  local function slashed(root, name)\n    if not readAsRootPosition(key, root, bass, voices) then\n      name = name .. \"/\" .. chordNoteName(key, bass)\n    end\n    return name\n  end\n\n  -- Two notes are an interval, except a bare fifth and a third.\n  if count == 2 then\n    for root = 0, 11 do\n      if classes[root] and classes[(root + 7) % 12] then\n        return slashed(root, chordNoteName(key, root) .. \"5\"), root, bass\n      end\n    end\n    for root = 0, 11 do\n      if classes[root] then\n        local quality = (classes[(root + 4) % 12] and \"maj\")\n                     or (classes[(root + 3) % 12] and \"min\")\n        if quality then\n          return slashed(root, chordNoteName(key, root) .. quality .. \"(no5)\"), root, bass\n        end\n      end\n    end\n    return spellOut(), nil, bass\n  end\n\n  -- Past a certain thickness there is no chord left to find, only a cluster.\n  if count > 7 then return spellOut(), nil, bass end\n\n  local best\n  for root = 0, 11 do\n    if classes[root] then\n      local has = {}\n      for pc = 0, 11 do\n        if classes[pc] then has[(pc - root) % 12] = true end\n      end\n      local name, cost, rank = analyse(has, root, bass)\n      local fit = key.pcs[root] and 100 or 0\n      for pc = 0, 11 do\n        if classes[pc] and key.pcs[pc] then fit = fit + 1 end\n      end\n      --[[  After the key, a draw goes to the reading that needs no slash, and\n          only then to the commoner quality. C D G Bb over C cost the same as\n          C7sus2 and as Gmin add11 over C, and the minor triad's rank won it:\n          a slash nobody needed, chosen by a tiebreak. ]]\n      local slash = root ~= bass\n      if not best or cost < best.cost\n         or (cost == best.cost and fit > best.fit)\n         or (cost == best.cost and fit == best.fit and best.slash and not slash)\n         or (cost == best.cost and fit == best.fit and slash == best.slash\n             and rank < best.rank) then\n        best = { root = root, name = name, cost = cost, rank = rank, fit = fit,\n                 slash = slash }\n      end\n    end\n  end\n\n  return slashed(best.root, chordNoteName(key, best.root) .. best.name), best.root, bass\nend\n\n------------------------------------------------------------------------------\n-- Roman numerals\n--\n-- A numeral says where a chord sits in the key, which is the thing a symbol\n-- cannot: C G Amin F and G D Emin C are the same progression, I V vi IV.\n-- Upper case for a major third, lower case for a minor one, the way every\n-- harmony textbook writes them.\n------------------------------------------------------------------------------\n\nlocal NUMERALS = { \"I\", \"II\", \"III\", \"IV\", \"V\", \"VI\", \"VII\" }\n\n-- The quality of a chord from its intervals above the root (a set), as the\n-- two things a numeral shows: its third and fifth, and its seventh.\nfunction M.quality(has)\n  local third = has[4] and \"maj\" or (has[3] and \"min\") or \"none\"\n  local fifth = has[7] and \"P\" or (has[6] and \"b\") or (has[8] and \"#\") or \"P\"\n  local triad = (third == \"min\" and fifth == \"b\" and \"dim\")\n             or (third == \"maj\" and fifth == \"#\" and \"aug\")\n             or (third == \"min\" and \"min\") or \"maj\"\n  local seventh = (has[10] and \"b7\") or (has[11] and \"maj7\")\n               or (triad == \"dim\" and has[9] and \"dim7\") or \"none\"\n  return triad, seventh\nend\n\n--[[  The numeral for a chord on rootPc with the given interval set.\n\n      A root in the key takes its degree. A root outside it is written as the\n      nearest degree flattened - bVII, bVI, bIII are the chords borrowed from\n      the parallel minor, and that is how they are always written - except a\n      root a semitone under the tonic, which is the raised seventh, #vii. ]]\nfunction M.numeral(key, rootPc, has)\n  rootPc = rootPc % 12\n  local triad, seventh = M.quality(has)\n  local base\n  local d = key.degree[rootPc]\n  if d then\n    base = NUMERALS[d + 1]\n  elseif (rootPc + 1) % 12 == key.tonic then\n    base = \"#\" .. NUMERALS[7]\n  else\n    local up = key.degree[(rootPc + 1) % 12]\n    if up then base = \"b\" .. NUMERALS[up + 1]\n    else base = \"#\" .. NUMERALS[(key.degree[(rootPc - 1) % 12] or 0) + 1] end\n  end\n  if triad == \"min\" or triad == \"dim\" then base = base:lower() end\n  local mark = (triad == \"dim\" and (seventh == \"b7\" and \"\u00c3\u00b87\" or \"\u00c2\u00b0\"))\n            or (triad == \"aug\" and \"+\") or \"\"\n  if triad == \"dim\" and seventh == \"dim7\" then mark = \"\u00c2\u00b07\" end\n  local sev = \"\"\n  if triad ~= \"dim\" then\n    sev = (seventh == \"b7\" and \"7\") or (seventh == \"maj7\" and \"maj7\") or \"\"\n  end\n  return base .. mark .. sev\nend\n\nreturn M\n"};

/* ---- ../kit/palette.js ---- */
/* The devices' colours in Live: after Ableton Live 8's default theme.
 *
 * The scheme is Starting Blocks' own experiment of 18 September 2026
 * (commit 2765b0a3, "theme the window after Live 8"): a neutral grey chrome
 * meant to sit quietly under brightly coloured clips, controls raised off it,
 * and one warm amber spent where Live spends its accent, on what is switched
 * on. It was built from the theme's described character, not Live's own
 * files, so it is a likeness, not a match.
 *
 * Two changes from that experiment, both for the family's rules (every word
 * 7:1 on what it sits on, ink on every button, marks and edges 3:1):
 *   - the chrome is #3E3E3E, a step darker than its #4A4A4A, because on
 *     #4A4A4A a secondary word cannot reach 7:1 and still look secondary;
 *   - buttons are a light grey with dark ink, as the house scheme's are,
 *     because light words on its #5E5E5E buttons reach only 5:1.
 * The greys are neutral (R = G = B), as Live's are: the house rule that
 * every grey leans blue is the yellow scheme's, and Live's look is not that.
 *
 * Palette.tone(r, g, b) is how the REAPER windows (the JSFX and Lua scripts,
 * drawn through gfx.js) take the scheme without a line of theirs changing:
 *   - the house scheme's own colours map one for one (HOUSE below), each
 *     chosen so the pairs the scripts rely on stay 7:1 for words and 3:1
 *     for edges;
 *   - the house yellow, and the shades the scripts make of it, become the
 *     amber, shaded the same way;
 *   - any other grey loses its tint at the same brightness, so a script
 *     with a palette of its own keeps every contrast it had;
 *   - every other colour (a material, an engine, a part) is left alone.
 */
var Palette = (function () {
  'use strict';
  var C = {
    ground: 0x3E3E3E,     // the chrome: Live 8's #4A4A4A, a step darker (see above)
    raised: 0x484848,     // a control that is off
    sunken: 0x2E2E2E,     // lists, fields, a roll or a page: Live 8's roll ground
    deep: 0x262626,       // a roll's own ground under a sunken frame
    popup: 0x333333,      // menus
    rule: 0x555555,       // separators: they group, they do not act
    edge: 0x8C8C8C,       // the edge of anything that acts: 3.2:1 on the chrome
    control: 0xB4B4B4,    // buttons, with ink on them
    controlHover: 0xC4C4C4,
    controlHeld: 0xAAAAAA,
    accent: 0xD7A93C,     // Live 8's warm amber: what is on
    accentHeld: 0xCDA139,  // held: ink on it still 7.2:1
    ink: 0x1A1A1A,        // words on a button, grey or amber; also a window's darkest ground
                          // (AutoCC paints its window in the ink), so words are 7:1 on it too
    text: 0xF0F0F0,       // 9.4:1 on the chrome
    label: 0xD8D8D8,      // 7.5:1
    dim: 0xD4D4D4,        // secondary words, 7.2:1
    mark: 0xA8A8A8,       // a mark that is not a word, or a control that is off
    note: 0xA8D8E8,       // Live 8's cool note colour, for a roll
    ring: 0xFAFAFA,       // the keyboard's place
    warn: 0xF0605A,       // a warning's mark, never its words: 3.3:1 on the chrome
    warnText: 0xFFC8C2    // a warning's words, 7.3:1
  };
  // The house scheme (HousePalette, every family repo's docs/COLOUR.md) to this one.
  var HOUSE = {
    0x111419: C.deep, 0x14171C: C.ink, 0x1A1D23: C.sunken, 0x1B1F25: C.popup, 0x1E2228: 0x343434,
    0x22262D: 0x363636, 0x23272E: C.ground, 0x2A2F37: C.raised, 0x3A404A: C.rule, 0x585F6B: 0x707070,
    0x646B77: 0x7A7A7A, 0x6D7581: C.edge, 0x8A919C: C.mark, 0x8F96A2: C.controlHeld, 0xA9AFBA: C.control,
    0xB0B6C0: C.dim, 0xB6BCC6: C.dim, 0xBFC5CE: C.label, 0xC0C6CF: C.controlHover, 0xDDE1E7: C.text,
    0xF2F4F7: C.ring, 0xFFF200: C.accent, 0xD1C600: C.accentHeld, 0xFF9E96: C.warnText, 0xFFA6A0: C.warnText, 0xD2483F: C.warn
  };
  function rgb(hex, a) {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, a === undefined ? 1 : a];
  }
  function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function unlin(l) { return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055; }
  function luminance(r, g, b) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
  function contrast(a, b) {
    var la = luminance(a[0], a[1], a[2]), lb = luminance(b[0], b[1], b[2]);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  var AMBER = rgb(C.accent);
  // r, g, b from 0 to 1; returns [r, g, b].
  function tone(r, g, b) {
    r = clamp(r); g = clamp(g); b = clamp(b);
    var R = Math.round(r * 255), G = Math.round(g * 255), B = Math.round(b * 255);
    var hex = (R << 16) | (G << 8) | B;
    if (HOUSE[hex] !== undefined) { var t = rgb(HOUSE[hex]); return [t[0], t[1], t[2]]; }
    // The house yellow and its shades: lighter ones mix in white (blue rises
    // from 0), darker ones scale down (red and green fall together).
    if (R >= 120 && G >= 110 && Math.abs(R - G) <= 40 && B <= Math.min(R, G) - 90) {
      var w = B / 255, k = Math.max(R, G) / 255;
      return [0, 1, 2].map(function (i) { return clamp(AMBER[i] * k + (1 - AMBER[i] * k) * w); });
    }
    // A grey with a tint, from any palette: neutral at the same brightness.
    var hi = Math.max(R, G, B), lo = Math.min(R, G, B);
    if (hi - lo <= 28) { var n = unlin(luminance(r, g, b)); return [n, n, n]; }
    return [r, g, b];
  }
  return { C: C, HOUSE: HOUSE, rgb: rgb, tone: tone, luminance: luminance, contrast: contrast };
})();


/* ---- ../kit/runtime/polyfill.js ---- */
/* What JavaScriptCore lacks and the Lua runtime uses: TextEncoder and
 * TextDecoder, UTF-8 only, as the web defines them (an invalid byte decodes
 * to U+FFFD and decoding goes on). Installed only where they are missing, so
 * Node and browsers keep their own; MiddawUTF8 is the same code, always, for
 * the tests to hold against the real thing.
 */
(function (G) {
  'use strict';
  function encode(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
        else c = 0xFFFD;
      } else if (c >= 0xD800 && c <= 0xDFFF) c = 0xFFFD;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
  function decode(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    var out = '', i = 0, n = b.length;
    while (i < n) {
      var c = b[i], need = 0, cp = 0, min = 0;
      if (c < 0x80) { out += String.fromCharCode(c); i++; continue; }
      else if (c >= 0xC2 && c <= 0xDF) { need = 1; cp = c & 0x1F; min = 0x80; }
      else if (c >= 0xE0 && c <= 0xEF) { need = 2; cp = c & 0x0F; min = 0x800; }
      else if (c >= 0xF0 && c <= 0xF4) { need = 3; cp = c & 0x07; min = 0x10000; }
      else { out += '�'; i++; continue; }
      var j = 1, ok = true;
      for (; j <= need; j++) {
        if (i + j >= n) { ok = false; break; }
        var x = b[i + j];
        // the second byte's range is narrower for a few leads (no overlongs, no surrogates)
        var lo = 0x80, hi = 0xBF;
        if (j === 1) {
          if (c === 0xE0) lo = 0xA0; else if (c === 0xED) hi = 0x9F;
          else if (c === 0xF0) lo = 0x90; else if (c === 0xF4) hi = 0x8F;
        }
        if (x < lo || x > hi) { ok = false; break; }
        cp = (cp << 6) | (x & 0x3F);
      }
      if (!ok || cp < min) { out += '�'; i += Math.max(1, j); continue; }
      if (cp >= 0x10000) { cp -= 0x10000; out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)); }
      else out += String.fromCharCode(cp);
      i += need + 1;
    }
    return out;
  }
  function Enc() {}
  Enc.prototype.encode = function (s) { return encode(String(s === undefined ? '' : s)); };
  function Dec() {}
  Dec.prototype.decode = function (b) { return decode(b); };
  G.MiddawUTF8 = { TextEncoder: Enc, TextDecoder: Dec };
  if (typeof G.TextEncoder === 'undefined') G.TextEncoder = Enc;
  if (typeof G.TextDecoder === 'undefined') G.TextDecoder = Dec;
})(typeof globalThis !== 'undefined' ? globalThis : this);


/* ---- ../kit/runtime/lua_parse.js ---- */
/* Middaw's Lua 5.4, part 1 of 3: the lexer and the parser.
 *
 * Middaw runs the family's Lua engines (Good Idea, Midi Suggester, Midi
 * Variator, Midi Catalogue, Starting Blocks, DAW Battle Pass...) unchanged, in
 * the browser, with no third-party code: this file reads Lua source into a
 * syntax tree, lua_compile.js turns the tree into JavaScript, lua_runtime.js
 * supplies the values and the standard library. tests/js/test_lua.js holds
 * all three to what the real Lua 5.4 prints for the same programs.
 *
 * Source is a "byte string": one JS character per byte of the file, which is
 * how Lua itself sees a string, so `#s` and string.sub count bytes as Lua does.
 */
(function (NS) {
  'use strict';

  var KEYWORDS = {};
  ('and break do else elseif end false for function goto if in local nil not ' +
   'or repeat return then true until while').split(' ').forEach(function (k) { KEYWORDS[k] = true; });

  function LuaSyntaxError(message, chunk, line) {
    this.message = chunk + ':' + line + ': ' + message;
    this.line = line;
  }
  LuaSyntaxError.prototype = Object.create(Error.prototype);
  LuaSyntaxError.prototype.name = 'LuaSyntaxError';

  function isDigit(c) { return c >= 48 && c <= 57; }
  function isHex(c) { return isDigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70); }
  function isAlpha(c) { return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95; }
  function isSpace(c) { return c === 32 || (c >= 9 && c <= 13); }

  // ---------------------------------------------------------------- lexer --
  function lex(src, chunk) {
    var toks = [];
    var i = 0, n = src.length, line = 1;
    function err(msg) { throw new LuaSyntaxError(msg, chunk, line); }
    function longBracketLevel(at) {   // at points to '['; returns level or -1
      var j = at + 1, level = 0;
      while (src.charCodeAt(j) === 61) { level++; j++; }
      return src.charCodeAt(j) === 91 ? level : -1;
    }
    function readLong(at, level) {    // returns [content, end index]
      var start = at + level + 2;
      // a newline straight after the opening bracket is skipped
      if (src[start] === '\r') { start++; if (src[start] === '\n') start++; }
      else if (src[start] === '\n') { start++; if (src[start] === '\r') start++; }
      var close = ']' + '='.repeat(level) + ']';
      var end = src.indexOf(close, start);
      if (end < 0) err('unfinished long string');
      var body = src.slice(start, end);
      for (var k = at; k < end + close.length; k++) if (src.charCodeAt(k) === 10) line++;
      return [body, end + close.length];
    }
    while (i < n) {
      var c = src.charCodeAt(i);
      if (c === 10) { line++; i++; continue; }
      if (isSpace(c)) { i++; continue; }
      if (c === 45 && src.charCodeAt(i + 1) === 45) {           // comment
        i += 2;
        if (src.charCodeAt(i) === 91) {
          var lvl = longBracketLevel(i);
          if (lvl >= 0) { i = readLong(i, lvl)[1]; continue; }
        }
        while (i < n && src.charCodeAt(i) !== 10) i++;
        continue;
      }
      var tline = line;
      if (isAlpha(c)) {
        var j = i + 1;
        while (j < n && (isAlpha(src.charCodeAt(j)) || isDigit(src.charCodeAt(j)))) j++;
        var word = src.slice(i, j);
        toks.push(KEYWORDS[word] ? { t: word, line: tline } : { t: 'name', v: word, line: tline });
        i = j; continue;
      }
      if (isDigit(c) || (c === 46 && isDigit(src.charCodeAt(i + 1)))) {
        var j2 = i, isFloat = false, text;
        if (c === 48 && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
          j2 = i + 2;
          while (j2 < n) {
            var d = src.charCodeAt(j2);
            if (isHex(d) || d === 46) { if (d === 46) isFloat = true; j2++; }
            else if ((d === 112 || d === 80)) {
              isFloat = true; j2++;
              if (src[j2] === '+' || src[j2] === '-') j2++;
            } else break;
          }
        } else {
          while (j2 < n) {
            var e = src.charCodeAt(j2);
            if (isDigit(e) || e === 46) { if (e === 46) isFloat = true; j2++; }
            else if (e === 101 || e === 69) {
              isFloat = true; j2++;
              if (src[j2] === '+' || src[j2] === '-') j2++;
            } else break;
          }
        }
        text = src.slice(i, j2);
        if (j2 < n && (isAlpha(src.charCodeAt(j2)))) err("malformed number near '" + text + src[j2] + "'");
        toks.push({ t: 'number', v: text, line: tline });
        i = j2; continue;
      }
      if (c === 34 || c === 39) {                                // short string
        var q = c, out = [], k = i + 1;
        for (;;) {
          if (k >= n) err('unfinished string');
          var ch = src.charCodeAt(k);
          if (ch === q) { k++; break; }
          if (ch === 10) err('unfinished string');
          if (ch === 92) {
            var x = src[k + 1];
            k += 2;
            switch (x) {
              case 'n': out.push('\n'); break;
              case 't': out.push('\t'); break;
              case 'r': out.push('\r'); break;
              case 'a': out.push('\x07'); break;
              case 'b': out.push('\b'); break;
              case 'f': out.push('\f'); break;
              case 'v': out.push('\v'); break;
              case '\\': out.push('\\'); break;
              case '"': out.push('"'); break;
              case "'": out.push("'"); break;
              case '\n': line++; out.push('\n'); break;
              case 'x': {
                var hx = src.slice(k, k + 2);
                if (!/^[0-9a-fA-F]{2}$/.test(hx)) err('hexadecimal digit expected');
                out.push(String.fromCharCode(parseInt(hx, 16))); k += 2; break;
              }
              case 'z': {
                while (k < n && isSpace(src.charCodeAt(k))) { if (src.charCodeAt(k) === 10) line++; k++; }
                break;
              }
              case 'u': {
                if (src[k] !== '{') err("missing '{' in \\u{xxxx}");
                var close = src.indexOf('}', k);
                var cp = parseInt(src.slice(k + 1, close), 16);
                k = close + 1;
                out.push(utf8Bytes(cp)); break;
              }
              default: {
                if (x !== undefined && isDigit(x.charCodeAt(0))) {
                  var digits = x; var m = 0;
                  while (m < 2 && isDigit(src.charCodeAt(k))) { digits += src[k]; k++; m++; }
                  var val = parseInt(digits, 10);
                  if (val > 255) err('decimal escape too large');
                  out.push(String.fromCharCode(val));
                } else err('invalid escape sequence');
              }
            }
            continue;
          }
          out.push(src[k]); k++;
        }
        toks.push({ t: 'string', v: out.join(''), line: tline });
        i = k; continue;
      }
      if (c === 91) {
        var lv = longBracketLevel(i);
        if (lv >= 0) {
          var r = readLong(i, lv);
          toks.push({ t: 'string', v: r[0], line: tline });
          i = r[1]; continue;
        }
      }
      var three = src.substr(i, 3), two = src.substr(i, 2);
      if (three === '...') { toks.push({ t: '...', line: tline }); i += 3; continue; }
      if (two === '==' || two === '~=' || two === '<=' || two === '>=' || two === '//' ||
          two === '::' || two === '<<' || two === '>>' || two === '..') {
        toks.push({ t: two, line: tline }); i += 2; continue;
      }
      var one = src[i];
      if ('+-*/%^#&~|<>=(){}[];:,.'.indexOf(one) >= 0) { toks.push({ t: one, line: tline }); i++; continue; }
      err("unexpected symbol near '" + one + "'");
    }
    toks.push({ t: '<eof>', line: line });
    return toks;
  }

  function utf8Bytes(cp) {
    if (cp < 0x80) return String.fromCharCode(cp);
    if (cp < 0x800) return String.fromCharCode(0xC0 | (cp >> 6), 0x80 | (cp & 63));
    if (cp < 0x10000) return String.fromCharCode(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    return String.fromCharCode(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }

  // --------------------------------------------------------------- parser --
  // Binary priorities exactly as lparser.c has them: { left, right }.
  var BINARY = {
    '+': [10, 10], '-': [10, 10], '*': [11, 11], '%': [11, 11], '^': [14, 13],
    '/': [11, 11], '//': [11, 11], '&': [6, 6], '|': [4, 4], '~': [5, 5],
    '<<': [7, 7], '>>': [7, 7], '..': [9, 8],
    '==': [3, 3], '<': [3, 3], '<=': [3, 3], '~=': [3, 3], '>': [3, 3], '>=': [3, 3],
    'and': [2, 2], 'or': [1, 1]
  };
  var UNARY_PRIORITY = 12;

  function parse(src, chunk) {
    chunk = chunk || '?';
    var toks = lex(src, chunk);
    var p = 0;
    function peek() { return toks[p]; }
    function next() { return toks[p++]; }
    function check(t) { return toks[p].t === t; }
    function err(msg, tok) {
      tok = tok || toks[p];
      var near = tok.t === '<eof>' ? '<eof>' : (tok.v !== undefined ? tok.v : tok.t);
      throw new LuaSyntaxError(msg + " near '" + near + "'", chunk, tok.line);
    }
    function expect(t, what) {
      if (toks[p].t !== t) err("'" + t + "' expected" + (what ? ' (to close ' + what + ')' : ''));
      return toks[p++];
    }
    function accept(t) { if (toks[p].t === t) { p++; return true; } return false; }
    function name() {
      if (toks[p].t !== 'name') err('<name> expected');
      return toks[p++].v;
    }

    function blockFollow(withUntil) {
      var t = toks[p].t;
      return t === 'else' || t === 'elseif' || t === 'end' || t === '<eof>' || (withUntil && t === 'until');
    }

    function block() {
      var body = [];
      while (!blockFollow(true)) {
        if (check('return')) { body.push(retstat()); break; }
        var s = statement();
        if (s) body.push(s);
      }
      return body;
    }

    function retstat() {
      var tok = next();
      var exprs = [];
      if (!blockFollow(true) && !check(';')) exprs = exprlist();
      accept(';');
      return { k: 'Return', exprs: exprs, line: tok.line };
    }

    function statement() {
      var tok = peek(), line = tok.line;
      switch (tok.t) {
        case ';': next(); return null;
        case 'if': return ifstat();
        case 'while': {
          next(); var cond = expr(); expect('do'); var b = block(); expect('end', 'while');
          return { k: 'While', cond: cond, body: b, line: line };
        }
        case 'do': { next(); var b2 = block(); expect('end', 'do'); return { k: 'Do', body: b2, line: line }; }
        case 'for': return forstat();
        case 'repeat': {
          next(); var b3 = block(); expect('until', 'repeat'); var c3 = expr();
          return { k: 'Repeat', body: b3, cond: c3, line: line };
        }
        case 'function': {
          next();
          var target = { k: 'Name', name: name(), line: line }, isMethod = false;
          while (check('.') || check(':')) {
            var sep = next().t;
            var key = name();
            target = { k: 'Index', obj: target, key: { k: 'String', v: key }, line: line };
            if (sep === ':') { isMethod = true; break; }
          }
          var f = funcbody(isMethod, line);
          return { k: 'Assign', targets: [target], exprs: [f], line: line };
        }
        case 'local': {
          next();
          if (accept('function')) {
            var nm = name();
            return { k: 'LocalFunction', name: nm, func: funcbody(false, line), line: line };
          }
          var names = [], attribs = [];
          do {
            names.push(name());
            if (accept('<')) { attribs.push(name()); expect('>'); } else attribs.push(null);
          } while (accept(','));
          var exprs = accept('=') ? exprlist() : [];
          return { k: 'Local', names: names, attribs: attribs, exprs: exprs, line: line };
        }
        case '::': { next(); var label = name(); expect('::'); return { k: 'Label', name: label, line: line }; }
        case 'return': return retstat();
        case 'break': next(); return { k: 'Break', line: line };
        case 'goto': next(); return { k: 'Goto', name: name(), line: line };
        default: return exprstat();
      }
    }

    function ifstat() {
      var line = next().line;
      var clauses = [];
      var cond = expr(); expect('then');
      clauses.push({ cond: cond, body: block() });
      var orelse = null;
      for (;;) {
        if (accept('elseif')) { var c = expr(); expect('then'); clauses.push({ cond: c, body: block() }); }
        else if (accept('else')) { orelse = block(); expect('end', 'if'); break; }
        else { expect('end', 'if'); break; }
      }
      return { k: 'If', clauses: clauses, orelse: orelse, line: line };
    }

    function forstat() {
      var line = next().line;
      var n1 = name();
      if (accept('=')) {
        var start = expr(); expect(',');
        var limit = expr();
        var step = accept(',') ? expr() : null;
        expect('do'); var b = block(); expect('end', 'for');
        return { k: 'NumFor', name: n1, start: start, limit: limit, step: step, body: b, line: line };
      }
      var names = [n1];
      while (accept(',')) names.push(name());
      expect('in');
      var exprs = exprlist();
      expect('do'); var body = block(); expect('end', 'for');
      return { k: 'GenFor', names: names, exprs: exprs, body: body, line: line };
    }

    function exprstat() {
      var line = peek().line;
      var e = suffixedexp();
      if (check('=') || check(',')) {
        var targets = [e];
        while (accept(',')) targets.push(suffixedexp());
        expect('=');
        var exprs = exprlist();
        targets.forEach(function (t) { if (t.k !== 'Name' && t.k !== 'Index') err('syntax error'); });
        return { k: 'Assign', targets: targets, exprs: exprs, line: line };
      }
      if (e.k !== 'Call' && e.k !== 'Method') err('syntax error');
      return { k: 'ExprStat', expr: e, line: line };
    }

    function exprlist() {
      var list = [expr()];
      while (accept(',')) list.push(expr());
      return list;
    }

    function funcbody(isMethod, line) {
      var params = isMethod ? ['self'] : [], vararg = false;
      expect('(');
      if (!check(')')) {
        do {
          if (accept('...')) { vararg = true; break; }
          params.push(name());
        } while (accept(','));
      }
      expect(')');
      var b = block();
      var endTok = expect('end', 'function');
      return { k: 'Function', params: params, vararg: vararg, body: b, line: line, endLine: endTok.line };
    }

    function primaryexp() {
      var tok = peek();
      if (tok.t === 'name') { next(); return { k: 'Name', name: tok.v, line: tok.line }; }
      if (tok.t === '(') {
        next(); var e = expr(); expect(')');
        return { k: 'Paren', expr: e, line: tok.line };
      }
      err('unexpected symbol');
    }

    function suffixedexp() {
      var e = primaryexp();
      for (;;) {
        var tok = peek();
        switch (tok.t) {
          case '.': next(); e = { k: 'Index', obj: e, key: { k: 'String', v: name() }, line: tok.line }; break;
          case '[': next(); var key = expr(); expect(']'); e = { k: 'Index', obj: e, key: key, line: tok.line }; break;
          case ':': next(); var m = name(); e = { k: 'Method', obj: e, name: m, args: callargs(), line: tok.line }; break;
          case '(': case 'string': case '{': e = { k: 'Call', fn: e, args: callargs(), line: tok.line }; break;
          default: return e;
        }
      }
    }

    function callargs() {
      var tok = peek();
      if (tok.t === 'string') { next(); return [{ k: 'String', v: tok.v }]; }
      if (tok.t === '{') return [tablecons()];
      expect('(');
      if (accept(')')) return [];
      var args = exprlist();
      expect(')');
      return args;
    }

    function tablecons() {
      var line = expect('{').line;
      var items = [];   // { kind: 'pos'|'named'|'keyed', key, value }
      while (!check('}')) {
        if (check('name') && toks[p + 1].t === '=') {
          var key = next().v; next();
          items.push({ kind: 'keyed', key: { k: 'String', v: key }, value: expr() });
        } else if (check('[')) {
          next(); var k = expr(); expect(']'); expect('=');
          items.push({ kind: 'keyed', key: k, value: expr() });
        } else {
          items.push({ kind: 'pos', value: expr() });
        }
        if (!accept(',') && !accept(';')) break;
      }
      expect('}', 'table');
      return { k: 'Table', items: items, line: line };
    }

    function simpleexp() {
      var tok = peek();
      switch (tok.t) {
        case 'number': next(); return { k: 'Number', v: tok.v, line: tok.line };
        case 'string': next(); return { k: 'String', v: tok.v };
        case 'nil': next(); return { k: 'Nil' };
        case 'true': next(); return { k: 'True' };
        case 'false': next(); return { k: 'False' };
        case '...': next(); return { k: 'Vararg', line: tok.line };
        case '{': return tablecons();
        case 'function': next(); return funcbody(false, tok.line);
        default: return suffixedexp();
      }
    }

    function expr(limit) {
      limit = limit || 0;
      var left, tok = peek();
      if (tok.t === 'not' || tok.t === '-' || tok.t === '#' || tok.t === '~') {
        next();
        left = { k: 'Unop', op: tok.t, expr: expr(UNARY_PRIORITY), line: tok.line };
      } else {
        left = simpleexp();
      }
      for (;;) {
        var op = peek().t, pr = BINARY[op];
        if (!pr || pr[0] <= limit) break;
        var line = next().line;
        var right = expr(pr[1]);
        left = { k: 'Binop', op: op, left: left, right: right, line: line };
      }
      return left;
    }

    var body = block();
    if (!check('<eof>')) err("'<eof>' expected");
    return { k: 'Chunk', body: body };
  }

  NS.lex = lex;
  NS.parse = parse;
  NS.LuaSyntaxError = LuaSyntaxError;
  NS.utf8Bytes = utf8Bytes;
})(typeof module === 'object' && module.exports
  ? (module.exports = (globalThis.MiddawLua = globalThis.MiddawLua || {}))
  : (globalThis.MiddawLua = globalThis.MiddawLua || {}));


/* ---- ../kit/runtime/lua_runtime.js ---- */
/* Middaw's Lua 5.4, part 3 of 3: values, operators and the standard library.
 *
 * Values, as JavaScript sees them:
 *   nil      undefined
 *   boolean  true / false
 *   number   a JS number. An integral JS number is a Lua *integer*; a
 *            non-integral one (or inf, nan) is a Lua *float*. A float whose
 *            value happens to be integral (4.0, 2/2) is an LFloat, so that it
 *            still prints "4.0" and math.type still says "float".
 *   string   a JS string with one character per byte (0-255)
 *   table    LuaTable
 *   function a JS function: Lua arguments in, and undefined, one value, or a
 *            Multi for two or more results.
 *
 * Wherever the result has to match the real Lua byte for byte - table.sort
 * with ties, the pattern matcher, math.random, number formatting - the code
 * is a port of Lua 5.4's own C, not a lookalike.
 */
(function (NS) {
  'use strict';

  // ------------------------------------------------------------ values ----
  function LFloat(n) { this.n = n; }
  LFloat.prototype.valueOf = function () { return this.n; };

  function mkf(x) { return Number.isInteger(x) ? new LFloat(x) : x; }
  function isNum(v) { return typeof v === 'number' || v instanceof LFloat; }
  function num(v) { return typeof v === 'number' ? v : v.n; }
  function isFloatVal(v) { return v instanceof LFloat || (typeof v === 'number' && !Number.isInteger(v)); }

  function Multi(a) { this.a = a; }
  function first(v) { return v instanceof Multi ? v.a[0] : v; }
  // `return` with no values gives NONE; a bare undefined is one nil.
  var NONE = new Multi([]);
  var NIL1 = Object.freeze([undefined]);
  function sp(v) {
    if (v instanceof Multi) return v.a;
    return v === undefined ? NIL1 : [v];
  }
  function ret(list) {
    if (list.length === 0) return NONE;
    if (list.length === 1) return list[0];
    return new Multi(list);
  }

  var tableIds = 0;
  function LuaTable() { this.arr = []; this.hash = null; this.mt = null; this.id = 0; this.hver = 0; }
  LuaTable.prototype.get = function (k) {
    if (typeof k === 'number') {
      var a = this.arr;
      if (k > 0 && k <= a.length && Number.isInteger(k)) return a[k - 1];
    } else if (typeof k === 'string') {
      return this.hash === null ? undefined : this.hash.get(k);
    } else if (k instanceof LFloat) {
      return this.get(k.n);
    }
    return this.hash === null ? undefined : this.hash.get(k);
  };
  LuaTable.prototype.set = function (k, v) {
    if (typeof k === 'number') {
      if (Number.isInteger(k) && k > 0) {
        var a = this.arr, n = a.length;
        if (k <= n) {
          a[k - 1] = v;
          if (v === undefined && k === n) { while (a.length && a[a.length - 1] === undefined) a.pop(); }
          return;
        }
        if (k === n + 1) {
          if (v === undefined) { if (this.hash !== null) this.hash.delete(k); return; }
          a.push(v);
          if (this.hash !== null && this.hash.size) {
            var h = this.hash;
            while (h.has(a.length + 1)) { var nk = a.length + 1; a.push(h.get(nk)); h.delete(nk); }
          }
          return;
        }
      } else if (k !== k) {
        throw rterror('table index is NaN');
      }
    } else if (k instanceof LFloat) {
      return this.set(k.n, v);
    } else if (k === undefined) {
      throw rterror('table index is nil');
    }
    if (v === undefined) { if (this.hash !== null) this.hash.delete(k); return; }
    if (this.hash === null) this.hash = new Map();
    if (!this.hash.has(k)) this.hver++;
    this.hash.set(k, v);
  };
  LuaTable.prototype.length = function () { return this.arr.length; };

  // ------------------------------------------------------------ errors ----
  // Compiled chunks register their line maps here, so an error can say
  // "gi_idea.lua:1234:" as the real Lua would.
  var lineMaps = {};
  function luaPosition(level) {
    var stack = new Error().stack || '';
    var re = /lua:([^:\s()]+):(\d+):\d+/g, m, found = 0;
    while ((m = re.exec(stack)) !== null) {
      found++;
      if (found >= level) {
        var map = lineMaps[m[1]];
        var line = map ? map[Number(m[2]) - 1] : undefined;
        if (line) return m[1] + ':' + line + ': ';
        return m[1] + ': ';
      }
    }
    return '';
  }
  function LuaError(value, traceback) {
    this.value = value;
    this.message = typeof value === 'string' ? value : tostring(value);
    this.luaTraceback = traceback;
    this.stack = new Error().stack;
  }
  LuaError.prototype = Object.create(Error.prototype);
  LuaError.prototype.name = 'LuaError';
  function rterror(msg) { return new LuaError(luaPosition(1) + msg); }

  function typeName(v) {
    if (v === undefined || v === null) return 'nil';
    switch (typeof v) {
      case 'boolean': return 'boolean';
      case 'number': return 'number';
      case 'string': return 'string';
      case 'function': return 'function';
    }
    if (v instanceof LFloat) return 'number';
    if (v instanceof LuaTable) return 'table';
    return 'userdata';
  }

  // --------------------------------------------------------- numbers ----
  // Exact decimal expansion of a double: x = D * 10^-s, D a BigInt.
  var F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
  function exactDecimal(x) {
    F64[0] = x;
    var hi = U32[1], lo = U32[0];
    var exp = (hi >>> 20) & 0x7ff;
    var mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    if (exp === 0) exp = 1; else mant |= 1n << 52n;
    var e = exp - 1075;
    if (e >= 0) return { D: mant << BigInt(e), s: 0 };
    return { D: mant * (5n ** BigInt(-e)), s: -e };
  }
  function roundDiv(N, div) {      // round N/div half to even
    var q = N / div, r = N % div;
    var twice = r * 2n;
    if (twice > div || (twice === div && (q & 1n) === 1n)) q += 1n;
    return q;
  }
  function fixedDigits(x, f) {     // |x| to f decimals, C-exact; returns string
    var ex = exactDecimal(Math.abs(x));
    var q;
    if (f >= ex.s) q = ex.D * (10n ** BigInt(f - ex.s));
    else q = roundDiv(ex.D, 10n ** BigInt(ex.s - f));
    var s = q.toString();
    if (f === 0) return s;
    while (s.length <= f) s = '0' + s;
    return s.slice(0, s.length - f) + '.' + s.slice(s.length - f);
  }
  function expDigits(x, prec) {    // |x| as d.ddd with prec decimals; returns [mantissa, exponent]
    if (x === 0) return [prec > 0 ? '0.' + '0'.repeat(prec) : '0', 0];
    var ex = exactDecimal(Math.abs(x));
    var D = ex.D.toString();
    var X = D.length - 1 - ex.s;
    var P = prec + 1, q;
    if (D.length > P) {
      q = roundDiv(ex.D, 10n ** BigInt(D.length - P)).toString();
      if (q.length > P) { q = q.slice(0, P); X++; }
    } else q = D + '0'.repeat(P - D.length);
    return [prec > 0 ? q[0] + '.' + q.slice(1) : q, X];
  }
  function fmtExp(x, prec, upper) {
    var r = expDigits(x, prec);
    var X = r[1];
    var s = r[0] + (upper ? 'E' : 'e') + (X < 0 ? '-' : '+') + (Math.abs(X) < 10 ? '0' : '') + Math.abs(X);
    return s;
  }
  function stripZeros(s) {
    if (s.indexOf('.') < 0) return s;
    s = s.replace(/0+$/, '');
    return s.replace(/\.$/, '');
  }
  function fmtG(x, P, upper, alt) {   // C's %g of |x|
    if (P === 0) P = 1;
    if (x === 0) return '0';
    var X = expDigits(x, P - 1)[1];
    var s;
    if (X < -4 || X >= P) {
      var r = expDigits(x, P - 1);
      var m = alt ? r[0] : stripZeros(r[0]);
      s = m + (upper ? 'E' : 'e') + (r[1] < 0 ? '-' : '+') + (Math.abs(r[1]) < 10 ? '0' : '') + Math.abs(r[1]);
    } else {
      s = fixedDigits(x, P - 1 - X);
      if (!alt) s = stripZeros(s);
    }
    return s;
  }
  function floatStr(x) {
    if (x === Infinity) return 'inf';
    if (x === -Infinity) return '-inf';
    if (x !== x) return (1 / x) < 0 ? 'nan' : '-nan';
    var neg = x < 0 || (x === 0 && 1 / x < 0);
    var s = (neg ? '-' : '') + fmtG(x, 14, false, false);
    if (/^-?\d+$/.test(s)) s += '.0';
    return s;
  }
  function intStr(n) {
    if (Math.abs(n) <= 9007199254740992) return String(n === 0 ? 0 : n);
    return BigInt(n).toString();
  }
  // io.write prints a float with LUA_NUMBER_FMT alone: 1.0 is "1".
  function writeNum(v) {
    if (!isNum(v)) throw rterror('bad argument to \'write\' (string expected, got ' + typeName(v) + ')');
    if (typeof v === 'number' && Number.isInteger(v)) return intStr(v);
    var x = num(v);
    if (x === Infinity) return 'inf';
    if (x === -Infinity) return '-inf';
    if (x !== x) return '-nan';
    return (x < 0 || (x === 0 && 1 / x < 0) ? '-' : '') + fmtG(Math.abs(x), 14, false, false);
  }
  function numStr(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? intStr(v) : floatStr(v);
    return floatStr(v.n);
  }

  // lua_stringtonumber: a whole numeral, spaces either side, or undefined.
  function str2num(s) {
    var t = s.replace(/^[ \f\n\r\t\v]+|[ \f\n\r\t\v]+$/g, '');
    var m;
    if ((m = /^([+-])?0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?(?:[pP]([+-]?\d+))?$/.exec(t))) {
      var ip = m[2], fp = m[3], ex = m[4];
      if (!ip && !fp) return undefined;
      var neg = m[1] === '-';
      if (fp === undefined && ex === undefined) {
        var big = BigInt.asIntN(64, BigInt('0x' + ip));
        var n = Number(big);
        return neg ? 0 - n : n;
      }
      var val = 0;
      for (var i = 0; i < ip.length; i++) val = val * 16 + parseInt(ip[i], 16);
      var scale = 1 / 16;
      fp = fp || '';
      for (var j = 0; j < fp.length; j++) { val += parseInt(fp[j], 16) * scale; scale /= 16; }
      if (ex) val *= Math.pow(2, Number(ex));
      return mkf(neg ? -val : val);
    }
    if ((m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.exec(t))) {
      var isInt = m[1].indexOf('.') < 0 && !m[2];
      var v = Number(t);
      if (isInt) {
        if (Math.abs(v) <= 9223372036854775807) return v;
        return mkf(v);
      }
      return mkf(v);
    }
    return undefined;
  }

  function toNumberArith(v, op) {
    if (typeof v === 'number') return v;
    if (v instanceof LFloat) return v;
    if (typeof v === 'string') { var n = str2num(v); if (n !== undefined) return n; }
    return null;
  }
  function arithError(op, a, b) {
    var bad = (isNum(a) || (typeof a === 'string' && str2num(a) !== undefined)) ? b : a;
    if (op === 'concat') return rterror('attempt to concatenate a ' + typeName(bad) + ' value');
    if (op === 'bit') return rterror('attempt to perform bitwise operation on a ' + typeName(bad) + ' value');
    return rterror('attempt to perform arithmetic on a ' + typeName(bad) + ' value');
  }
  function metaOf(v) {
    if (v instanceof LuaTable) return v.mt;
    if (typeof v === 'string') return stringMeta;
    return null;
  }
  function metaBin(ev, a, b) {
    var mt = metaOf(a), h = mt && mt.get(ev);
    if (h === undefined) { mt = metaOf(b); h = mt && mt.get(ev); }
    if (h === undefined || h === null) return NOMETA;
    return first(call(h)(a, b));
  }
  var NOMETA = {};

  function arithSlow(op, a, b, ev) {
    var x = toNumberArith(a), y = toNumberArith(b);
    if (x === null || y === null) {
      var r = metaBin(ev, a, b);
      if (r !== NOMETA) return r;
      throw arithError(op, a, b);
    }
    switch (op) {
      case 'add': return add(x, y);
      case 'sub': return sub(x, y);
      case 'mul': return mul(x, y);
      case 'div': return div(x, y);
      case 'mod': return mod(x, y);
      case 'idiv': return idiv(x, y);
      case 'pow': return pow(x, y);
    }
  }
  function add(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
      var r = a + b;
      return (Number.isInteger(a) && Number.isInteger(b)) ? r : mkf(r);
    }
    if (isNum(a) && isNum(b)) return mkf(num(a) + num(b));
    return arithSlow('add', a, b, '__add');
  }
  function sub(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
      var r = a - b;
      return (Number.isInteger(a) && Number.isInteger(b)) ? r : mkf(r);
    }
    if (isNum(a) && isNum(b)) return mkf(num(a) - num(b));
    return arithSlow('sub', a, b, '__sub');
  }
  function mul(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
      var r = a * b;
      if (Number.isInteger(a) && Number.isInteger(b)) return r === 0 ? 0 : r;
      return mkf(r);
    }
    if (isNum(a) && isNum(b)) return mkf(num(a) * num(b));
    return arithSlow('mul', a, b, '__mul');
  }
  function div(a, b) {
    if (isNum(a) && isNum(b)) return mkf(num(a) / num(b));
    return arithSlow('div', a, b, '__div');
  }
  function idiv(a, b) {
    if (typeof a === 'number' && typeof b === 'number' && Number.isInteger(a) && Number.isInteger(b)) {
      if (b === 0) throw rterror("attempt to perform 'n//0'");
      var q = Math.floor(a / b);
      return q === 0 ? 0 : q;
    }
    if (isNum(a) && isNum(b)) return mkf(Math.floor(num(a) / num(b)));
    return arithSlow('idiv', a, b, '__idiv');
  }
  function mod(a, b) {
    if (typeof a === 'number' && typeof b === 'number' && Number.isInteger(a) && Number.isInteger(b)) {
      if (b === 0) throw rterror("attempt to perform 'n%%0'");
      var r = a % b;
      if (r !== 0 && (r < 0) !== (b < 0)) r += b;
      return r === 0 ? 0 : r;
    }
    if (isNum(a) && isNum(b)) {
      var x = num(a), y = num(b);
      var m;
      if (y === Infinity || y === -Infinity) m = x;
      else m = x % y;
      if ((m > 0) ? y < 0 : (m < 0 && y !== m)) m += y;
      return mkf(m);
    }
    return arithSlow('mod', a, b, '__mod');
  }
  function pow(a, b) {
    if (isNum(a) && isNum(b)) return mkf(Math.pow(num(a), num(b)));
    return arithSlow('pow', a, b, '__pow');
  }
  function unm(a) {
    if (typeof a === 'number') return Number.isInteger(a) ? 0 - a : -a;
    if (a instanceof LFloat) return new LFloat(-a.n);
    var x = toNumberArith(a);
    if (x !== null) return unm(x);
    var mt = metaOf(a), h = mt && mt.get('__unm');
    if (h !== undefined && h !== null) return first(call(h)(a, a));
    throw rterror('attempt to perform arithmetic on a ' + typeName(a) + ' value');
  }

  // Bitwise operations work on 64-bit integers.
  function toInt64(v, a, b) {
    var x = typeof v === 'string' ? str2num(v) : v;
    if (typeof x === 'number' && Number.isInteger(x)) return BigInt(x);
    if (x instanceof LFloat) return BigInt(x.n);
    if (typeof x === 'number') throw rterror('number has no integer representation');
    throw arithError('bit', a, b);
  }
  function fromInt64(big) { return Number(BigInt.asIntN(64, big)); }
  function small(a, b) {
    return typeof a === 'number' && typeof b === 'number' && (a | 0) === a && (b | 0) === b;
  }
  function band(a, b) { if (small(a, b)) return a & b; return bitSlow('__band', a, b, function (x, y) { return x & y; }); }
  function bor(a, b) { if (small(a, b)) return a | b; return bitSlow('__bor', a, b, function (x, y) { return x | y; }); }
  function bxor(a, b) { if (small(a, b)) return a ^ b; return bitSlow('__bxor', a, b, function (x, y) { return x ^ y; }); }
  function shiftLeft(x, n) {
    if (n <= -64n || n >= 64n) return 0n;
    if (n >= 0n) return BigInt.asUintN(64, x << n);
    return BigInt.asUintN(64, x) >> (-n);
  }
  function shl(a, b) { return bitSlow('__shl', a, b, function (x, y) { return shiftLeft(x, y); }); }
  function shr(a, b) { return bitSlow('__shr', a, b, function (x, y) { return shiftLeft(x, -y); }); }
  function bnot(a) {
    if (typeof a === 'number' && (a | 0) === a) return ~a;
    var mt = metaOf(a), h = mt && mt.get('__bnot');
    if (h !== undefined && h !== null && !isNum(a)) return first(call(h)(a, a));
    return fromInt64(~toInt64(a, a, a));
  }
  function bitSlow(ev, a, b, f) {
    if (!((isNum(a) || typeof a === 'string') && (isNum(b) || typeof b === 'string'))) {
      var r = metaBin(ev, a, b);
      if (r !== NOMETA) return r;
    }
    return fromInt64(f(toInt64(a, a, b), toInt64(b, a, b)));
  }

  function concat(a, b) {
    var ta = typeof a, tb = typeof b;
    if (ta === 'string' && tb === 'string') return a + b;
    if ((ta === 'string' || isNum(a)) && (tb === 'string' || isNum(b))) {
      return (ta === 'string' ? a : numStr(a)) + (tb === 'string' ? b : numStr(b));
    }
    var r = metaBin('__concat', a, b);
    if (r !== NOMETA) return r;
    throw arithError('concat', a, b);
  }

  function len(v) {
    if (typeof v === 'string') return v.length;
    if (v instanceof LuaTable) {
      if (v.mt !== null) {
        var h = v.mt.get('__len');
        if (h !== undefined) return first(call(h)(v));
      }
      return v.arr.length;
    }
    var mt = metaOf(v), h2 = mt && mt.get('__len');
    if (h2 !== undefined && h2 !== null) return first(call(h2)(v));
    throw rterror('attempt to get length of a ' + typeName(v) + ' value');
  }

  function eq(a, b) {
    if (a === b) return true;
    var ta = typeof a, tb = typeof b;
    if (ta === 'object' || tb === 'object') {
      if (isNum(a) && isNum(b)) return num(a) === num(b);
      if (a instanceof LuaTable && b instanceof LuaTable) {
        var h = (a.mt && a.mt.get('__eq')) || (b.mt && b.mt.get('__eq'));
        if (h) return truthy(first(call(h)(a, b)));
      }
    }
    return false;
  }
  function lt(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a < b;
    if (isNum(a) && isNum(b)) return num(a) < num(b);
    if (typeof a === 'string' && typeof b === 'string') return a < b;
    var r = metaBin('__lt', a, b);
    if (r !== NOMETA) return truthy(r);
    throw compareError(a, b);
  }
  function le(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a <= b;
    if (isNum(a) && isNum(b)) return num(a) <= num(b);
    if (typeof a === 'string' && typeof b === 'string') return a <= b;
    var r = metaBin('__le', a, b);
    if (r !== NOMETA) return truthy(r);
    throw compareError(a, b);
  }
  function gt(a, b) { return lt(b, a); }
  function ge(a, b) { return le(b, a); }
  function compareError(a, b) {
    var t1 = typeName(a), t2 = typeName(b);
    if (t1 === t2) return rterror('attempt to compare two ' + t1 + ' values');
    return rterror('attempt to compare ' + t1 + ' with ' + t2);
  }
  function truthy(v) { return v !== undefined && v !== false && v !== null; }

  // ------------------------------------------------------- indexing ----
  function index(o, k, desc) {
    if (o instanceof LuaTable) {
      var v = o.get(k);
      if (v !== undefined || o.mt === null) return v;
      return metaIndex(o, k, desc);
    }
    if (typeof o === 'string') return stringLib.get(k);
    return metaIndex(o, k, desc);
  }
  function metaIndex(o, k, desc) {
    for (var loop = 0; loop < 100; loop++) {
      var h;
      if (o instanceof LuaTable) {
        var v = o.get(k);
        if (v !== undefined) return v;
        if (o.mt === null) return undefined;
        h = o.mt.get('__index');
        if (h === undefined) return undefined;
      } else {
        var mt = metaOf(o);
        h = mt && mt.get('__index');
        if (h === undefined || h === null) {
          throw rterror('attempt to index a ' + typeName(o) + ' value' + (desc ? ' (' + desc + ')' : ''));
        }
      }
      if (typeof h === 'function') return first(h(o, k));
      o = h;
    }
    throw rterror("'__index' chain too long; possible loop");
  }
  function setindex(o, k, v, desc) {
    if (o instanceof LuaTable) {
      if (o.mt === null) { o.set(k, v); return; }
      var h = o.mt.get('__newindex');
      if (h === undefined || o.get(k) !== undefined) { o.set(k, v); return; }
      if (typeof h === 'function') { h(o, k, v); return; }
      return setindex(h, k, v);
    }
    throw rterror('attempt to index a ' + typeName(o) + ' value' + (desc ? ' (' + desc + ')' : ''));
  }

  function call(f, desc) {
    if (typeof f === 'function') return f;
    var mt = metaOf(f), h = mt && mt.get('__call');
    if (typeof h === 'function') return function () {
      var args = [f];
      for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
      return h.apply(null, args);
    };
    throw rterror('attempt to call a ' + typeName(f) + ' value' + (desc ? ' (' + desc + ')' : ''));
  }
  function method(o, name) {
    var f = index(o, name, 'method \'' + name + '\'');
    if (typeof f !== 'function') f = call(f, "method '" + name + "'");
    var args = [o];
    for (var i = 2; i < arguments.length; i++) args.push(arguments[i]);
    return f.apply(null, args);
  }

  function tbl(list, keyed) {
    var t = new LuaTable();
    if (list.length) {
      var a = list.slice();
      while (a.length && a[a.length - 1] === undefined) a.pop();
      t.arr = a;
    }
    if (keyed) {
      for (var i = 0; i < keyed.length; i += 2) {
        if (keyed[i] === undefined) throw rterror('table index is nil');
        if (keyed[i + 1] !== undefined) t.set(keyed[i], keyed[i + 1]);
      }
    }
    return t;
  }

  // ------------------------------------------------------- iteration ----
  function IpairsIter(t) { this.t = t; this.i = 0; this.a = undefined; this.b = undefined; }
  IpairsIter.prototype.step = function () {
    var i = this.i + 1, v = this.t.get(i);
    if (v === undefined) return false;
    this.i = i; this.a = i; this.b = v; return true;
  };
  function PairsIter(t) { this.t = t; this.i = 0; this.it = null; this.a = undefined; this.b = undefined; }
  PairsIter.prototype.step = function () {
    var arr = this.t.arr;
    while (this.it === null && this.i < arr.length) {
      var v = arr[this.i++];
      if (v !== undefined) { this.a = this.i; this.b = v; return true; }
    }
    if (this.it === null) {
      if (this.t.hash === null) return false;
      this.it = this.t.hash.entries();
    }
    var n = this.it.next();
    if (n.done) return false;
    this.a = n.value[0]; this.b = n.value[1];
    return true;
  };
  function GenIter(f, s, c) { this.f = call(f, 'for iterator'); this.s = s; this.c = c; this.a = undefined; this.b = undefined; this.v = NONE; }
  GenIter.prototype.step = function () {
    var r = this.f(this.s, this.c);
    var v = r instanceof Multi ? r.a : [r];
    if (v[0] === undefined) return false;
    this.c = v[0]; this.a = v[0]; this.b = v[1]; this.v = v;
    return true;
  };
  function iter(f, s, c) {
    if (f === ipairsAux && s instanceof LuaTable && s.mt === null) return new IpairsIter(s);
    if (f === luaNext && s instanceof LuaTable && c === undefined && s.mt === null) return new PairsIter(s);
    return new GenIter(f, s, c);
  }

  function forprep(a, b, c) {
    if (c === undefined) c = 1;
    if (!isNum(a)) throw rterror("'for' initial value must be a number");
    if (!isNum(b)) throw rterror("'for' limit must be a number");
    if (!isNum(c)) throw rterror("'for' step must be a number");
    var x = num(a), lim = num(b), st = num(c);
    if (st === 0) throw rterror("'for' step is zero");
    var intLoop = typeof a === 'number' && Number.isInteger(a) && typeof c === 'number' && Number.isInteger(c);
    if (intLoop) {
      if (!(typeof b === 'number' && Number.isInteger(b))) {
        if (lim !== lim) return [1, 0, 1, false];
        lim = st > 0 ? Math.floor(lim) : Math.ceil(lim);
      }
      return [x, lim, st, false];
    }
    return [x, lim, st, true];
  }

  // ------------------------------------------------------- tostring ----
  function tostring(v) {
    if (v === undefined || v === null) return 'nil';
    switch (typeof v) {
      case 'string': return v;
      case 'number': return numStr(v);
      case 'boolean': return v ? 'true' : 'false';
      case 'function': return 'function: ' + addressOf(v);
    }
    if (v instanceof LFloat) return floatStr(v.n);
    if (v instanceof LuaTable) {
      if (v.mt !== null) {
        var h = v.mt.get('__tostring');
        if (h !== undefined) {
          var s = first(call(h)(v));
          if (typeof s !== 'string') throw rterror("'__tostring' must return a string");
          return s;
        }
        var nm = v.mt.get('__name');
        if (typeof nm === 'string') return nm + ': ' + addressOf(v);
      }
      return 'table: ' + addressOf(v);
    }
    return 'userdata: ' + addressOf(v);
  }
  var addresses = new WeakMap(), nextAddress = 0x55d0c0de0000;
  function addressOf(o) {
    var a = addresses.get(o);
    if (a === undefined) { a = nextAddress; nextAddress += 0x40; addresses.set(o, a); }
    return '0x' + a.toString(16).padStart(14, '0');
  }

  // ===================================================== the library ======
  function argError(n, fname, msg) { return rterror("bad argument #" + n + " to '" + fname + "' (" + msg + ')'); }
  function checkTable(v, n, fname) {
    if (!(v instanceof LuaTable)) throw argError(n, fname, 'table expected, got ' + typeNameArg(v));
    return v;
  }
  function typeNameArg(v) { return v === undefined ? 'no value' : typeName(v); }
  function checkInt(v, n, fname) {
    if (typeof v === 'number' && Number.isInteger(v)) return v;
    if (v instanceof LFloat) return v.n;
    if (typeof v === 'string') { var x = str2num(v); if (x !== undefined) return checkInt(x, n, fname); }
    if (typeof v === 'number') throw argError(n, fname, 'number has no integer representation');
    throw argError(n, fname, 'number expected, got ' + typeNameArg(v));
  }
  function optInt(v, n, fname, d) { return v === undefined ? d : checkInt(v, n, fname); }
  function checkNum(v, n, fname) {
    if (typeof v === 'number') return v;
    if (v instanceof LFloat) return v.n;
    if (typeof v === 'string') { var x = str2num(v); if (x !== undefined) return num(x); }
    throw argError(n, fname, 'number expected, got ' + typeNameArg(v));
  }
  function checkStr(v, n, fname) {
    if (typeof v === 'string') return v;
    if (isNum(v)) return numStr(v);
    throw argError(n, fname, 'string expected, got ' + typeNameArg(v));
  }

  function rawLen(t) { return t instanceof LuaTable ? t.arr.length : (typeof t === 'string' ? t.length : 0); }

  // ---------------------------------------------------------- base ------
  function luaNext(t, k) {
    checkTable(t, 1, 'next');
    var arr = t.arr, i = 0;
    if (k !== undefined) {
      if (typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= arr.length) i = k;
      else if (k instanceof LFloat && k.n >= 1 && k.n <= arr.length) i = k.n;
      else i = -1;
    }
    if (i >= 0) {
      for (; i < arr.length; i++) if (arr[i] !== undefined) return new Multi([i + 1, arr[i]]);
      if (t.hash === null) return undefined;
      var it = t.hash.entries().next();
      return it.done ? undefined : new Multi([it.value[0], it.value[1]]);
    }
    if (t.hash === null) throw rterror("invalid key to 'next'");
    if (t._nkver !== t.hver || !t._nk) {
      t._nk = Array.from(t.hash.keys());
      t._nki = new Map();
      for (var j = 0; j < t._nk.length; j++) t._nki.set(t._nk[j], j);
      t._nkver = t.hver;
    }
    var key = k instanceof LFloat ? k.n : k;
    var pos = t._nki.get(key);
    if (pos === undefined) throw rterror("invalid key to 'next'");
    for (pos++; pos < t._nk.length; pos++) {
      var kk = t._nk[pos];
      if (t.hash.has(kk)) return new Multi([kk, t.hash.get(kk)]);
    }
    return undefined;
  }
  function ipairsAux(t, i) {
    i = i + 1;
    var v = index(t, i);
    return v === undefined ? undefined : new Multi([i, v]);
  }

  function makeEnv(host) {
    host = host || {};
    var G = new LuaTable();
    function reg(t, name, f) { t.set(name, f); }

    reg(G, 'print', function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) parts.push(tostring(arguments[i]));
      (host.print || function (s) { console.log(s); })(parts.join('\t'));
      return NONE;
    });
    reg(G, 'type', function (v) {
      if (arguments.length === 0) throw argError(1, 'type', 'value expected');
      return typeName(v);
    });
    reg(G, 'tostring', function (v) { return tostring(v); });
    reg(G, 'tonumber', function (v, base) {
      if (base === undefined) {
        if (isNum(v)) return v;
        if (typeof v === 'string') return str2num(v);
        if (arguments.length === 0) throw argError(1, 'tonumber', 'value expected');
        return undefined;
      }
      var b = checkInt(base, 2, 'tonumber');
      var s = checkStr(v, 1, 'tonumber').replace(/^\s+|\s+$/g, '').toLowerCase();
      var neg = false;
      if (s[0] === '-') { neg = true; s = s.slice(1); }
      if (!s.length) return undefined;
      var n = 0;
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        var d = c >= 48 && c <= 57 ? c - 48 : (c >= 97 && c <= 122 ? c - 87 : 99);
        if (d >= b) return undefined;
        n = n * b + d;
      }
      return neg ? -n : n;
    });
    reg(G, 'ipairs', function (t) {
      if (arguments.length === 0) throw argError(1, 'ipairs', 'table expected, got no value');
      return new Multi([ipairsAux, t, 0]);
    });
    reg(G, 'pairs', function (t) {
      if (t instanceof LuaTable && t.mt !== null) {
        var h = t.mt.get('__pairs');
        if (h !== undefined) { var r = sp(call(h)(t)); return new Multi([r[0], r[1], r[2]]); }
      }
      checkTable(t, 1, 'pairs');
      return new Multi([luaNext, t, undefined]);
    });
    reg(G, 'next', luaNext);
    reg(G, 'select', function (n) {
      var count = arguments.length - 1;
      if (n === '#') return count;
      var i = checkInt(n, 1, 'select');
      if (i < 0) i = count + i; else if (i === 0) throw argError(1, 'select', 'index out of range');
      else i = i - 1;
      if (i < 0) throw argError(1, 'select', 'index out of range');
      var out = [];
      for (var j = i + 1; j < arguments.length; j++) out.push(arguments[j]);
      return ret(out);
    });
    reg(G, 'rawget', function (t, k) { checkTable(t, 1, 'rawget'); return t.get(k); });
    reg(G, 'rawset', function (t, k, v) { checkTable(t, 1, 'rawset'); t.set(k, v); return t; });
    reg(G, 'rawequal', function (a, b) { return a === b || (isNum(a) && isNum(b) && num(a) === num(b)); });
    reg(G, 'rawlen', function (t) { return rawLen(t); });
    reg(G, 'setmetatable', function (t, mt) {
      checkTable(t, 1, 'setmetatable');
      if (t.mt && t.mt.get('__metatable') !== undefined) throw rterror('cannot change a protected metatable');
      t.mt = mt === undefined ? null : mt;
      return t;
    });
    reg(G, 'getmetatable', function (v) {
      var mt = metaOf(v);
      if (!mt) return undefined;
      var p = mt.get('__metatable');
      return p !== undefined ? p : mt;
    });
    reg(G, 'assert', function (v, msg) {
      if (truthy(v)) { return ret(Array.prototype.slice.call(arguments)); }
      if (arguments.length < 1) throw argError(1, 'assert', 'value expected');
      throw new LuaError(arguments.length >= 2 ? msg : 'assertion failed!');
    });
    reg(G, 'error', function (v, level) {
      var lv = level === undefined ? 1 : num(level);
      if (typeof v === 'string' && lv > 0) v = luaPosition(lv + 1) + v;
      throw new LuaError(v);
    });
    reg(G, 'pcall', function (f) {
      var args = Array.prototype.slice.call(arguments, 1);
      try {
        var r = call(f).apply(null, args);
        return new Multi([true].concat(sp(r)));
      } catch (e) {
        return new Multi([false, errorValue(e)]);
      }
    });
    reg(G, 'xpcall', function (f, handler) {
      var args = Array.prototype.slice.call(arguments, 2);
      try {
        var r = call(f).apply(null, args);
        return new Multi([true].concat(sp(r)));
      } catch (e) {
        return new Multi([false].concat(sp(call(handler)(errorValue(e)))));
      }
    });
    reg(G, 'collectgarbage', function (opt) { return opt === 'count' ? mkf(1024) : 0; });
    reg(G, 'load', function (chunk, name, mode, env) {
      var src = chunk;
      if (typeof chunk === 'function') {
        var pieces = [], piece;
        while ((piece = first(chunk())) !== undefined && piece !== '') pieces.push(piece);
        src = pieces.join('');
      }
      try {
        return NS.load(src, typeof name === 'string' ? name.replace(/^[=@]/, '') : 'chunk', env || G);
      } catch (e) {
        return new Multi([undefined, errorValue(e)]);
      }
    });
    reg(G, 'loadfile', function (path, mode, env) {
      var src = host.readFile ? host.readFile(path) : null;
      if (src === null || src === undefined) return new Multi([undefined, 'cannot open ' + path]);
      try { return NS.load(src, path, env || G); }
      catch (e) { return new Multi([undefined, errorValue(e)]); }
    });
    reg(G, 'dofile', function (path) {
      var src = host.readFile ? host.readFile(path) : null;
      if (src === null || src === undefined) throw rterror('cannot open ' + path);
      return NS.load(src, path, G)();
    });
    reg(G, 'require', function (name) {
      var loaded = G.get('package').get('loaded');
      var v = loaded.get(name);
      if (v !== undefined) return v;
      if (!host.require) throw rterror("module '" + name + "' not found");
      v = host.require(name);
      loaded.set(name, v === undefined ? true : v);
      return v === undefined ? true : v;
    });
    var pkg = new LuaTable(); pkg.set('loaded', new LuaTable()); pkg.set('path', './?.lua');
    G.set('package', pkg);
    G.set('_G', G);
    G.set('_VERSION', 'Lua 5.4');

    G.set('string', stringLib);
    G.set('table', makeTableLib());
    G.set('math', makeMathLib());
    G.set('os', makeOsLib(host));
    G.set('io', makeIoLib(host));
    G.set('utf8', makeUtf8Lib());
    pkg.get('loaded').set('string', stringLib);
    pkg.get('loaded').set('_G', G);
    return G;
  }
  function errorValue(e) {
    if (e instanceof LuaError) return e.value;
    if (e instanceof RangeError) return 'stack overflow';
    if (e && e.name === 'LuaSyntaxError') return e.message;
    return String(e && e.message ? e.message : e);
  }

  // --------------------------------------------------------- table ------
  function makeTableLib() {
    var T = new LuaTable();
    T.set('insert', function (t, a, b) {
      checkTable(t, 1, 'insert');
      var e = len(t) + 1;
      if (arguments.length === 2) { setindex(t, e, a); return NONE; }
      if (arguments.length !== 3) throw rterror("wrong number of arguments to 'insert'");
      var pos = checkInt(a, 2, 'insert');
      if (pos < 1 || pos > e) throw argError(2, 'insert', 'position out of bounds');
      if (t.mt === null && e - 1 === t.arr.length) {
        t.arr.splice(pos - 1, 0, b);
        if (b === undefined) { while (t.arr.length && t.arr[t.arr.length - 1] === undefined) t.arr.pop(); }
        return NONE;
      }
      for (var i = e; i > pos; i--) setindex(t, i, index(t, i - 1));
      setindex(t, pos, b);
      return NONE;
    });
    T.set('remove', function (t, p) {
      checkTable(t, 1, 'remove');
      var size = len(t);
      var pos = p === undefined ? size : checkInt(p, 2, 'remove');
      if (p !== undefined && pos !== size && (pos < 1 || pos > size + 1)) throw argError(2, 'remove', 'position out of bounds');
      var result = index(t, pos);
      if (t.mt === null && size === t.arr.length && pos >= 1 && pos <= size) {
        t.arr.splice(pos - 1, 1);
        while (t.arr.length && t.arr[t.arr.length - 1] === undefined) t.arr.pop();
        return result;
      }
      for (; pos < size; pos++) setindex(t, pos, index(t, pos + 1));
      setindex(t, pos, undefined);
      return result;
    });
    T.set('concat', function (t, sep, i, j) {
      checkTable(t, 1, 'concat');
      sep = sep === undefined ? '' : checkStr(sep, 2, 'concat');
      var a = optInt(i, 3, 'concat', 1), b = j === undefined ? len(t) : checkInt(j, 4, 'concat');
      var parts = [];
      for (var k = a; k <= b; k++) {
        var v = index(t, k);
        if (typeof v === 'string') parts.push(v);
        else if (isNum(v)) parts.push(numStr(v));
        else throw rterror("invalid value (at index " + k + ") in table for 'concat'");
      }
      return parts.join(sep);
    });
    T.set('unpack', function (t, i, j) {
      var a = optInt(i, 2, 'unpack', 1), b = j === undefined ? len(t) : checkInt(j, 3, 'unpack');
      var out = [];
      for (var k = a; k <= b; k++) out.push(index(t, k));
      return ret(out);
    });
    T.set('pack', function () {
      var t = tbl(Array.prototype.slice.call(arguments));
      t.set('n', arguments.length);
      return t;
    });
    T.set('move', function (a1, f, e, t, a2) {
      if (a2 === undefined) a2 = a1;
      f = checkInt(f, 2, 'move'); e = checkInt(e, 3, 'move'); t = checkInt(t, 4, 'move');
      if (e >= f) {
        if (t > e || t <= f || a1 !== a2) for (var i = 0; i <= e - f; i++) setindex(a2, t + i, index(a1, f + i));
        else for (var k = e - f; k >= 0; k--) setindex(a2, t + k, index(a1, f + k));
      }
      return a2;
    });
    T.set('sort', function (t, comp) {
      checkTable(t, 1, 'sort');
      var n = len(t);
      if (n > 1) {
        var a = new Array(n + 1);
        for (var i = 1; i <= n; i++) a[i] = index(t, i);
        var less;
        if (comp !== undefined) {
          var cf = call(comp);
          less = function (x, y) { return truthy(first(cf(x, y))); };
        } else less = lt;
        auxsort(a, 1, n, 0, less);
        for (var j = 1; j <= n; j++) setindex(t, j, a[j]);
      }
      return NONE;
    });
    return T;
  }

  // Lua 5.4's ltablib.c sort, line for line: ties come out in the same
  // order as in the real Lua, which matters to engines that sort with them.
  var RANLIMIT = 100;
  function auxsort(a, lo, up, rnd, less) {
    var t;
    while (lo < up) {
      if (less(a[up], a[lo])) { t = a[lo]; a[lo] = a[up]; a[up] = t; }
      if (up - lo === 1) break;
      var p;
      if (up - lo < RANLIMIT || rnd === 0) p = Math.floor((lo + up) / 2);
      else { var r4 = Math.floor((up - lo) / 4); p = rnd % (r4 * 2) + (lo + r4); }
      if (less(a[p], a[lo])) { t = a[p]; a[p] = a[lo]; a[lo] = t; }
      else if (less(a[up], a[p])) { t = a[p]; a[p] = a[up]; a[up] = t; }
      if (up - lo === 2) break;
      var P = a[p];
      t = a[p]; a[p] = a[up - 1]; a[up - 1] = t;
      // partition
      var i = lo, j = up - 1;
      for (;;) {
        while (less(a[++i], P)) {
          if (i === up - 1) throw rterror('invalid order function for sorting');
        }
        while (less(P, a[--j])) {
          if (j < i) throw rterror('invalid order function for sorting');
        }
        if (j < i) { t = a[up - 1]; a[up - 1] = a[i]; a[i] = t; break; }
        t = a[i]; a[i] = a[j]; a[j] = t;
      }
      p = i;
      var n;
      if (p - lo < up - p) { auxsort(a, lo, p - 1, rnd, less); n = p - lo; lo = p + 1; }
      else { auxsort(a, p + 1, up, rnd, less); n = up - p; up = p - 1; }
      if ((up - lo) / 128 > n) rnd = 0x5bd1e995;   // real Lua randomises here
    }
  }

  // ---------------------------------------------------------- math ------
  function makeMathLib() {
    var M = new LuaTable();
    M.set('pi', Math.PI);
    M.set('huge', Infinity);
    M.set('maxinteger', 9223372036854775807);
    M.set('mininteger', -9223372036854775808);
    M.set('abs', function (x) {
      if (typeof x === 'number') return Number.isInteger(x) ? (x < 0 ? 0 - x : x) : Math.abs(x);
      if (x instanceof LFloat) return new LFloat(Math.abs(x.n));
      return mkfOrInt(Math.abs(checkNum(x, 1, 'abs')), x);
    });
    M.set('floor', function (x) {
      if (typeof x === 'number' && Number.isInteger(x)) return x;
      var r = Math.floor(checkNum(x, 1, 'floor'));
      return r === 0 ? 0 : r;
    });
    M.set('ceil', function (x) {
      if (typeof x === 'number' && Number.isInteger(x)) return x;
      var r = Math.ceil(checkNum(x, 1, 'ceil'));
      return r === 0 ? 0 : r;
    });
    function minmax(isMax, name) {
      return function () {
        if (arguments.length === 0) throw argError(1, name, 'number expected, got no value');
        var best = arguments[0]; checkNum(best, 1, name);
        for (var i = 1; i < arguments.length; i++) {
          var v = arguments[i]; checkNum(v, i + 1, name);
          if (isMax ? lt(best, v) : lt(v, best)) best = v;
        }
        return best;
      };
    }
    M.set('max', minmax(true, 'max'));
    M.set('min', minmax(false, 'min'));
    function fl(f, name) { return function (x) { return mkf(f(checkNum(x, 1, name))); }; }
    M.set('sqrt', fl(Math.sqrt, 'sqrt'));
    M.set('sin', fl(Math.sin, 'sin'));
    M.set('cos', fl(Math.cos, 'cos'));
    M.set('tan', fl(Math.tan, 'tan'));
    M.set('asin', fl(Math.asin, 'asin'));
    M.set('acos', fl(Math.acos, 'acos'));
    M.set('exp', fl(Math.exp, 'exp'));
    M.set('atan', function (y, x) { return mkf(Math.atan2(checkNum(y, 1, 'atan'), x === undefined ? 1 : checkNum(x, 2, 'atan'))); });
    M.set('log', function (x, base) {
      var v = checkNum(x, 1, 'log');
      if (base === undefined) return mkf(Math.log(v));
      var b = checkNum(base, 2, 'log');
      if (b === 2) return mkf(Math.log2(v));
      if (b === 10) return mkf(Math.log10(v));
      return mkf(Math.log(v) / Math.log(b));
    });
    M.set('fmod', function (a, b) {
      if (typeof a === 'number' && typeof b === 'number' && Number.isInteger(a) && Number.isInteger(b)) {
        if (b === 0) throw argError(2, 'fmod', 'zero');
        return a % b === 0 ? 0 : a % b;
      }
      return mkf(checkNum(a, 1, 'fmod') % checkNum(b, 2, 'fmod'));
    });
    M.set('modf', function (x) {
      var v = checkNum(x, 1, 'modf');
      var ip = v >= 0 ? Math.floor(v) : Math.ceil(v);
      var fp = (v === Infinity || v === -Infinity) ? 0 : v - ip;
      return new Multi([mkf(ip), mkf(fp)]);
    });
    M.set('tointeger', function (x) {
      if (typeof x === 'number' && Number.isInteger(x)) return x;
      if (x instanceof LFloat) return x.n;
      if (typeof x === 'string') { var n = str2num(x); return n === undefined ? undefined : (typeof n === 'number' && Number.isInteger(n) ? n : (n instanceof LFloat ? n.n : undefined)); }
      return undefined;
    });
    M.set('type', function (x) {
      if (arguments.length === 0) throw argError(1, 'type', 'value expected');
      if (typeof x === 'number') return Number.isInteger(x) ? 'integer' : 'float';
      if (x instanceof LFloat) return 'float';
      return undefined;
    });
    M.set('ult', function (a, b) {
      return BigInt.asUintN(64, BigInt(checkInt(a, 1, 'ult'))) < BigInt.asUintN(64, BigInt(checkInt(b, 2, 'ult')));
    });

    // xoshiro256**, as lmathlib.c has it, on 64-bit BigInts.
    var MASK = (1n << 64n) - 1n;
    var state = [0n, 0n, 0n, 0n];
    function rotl(x, n) { return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK; }
    function nextrand() {
      var s0 = state[0], s1 = state[1], s2 = state[2] ^ s0, s3 = state[3] ^ s1;
      var res = (rotl((s1 * 5n) & MASK, 7) * 9n) & MASK;
      state[0] = s0 ^ s3;
      state[1] = s1 ^ s2;
      state[2] = s2 ^ ((s1 << 17n) & MASK);
      state[3] = rotl(s3, 45);
      return res;
    }
    function setseed(n1, n2) {
      state = [BigInt.asUintN(64, n1), 0xffn, BigInt.asUintN(64, n2), 0n];
      for (var i = 0; i < 16; i++) nextrand();
    }
    setseed(BigInt(Date.now()), 0n);
    function project(ran, n) {
      if ((n & (n + 1n)) === 0n) return ran & n;
      var lim = n;
      lim |= lim >> 1n; lim |= lim >> 2n; lim |= lim >> 4n; lim |= lim >> 8n;
      lim |= lim >> 16n; lim |= lim >> 32n;
      while ((ran &= lim) > n) ran = nextrand();
      return ran;
    }
    M.set('random', function (m, n) {
      var rv = nextrand();
      var low, up;
      switch (arguments.length) {
        case 0: return mkf(Number(rv >> 11n) * Math.pow(2, -53));
        case 1:
          low = 1n; up = BigInt(checkInt(m, 1, 'random'));
          if (up === 0n) return fromInt64(rv);
          break;
        case 2:
          low = BigInt(checkInt(m, 1, 'random')); up = BigInt(checkInt(n, 2, 'random'));
          break;
        default: throw rterror('wrong number of arguments');
      }
      if (!(low <= up)) throw argError(1, 'random', 'interval is empty');
      var p = project(rv, BigInt.asUintN(64, up - low));
      return fromInt64(p + BigInt.asUintN(64, low));
    });
    M.set('randomseed', function (a, b) {
      if (arguments.length === 0) { setseed(BigInt(Date.now()), 0n); return; }
      var n1 = isFloatVal(a) ? BigInt(Math.trunc(num(a))) : BigInt(checkInt(a, 1, 'randomseed'));
      var n2 = b === undefined ? 0n : BigInt(checkInt(b, 2, 'randomseed'));
      setseed(n1, n2);
      return new Multi([fromInt64(n1), fromInt64(n2)]);
    });
    return M;
  }
  function mkfOrInt(r, orig) { return isFloatVal(orig) ? mkf(r) : r; }

  // ------------------------------------------------------------ os ------
  function makeOsLib(host) {
    var O = new LuaTable();
    var now = host.now || function () { return Date.now(); };
    O.set('time', function (t) {
      if (t === undefined) return Math.floor(now() / 1000);
      checkTable(t, 1, 'time');
      function field(k, d) {
        var v = t.get(k);
        if (v === undefined) { if (d === undefined) throw rterror("field '" + k + "' missing in date table"); return d; }
        return num(v);
      }
      var d = new Date(field('year'), field('month') - 1, field('day'), field('hour', 12), field('min', 0), field('sec', 0));
      return Math.floor(d.getTime() / 1000);
    });
    O.set('clock', function () {
      var p = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      return mkf(p / 1000);
    });
    O.set('date', function (fmt, t) {
      fmt = fmt === undefined ? '%c' : checkStr(fmt, 1, 'date');
      var ms = t === undefined ? now() : num(t) * 1000;
      var utc = fmt[0] === '!';
      if (utc) fmt = fmt.slice(1);
      var d = new Date(ms);
      var g = utc
        ? { Y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), H: d.getUTCHours(), M: d.getUTCMinutes(), S: d.getUTCSeconds(), w: d.getUTCDay() }
        : { Y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), H: d.getHours(), M: d.getMinutes(), S: d.getSeconds(), w: d.getDay() };
      var start = utc ? Date.UTC(g.Y, 0, 1) : new Date(g.Y, 0, 1).getTime();
      var cur = utc ? Date.UTC(g.Y, g.m, g.d) : new Date(g.Y, g.m, g.d).getTime();
      var yday = Math.round((cur - start) / 86400000) + 1;
      if (fmt.slice(0, 2) === '*t') {
        var r = new LuaTable();
        r.set('year', g.Y); r.set('month', g.m + 1); r.set('day', g.d);
        r.set('hour', g.H); r.set('min', g.M); r.set('sec', g.S);
        r.set('wday', g.w + 1); r.set('yday', yday); r.set('isdst', false);
        return r;
      }
      var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      function p2(n) { return (n < 10 ? '0' : '') + n; }
      return fmt.replace(/%(.)/g, function (_, c) {
        switch (c) {
          case 'Y': return String(g.Y);
          case 'y': return p2(g.Y % 100);
          case 'm': return p2(g.m + 1);
          case 'd': return p2(g.d);
          case 'e': return (g.d < 10 ? ' ' : '') + g.d;
          case 'H': return p2(g.H);
          case 'I': return p2(((g.H + 11) % 12) + 1);
          case 'M': return p2(g.M);
          case 'S': return p2(g.S);
          case 'p': return g.H < 12 ? 'AM' : 'PM';
          case 'A': return DAYS[g.w];
          case 'a': return DAYS[g.w].slice(0, 3);
          case 'B': return MONTHS[g.m];
          case 'b': return MONTHS[g.m].slice(0, 3);
          case 'j': return String(yday).padStart(3, '0');
          case 'w': return String(g.w);
          case 'u': return String(g.w === 0 ? 7 : g.w);
          case 'x': return p2(g.m + 1) + '/' + p2(g.d) + '/' + p2(g.Y % 100);
          case 'X': return p2(g.H) + ':' + p2(g.M) + ':' + p2(g.S);
          case 'c': return DAYS[g.w].slice(0, 3) + ' ' + MONTHS[g.m].slice(0, 3) + ' ' + (g.d < 10 ? ' ' : '') + g.d + ' ' + p2(g.H) + ':' + p2(g.M) + ':' + p2(g.S) + ' ' + g.Y;
          case '%': return '%';
          default: return '%' + c;
        }
      });
    });
    O.set('getenv', function () { return undefined; });
    O.set('remove', function (path) {
      if (host.removeFile && host.removeFile(path)) return true;
      return new Multi([undefined, path + ': No such file or directory', 2]);
    });
    O.set('rename', function (a, b) {
      if (host.renameFile && host.renameFile(a, b)) return true;
      return new Multi([undefined, a + ': No such file or directory', 2]);
    });
    O.set('exit', function () { throw new LuaError('os.exit called'); });
    O.set('tmpname', function () { return '/tmp/lua_' + Math.random().toString(36).slice(2); });
    return O;
  }

  // ------------------------------------------------------------ io ------
  // Files live wherever the host keeps them (host.readFile / host.writeFile):
  // Battle Pass keeps its save file this way.
  function makeIoLib(host) {
    var IO = new LuaTable();
    var fileMeta = new LuaTable();
    var fileMethods = new LuaTable();
    fileMeta.set('__index', fileMethods);
    fileMeta.set('__name', 'FILE*');
    function newFile(path, mode, data) {
      var f = new LuaTable();
      f.mt = fileMeta;
      f._path = path; f._mode = mode; f._data = data; f._pos = 0; f._closed = false;
      return f;
    }
    IO.set('open', function (path, mode) {
      path = checkStr(path, 1, 'open');
      mode = mode === undefined ? 'r' : checkStr(mode, 2, 'open');
      var m = mode.replace('b', '');
      if (m[0] === 'r') {
        var data = host.readFile ? host.readFile(path) : null;
        if (data === null || data === undefined) return new Multi([undefined, path + ': No such file or directory', 2]);
        return newFile(path, m, data);
      }
      if (m[0] === 'w') return newFile(path, m, '');
      if (m[0] === 'a') {
        var old = host.readFile ? host.readFile(path) : null;
        var f = newFile(path, m, old || '');
        f._pos = f._data.length;
        return f;
      }
      throw argError(2, 'open', 'invalid mode');
    });
    fileMethods.set('read', function (f) {
      var fmts = Array.prototype.slice.call(arguments, 1);
      if (!fmts.length) fmts = ['l'];
      var out = [];
      for (var i = 0; i < fmts.length; i++) {
        var fm = fmts[i];
        if (isNum(fm)) {
          var n = num(fm);
          if (f._pos >= f._data.length && n > 0) { out.push(undefined); break; }
          out.push(f._data.substr(f._pos, n)); f._pos += n; continue;
        }
        fm = String(fm).replace(/^\*/, '');
        if (fm[0] === 'a') { out.push(f._data.slice(f._pos)); f._pos = f._data.length; continue; }
        if (fm[0] === 'l' || fm[0] === 'L') {
          if (f._pos >= f._data.length) { out.push(undefined); break; }
          var e = f._data.indexOf('\n', f._pos);
          var line = e < 0 ? f._data.slice(f._pos) : f._data.slice(f._pos, fm[0] === 'L' ? e + 1 : e);
          f._pos = e < 0 ? f._data.length : e + 1;
          out.push(line); continue;
        }
        if (fm[0] === 'n') {
          var m = /^\s*[-+]?(0[xX][0-9a-fA-F.]+|\d*\.?\d+(?:[eE][-+]?\d+)?)/.exec(f._data.slice(f._pos));
          if (!m) { out.push(undefined); break; }
          f._pos += m[0].length; out.push(str2num(m[0])); continue;
        }
      }
      return ret(out);
    });
    fileMethods.set('write', function (f) {
      for (var i = 1; i < arguments.length; i++) {
        var v = arguments[i];
        var s = typeof v === 'string' ? v : writeNum(v);
        f._data = f._data.slice(0, f._pos) + s + f._data.slice(f._pos + s.length);
        f._pos += s.length;
      }
      return f;
    });
    fileMethods.set('lines', function (f) {
      return function () { return first(fileMethods.get('read')(f, 'l')); };
    });
    fileMethods.set('seek', function (f, whence, off) {
      whence = whence || 'cur'; off = off === undefined ? 0 : num(off);
      if (whence === 'set') f._pos = off;
      else if (whence === 'end') f._pos = f._data.length + off;
      else f._pos += off;
      return f._pos;
    });
    fileMethods.set('flush', function (f) {
      if (f._mode[0] !== 'r' && host.writeFile) host.writeFile(f._path, f._data);
      return f;
    });
    fileMethods.set('close', function (f) {
      if (!f._closed && f._mode[0] !== 'r' && host.writeFile) host.writeFile(f._path, f._data);
      f._closed = true;
      return true;
    });
    fileMethods.set('setvbuf', function () { return true; });
    IO.set('write', function () {
      var s = '';
      for (var i = 0; i < arguments.length; i++) s += typeof arguments[i] === 'string' ? arguments[i] : writeNum(arguments[i]);
      (host.write || host.print || function (x) { if (typeof process !== 'undefined') process.stdout.write(x); })(s);
      return NONE;
    });
    IO.set('lines', function (path) {
      var data = host.readFile ? host.readFile(path) : null;
      if (data === null || data === undefined) throw rterror(path + ': No such file or directory');
      var f = newFile(path, 'r', data);
      return function () { return first(fileMethods.get('read')(f, 'l')); };
    });
    return IO;
  }

  // ---------------------------------------------------------- utf8 ------
  function makeUtf8Lib() {
    var U = new LuaTable();
    U.set('char', function () {
      var s = '';
      for (var i = 0; i < arguments.length; i++) s += NS.utf8Bytes(checkInt(arguments[i], i + 1, 'char'));
      return s;
    });
    U.set('charpattern', '[\x00-\x7F\xC2-\xFD][\x80-\xBF]*');
    function decodeAt(s, i) {   // i 0-based; returns [codepoint, length] or null
      var c = s.charCodeAt(i);
      if (c < 0x80) return [c, 1];
      var n = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC0 ? 2 : 0;
      if (!n) return null;
      var cp = c & (0x7F >> n);
      for (var k = 1; k < n; k++) {
        var cc = s.charCodeAt(i + k);
        if ((cc & 0xC0) !== 0x80) return null;
        cp = (cp << 6) | (cc & 0x3F);
      }
      return [cp, n];
    }
    U.set('len', function (s, i, j) {
      s = checkStr(s, 1, 'len');
      var a = (i === undefined ? 1 : num(i)) - 1, b = j === undefined ? s.length : num(j);
      var n = 0;
      while (a < b) {
        var d = decodeAt(s, a);
        if (!d) return new Multi([undefined, a + 1]);
        a += d[1]; n++;
      }
      return n;
    });
    U.set('codepoint', function (s, i, j) {
      s = checkStr(s, 1, 'codepoint');
      var a = (i === undefined ? 1 : num(i)), b = j === undefined ? a : num(j);
      var out = [], p = a - 1;
      while (p < b) {
        var d = decodeAt(s, p);
        if (!d) throw rterror('invalid UTF-8 code');
        out.push(d[0]); p += d[1];
      }
      return ret(out);
    });
    U.set('offset', function (s, n, i) {
      s = checkStr(s, 1, 'offset');
      n = num(n);
      var p = i === undefined ? (n >= 0 ? 1 : s.length + 1) : num(i);
      p -= 1;
      function cont(k) { return (s.charCodeAt(k) & 0xC0) === 0x80; }
      if (n === 0) { while (p > 0 && cont(p)) p--; return p + 1; }
      if (n > 0) { n--; while (n > 0 && p < s.length) { p++; while (cont(p)) p++; n--; } return n === 0 ? p + 1 : undefined; }
      while (n < 0 && p > 0) { p--; while (p > 0 && cont(p)) p--; n++; }
      return n === 0 ? p + 1 : undefined;
    });
    U.set('codes', function (s) {
      s = checkStr(s, 1, 'codes');
      return new Multi([function (str, i) {
        var p = num(i);
        if (p > 0) { var d0 = decodeAt(str, p - 1); p += d0 ? d0[1] - 1 : 0; }
        if (p >= str.length) return undefined;
        var d = decodeAt(str, p);
        if (!d) throw rterror('invalid UTF-8 code');
        return new Multi([p + 1, d[0]]);
      }, s, 0]);
    });
    return U;
  }

  // ======================================================== strings =======
  var stringLib = new LuaTable();
  var stringMeta = new LuaTable();
  stringMeta.set('__index', stringLib);

  function posrelatI(pos, l) {
    if (pos > 0) return pos;
    if (pos === 0) return 1;
    if (pos < -l) return 1;
    return l + pos + 1;
  }
  function getendpos(pos, l) {
    if (pos > l) return l;
    if (pos >= 0) return pos;
    if (pos < -l) return 0;
    return l + pos + 1;
  }
  stringLib.set('len', function (s) { return checkStr(s, 1, 'len').length; });
  stringLib.set('sub', function (s, i, j) {
    s = checkStr(s, 1, 'sub');
    var l = s.length;
    var st = posrelatI(checkInt(i === undefined ? 1 : i, 2, 'sub'), l);
    var en = getendpos(j === undefined ? -1 : checkInt(j, 3, 'sub'), l);
    if (st < 1) st = 1;
    if (en > l) en = l;
    return st <= en ? s.slice(st - 1, en) : '';
  });
  stringLib.set('upper', function (s) {
    s = checkStr(s, 1, 'upper');
    return s.replace(/[a-z]+/g, function (m) { return m.toUpperCase(); });
  });
  stringLib.set('lower', function (s) {
    s = checkStr(s, 1, 'lower');
    return s.replace(/[A-Z]+/g, function (m) { return m.toLowerCase(); });
  });
  stringLib.set('rep', function (s, n, sep) {
    s = checkStr(s, 1, 'rep'); n = checkInt(n, 2, 'rep');
    if (n <= 0) return '';
    if (sep === undefined || sep === '') return s.repeat(n);
    sep = checkStr(sep, 3, 'rep');
    return Array(n).fill(s).join(sep);
  });
  stringLib.set('reverse', function (s) { return checkStr(s, 1, 'reverse').split('').reverse().join(''); });
  stringLib.set('byte', function (s, i, j) {
    s = checkStr(s, 1, 'byte');
    var l = s.length;
    var pi = posrelatI(optInt(i, 2, 'byte', 1), l);
    var pe = getendpos(j === undefined ? pi : checkInt(j, 3, 'byte'), l);
    if (pi > pe) return undefined;
    var out = [];
    for (var k = pi; k <= pe; k++) out.push(s.charCodeAt(k - 1));
    return ret(out);
  });
  stringLib.set('char', function () {
    var out = '';
    for (var i = 0; i < arguments.length; i++) {
      var c = checkInt(arguments[i], i + 1, 'char');
      if (c < 0 || c > 255) throw argError(i + 1, 'char', 'value out of range');
      out += String.fromCharCode(c);
    }
    return out;
  });

  // string.format, with C's own rounding.
  stringLib.set('format', function (fmt) {
    fmt = checkStr(fmt, 1, 'format');
    var args = arguments, argi = 1;
    var out = '', i = 0, n = fmt.length;
    while (i < n) {
      var c = fmt[i++];
      if (c !== '%') { out += c; continue; }
      if (fmt[i] === '%') { out += '%'; i++; continue; }
      var m = /^([-+ #0]*)(\d*)(?:\.(\d*))?([a-zA-Z])/.exec(fmt.slice(i));
      if (!m) throw rterror("invalid conversion '%" + fmt.slice(i, i + 5) + "' to 'format'");
      i += m[0].length;
      var flags = m[1], width = m[2] ? Number(m[2]) : 0, prec = m[3] === undefined ? undefined : Number(m[3] || 0);
      var conv = m[4];
      var argn = ++argi;
      if (argn > args.length - 1 + 1 && conv !== '%') {
        if (args[argn - 1] === undefined && argn > args.length) throw argError(argn, 'format', 'no value');
      }
      var v = args[argn - 1], body, sign = '';
      switch (conv) {
        case 'd': case 'i': {
          var iv = checkInt(v, argn, 'format');
          body = String(Math.abs(iv) < 1e21 ? Math.abs(iv) : BigInt(iv) * (iv < 0 ? -1n : 1n));
          if (prec !== undefined) { body = body.padStart(prec, '0'); if (prec === 0 && iv === 0) body = ''; }
          sign = iv < 0 ? '-' : (flags.indexOf('+') >= 0 ? '+' : (flags.indexOf(' ') >= 0 ? ' ' : ''));
          out += pad(sign, body, width, flags, prec === undefined);
          break;
        }
        case 'u': {
          var uv = checkInt(v, argn, 'format');
          body = BigInt.asUintN(64, BigInt(uv)).toString();
          out += pad('', body, width, flags, true);
          break;
        }
        case 'c': out += pad('', String.fromCharCode(checkInt(v, argn, 'format')), width, flags.replace('0', ''), false); break;
        case 'x': case 'X': case 'o': {
          var xv = BigInt.asUintN(64, BigInt(checkInt(v, argn, 'format')));
          body = xv.toString(conv === 'o' ? 8 : 16);
          if (conv === 'X') body = body.toUpperCase();
          if (prec !== undefined) body = body.padStart(prec, '0');
          var pre = (flags.indexOf('#') >= 0 && xv !== 0n) ? (conv === 'o' ? '0' : (conv === 'x' ? '0x' : '0X')) : '';
          out += pad(pre, body, width, flags, prec === undefined);
          break;
        }
        case 'e': case 'E': case 'f': case 'F': case 'g': case 'G': case 'a': case 'A': {
          var fv = checkNum(v, argn, 'format');
          var neg = fv < 0 || (fv === 0 && 1 / fv < 0);
          var ax = Math.abs(fv);
          var up = conv === 'E' || conv === 'G' || conv === 'F' || conv === 'A';
          if (ax === Infinity || fv !== fv) {
            body = fv !== fv ? 'nan' : 'inf';
            if (up) body = body.toUpperCase();
            sign = neg && fv === fv ? '-' : (flags.indexOf('+') >= 0 ? '+' : (flags.indexOf(' ') >= 0 ? ' ' : ''));
            out += pad(sign, body, width, flags.replace('0', ''), false);
            break;
          }
          var p = prec === undefined ? 6 : prec;
          var alt = flags.indexOf('#') >= 0;
          if (conv === 'f' || conv === 'F') { body = fixedDigits(ax, p); if (alt && p === 0) body += '.'; }
          else if (conv === 'e' || conv === 'E') body = fmtExp(ax, p, up);
          else if (conv === 'g' || conv === 'G') body = fmtG(ax, p, up, alt);
          else body = hexFloat(ax, prec, up);
          sign = neg ? '-' : (flags.indexOf('+') >= 0 ? '+' : (flags.indexOf(' ') >= 0 ? ' ' : ''));
          out += pad(sign, body, width, flags, true);
          break;
        }
        case 's': {
          var sv = tostring(v);
          if (args.length < argn) throw argError(argn, 'format', 'no value');
          if (prec !== undefined) sv = sv.slice(0, prec);
          out += pad('', sv, width, flags.replace('0', ''), false);
          break;
        }
        case 'q': out += quoteString(v); break;
        default:
          throw rterror("invalid conversion '%" + m[0] + "' to 'format'");
      }
    }
    return out;
  });
  function pad(sign, body, width, flags, zeroOk) {
    var total = sign.length + body.length;
    if (total >= width) return sign + body;
    if (flags.indexOf('-') >= 0) return sign + body + ' '.repeat(width - total);
    if (zeroOk && flags.indexOf('0') >= 0) return sign + '0'.repeat(width - total) + body;
    return ' '.repeat(width - total) + sign + body;
  }
  function hexFloat(x, prec, up) {
    if (x === 0) return up ? '0X0P+0' : '0x0p+0';
    var e = Math.floor(Math.log2(x)), m = x / Math.pow(2, e);
    if (m >= 2) { m /= 2; e++; } else if (m < 1) { m *= 2; e--; }
    var frac = (m - 1).toString(16).slice(2);
    if (prec !== undefined) frac = frac.slice(0, prec).padEnd(prec, '0');
    var s = '0x1' + (frac ? '.' + frac : '') + 'p' + (e >= 0 ? '+' : '') + e;
    return up ? s.toUpperCase() : s;
  }
  function quoteString(v) {
    if (typeof v === 'string') {
      var o = '"';
      for (var i = 0; i < v.length; i++) {
        var c = v.charCodeAt(i), ch = v[i];
        if (ch === '"' || ch === '\\') o += '\\' + ch;
        else if (ch === '\n') o += '\\\n';
        else if (ch === '\r') o += '\\r';
        else if (c === 0) o += (i + 1 < v.length && /\d/.test(v[i + 1])) ? '\\000' : '\\0';
        else if (c < 32 || c === 127) o += '\\' + ((i + 1 < v.length && /\d/.test(v[i + 1])) ? String(c).padStart(3, '0') : c);
        else o += ch;
      }
      return o + '"';
    }
    if (typeof v === 'number' && Number.isInteger(v)) return intStr(v);
    if (isNum(v)) {
      var x = num(v);
      if (x === Infinity) return '1e9999';
      if (x === -Infinity) return '-1e9999';
      if (x !== x) return '(0/0)';
      if (x === Math.floor(x)) return (x < 0 ? '-' : '') + hexFloat(Math.abs(x)) ;
      return (x < 0 ? '-' : '') + hexFloat(Math.abs(x));
    }
    if (v === undefined || typeof v === 'boolean') return tostring(v);
    throw rterror("bad argument to 'format' (value has no literal form)");
  }

  // ----------------------------------------------------- patterns ------
  // lstrlib.c's matcher, ported line for line.
  var L_ESC = 37, CAP_UNFINISHED = -1, CAP_POSITION = -2, MAXCCALLS = 200, MAXCAPTURES = 32;
  function MatchState(src, pat) {
    this.src = src; this.pat = pat; this.level = 0; this.matchdepth = MAXCCALLS;
    this.capInit = new Array(MAXCAPTURES); this.capLen = new Array(MAXCAPTURES);
  }
  function classEnd(ms, p) {
    var pat = ms.pat, pe = pat.length;
    var c = pat.charCodeAt(p++);
    if (c === L_ESC) {
      if (p >= pe) throw rterror("malformed pattern (ends with '%')");
      return p + 1;
    }
    if (c === 91) {   // '['
      if (pat.charCodeAt(p) === 94) p++;
      do {
        if (p >= pe) throw rterror("malformed pattern (missing ']')");
        if (pat.charCodeAt(p++) === L_ESC && p < pe) p++;
      } while (pat.charCodeAt(p) !== 93);
      return p + 1;
    }
    return p;
  }
  function isalpha(c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122); }
  function isdigit(c) { return c >= 48 && c <= 57; }
  function islower(c) { return c >= 97 && c <= 122; }
  function isupper(c) { return c >= 65 && c <= 90; }
  function isspace(c) { return c === 32 || (c >= 9 && c <= 13); }
  function iscntrl(c) { return c < 32 || c === 127; }
  function ispunct(c) { return c >= 33 && c <= 126 && !isalpha(c) && !isdigit(c); }
  function isxdigit(c) { return isdigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70); }
  function matchClass(c, cl) {
    var res;
    var low = cl >= 65 && cl <= 90 ? cl + 32 : cl;
    switch (low) {
      case 97: res = isalpha(c); break;            // a
      case 99: res = iscntrl(c); break;            // c
      case 100: res = isdigit(c); break;           // d
      case 103: res = c >= 33 && c <= 126; break;  // g
      case 108: res = islower(c); break;           // l
      case 112: res = ispunct(c); break;           // p
      case 115: res = isspace(c); break;           // s
      case 117: res = isupper(c); break;           // u
      case 119: res = isalpha(c) || isdigit(c); break; // w
      case 120: res = isxdigit(c); break;          // x
      default: return cl === c;
    }
    if (isupper(cl)) res = !res;
    return res;
  }
  function matchBracketClass(ms, c, p, ec) {
    var pat = ms.pat, sig = true;
    if (pat.charCodeAt(p + 1) === 94) { sig = false; p++; }
    while (++p < ec) {
      var pc = pat.charCodeAt(p);
      if (pc === L_ESC) {
        p++;
        if (matchClass(c, pat.charCodeAt(p))) return sig;
      } else if (pat.charCodeAt(p + 1) === 45 && p + 2 < ec) {
        p += 2;
        if (pat.charCodeAt(p - 2) <= c && c <= pat.charCodeAt(p)) return sig;
      } else if (pc === c) return sig;
    }
    return !sig;
  }
  function singleMatch(ms, s, p, ep) {
    if (s >= ms.src.length) return false;
    var c = ms.src.charCodeAt(s);
    var pc = ms.pat.charCodeAt(p);
    switch (pc) {
      case 46: return true;                                  // '.'
      case L_ESC: return matchClass(c, ms.pat.charCodeAt(p + 1));
      case 91: return matchBracketClass(ms, c, p, ep - 1);
      default: return pc === c;
    }
  }
  function matchBalance(ms, s, p) {
    if (p >= ms.pat.length - 1) throw rterror("malformed pattern (missing arguments to '%b')");
    var src = ms.src;
    if (src.charCodeAt(s) !== ms.pat.charCodeAt(p)) return -1;
    var b = ms.pat.charCodeAt(p), e = ms.pat.charCodeAt(p + 1), cont = 1;
    while (++s < src.length) {
      var c = src.charCodeAt(s);
      if (c === e) { if (--cont === 0) return s + 1; }
      else if (c === b) cont++;
    }
    return -1;
  }
  function maxExpand(ms, s, p, ep) {
    var i = 0;
    while (singleMatch(ms, s + i, p, ep)) i++;
    while (i >= 0) {
      var res = doMatch(ms, s + i, ep + 1);
      if (res !== -1) return res;
      i--;
    }
    return -1;
  }
  function minExpand(ms, s, p, ep) {
    for (;;) {
      var res = doMatch(ms, s, ep + 1);
      if (res !== -1) return res;
      else if (singleMatch(ms, s, p, ep)) s++;
      else return -1;
    }
  }
  function startCapture(ms, s, p, what) {
    var level = ms.level;
    if (level >= MAXCAPTURES) throw rterror('too many captures');
    ms.capInit[level] = s; ms.capLen[level] = what;
    ms.level = level + 1;
    var res = doMatch(ms, s, p);
    if (res === -1) ms.level--;
    return res;
  }
  function captureToClose(ms) {
    var level = ms.level;
    for (level--; level >= 0; level--) if (ms.capLen[level] === CAP_UNFINISHED) return level;
    throw rterror('invalid pattern capture');
  }
  function endCapture(ms, s, p) {
    var l = captureToClose(ms);
    ms.capLen[l] = s - ms.capInit[l];
    var res = doMatch(ms, s, p);
    if (res === -1) ms.capLen[l] = CAP_UNFINISHED;
    return res;
  }
  function checkCapture(ms, l) {
    l -= 49;
    if (l < 0 || l >= ms.level || ms.capLen[l] === CAP_UNFINISHED) throw rterror('invalid capture index %' + (l + 1));
    return l;
  }
  function matchCapture(ms, s, l) {
    l = checkCapture(ms, l);
    var len = ms.capLen[l];
    var cap = ms.src.substr(ms.capInit[l], len);
    if (ms.src.length - s >= len && ms.src.substr(s, len) === cap) return s + len;
    return -1;
  }
  function doMatch(ms, s, p) {
    if (ms.matchdepth-- === 0) throw rterror('pattern too complex');
    var pat = ms.pat, pe = pat.length;
    for (;;) {
      if (p === pe) break;
      var pc = pat.charCodeAt(p);
      if (pc === 40) {                                     // '('
        if (pat.charCodeAt(p + 1) === 41) s = startCapture(ms, s, p + 2, CAP_POSITION);
        else s = startCapture(ms, s, p + 1, CAP_UNFINISHED);
        break;
      }
      if (pc === 41) { s = endCapture(ms, s, p + 1); break; }   // ')'
      if (pc === 36 && p + 1 === pe) {                     // '$' at the end
        s = (s === ms.src.length) ? s : -1;
        break;
      }
      if (pc === L_ESC) {
        var nx = pat.charCodeAt(p + 1);
        if (nx === 98) {                                   // %b
          s = matchBalance(ms, s, p + 2);
          if (s !== -1) { p += 4; continue; }
          break;
        }
        if (nx === 102) {                                  // %f
          p += 2;
          if (pat.charCodeAt(p) !== 91) throw rterror("missing '[' after '%f' in pattern");
          var ep0 = classEnd(ms, p);
          var prev = (s === 0) ? 0 : ms.src.charCodeAt(s - 1);
          var cur = s < ms.src.length ? ms.src.charCodeAt(s) : 0;
          if (!matchBracketClass(ms, prev, p, ep0 - 1) && matchBracketClass(ms, cur, p, ep0 - 1)) { p = ep0; continue; }
          s = -1; break;
        }
        if (nx >= 48 && nx <= 57) {                        // %0-%9
          s = matchCapture(ms, s, nx);
          if (s !== -1) { p += 2; continue; }
          break;
        }
      }
      // default: a single class with an optional suffix
      var ep = classEnd(ms, p);
      var epc = pat.charCodeAt(ep);
      if (!singleMatch(ms, s, p, ep)) {
        if (epc === 42 || epc === 63 || epc === 45) { p = ep + 1; continue; }   // * ? -
        s = -1; break;
      }
      if (epc === 63) {                                    // ?
        var res = doMatch(ms, s + 1, ep + 1);
        if (res !== -1) { s = res; break; }
        p = ep + 1; continue;
      }
      if (epc === 43) { s = maxExpand(ms, s + 1, p, ep); break; }   // +
      if (epc === 42) { s = maxExpand(ms, s, p, ep); break; }       // *
      if (epc === 45) { s = minExpand(ms, s, p, ep); break; }       // -
      s++; p = ep;
    }
    ms.matchdepth++;
    return s;
  }
  function getCapture(ms, i, s, e) {
    if (i >= ms.level) {
      if (i !== 0) throw rterror('invalid capture index %' + (i + 1));
      return ms.src.slice(s, e);
    }
    var l = ms.capLen[i];
    if (l === CAP_UNFINISHED) throw rterror('unfinished capture');
    if (l === CAP_POSITION) return ms.capInit[i] + 1;
    return ms.src.substr(ms.capInit[i], l);
  }
  function captures(ms, s, e, wholeIfNone) {
    var n = (ms.level === 0 && wholeIfNone) ? 1 : ms.level;
    var out = [];
    for (var i = 0; i < n; i++) out.push(getCapture(ms, i, s, e));
    return out;
  }
  var SPECIALS = /[\^$*+?.()[\]%-]/;
  function strFindAux(find, s, p, init, plain, fname) {
    s = checkStr(s, 1, fname); p = checkStr(p, 2, fname);
    var ls = s.length;
    var st = posrelatI(optInt(init, 3, fname, 1), ls) - 1;
    if (st > ls) return undefined;
    if (find && (truthy(plain) || !SPECIALS.test(p))) {
      var idx = s.indexOf(p, st);
      if (idx >= 0) return new Multi([idx + 1, idx + p.length]);
      return undefined;
    }
    var anchor = p.charCodeAt(0) === 94;
    var pp = anchor ? p.slice(1) : p;
    var ms = new MatchState(s, pp);
    var s1 = st;
    do {
      ms.level = 0; ms.matchdepth = MAXCCALLS;
      var res = doMatch(ms, s1, 0);
      if (res !== -1) {
        if (find) return new Multi([s1 + 1, res].concat(captures(ms, -1, 0, false)));
        return ret(captures(ms, s1, res, true));
      }
    } while (s1++ < ls && !anchor);
    return undefined;
  }
  stringLib.set('find', function (s, p, init, plain) { return strFindAux(true, s, p, init, plain, 'find'); });
  stringLib.set('match', function (s, p, init) { return strFindAux(false, s, p, init, false, 'match'); });
  stringLib.set('gmatch', function (s, p, init) {
    s = checkStr(s, 1, 'gmatch'); p = checkStr(p, 2, 'gmatch');
    var ls = s.length;
    var src = posrelatI(optInt(init, 3, 'gmatch', 1), ls) - 1;
    if (src > ls) src = ls + 1;
    var ms = new MatchState(s, p), lastmatch = -1;
    return function () {
      for (; src <= ls; src++) {
        ms.level = 0; ms.matchdepth = MAXCCALLS;
        var e = doMatch(ms, src, 0);
        if (e !== -1 && e !== lastmatch) {
          var start = src;
          src = lastmatch = e;
          return ret(captures(ms, start, e, true));
        }
      }
      return undefined;
    };
  });
  stringLib.set('gsub', function (s, p, repl, maxn) {
    s = checkStr(s, 1, 'gsub'); p = checkStr(p, 2, 'gsub');
    var tr = typeName(repl);
    if (!(tr === 'number' || tr === 'string' || tr === 'table' || tr === 'function')) {
      throw argError(3, 'gsub', 'string/function/table expected, got ' + typeNameArg(repl));
    }
    var maxS = maxn === undefined ? s.length + 1 : checkInt(maxn, 4, 'gsub');
    var anchor = p.charCodeAt(0) === 94;
    var pp = anchor ? p.slice(1) : p;
    var ms = new MatchState(s, pp);
    var src = 0, lastmatch = -1, n = 0, out = '';
    var rs = tr === 'string' || tr === 'number' ? (typeof repl === 'string' ? repl : numStr(repl)) : null;
    while (n < maxS) {
      ms.level = 0; ms.matchdepth = MAXCCALLS;
      var e = doMatch(ms, src, 0);
      if (e !== -1 && e !== lastmatch) {
        n++;
        out += addValue(ms, src, e, repl, rs, tr);
        src = lastmatch = e;
      } else if (src < s.length) out += s[src++];
      else break;
      if (anchor) break;
    }
    if (src < s.length) out += s.slice(src);
    return new Multi([out, n]);
  });
  function addValue(ms, s, e, repl, rs, tr) {
    var whole = ms.src.slice(s, e), v;
    if (rs !== null) {
      var o = '';
      for (var i = 0; i < rs.length; i++) {
        var c = rs[i];
        if (c !== '%') { o += c; continue; }
        i++;
        var d = rs[i];
        if (d === '%') o += '%';
        else if (d !== undefined && d >= '0' && d <= '9') {
          var cap = d === '0' ? whole : getCapture(ms, d.charCodeAt(0) - 49, s, e);
          o += typeof cap === 'string' ? cap : numStr(cap);
        } else throw rterror("invalid use of '%' in replacement string");
      }
      return o;
    }
    var caps = captures(ms, s, e, true);
    if (tr === 'table') v = index(repl, caps[0]);
    else v = first(call(repl).apply(null, caps));
    if (v === undefined || v === false) return whole;
    if (typeof v === 'string') return v;
    if (isNum(v)) return numStr(v);
    throw rterror('invalid replacement value (a ' + typeName(v) + ')');
  }

  // ===================================================== conversion =======
  // Between JS values (UTF-16 strings, arrays, objects) and Lua values.
  var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  var decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  function toBytes(str) {        // JS string -> Lua byte string
    if (/^[\x00-\x7f]*$/.test(str)) return str;
    var b = encoder.encode(str), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }
  function fromBytes(s) {        // Lua byte string -> JS string
    if (/^[\x00-\x7f]*$/.test(s)) return s;
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return decoder.decode(b);
  }
  function toLua(v) {
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'string') return toBytes(v);
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'function') return v;
    if (v instanceof LuaTable || v instanceof LFloat) return v;
    var t = new LuaTable();
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) t.set(i + 1, toLua(v[i])); return t; }
    Object.keys(v).forEach(function (k) { t.set(toBytes(k), toLua(v[k])); });
    return t;
  }
  function toJS(v, seen) {
    if (v instanceof LFloat) return v.n;
    if (typeof v === 'string') return fromBytes(v);
    if (!(v instanceof LuaTable)) return v;
    seen = seen || new Map();
    if (seen.has(v)) return seen.get(v);
    var n = v.arr.length, hashSize = v.hash ? v.hash.size : 0;
    if (hashSize === 0) {
      var a = [];
      seen.set(v, a);
      for (var i = 0; i < n; i++) a.push(toJS(v.arr[i], seen));
      return a;
    }
    var o = {};
    seen.set(v, o);
    for (var j = 0; j < n; j++) if (v.arr[j] !== undefined) o[j + 1] = toJS(v.arr[j], seen);
    v.hash.forEach(function (val, key) {
      var k = typeof key === 'string' ? fromBytes(key) : (isNum(key) ? numStr(key) : tostring(key));
      o[k] = toJS(val, seen);
    });
    return o;
  }

  NS.LFloat = LFloat; NS.mkf = mkf; NS.Multi = Multi; NS.first = first; NS.sp = sp; NS.ret = ret;
  NS.LuaTable = LuaTable; NS.NONE = NONE; NS.LuaError = LuaError; NS.lineMaps = lineMaps;
  NS.add = add; NS.sub = sub; NS.mul = mul; NS.div = div; NS.idiv = idiv; NS.mod = mod; NS.pow = pow;
  NS.unm = unm; NS.band = band; NS.bor = bor; NS.bxor = bxor; NS.shl = shl; NS.shr = shr; NS.bnot = bnot;
  NS.concat = concat; NS.len = len; NS.eq = eq; NS.lt = lt; NS.le = le; NS.gt = gt; NS.ge = ge;
  NS.T = truthy; NS.index = index; NS.setindex = setindex; NS.call = call; NS.method = method;
  NS.tbl = tbl; NS.iter = iter; NS.forprep = forprep; NS.tostring = tostring; NS.typeName = typeName;
  NS.makeEnv = makeEnv; NS.toLua = toLua; NS.toJS = toJS; NS.toBytes = toBytes; NS.fromBytes = fromBytes;
  NS.numStr = numStr; NS.str2num = str2num; NS.errorValue = errorValue; NS.rterror = rterror;
})(typeof module === 'object' && module.exports
  ? (module.exports = (globalThis.MiddawLua = globalThis.MiddawLua || {}))
  : (globalThis.MiddawLua = globalThis.MiddawLua || {}));


/* ---- ../kit/runtime/lua_compile.js ---- */
/* Middaw's Lua 5.4, part 2 of 3: syntax tree in, JavaScript out.
 *
 * Every Lua local becomes a JS `let` with a name of its own ($x, $x$2...), so
 * shadowing and closures behave as in Lua: a fresh binding per declaration,
 * and per loop iteration. Every operator goes through the runtime, so the
 * integer/float distinction and the error messages are Lua's. Each statement
 * starts a new line carrying a marker with its Lua line number, which is how
 * an error raised in the generated code is reported at the Lua line.
 */
(function (NS) {
  'use strict';

  var ARITH = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', '^': 'pow', '//': 'idiv',
                '&': 'band', '|': 'bor', '~': 'bxor', '<<': 'shl', '>>': 'shr', '..': 'concat' };
  var COMPARE = { '==': 'eq', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' };

  function compile(ast, chunk) {
    var consts = [];
    var nameCounts = Object.create(null);

    function uniqueName(luaName) {
      var n = (nameCounts[luaName] || 0) + 1;
      nameCounts[luaName] = n;
      return n === 1 ? '$' + luaName : '$' + luaName + '$' + n;
    }

    function FuncState(parent, vararg) {
      this.parent = parent; this.vararg = vararg; this.temps = 0; this.scopes = [];
    }
    var fs = null;
    var stmtUid = 0;

    function newTemp() { fs.temps++; return '$$' + fs.temps; }
    function lookup(name) {
      for (var f = fs; f; f = f.parent) {
        for (var i = f.scopes.length - 1; i >= 0; i--) {
          var js = f.scopes[i][name];
          if (js !== undefined) return js;
        }
      }
      return null;
    }
    function declare(name) {
      var js = uniqueName(name);
      fs.scopes[fs.scopes.length - 1][name] = js;
      return js;
    }
    function openScope() { fs.scopes.push(Object.create(null)); }
    function closeScope() { fs.scopes.pop(); }

    function err(msg, line) {
      throw new NS.LuaSyntaxError(msg, chunk, line || 0);
    }

    function str(s) { return JSON.stringify(s); }

    function numberLiteral(text) {
      var v;
      if (/^0[xX]/.test(text)) {
        if (/[.pP]/.test(text)) v = NS.str2num(text);
        else {
          var big = BigInt.asIntN(64, BigInt('0x' + text.slice(2)));
          return String(Number(big));
        }
      } else if (/[.eE]/.test(text)) {
        v = NS.mkf(Number(text));
      } else {
        var n = Number(text);
        if (Math.abs(n) > 9223372036854775807) v = NS.mkf(n);
        else return String(n);
      }
      if (v instanceof NS.LFloat) {
        var idx = consts.length;
        consts.push(v);
        return '$$K[' + idx + ']';
      }
      var s = String(v);
      return s === 'Infinity' ? 'Infinity' : (s === 'NaN' ? 'NaN' : (v < 0 ? '(' + s + ')' : s));
    }

    function describe(e) {
      if (e.k === 'Name') return lookup(e.name) ? "local '" + e.name + "'" : "global '" + e.name + "'";
      if (e.k === 'Index' && e.key.k === 'String') return "field '" + e.key.v + "'";
      if (e.k === 'Method') return "method '" + e.name + "'";
      return '';
    }

    function isMultiExpr(e) { return e.k === 'Call' || e.k === 'Method' || e.k === 'Vararg'; }

    // A JS expression for the raw result of a call: possibly a Multi.
    function callRaw(e) {
      if (e.k === 'Method') {
        var o = ex(e.obj);
        var args = argList(e.args);
        return 'L.method(' + o + ', ' + str(e.name) + (args ? ', ' + args : '') + ')';
      }
      var fn = ex(e.fn), a = argList(e.args), d = describe(e.fn);
      if (/^\$[A-Za-z_][\w$]*$/.test(fn)) {
        return '(typeof ' + fn + " === 'function' ? " + fn + ' : L.call(' + fn + ', ' + str(d) + '))(' + a + ')';
      }
      var t = newTemp();
      return '(typeof (' + t + ' = ' + fn + ") === 'function' ? " + t + ' : L.call(' + t + ', ' + str(d) + '))(' + a + ')';
    }

    function argList(exprs) {
      var out = [];
      for (var i = 0; i < exprs.length; i++) {
        var e = exprs[i], last = i === exprs.length - 1;
        if (last && (e.k === 'Call' || e.k === 'Method')) out.push('...L.sp(' + callRaw(e) + ')');
        else if (last && e.k === 'Vararg') { checkVararg(e); out.push('...$$va'); }
        else out.push(ex(e));
      }
      return out.join(', ');
    }
    function checkVararg(e) {
      if (!fs.vararg) err("cannot use '...' outside a vararg function", e.line);
    }

    // A JS expression for exactly one Lua value.
    function ex(e) {
      switch (e.k) {
        case 'Nil': return 'undefined';
        case 'True': return 'true';
        case 'False': return 'false';
        case 'Number': return numberLiteral(e.v);
        case 'String': return str(e.v);
        case 'Vararg': checkVararg(e); return '$$va[0]';
        case 'Function': return funcExpr(e);
        case 'Paren': return ex(e.expr);
        case 'Name': {
          var js = lookup(e.name);
          if (js) return js;
          return 'L.index($$G, ' + str(e.name) + ')';
        }
        case 'Index':
          return 'L.index(' + ex(e.obj) + ', ' + ex(e.key) + ', ' + str(describe(e.obj)) + ')';
        case 'Call': case 'Method':
          return 'L.first(' + callRaw(e) + ')';
        case 'Table': return tableExpr(e);
        case 'Unop': {
          if (e.op === 'not') return '!' + cond(e.expr);
          if (e.op === '-') {
            if (e.expr.k === 'Number') {
              var lit = numberLiteral(e.expr.v);
              if (/^\d+$/.test(lit)) return lit === '0' ? '0' : '(-' + lit + ')';
              if (/^[\d.e+-]+$/.test(lit)) return '(-' + lit + ')';
            }
            return 'L.unm(' + ex(e.expr) + ')';
          }
          if (e.op === '#') return 'L.len(' + ex(e.expr) + ')';
          if (e.op === '~') return 'L.bnot(' + ex(e.expr) + ')';
          break;
        }
        case 'Binop': {
          if (e.op === 'and') {
            var t = newTemp();
            return '(L.T(' + t + ' = ' + ex(e.left) + ') ? ' + ex(e.right) + ' : ' + t + ')';
          }
          if (e.op === 'or') {
            var t2 = newTemp();
            return '(L.T(' + t2 + ' = ' + ex(e.left) + ') ? ' + t2 + ' : ' + ex(e.right) + ')';
          }
          if (e.op === '~=') return '!L.eq(' + ex(e.left) + ', ' + ex(e.right) + ')';
          if (COMPARE[e.op]) return 'L.' + COMPARE[e.op] + '(' + ex(e.left) + ', ' + ex(e.right) + ')';
          return 'L.' + ARITH[e.op] + '(' + ex(e.left) + ', ' + ex(e.right) + ')';
        }
      }
      err('cannot compile expression ' + e.k, e.line);
    }

    // A JS boolean expression for Lua truth, without building a Lua value.
    function cond(e) {
      switch (e.k) {
        case 'True': return 'true';
        case 'False': case 'Nil': return 'false';
        case 'Paren': return cond(e.expr);
        case 'Unop': if (e.op === 'not') return '!' + cond(e.expr); break;
        case 'Binop':
          if (e.op === 'and') return '(' + cond(e.left) + ' && ' + cond(e.right) + ')';
          if (e.op === 'or') return '(' + cond(e.left) + ' || ' + cond(e.right) + ')';
          if (e.op === '~=' || COMPARE[e.op]) return ex(e);
          break;
      }
      return 'L.T(' + ex(e) + ')';
    }

    function tableExpr(e) {
      var pos = [], keyed = [];
      for (var i = 0; i < e.items.length; i++) {
        var it = e.items[i];
        if (it.kind === 'pos') {
          var lastPos = true;
          for (var j = i + 1; j < e.items.length; j++) if (e.items[j].kind === 'pos') { lastPos = false; break; }
          if (lastPos && (it.value.k === 'Call' || it.value.k === 'Method')) pos.push('...L.sp(' + callRaw(it.value) + ')');
          else if (lastPos && it.value.k === 'Vararg') { checkVararg(it.value); pos.push('...$$va'); }
          else pos.push(ex(it.value));
        } else {
          keyed.push(ex(it.key), ex(it.value));
        }
      }
      if (!keyed.length) return 'L.tbl([' + pos.join(', ') + '])';
      return 'L.tbl([' + pos.join(', ') + '], [' + keyed.join(', ') + '])';
    }

    function funcExpr(f) {
      var saved = fs;
      fs = new FuncState(saved, f.vararg);
      openScope();
      var params = f.params.map(function (p) { return declare(p); });
      if (f.vararg) params.push('...$$va');
      var body = block(f.body);
      closeScope();
      var temps = '';
      if (fs.temps) {
        var names = [];
        for (var i = 1; i <= fs.temps; i++) names.push('$$' + i);
        temps = 'let ' + names.join(', ') + ';';
      }
      fs = saved;
      return 'function (' + params.join(', ') + ') {' + temps + body + '\n/*@' + (f.endLine || f.line) + '*/return L.NONE;}';
    }

    function block(stmts) {
      var out = '';
      for (var i = 0; i < stmts.length; i++) out += statement(stmts[i]);
      return out;
    }
    function scoped(stmts) {
      openScope();
      var b = block(stmts);
      closeScope();
      return b;
    }

    function assignTo(target, value) {
      if (target.k === 'Name') {
        var js = lookup(target.name);
        if (js) return js + ' = ' + value + ';';
        return 'L.setindex($$G, ' + str(target.name) + ', ' + value + ');';
      }
      return 'L.setindex(' + ex(target.obj) + ', ' + ex(target.key) + ', ' + value + ', ' + str(describe(target.obj)) + ');';
    }

    function valuesArray(exprs) { return '[' + argList(exprs) + ']'; }

    function statement(s) {
      var mark = '\n/*@' + (s.line || 0) + '*/';
      switch (s.k) {
        case 'Local': {
          var attrs = s.attribs || [];
          attrs.forEach(function (a) {
            if (a && a !== 'const' && a !== 'close') err("unknown attribute '" + a + "'", s.line);
          });
          if (s.names.length === 1 && s.exprs.length <= 1) {
            var v = s.exprs.length ? ex(s.exprs[0]) : 'undefined';
            return mark + 'let ' + declare(s.names[0]) + ' = ' + v + ';';
          }
          if (s.exprs.length === s.names.length && !s.exprs.some(isMultiExpr)) {
            var vals = s.exprs.map(ex);
            var tmpNames = vals.map(function () { return '$$l' + (++stmtUid); });
            var pre = 'const ' + tmpNames.map(function (t, i) { return t + ' = ' + vals[i]; }).join(', ') + ';';
            var decl = s.names.map(function (n, i) { return declare(n) + ' = ' + tmpNames[i]; });
            return mark + pre + ' let ' + decl.join(', ') + ';';
          }
          var r = '$$r' + (++stmtUid);
          var code = 'const ' + r + ' = ' + valuesArray(s.exprs) + ';';
          var decls = s.names.map(function (n, i) { return declare(n) + ' = ' + r + '[' + i + ']'; });
          return mark + code + ' let ' + decls.join(', ') + ';';
        }
        case 'LocalFunction': {
          var name = declare(s.name);
          return mark + 'let ' + name + '; ' + name + ' = ' + funcExpr(s.func) + ';';
        }
        case 'Assign': {
          if (s.targets.length === 1 && s.exprs.length === 1) {
            return mark + assignTo(s.targets[0], ex(s.exprs[0]));
          }
          var rr = '$$r' + (++stmtUid);
          var c2 = 'const ' + rr + ' = ' + valuesArray(s.exprs) + ';';
          s.targets.forEach(function (t, i) { c2 += ' ' + assignTo(t, rr + '[' + i + ']'); });
          return mark + c2;
        }
        case 'ExprStat':
          return mark + callRaw(s.expr) + ';';
        case 'Do':
          return mark + '{' + scoped(s.body) + '\n}';
        case 'While':
          return mark + 'while (' + cond(s.cond) + ') {' + scoped(s.body) + '\n}';
        case 'Repeat': {
          openScope();
          var body = block(s.body);
          var cnd = cond(s.cond);
          closeScope();
          return mark + 'for (;;) {' + body + '\nif (' + cnd + ') break;\n}';
        }
        case 'If': {
          var o = mark;
          s.clauses.forEach(function (c, i) {
            o += (i ? ' else if (' : 'if (') + cond(c.cond) + ') {' + scoped(c.body) + '\n}';
          });
          if (s.orelse) o += ' else {' + scoped(s.orelse) + '\n}';
          return o;
        }
        case 'NumFor': {
          var u = ++stmtUid;
          var I = '$$i' + u, LIM = '$$m' + u, ST = '$$s' + u, FL = '$$f' + u;
          var start = ex(s.start), limit = ex(s.limit);
          var stepLit = !s.step ? 1 : (s.step.k === 'Number' && /^\d+$/.test(s.step.v) ? Number(s.step.v) : null);
          var step = s.step ? ex(s.step) : '1';
          var intStart = s.start.k === 'Number' && /^\d+$/.test(s.start.v);
          var test = stepLit !== null && stepLit > 0 ? I + ' <= ' + LIM : '(' + ST + ' > 0 ? ' + I + ' <= ' + LIM + ' : ' + I + ' >= ' + LIM + ')';
          openScope();
          var v2 = declare(s.name);
          var bindVal = (intStart && stepLit !== null) ? I : FL + ' ? L.mkf(' + I + ') : ' + I;
          var bd = block(s.body);
          closeScope();
          return mark + 'for (let [' + I + ', ' + LIM + ', ' + ST + ', ' + FL + '] = L.forprep(' + start + ', ' + limit + ', ' + step + '); ' +
                 test + '; ' + I + ' += ' + ST + ') { let ' + v2 + ' = ' + bindVal + ';' + bd + '\n}';
        }
        case 'GenFor': {
          var it = '$$it' + (++stmtUid);
          var head = 'const ' + it + ' = L.iter(' + argList(s.exprs) + ');';
          openScope();
          var binds = s.names.map(function (n, i) {
            var src = i === 0 ? it + '.a' : (i === 1 ? it + '.b' : it + '.v[' + i + ']');
            return declare(n) + ' = ' + src;
          });
          var gb = block(s.body);
          closeScope();
          return mark + '{' + head + ' while (' + it + '.step()) { let ' + binds.join(', ') + ';' + gb + '\n}}';
        }
        case 'Return': {
          var ex0 = s.exprs;
          if (!ex0.length) return mark + 'return L.NONE;';
          if (ex0.length === 1) {
            if (ex0[0].k === 'Call' || ex0[0].k === 'Method') return mark + 'return ' + callRaw(ex0[0]) + ';';
            if (ex0[0].k === 'Vararg') { checkVararg(ex0[0]); return mark + 'return L.ret($$va);'; }
            return mark + 'return ' + ex(ex0[0]) + ';';
          }
          return mark + 'return L.ret(' + valuesArray(ex0) + ');';
        }
        case 'Break': return mark + 'break;';
        case 'Goto': case 'Label':
          err('goto and labels are not supported by Middaw\'s Lua', s.line);
      }
      err('cannot compile statement ' + s.k, s.line);
    }

    fs = new FuncState(null, true);
    openScope();
    var body = block(ast.body);
    closeScope();
    var temps = '';
    if (fs.temps) {
      var names = [];
      for (var i = 1; i <= fs.temps; i++) names.push('$$' + i);
      temps = 'let ' + names.join(', ') + ';';
    }
    return { body: temps + body, consts: consts };
  }

  // The line the first line of a `new Function` body is reported as.
  var lineOffset = null;
  function probeOffset() {
    if (lineOffset !== null) return lineOffset;
    try {
      new Function('throw new Error("probe");\n//# sourceURL=lua:__probe__')();
    } catch (e) {
      var m = /lua:__probe__:(\d+)/.exec(e.stack || '');
      lineOffset = m ? Number(m[1]) - 1 : 0;
    }
    return lineOffset;
  }

  var chunkUid = 0;
  // Lua source (a byte string) -> a JS function, as `load` gives it.
  function load(src, chunkname, env) {
    var name = String(chunkname || 'chunk').replace(/[^A-Za-z0-9_.\/-]/g, '_');
    if (NS.lineMaps[name]) name = name + '#' + (++chunkUid);
    var ast = NS.parse(src, name);
    var out = compile(ast, name);
    var code = 'return function (...$$va) {' + out.body + '\nreturn L.NONE;\n};';
    var offset = probeOffset();
    var lines = code.split('\n'), map = [], cur = 0;
    for (var i = 0; i < offset; i++) map.push(0);
    for (var j = 0; j < lines.length; j++) {
      var m = /^\/\*@(\d+)\*\//.exec(lines[j]);
      if (m) cur = Number(m[1]);
      map.push(cur);
    }
    NS.lineMaps[name.replace(/#/g, '_')] = map;
    var factory = new Function('L', '$$G', '$$K', code + '\n//# sourceURL=lua:' + name.replace(/#/g, '_'));
    return factory(NS, env || NS.defaultEnv(), out.consts);
  }

  var sharedEnv = null;
  NS.defaultEnv = function () { return sharedEnv || (sharedEnv = NS.makeEnv()); };
  NS.compile = compile;
  NS.load = load;
})(typeof module === 'object' && module.exports
  ? (module.exports = (globalThis.MiddawLua = globalThis.MiddawLua || {}))
  : (globalThis.MiddawLua = globalThis.MiddawLua || {}));


/* ---- ../kit/runtime/host.js ---- */
/* The family's Lua engines, spoken to in JSON.
 *
 * The native app runs this in JavaScriptCore, after the Lua runtime
 * (runtime/lua/), and calls `MiddawHost.call(method, argsJSON)`; the tests run
 * it in Node. It knows no browser and no files: the host hands it a
 * `readFile(path)` that returns the file's bytes as a string, one character
 * per byte, which is how Middaw's Lua keeps its strings.
 *
 * The adapters (Noterator's) are how the generators are spoken to - settings
 * in, notes out - the same protocol Miderator and Noterator use.
 */
(function (G) {
  'use strict';
  var L = G.MiddawLua;

  var FILES = [
    'good-idea/gi_theory.lua', 'good-idea/gi_idea.lua',
    'midi-catalogue/mc_theory.lua', 'midi-catalogue/mc_orchestra.lua', 'midi-catalogue/mc_catalogue.lua',
    'midi-suggester/ms_theory.lua', 'midi-suggester/ms_read.lua', 'midi-suggester/ms_harmony.lua', 'midi-suggester/ms_melody.lua',
    'midi-variator/mv_theory.lua', 'midi-variator/mv_vary.lua',
    'starting-blocks/sb_engine.lua',
    'adapters/common.lua', 'adapters/index.lua', 'adapters/good_idea.lua', 'adapters/midi_suggester.lua',
    'adapters/midi_variator.lua', 'adapters/starting_blocks.lua', 'adapters/midi_catalogue.lua',
    'notation/sb_notate.lua', 'notation/sb_draw.lua', 'notation/sb_glyphs.lua',
    'battle-pass/bp_theory.lua', 'battle-pass/bp_loot.lua', 'battle-pass/bp_game.lua',
    'orchestration/orchestration_data.lua', 'orchestration/orchestration_composers.lua'
  ];

  var readFile = null, modules = {}, env = null, log = function () {};

  function engine(name) {
    if (modules[name] === undefined) {
      var src = readFile(name);
      if (src === null || src === undefined) throw new Error("engine '" + name + "' is not there");
      var r = L.first(L.load(src, name, env)());
      modules[name] = r === undefined ? false : r;
    }
    return modules[name];
  }

  function init(reader, logger) {
    readFile = reader;
    if (logger) log = logger;
    modules = {};
    env = L.makeEnv({
      print: function (s) { log('[lua] ' + L.fromBytes(s)); },
      readFile: function () { return null; },
      writeFile: function () {}
    });
    env.set('engine', function (name) { return engine(name); });
    env.set('dofile', function (name) { return L.first(engine(String(name).replace(/^.*engines\//, ''))); });
    return true;
  }

  function call(mod, fname) {
    var m = typeof mod === 'string' ? engine(mod) : mod;
    var f = L.index(m, fname);
    var args = [];
    for (var i = 2; i < arguments.length; i++) {
      var a = arguments[i];
      args.push(a instanceof L.LuaTable ? a : L.toLua(a));
    }
    return L.first(L.call(f).apply(null, args));
  }
  function js(v) { return L.toJS(v); }
  function list(x) { return !x ? [] : Array.isArray(x) ? x : Object.keys(x).map(function (k) { return x[k]; }); }

  // --------------------------------------------------------- generators --
  var adapters = null;
  function gens() {
    if (adapters) return adapters;
    adapters = list(js(engine('adapters/index.lua'))).map(function (path) {
      var A = engine(path);
      return { id: js(L.index(A, 'id')), name: js(L.index(A, 'name')), description: js(L.index(A, 'description')) || '',
               input: js(L.index(A, 'input')), panel: js(L.index(A, 'panel')) || null, A: A, path: path };
    });
    return adapters;
  }
  function gen(id) {
    var l = gens();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    throw new Error('no generator ' + id);
  }

  // A generator's settings live in Lua, as the engine left them.
  var sessions = {}, nextSession = 1;
  function session(id) { var s = sessions[id]; if (!s) throw new Error('no session ' + id); return s; }
  function normalise(r) {
    r = r || { results: [] };
    r.results = list(r.results);
    r.results.forEach(function (res) {
      res.parts = list(res.parts);
      res.parts.forEach(function (p) { p.notes = list(p.notes); });
    });
    return r;
  }

  // ------------------------------------------------------------- theory --
  // Chord names are ScaleView's, read by Midi Variator's port of it.
  // mv_theory knows the seven-note scales; anything else names chords
  // against the parallel major or minor. Indexed by ScaleView's scale (1-16).
  var MV_SCALE = [1, 2, 3, 1, 4, 5, 6, 7, 2, 1, 2, 1, 2, 1, 2, 1];
  var keyCache = {};
  function luaKey(key) {
    var k = key.root + ':' + key.scale;
    if (!keyCache[k]) keyCache[k] = call('midi-variator/mv_theory.lua', 'key', key.root, MV_SCALE[key.scale - 1] || 1);
    return keyCache[k];
  }

  // -------------------------------------------------------- orchestra ----
  // Noterator's instruments beyond the orchestra (Source/Core/Instruments.cpp).
  var EXTRA = [
    { id: 'asax', name: 'Alto Saxophone', family: 'Woodwind', low: 49, high: 80, sweet: [53, 76], poly: 1, fast: 0.09, leap: 12 },
    { id: 'tsax', name: 'Tenor Saxophone', family: 'Woodwind', low: 44, high: 75, sweet: [48, 70], poly: 1, fast: 0.09, leap: 12 },
    { id: 'bsax', name: 'Baritone Saxophone', family: 'Woodwind', low: 36, high: 69, sweet: [40, 62], poly: 1, fast: 0.10, leap: 12 },
    { id: 'vib', name: 'Vibraphone', family: 'Percussion', low: 53, high: 89, sweet: [55, 84], poly: 4, fast: 0.09, leap: 12 },
    { id: 'sop', name: 'Soprano', family: 'Voices', low: 60, high: 81, sweet: [64, 77], poly: 1, fast: 0.15, leap: 9 },
    { id: 'alto', name: 'Alto', family: 'Voices', low: 53, high: 74, sweet: [57, 69], poly: 1, fast: 0.15, leap: 9 },
    { id: 'ten', name: 'Tenor', family: 'Voices', low: 48, high: 69, sweet: [50, 65], poly: 1, fast: 0.15, leap: 9 },
    { id: 'bass', name: 'Bass', family: 'Voices', low: 40, high: 64, sweet: [43, 60], poly: 1, fast: 0.15, leap: 9 },
    { id: 'gtr', name: 'Guitar', family: 'Band', low: 40, high: 83, sweet: [45, 76], poly: 6, fast: 0.08, leap: 12 },
    { id: 'ebass', name: 'Bass Guitar', family: 'Band', low: 28, high: 67, sweet: [28, 55], poly: 1, fast: 0.09, leap: 12 },
    { id: 'ubass', name: 'Upright Bass', family: 'Band', low: 28, high: 67, sweet: [28, 55], poly: 1, fast: 0.10, leap: 12 },
    { id: 'synth', name: 'Synth', family: 'Band', low: 24, high: 108, sweet: [36, 96], poly: 16, fast: 0.03, leap: 48 },
    { id: 'kit', name: 'Drum Kit', family: 'Band', low: 35, high: 81, sweet: [35, 81], poly: 4, fast: 0.05, leap: 127, drums: true }
  ];

  // ----------------------------------------------------------- notation --
  var notate = null;
  function notation() {
    if (notate) return notate;
    var N = engine('notation/sb_notate.lua'), D = engine('notation/sb_draw.lua'), Gl = engine('notation/sb_glyphs.lua');
    L.call(L.index(D, 'setNotate'))(N);
    L.call(L.index(D, 'setGlyphs'))(Gl);
    notate = { N: N, D: D, E: engine('starting-blocks/sb_engine.lua') };
    return notate;
  }
  // A pen that records what Starting Blocks Notation draws, for the native
  // side to replay. sb_draw.lua uses four calls; colours arrive as the ids
  // given to it (1 ink, 2 staff, 3 ground, 4 accent):
  //   ["line", x1, y1, x2, y2, colour, thickness]
  //   ["poly", [x, y, x, y, ...], colour]
  //   ["circle", x, y, r, colour, filled]
  //   ["text", x, y, colour, text, size, centred]
  function num(v) { return v instanceof L.LFloat ? v.n : +v; }
  function colour(c) { return c instanceof L.LuaTable ? js(c) : num(c); }
  function recordingPen(ops) {
    var pen = new L.LuaTable();
    pen.set('line', function (x1, y1, x2, y2, col, th) {
      ops.push(['line', num(x1), num(y1), num(x2), num(y2), colour(col), th === undefined ? 1 : num(th)]); return L.NONE;
    });
    pen.set('poly', function (pts, col) {
      ops.push(['poly', pts.arr.map(num), colour(col)]); return L.NONE;
    });
    pen.set('circle', function (x, y, r, col, filled) {
      ops.push(['circle', num(x), num(y), num(r), colour(col), !!L.T(filled)]); return L.NONE;
    });
    pen.set('text', function (x, y, col, str, size, center) {
      ops.push(['text', num(x), num(y), colour(col), L.fromBytes(L.tostring(str)), num(size), !!L.T(center)]); return L.NONE;
    });
    return pen;
  }

  // ---------------------------------------------------------- the pass ---
  var pass = null, passState = null, passSession = null;
  function battlePass() {
    if (pass) return pass;
    var T = engine('battle-pass/bp_theory.lua');
    var Lt = L.first(L.call(L.index(engine('battle-pass/bp_loot.lua'), 'init'))(T));
    var Gm = L.first(L.call(L.index(engine('battle-pass/bp_game.lua'), 'init'))(Lt));
    pass = { G: Gm, L: Lt, T: T };
    return pass;
  }

  // ------------------------------------------------------------- methods -
  var M = {
    generators: function () {
      return gens().map(function (g) { return { id: g.id, name: g.name, description: g.description, input: g.input, panel: g.panel }; });
    },
    newSession: function (a) {
      var g = gen(a.generator), id = nextSession++;
      sessions[id] = { g: g, st: L.first(L.call(L.index(g.A, 'newState'))()) };
      return id;
    },
    useKey: function (a) { var s = session(a.session); call(s.g.A, 'useKey', s.st, a.key.root, a.key.scale); return true; },
    settings: function (a) { var s = session(a.session); return list(js(call(s.g.A, 'settings', s.st, L.toLua(a.context || {})))); },
    set: function (a) { var s = session(a.session); call(s.g.A, 'set', s.st, a.setting, a.index, L.toLua(a.context || {})); return true; },
    generate: function (a) {
      var s = session(a.session);
      return normalise(js(call(s.g.A, 'generate', s.st, L.toLua(a.context || {}), a.seed || 1, a.count || 6)));
    },
    snapshot: function (a) { return js(session(a.session).st); },
    restore: function (a) {
      var s = session(a.session);
      Object.keys(a.state || {}).forEach(function (k) { L.setindex(s.st, L.toBytes(k), L.toLua(a.state[k])); });
      return true;
    },
    closeSession: function (a) { delete sessions[a.session]; return true; },

    nameChord: function (a) {
      if (!a.pitches || a.pitches.length < 2) return '';
      var r = L.call(L.index(engine('midi-variator/mv_theory.lua'), 'nameChord'))(L.toLua(a.pitches), luaKey(a.key));
      return js(L.first(r)) || '';
    },
    noteNames: function (a) {
      var k = js(L.index(luaKey(a.key), 'names')), out = [];
      for (var pc = 0; pc < 12; pc++) out.push(k[pc] || k[String(pc)] || '');
      return out;
    },
    // Midi Variator's key finder (ScaleView's), as Miderator's key lane uses it.
    detectKey: function (a) {
      var notes = (a.notes || []).slice().sort(function (x, y) { return x.start - y.start; });
      if (!notes.length) return null;
      var r = list(js(call('midi-variator/mv_theory.lua', 'detectKey',
        notes.map(function (n) { return { pitch: n.pitch, start: n.start, len: n.len }; }),
        notes[0].pitch % 12, notes[notes.length - 1].pitch % 12)));
      if (!r.length) return null;
      return { root: r[0].root, scale: r[0].scale === 2 ? 2 : 1 };
    },
    // Midi Catalogue's orchestra, plus Noterator's band and voices.
    instruments: function () {
      return list(js(L.index(engine('midi-catalogue/mc_orchestra.lua'), 'INSTRUMENTS'))).concat(EXTRA);
    },
    orchestration: function () {
      var A = js(engine('orchestration/orchestration_data.lua'));
      var B = js(engine('orchestration/orchestration_composers.lua'));
      return { entries: list(A.ENTRIES).concat(list(B && B.ENTRIES)),
               sources: Object.assign({}, (B && B.SOURCES) || {}, A.SOURCES || {}) };
    },

    // A part engraved by Starting Blocks Notation: its height and the drawing,
    // as a list of pen calls in staff spaces of `space` points.
    engrave: function (a) {
      var nt = notation();
      var st = L.first(L.call(L.index(nt.E, 'newState'))());
      st.set('root', a.key.root); st.set('scale', a.key.scale); st.set('barBeats', a.barBeats);
      var ctx = L.first(L.call(L.index(nt.N, 'context'))(nt.E, st));
      var block = L.toLua({ notes: a.notes, beats: a.beats, name: a.name || '' });
      var opts = L.toLua({ barBeats: a.barBeats, tsNum: a.meter[0], tsDen: a.meter[1], width: a.width,
                           drums: !!a.drums, grid: a.drums ? 0.25 : undefined,
                           // a clip is as played, so its silences are rests (Starting Blocks Notation 0019)
                           rests: !a.drums });
      opts.set('ctx', ctx);
      var doc = L.first(L.call(L.index(nt.N, 'layout'))(block, opts));
      var height = +L.first(L.call(L.index(nt.D, 'height'))(doc, a.space));
      var ops = [];
      var colours = L.toLua({ ink: 1, staff: 2, ground: 3, accent: 4 });
      var popts = new L.LuaTable();
      if (a.highlight !== undefined && a.highlight >= 0) {
        var at = a.highlight * 960;
        popts.set('highlight', function (el) {
          var abs = L.index(el, 'abs'), ticks = L.index(el, 'ticks');
          return abs !== undefined && at >= +abs && at < +abs + +ticks;
        });
      }
      L.call(L.index(nt.D, 'page'))(recordingPen(ops), doc, 0, 0, a.space, colours, popts);
      return { height: height, ops: ops };
    },

    // The Battle Pass, unchanged: its state is the game's own text.
    // `clock` is seconds of activity time, `epoch` the wall clock in seconds.
    passStart: function (a) {
      var Gm = battlePass().G;
      passState = a.saved ? L.first(L.call(L.index(Gm, 'deserialize'))(L.toBytes(a.saved))) : undefined;
      if (!passState) passState = L.first(L.call(L.index(Gm, 'newState'))(a.epoch));
      L.call(L.index(Gm, 'clampState'))(passState, a.epoch);
      passSession = L.first(L.call(L.index(Gm, 'newSession'))(passState, a.clock, a.epoch));
      L.call(L.index(Gm, 'refresh'))(passState, passSession, a.epoch, new L.LuaTable());
      return true;
    },
    // Any bp_game function; "$state" and "$session" in `args` stand for the
    // game's own tables.
    passCall: function (a) {
      var args = (a.args || []).map(function (x) {
        return x === '$state' ? passState : x === '$session' ? passSession : L.toLua(x);
      });
      return js(L.first(L.call(L.index(battlePass().G, a.fn)).apply(null, args)));
    },
    // What the game wants celebrated since last asked, then forgotten.
    passNotices: function () {
      var l = L.index(passSession, 'notices');
      if (!l || !l.arr || !l.arr.length) return [];
      var out = l.arr.map(function (n) { return js(n); });
      l.arr.length = 0;
      return out;
    },
    passGet: function (a) {
      var v = passState;
      String(a.path).split('.').forEach(function (k) { v = v === undefined ? undefined : L.index(v, isNaN(+k) ? k : +k); });
      return v instanceof L.LFloat ? v.n : js(v);
    },
    // Middaw's composer (runtime/composer/, the port of middaw/): a sentence
    // in, the song's five parts out, exactly as `python3 -m middaw --json`
    // answers. composerLoad takes data/vocab/tags.json and drums.json as text.
    composerLoad: function (a) {
      if (!G.MiddawComposer || !G.MiddawComposer.load) throw new Error('the composer is not loaded');
      G.MiddawComposer.load(JSON.parse(a.tags), JSON.parse(a.drums));
      return true;
    },
    compose: function (a) {
      var C = G.MiddawComposer;
      if (!C || !C.vocabulary) throw new Error('the composer has no vocabulary');
      return C.compose(String(a.prompt || ''), a.seed === undefined || a.seed === null ? undefined : a.seed);
    },

    // The game's own tables that are not state: the shop, the check-in
    // calendar, the rarities (module 'loot').
    passConst: function (a) {
      var P = battlePass();
      var v = L.index(a.module === 'loot' ? P.L : P.G, String(a.name));
      // a list that is also indexed by name (G.SHOP[id]) is its list
      if (v instanceof L.LuaTable && L.index(v, 1) != null) {
        var out = [];
        for (var i = 1; L.index(v, i) != null; i++) out.push(js(L.index(v, i)));
        return out;
      }
      return js(v);
    },
    passSave: function () { return L.fromBytes(L.first(L.call(L.index(battlePass().G, 'serialize'))(passState))); },

    // AutoCC (the JSFX, unchanged) run over a clip's notes: the curves it
    // would play, as controller lanes {number: [[beat, value], ...]}. Only a
    // point where the value turns is kept, not every step.
    autoCC: function (a) {
      var J = G.MiddawJSFX;
      if (!J) throw new Error('the JSFX runtime is not loaded');
      var fx = new J.JSFX(a.source, {});
      Object.keys(a.sliders || {}).forEach(function (k) { fx.setSliderByIndex(Number(k), a.sliders[k]); });
      var sr = 48000, bs = 256;
      fx.init(sr);
      fx.setTime({ tempo: a.tempo, playState: 1, num: a.meter[0], den: a.meter[1] });
      var ev = [];
      (a.notes || []).forEach(function (n) {
        ev.push([n.start, [0x90, n.pitch, n.vel]]);
        ev.push([n.start + n.len, [0x80, n.pitch, 0]]);
      });
      ev.sort(function (x, y) { return x[0] - y[0]; });
      var spb = sr * 60 / a.tempo, total = Math.ceil(a.length * spb / bs) + 8, k = 0, lanes = {};
      for (var b = 0; b < total; b++) {
        var midi = [];
        while (k < ev.length && ev[k][0] * spb < (b + 1) * bs) {
          midi.push({ offset: Math.max(0, Math.round(ev[k][0] * spb - b * bs)), data: ev[k][1] }); k++;
        }
        fx.setTime({ beat: b * bs / spb, seconds: b * bs / sr });
        fx.process(bs, null, null, midi).forEach(function (m) {
          if ((m.data[0] & 0xF0) !== 0xB0) return;
          var beat = (b * bs + m.offset) / spb;
          if (beat > a.length) return;
          (lanes[m.data[1]] = lanes[m.data[1]] || []).push([Math.round(beat * 1000) / 1000, m.data[2]]);
        });
      }
      Object.keys(lanes).forEach(function (num) {
        var pts = lanes[num], out = [];
        pts.forEach(function (pt, i) {
          var prev = out[out.length - 1];
          if (!prev || i === pts.length - 1 || Math.abs(pt[1] - prev[1]) >= 2) out.push(pt);
        });
        lanes[num] = out;
      });
      return lanes;
    }
  };

  G.MiddawHost = {
    FILES: FILES,
    init: init,
    // The one entry point the native side uses: JSON in, JSON out, errors
    // returned rather than thrown so they cross the bridge as text.
    call: function (method, argsJSON) {
      try {
        if (!M[method]) throw new Error('no method ' + method);
        var r = M[method](argsJSON ? JSON.parse(argsJSON) : {});
        return JSON.stringify({ ok: true, value: r === undefined ? null : r });
      } catch (e) {
        var msg = e && (e.message || (e.value !== undefined ? String(L.tostring ? L.tostring(e.value) : e.value) : String(e)));
        return JSON.stringify({ ok: false, error: msg || 'error' });
      }
    },
    methods: M
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);


/* ---- ../kit/ui.js ---- */
/* The family's look, drawn with Max's mgraphics in a [v8ui].
 *
 * Colours are Palette's (palette.js), after Ableton Live 8: neutral greys,
 * the amber accent for what is on, every word 7:1 on its surface. A control
 * registers its rectangle while it is painted, so a click goes to whatever
 * was drawn under it last paint - no layout is kept twice.
 */
var UI = (function () {
  'use strict';
  function rgb(hex, a) {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, a === undefined ? 1 : a];
  }
  // The colours are Palette's (palette.js): Live 8's neutral greys and amber.
  var P = Palette.C;
  var C = {
    accent: rgb(P.accent), accentHeld: rgb(P.accentHeld), control: rgb(P.control), controlHeld: rgb(P.controlHeld),
    ground: rgb(P.ground), raised: rgb(P.raised), sunken: rgb(P.sunken), rule: rgb(P.rule),
    edge: rgb(P.edge), ink: rgb(P.ink), text: rgb(P.text), dim: rgb(P.dim),
    label: rgb(P.label), warn: rgb(P.warn), warnText: rgb(P.warnText), mark: rgb(P.mark), note: rgb(P.note)
  };

  var g = null, hits = [], drag = null, FONT = 'Arial';

  function begin(graphics) {
    g = graphics;
    hits = [];
    g.select_font_face(FONT);
  }
  function fill(c) { g.set_source_rgba(c[0], c[1], c[2], c[3]); }
  function rect(x, y, w, h, c) { fill(c); g.rectangle(x, y, w, h); g.fill(); }
  function round(x, y, w, h, r, c) { fill(c); g.rectangle_rounded(x, y, w, h, r, r); g.fill(); }
  function frame(x, y, w, h, c) { fill(c); g.set_line_width(1); g.rectangle(x + 0.5, y + 0.5, w - 1, h - 1); g.stroke(); }
  function measure(s, size) { g.set_font_size(size || 10); var m = g.text_measure(String(s)); return m[0]; }

  // Text cut to fit, with an ellipsis, so a long name never runs into the next control.
  function fit(s, w, size) {
    s = String(s);
    if (measure(s, size) <= w) return s;
    while (s.length > 1 && measure(s + '…', size) > w) s = s.slice(0, -1);
    return s + '…';
  }
  // align: 0 left, 1 centre, 2 right; y is the box top, h its height.
  function text(s, x, y, w, h, c, size, align, bold) {
    size = size || 10;
    g.select_font_face(FONT, 'normal', bold ? 'bold' : 'normal');
    g.set_font_size(size);
    var t = fit(s, w, size), tw = measure(t, size);
    var tx = align === 1 ? x + (w - tw) / 2 : align === 2 ? x + w - tw : x;
    fill(c);
    g.move_to(tx, y + h / 2 + size * 0.36);
    g.show_text(t);
    g.select_font_face(FONT, 'normal', 'normal');
  }

  function hit(x, y, w, h, handler) { hits.push({ x: x, y: y, w: w, h: h, fn: handler }); }
  function find(px, py) {
    for (var i = hits.length - 1; i >= 0; i--) {
      var r = hits[i];
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return r;
    }
    return null;
  }

  // A push button: title-style words, ink on the control grey, accent when on.
  function button(label, x, y, w, h, on, handler, enabled) {
    var off = enabled === false;
    round(x, y, w, h, 3, off ? C.raised : on ? C.accent : C.control);
    text(label, x + 4, y, w - 8, h, off ? C.dim : C.ink, 10, 1, true);
    if (!off) hit(x, y, w, h, { click: handler });
  }

  // A value chosen from a list: click the left third for the one before, the
  // rest for the one after, or drag up and down through them.
  function stepper(label, names, index, x, y, w, onChange) {
    text(label, x, y, w, 12, C.label, 9, 0);
    var by = y + 13, bh = 18;
    round(x, by, w, bh, 3, C.sunken);
    frame(x, by, w, bh, C.rule);
    text('‹', x + 3, by, 8, bh, C.dim, 11, 1);
    text('›', x + w - 11, by, 8, bh, C.dim, 11, 1);
    text(names[index - 1] === undefined ? '' : names[index - 1], x + 12, by, w - 24, bh, C.text, 10, 1);
    var n = names.length;
    var last = index;
    function to(i) { i = Math.max(1, Math.min(n, i)); if (i !== last) { last = i; onChange(i); } }
    hit(x, by, w, bh, {
      click: function (px) { to(px < x + w / 3 ? index - 1 : index + 1); },
      drag: function (dy) { to(index - Math.round(dy / 8)); }
    });
  }

  // The same, in one line for a small panel (a MIDI Tool's): the label at
  // the left, the value at the right, the arrows at the ends.
  function row(label, names, index, x, y, w, h, onChange) {
    round(x, y, w, h, 3, C.sunken);
    frame(x, y, w, h, C.rule);
    text('‹', x + 1, y, 8, h, C.dim, 10, 1);
    text('›', x + w - 9, y, 8, h, C.dim, 10, 1);
    var lw = Math.round((w - 18) * 0.42);
    text(label, x + 10, y, lw - 2, h, C.label, 9, 0);
    text(names[index - 1] === undefined ? '' : names[index - 1], x + 10 + lw, y, w - 20 - lw, h, C.text, 9, 2);
    var n = names.length, last = index;
    function to(i) { i = Math.max(1, Math.min(n, i)); if (i !== last) { last = i; onChange(i); } }
    hit(x, y, w, h, {
      click: function (px) { to(px < x + w / 3 ? index - 1 : index + 1); },
      drag: function (dy) { to(index - Math.round(dy / 8)); }
    });
  }

  function toggle(label, on, x, y, w, h, onChange) {
    round(x, y, w, h, 3, on ? C.accent : C.control);
    text(label, x + 4, y, w - 8, h, C.ink, 10, 1, true);
    hit(x, y, w, h, { click: function () { onChange(!on); } });
  }

  // Mouse, as [v8ui] delivers it: onclick then ondrag until the button is up.
  function click(px, py) {
    var r = find(px, py);
    drag = null;
    if (!r) return false;
    if (r.fn.drag) drag = { r: r, y0: py, moved: false };
    else if (r.fn.click) r.fn.click(px, py);
    return true;
  }
  function dragTo(px, py, down) {
    if (!drag) return;
    var dy = drag.y0 - py;
    if (down) {
      if (Math.abs(dy) >= 4) drag.moved = true;
      if (drag.moved) drag.r.fn.drag(dy);
    } else {
      if (!drag.moved && drag.r.fn.click) drag.r.fn.click(px, py);
      drag = null;
    }
  }

  return { C: C, begin: begin, rect: rect, round: round, frame: frame, text: text, fit: fit, measure: measure,
           hit: hit, button: button, stepper: stepper, row: row, toggle: toggle, click: click, dragTo: dragTo, find: find };
})();


/* ---- ../kit/live.js ---- */
/* The Live set, as the family's devices need it: the song's tempo, meter and
 * scale, the notes of the clip being edited, somewhere to put new notes, and
 * a way to hear notes before they are used.
 *
 * Everything goes through the Live Object Model (LiveAPI). Times are beats,
 * which in Live are quarter notes - the unit every family engine already
 * speaks - so nothing is converted but the field names.
 */
var Live = (function () {
  'use strict';
  function api(path) { return new LiveAPI(null, path); }
  function one(a, prop) { var v = a.get(prop); return Array.isArray(v) ? v[0] : v; }
  function exists(a) { return a && Number(a.id) !== 0; }
  function json(v) {
    if (typeof v === 'string') return JSON.parse(v);
    if (Array.isArray(v) && typeof v[0] === 'string' && v.length === 1) return JSON.parse(v[0]);
    return v;
  }

  // Live 12's scale names, as ScaleView numbers its scales (1-16). A scale
  // ScaleView has no name for is left out: the device keeps its own key.
  var SCALE = {
    'Major': 1, 'Minor': 2, 'Harmonic Minor': 3, 'Dorian': 5, 'Phrygian': 6, 'Lydian': 7,
    'Mixolydian': 8, 'Major Pentatonic': 10, 'Minor Pentatonic': 11, 'Minor Blues': 13,
    'Whole Tone': 14, 'Whole-half Dim.': 15, 'Half-whole Dim.': 16
  };
  // ScaleView's eighteen roots, and the spelling a key on each pitch class
  // takes: flats for the major side, sharps where a minor key has them.
  var ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'Cb'];
  var MAJOR_SIDE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MINOR_SIDE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  var MINORISH = { 2: 1, 3: 1, 5: 1, 6: 1, 11: 1, 13: 1 };
  var SCALE_NAMES = ['Major', 'Minor (Natural)', 'Harmonic Minor', 'Ionian', 'Dorian', 'Phrygian', 'Lydian',
                     'Mixolydian', 'Aeolian', 'Major Pentatonic', 'Minor Pentatonic', 'Major Blues', 'Minor Blues',
                     'Whole Tone', 'Diminished Whole-Half', 'Diminished Half-Whole'];

  // Live's scale (a root pitch class and a name) as the family's key, or
  // null for a scale ScaleView does not have.
  function keyOf(pc, name) {
    var sc = SCALE[String(name)];
    if (!sc) return null;
    return { root: ROOTS.indexOf((MINORISH[sc] ? MINOR_SIDE : MAJOR_SIDE)[((+pc % 12) + 12) % 12]) + 1, scale: sc };
  }

  function song() {
    var s = api('live_set');
    var out = { tempo: +one(s, 'tempo') || 120, num: +one(s, 'signature_numerator') || 4,
                den: +one(s, 'signature_denominator') || 4, playing: !!+one(s, 'is_playing'),
                position: +one(s, 'current_song_time') || 0, key: null };
    var mode = s.get('scale_mode');
    if (mode !== undefined && mode !== null) {
      var name = String(one(s, 'scale_name')), pc = +one(s, 'root_note');
      out.liveScale = { on: !!+(Array.isArray(mode) ? mode[0] : mode), name: name, root: pc };
      out.key = keyOf(pc, name);
    }
    return out;
  }

  function detailClip() {
    var c = api('live_set view detail_clip');
    if (!exists(c) || !+one(c, 'is_midi_clip')) return null;
    return c;
  }

  // The clip being edited: its selected notes if any are selected, else every
  // note in its loop. Starts are from the start of what was taken.
  function clipNotes() {
    var c = detailClip();
    if (!c) return null;
    var from = +one(c, 'loop_start') || 0, to = +one(c, 'loop_end') || 0;
    var raw = null, selected = false;
    try { raw = json(c.call('get_selected_notes_extended')); selected = raw && raw.notes && raw.notes.length > 0; } catch (e) { raw = null; }
    if (!selected) raw = json(c.call('get_notes_extended', 0, 128, from, Math.max(0, to - from)));
    var notes = ((raw && raw.notes) || []).filter(function (n) { return !n.mute; }).map(function (n) {
      return { start: n.start_time, len: n.duration, pitch: n.pitch, vel: Math.round(n.velocity) };
    });
    var first = selected && notes.length ? Math.min.apply(null, notes.map(function (n) { return n.start; })) : from;
    var beats = to - from;
    if (selected) {
      var bar = 4, end = 0;
      notes.forEach(function (n) { end = Math.max(end, n.start + n.len); });
      first = Math.floor(first / bar) * bar;
      beats = Math.ceil((end - first) / bar) * bar;
    }
    notes.forEach(function (n) { n.start -= first; });
    notes.sort(function (a, b) { return a.start - b.start || a.pitch - b.pitch; });
    return { notes: notes, beats: beats, name: String(one(c, 'name') || ''), selected: selected, drums: drumTrack() };
  }

  // A track whose instrument is a Drum Rack plays drums: its note numbers name
  // drums, not pitches, and the engines treat them that way.
  function drumTrack() {
    try {
      var track = api('this_device canonical_parent'), n = track.getcount('devices');
      for (var i = 0; i < n; i++) if (+one(api(track.unquotedpath + ' devices ' + i), 'can_have_drum_pads')) return true;
    } catch (e) { /* not known: not drums */ }
    return false;
  }

  function liveNotes(notes) {
    return { notes: notes.map(function (n) {
      return { pitch: Math.max(0, Math.min(127, Math.round(n.pitch))), start_time: Math.max(0, n.start),
               duration: Math.max(1 / 128, n.len), velocity: Math.max(1, Math.min(127, Math.round(n.vel || 100))), mute: 0 };
    }) };
  }

  function undoable(fn) {
    var s = api('live_set');
    try { s.call('begin_undo_step'); } catch (e) { /* Live before 11.1 */ }
    try { return fn(); } finally { try { s.call('end_undo_step'); } catch (e2) { /* as above */ } }
  }

  function show(clip) {
    try { api('live_set view').set('detail_clip', 'id', Number(clip.id)); } catch (e) { /* the clip is made either way */ }
  }

  function selectedScene() {
    var scene = api('live_set view selected_scene'), n = api('live_set').getcount('scenes');
    for (var i = 0; i < n; i++) if (Number(api('live_set scenes ' + i).id) === Number(scene.id)) return i;
    return 0;
  }
  function thisTrack() {
    var track = api('this_device canonical_parent');
    if (!exists(track) || !+one(track, 'has_midi_input')) return null;
    return track;
  }
  // Where this device's track is in the set, for putting new tracks beside it.
  function trackIndex(track) {
    var n = api('live_set').getcount('tracks');
    for (var i = 0; i < n; i++) if (Number(api('live_set tracks ' + i).id) === Number(track.id)) return i;
    return n - 1;
  }
  function clipInSlot(slot, notes, beats, name) {
    slot.call('create_clip', Math.max(1, beats));
    var clip = api(slot.unquotedpath + ' clip');
    if (name) clip.set('name', name);
    clip.call('add_new_notes', liveNotes(notes));
    return clip;
  }
  function freeSlot(track, from) {
    var n = track.getcount('clip_slots');
    for (var k = 0; k < n; k++) {
      var at = (from + k) % n, slot = api(track.unquotedpath + ' clip_slots ' + at);
      if (!+one(slot, 'has_clip')) return { slot: slot, at: at };
    }
    return null;
  }
  function arrangementClipOn(track, notes, beats, name, at) {
    var before = track.getcount('arrangement_clips');
    try { track.call('create_midi_clip', at, Math.max(1, beats)); } catch (e) { /* checked below */ }
    var count = track.getcount('arrangement_clips');
    if (!(count > before)) return false;
    for (var i = 0; i < count; i++) {
      var clip = api(track.unquotedpath + ' arrangement_clips ' + i);
      if (Math.abs((+one(clip, 'start_time') || 0) - at) < 1e-6) {
        if (name) clip.set('name', name);
        clip.call('add_new_notes', liveNotes(notes));
        return true;
      }
    }
    return false;
  }

  // New notes, as a new clip in the first free slot on this device's track,
  // from the selected scene down. `more` are further parts ({name, notes}),
  // each on a new MIDI track after this one, in the same scene. Returns what
  // happened, for the status line.
  function newClip(notes, beats, name, more) {
    var track = thisTrack();
    if (!track) return { ok: false, message: 'This device needs to be on a MIDI track.' };
    var free = freeSlot(track, selectedScene());
    if (!free) return { ok: false, message: 'Every clip slot on this track is full. Add a scene, then try again.' };
    return undoable(function () {
      var clip = clipInSlot(free.slot, notes, beats, name);
      var made = newTracks(track, more, function (t) {
        clipInSlot(api(t.unquotedpath + ' clip_slots ' + free.at), this.notes, beats, this.name);
      });
      show(clip);
      return { ok: true, message: 'Added a clip in scene ' + (free.at + 1) + (made ? ', and ' + made + ' on new tracks beside it.' : '.') };
    });
  }

  // New notes on a new MIDI track beside this one, in the selected scene:
  // a suggestion goes with the music it was made for, not over it.
  function newTrackClip(notes, beats, name, more) {
    var track = thisTrack();
    if (!track) return { ok: false, message: 'This device needs to be on a MIDI track.' };
    var scene = selectedScene();
    return undoable(function () {
      var parts = [{ name: name, notes: notes }].concat(more || []);
      newTracks(track, parts, function (t) { show(clipInSlot(api(t.unquotedpath + ' clip_slots ' + scene), this.notes, beats, this.name)); });
      return { ok: true, message: parts.length === 1 ? 'Added a track beside this one, with the clip in scene ' + (scene + 1) + '.'
                                                     : 'Added ' + parts.length + ' tracks beside this one, with the clips in scene ' + (scene + 1) + '.' };
    });
  }

  // Each further part on a new MIDI track, in order, after this one.
  function newTracks(track, more, put) {
    if (!more || !more.length) return '';
    var at = trackIndex(track), song = api('live_set');
    more.forEach(function (part, k) {
      song.call('create_midi_track', at + 1 + k);
      var t = api('live_set tracks ' + (at + 1 + k));
      t.set('name', part.name);
      put.call(part, t);
    });
    return more.length === 1 ? 'one more part' : more.length + ' more parts';
  }

  // New notes in place of the notes of the clip being edited, from its loop start.
  function replaceInClip(notes, beats) {
    var c = detailClip();
    if (!c) return { ok: false, message: 'No MIDI clip is open. Open one in Detail View, then try again.' };
    var from = +one(c, 'loop_start') || 0;
    return undoable(function () {
      var span = Math.max(beats, (+one(c, 'loop_end') || 0) - from);
      c.call('remove_notes_extended', 0, 128, from, span);
      c.call('add_new_notes', liveNotes(notes.map(function (n) {
        return { start: n.start + from, len: n.len, pitch: n.pitch, vel: n.vel };
      })));
      if ((+one(c, 'loop_end') || 0) < from + beats) c.set('loop_end', from + beats);
      return { ok: true, message: 'Replaced the notes in “' + (String(one(c, 'name') || '') || 'the clip') + '”.' };
    });
  }

  // New notes in the Arrangement at the insert marker, on this device's track
  // (Track.create_midi_clip, Live 12.2 and later); further parts as above.
  function arrangementClip(notes, beats, name, more) {
    var track = thisTrack();
    if (!track) return { ok: false, message: 'This device needs to be on a MIDI track.' };
    var at = +one(api('live_set'), 'current_song_time') || 0;
    return undoable(function () {
      if (!arrangementClipOn(track, notes, beats, name, at)) {
        return { ok: false, message: 'This version of Live can\u2019t add Arrangement clips from a device. Choose New Clip instead.' };
      }
      var made = newTracks(track, more, function (t) { arrangementClipOn(t, this.notes, beats, this.name, at); });
      return { ok: true, message: 'Added a clip to the Arrangement at beat ' + (Math.round(at * 100) / 100 + 1) +
               (made ? ', and ' + made + ' on new tracks beside it.' : '.') };
    });
  }

  // ------------------------------------------------------------ player ---
  // Notes heard through this device's MIDI out: the instrument after it on
  // the track plays them. A Task ticks every few milliseconds and sends what
  // is due; nothing waits on the transport.
  function Player(send) {
    this.send = send; this.events = []; this.pos = 0; this.t0 = 0; this.task = null; this.sounding = {};
    this.onEnd = null;
  }
  Player.prototype.play = function (notes, tempo, onEnd) {
    this.stop();
    var ms = 60000 / (tempo || 120), ev = [];
    notes.forEach(function (n) {
      ev.push({ t: n.start * ms, on: true, pitch: n.pitch, vel: n.vel || 100 });
      ev.push({ t: (n.start + n.len) * ms - 1, on: false, pitch: n.pitch });
    });
    ev.sort(function (a, b) { return a.t - b.t || (a.on === b.on ? 0 : a.on ? 1 : -1); });
    this.events = ev; this.pos = 0; this.t0 = Date.now(); this.onEnd = onEnd || null;
    var self = this;
    this.task = new Task(function () { self.tick(); }, this);
    this.task.interval = 4;
    this.task.repeat();
    this.tick();
  };
  Player.prototype.tick = function () {
    var now = Date.now() - this.t0;
    while (this.pos < this.events.length && this.events[this.pos].t <= now) {
      var e = this.events[this.pos++];
      if (e.on) { this.sounding[e.pitch] = (this.sounding[e.pitch] || 0) + 1; this.send([0x90, e.pitch, Math.max(1, Math.min(127, Math.round(e.vel)))]); }
      else if (this.sounding[e.pitch]) { this.sounding[e.pitch]--; this.send([0x80, e.pitch, 0]); }
    }
    if (this.pos >= this.events.length) {
      var end = this.onEnd;
      this.stop();
      if (end) end();
    }
  };
  Player.prototype.playing = function () { return !!this.task; };
  Player.prototype.stop = function () {
    if (this.task) { this.task.cancel(); this.task.freepeer && this.task.freepeer(); this.task = null; }
    var self = this;
    Object.keys(this.sounding).forEach(function (p) {
      for (var i = 0; i < self.sounding[p]; i++) self.send([0x80, +p, 0]);
    });
    this.sounding = {};
    this.onEnd = null;
  };

  return { song: song, clipNotes: clipNotes, newClip: newClip, newTrackClip: newTrackClip, replaceInClip: replaceInClip,
           arrangementClip: arrangementClip, drumTrack: drumTrack, Player: Player, ROOTS: ROOTS, SCALE_NAMES: SCALE_NAMES,
           keyOf: keyOf };
})();


/* ---- ../kit/miditool.js ---- */
/* A family engine as a Live 12 MIDI Tool: in the clip view's Generate or
 * Transform panel, beside Live's own.
 *
 * Live hands the tool the clip's notes and a context (the time selection,
 * the clip's scale, the grid, a seed for this apply) through
 * [live.miditool.in]; [dict.join] makes them one dictionary, and this answers
 * at once with the notes to write, through [live.miditool.out]:
 *   - a Generator (DEVICE.tool 'generate') writes the chosen result into the
 *     time selection, repeated to fill it; Live adds it to what is there;
 *   - a Transformation ('transform') replaces the notes it was given: with a
 *     variation of them, or (DEVICE.beside) with them and a suggestion that
 *     goes with them.
 * The key is the clip's scale when the clip has one ScaleView knows, else the
 * tool's own Key and Scale. The engine is the repository's own Lua, run
 * unchanged by Middaw's Lua runtime, spoken to through Noterator's adapter,
 * exactly as in the MIDI effect (generator.js).
 *
 * Changing a setting asks Live for the notes again (a bang to
 * [live.miditool.in], a moment later: from inside an apply it would nest).
 *
 * Expects, before it: Palette, UI, Live, MiddawHost, and DEVICE = { generator,
 * tool, files }. Outlets: 0 the notes to [live.miditool.out], 1 the saved
 * state to [pattr], 2 a bang to [live.miditool.in].
 */
inlets = 1;
outlets = 3;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var H = MiddawHost;
H.init(function (p) { return DEVICE.files[p] === undefined ? null : DEVICE.files[p]; },
       function (s) { post(s + '\n'); });

function call(method, args) {
  var r = JSON.parse(H.call(method, args === undefined ? '' : JSON.stringify(args)));
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

var GEN = null;
call('generators').forEach(function (g) { if (g.id === DEVICE.generator) GEN = g; });
var TRANSFORM = DEVICE.tool === 'transform';

var T = {
  session: call('newSession', { generator: DEVICE.generator }),
  key: { root: 1, scale: 1 },   // the tool's own, for a clip with no scale
  clipKey: null,                // the clip's, from the last apply
  song: { tempo: 120, num: 4, den: 4 },
  settings: [], results: [], pick: 1, part: 0, inst: 'pno', page: 0,
  input: null, applied: false, wrote: 0, status: '', warn: false, ready: false, pending: null
};

function say(msg, warn) { T.status = msg || ''; T.warn = !!warn; }
function keyName(k) { return Live.ROOTS[k.root - 1] + ' ' + Live.SCALE_NAMES[k.scale - 1]; }
function barBeats() { return T.song.num * 4 / T.song.den; }
function key() { return T.clipKey || T.key; }

function context() {
  var sel = T.input || { notes: [], beats: 0 };
  var k = key();
  return { root: k.root, scale: k.scale, num: T.song.num, den: T.song.den, barBeats: barBeats(), bpm: T.song.tempo,
           inst: T.inst, catalogueId: T.inst, bars: 4,
           selection: { notes: sel.notes, beats: sel.beats, drums: false } };
}

// The settings a tool shows: which result, the engine's own, then the parts
// and the instrument where the engine has them, then the key (only when the
// clip has none of its own, or it would be a control that does nothing).
var OWN_KEY = { root: 1, scale: 1, key: 1 };
var EXTRA = { asax: 1, tsax: 1, bsax: 1, vib: 1, sop: 1, alto: 1, ten: 1, bass: 1, gtr: 1, ebass: 1, ubass: 1, synth: 1, kit: 1 };
var INSTRUMENTS = DEVICE.instrument ? call('instruments').filter(function (i) { return !EXTRA[i.id]; }) : [];
function partNames() {
  var most = [];
  T.results.forEach(function (r) { if (r.parts.length > most.length) most = r.parts; });
  return most.length > 1 ? ['All Parts'].concat(most.map(function (p, i) { return p.name || ('Part ' + (i + 1)); })) : null;
}
function rows() {
  var out = [];
  // DEVICE.short: a result is named by what comes before its first wide gap
  // (Starting Blocks' numeral: "IV  C Major IV Chord Triad" is IV).
  var names = T.results.length ? T.results.map(function (r, i) {
    var t = r.title || String(i + 1);
    return DEVICE.short ? t.split('  ')[0] : t;
  }) : ['1'];
  if (T.pick > names.length) T.pick = 1;
  out.push({ id: '$pick', label: DEVICE.result || 'Result', names: names, index: T.pick });
  if (INSTRUMENTS.length) {
    var at = 0;
    INSTRUMENTS.forEach(function (x, i) { if (x.id === T.inst) at = i; });
    out.push({ id: '$inst', label: 'Instrument', names: INSTRUMENTS.map(function (x) { return x.name; }), index: at + 1 });
  }
  T.settings.forEach(function (s) { out.push(s); });
  var parts = partNames();
  if (parts) {
    if (T.part >= parts.length) T.part = 0;
    out.push({ id: '$part', label: 'Part', names: parts, index: T.part + 1 });
  }
  if (!DEVICE.keyless && !T.clipKey) {
    out.push({ id: '$root', label: 'Key', names: Live.ROOTS, index: T.key.root });
    out.push({ id: '$scale', label: 'Scale', names: Live.SCALE_NAMES, index: T.key.scale });
  }
  return out;
}

function refresh() {
  call('useKey', { session: T.session, key: key() });
  T.settings = call('settings', { session: T.session, context: context() }).filter(function (s) { return !OWN_KEY[s.id]; });
}

// Before Live has asked for anything, a generator lists what it would write
// in the tool's own key, so Result names something.
function preview() {
  if (TRANSFORM || T.applied) return;
  T.results = call('generate', { session: T.session, context: context(), seed: 1, count: 8 }).results || [];
}

function readSong() {
  try { var s = Live.song(); T.song = { tempo: s.tempo, num: s.num, den: s.den }; } catch (e) { /* not in Live */ }
}

// ------------------------------------------------------------ the apply --
// Live's notes (start_time, duration...) as the engines' (start, len...),
// from the start of what the tool was given.
function fromLive(notes, base) {
  return notes.filter(function (n) { return !+n.mute; }).map(function (n) {
    return { start: +n.start_time - base, len: +n.duration, pitch: +n.pitch, vel: Math.round(+n.velocity || 100) };
  }).sort(function (a, b) { return a.start - b.start || a.pitch - b.pitch; });
}
function toLive(n, base) {
  return { pitch: Math.max(0, Math.min(127, Math.round(n.pitch))), start_time: base + n.start,
           duration: Math.max(1 / 64, n.len), velocity: Math.max(1, Math.min(127, Math.round(n.vel || 100))) };
}
// Where the tool writes: the time selection, else (a transformation) the
// bars the notes it was given cover, else (a generator) four bars.
function span(d, notes) {
  var c = d.clip || d;
  var a = +c.time_selection_start, b = +c.time_selection_end;
  if (b > a) return { base: a, beats: b - a };
  var bar = barBeats();
  if (!TRANSFORM || !notes.length) return { base: a > 0 ? a : 0, beats: bar * 4 };
  var lo = Infinity, hi = 0;
  notes.forEach(function (n) { lo = Math.min(lo, +n.start_time); hi = Math.max(hi, +n.start_time + +n.duration); });
  var base = Math.floor(lo / bar) * bar;
  return { base: base, beats: Math.max(bar, Math.ceil((hi - base) / bar) * bar) };
}
function clipScale(d) {
  var s = d.scale || {};
  var on = Array.isArray(s.scale_mode) ? s.scale_mode[0] : s.scale_mode;
  return +on ? Live.keyOf(s.root_note, s.scale_name) : null;
}
function chosen() {
  var r = T.results[T.pick - 1];
  if (!r) return null;
  var parts = T.part > 0 && r.parts[T.part - 1] ? [r.parts[T.part - 1]] : r.parts;
  var all = [];
  parts.forEach(function (p) { p.notes.forEach(function (n) { all.push(n); }); });
  return { notes: all, beats: r.beats || 4, title: r.title || GEN.name };
}

// What the tool writes for one apply. Returns Live's notes.
function compute(d) {
  readSong();
  var given = (d.notes || []).slice();
  var at = span(d, given);
  var ck = clipScale(d);
  T.clipKey = ck;
  T.input = TRANSFORM ? { notes: fromLive(given, at.base), beats: at.beats } : { notes: [], beats: at.beats };
  var keep = TRANSFORM ? given : [];   // what a transformation leaves if it has nothing to say
  if (TRANSFORM && !T.input.notes.length) { say('Select notes to change first.'); return keep; }
  var seed = 1 + Math.abs(Math.round(+d.seed || 0)) % 99999;
  refresh();
  var r = call('generate', { session: T.session, context: context(), seed: seed, count: 8 });
  T.results = r.results || [];
  var c = chosen();
  if (!c || !c.notes.length) { say(r.message || 'Nothing fits these settings. Change one, then try again.', !r.message); return keep; }
  var out = [];
  if (TRANSFORM) {
    // A variation replaces what it was given; a suggestion goes with it.
    if (DEVICE.beside) given.forEach(function (n) { out.push(n); });
    c.notes.forEach(function (n) {
      if (n.start < at.beats) out.push(toLive({ start: n.start, len: Math.min(n.len, at.beats - n.start), pitch: n.pitch, vel: n.vel }, at.base));
    });
  } else {
    // A block fills the time selection, repeated as a pattern is.
    var len = c.beats > 0 ? c.beats : at.beats;
    for (var k = 0; k * len < at.beats; k++) {
      c.notes.forEach(function (n) {
        var st = k * len + n.start;
        if (st < at.beats - 1e-9) out.push(toLive({ start: st, len: Math.min(n.len, at.beats - st), pitch: n.pitch, vel: n.vel }, at.base));
      });
    }
  }
  T.wrote = out.length - (DEVICE.beside ? given.length : 0);
  say(c.title);
  return out;
}

function send(notes) {
  var body = { notes: notes };
  if (typeof outlet_dictionary === 'function') { outlet_dictionary(0, body); return; }
  var dct = new Dict();
  dct.parse(JSON.stringify(body));
  outlet(0, 'dictionary', dct.name);
}

// The joined notes and context. v8 hands a dictionary to msg_dictionary as an
// object when the function exists; dictionary(name) is the older route.
function msg_dictionary(d) { applyFrom(d); }
function dictionary(name) {
  var d = null;
  try { d = JSON.parse(new Dict(String(name)).stringify()); } catch (e) { d = null; }
  if (d) applyFrom(d);
}
function applyFrom(d) {
  var notes;
  try { notes = compute(d); } catch (e) { say(String(e.message || e), true); notes = TRANSFORM ? (d.notes || []) : []; }
  T.applied = true;
  send(notes);
  mgraphics.redraw();
}

// Ask Live to apply again, after this message is done.
var again = new Task(function () { outlet(2, 'bang'); });
function reapply() { if (T.applied) again.schedule(1); }

// ------------------------------------------------------------ messages --
function bang() {
  T.ready = true;
  if (T.pending) { restoreFrom(T.pending); T.pending = null; }
  readSong();
  try { refresh(); preview(); }
  catch (e) { say(String(e.message || e), true); }
  if (!T.status) say(TRANSFORM ? 'Select notes, then Transform.' : 'Choose, then click Generate.');
  mgraphics.redraw();
}
function save() {
  outlet(1, 'set', JSON.stringify({ v: 1, st: call('snapshot', { session: T.session }), key: T.key,
                                    pick: T.pick, part: T.part, inst: T.inst }));
}
function restore(text) {
  var st = null;
  try { st = JSON.parse(String(text)); } catch (e) { return; }
  if (!T.ready) { T.pending = st; return; }
  restoreFrom(st);
  mgraphics.redraw();
}
function restoreFrom(st) {
  if (!st || st.v !== 1) return;
  if (st.st) call('restore', { session: T.session, state: st.st });
  if (st.key) T.key = st.key;
  T.pick = st.pick || 1;
  T.part = st.part || 0;
  if (st.inst) T.inst = st.inst;
  refresh();
  preview();
}
function choose(id, index) {
  if (id === '$pick') T.pick = index;
  else if (id === '$part') T.part = index - 1;
  else if (id === '$inst') T.inst = INSTRUMENTS[index - 1].id;
  else if (id === '$root') T.key = { root: index, scale: T.key.scale };
  else if (id === '$scale') T.key = { root: T.key.root, scale: index };
  else call('set', { session: T.session, setting: id, index: index, context: context() });
  try {
    refresh();
    preview();
  } catch (e) { say(String(e.message || e), true); }
  save();
  reapply();
  mgraphics.redraw();
}

// --------------------------------------------------------------- paint --
var ROW_H = 17, GAP = 1, TOP = 16;
function size() {
  var r = (typeof box !== 'undefined' && box.rect) ? box.rect : [0, 0, 152, 147];
  return [r[2] - r[0], r[3] - r[1]];
}
function paint() {
  var g = mgraphics, sz = size(), W = sz[0], Ht = sz[1];
  UI.begin(g);
  UI.rect(0, 0, W, Ht, UI.C.ground);
  UI.text(T.status || GEN.name, 3, 0, W - 6, TOP - 2, T.warn ? UI.C.warnText : UI.C.dim, 9, 0);
  var all = rows();
  var per = Math.max(1, Math.floor((Ht - TOP - ROW_H - GAP) / (ROW_H + GAP)));
  if (all.length <= per + 1) per = all.length;
  var pages = Math.max(1, Math.ceil(all.length / per));
  if (T.page >= pages) T.page = 0;
  all.slice(T.page * per, (T.page + 1) * per).forEach(function (s, i) {
    UI.row(s.label, s.names, s.index, 2, TOP + i * (ROW_H + GAP), W - 4, ROW_H, function (k) { choose(s.id, k); });
  });
  if (pages > 1) {
    var y = Ht - ROW_H - 1, bw = 22;
    UI.button('‹', 2, y, bw, ROW_H, false, function () { T.page = (T.page + pages - 1) % pages; mgraphics.redraw(); });
    UI.text('Settings ' + (T.page + 1) + ' of ' + pages, 2 + bw, y, W - 4 - 2 * bw, ROW_H, UI.C.dim, 9, 1);
    UI.button('›', W - 2 - bw, y, bw, ROW_H, false, function () { T.page = (T.page + 1) % pages; mgraphics.redraw(); });
  }
}
function onclick(x, y) { if (UI.click(x, y)) mgraphics.redraw(); }
function ondrag(x, y, but) { UI.dragTo(x, y, !!but); }

