# Midi Suggester

A REAPER script that listens to a MIDI item and suggests what goes with it.

- **Import a melody** and it suggests **chord progressions** to go under it.
- **Import a chord progression** and it suggests **melodies** to go over it.

Pick a suggestion, hear it played against your original, and drop it onto a
new track lined up bar for bar.

It works out by itself whether the item is a melody or chords, and what key
it is in. Both are shown, and both can be changed with one click if it has
guessed wrong.

## Installing

**1. Install ReaImGui.** The script will not start without it.

In REAPER: Extensions -> ReaPack -> Browse packages, search for `ReaImGui`,
right-click it and Install. Then Extensions -> ReaPack -> Apply changes, and
restart REAPER.

If you have no ReaPack, get it from [reapack.com](https://reapack.com), put
the file it gives you in `UserPlugins` inside the resource path below, restart,
and then do the above.

**2. Put all six files in one folder under Scripts.**

Options -> Show REAPER resource path in explorer/finder, then into `Scripts/`.
Make a folder and put these six in it together:

```
Scripts/Midi Suggester/
  Midi Suggester.lua
  ms_theory.lua
  ms_read.lua
  ms_harmony.lua
  ms_melody.lua
  ms_place.lua
```

They are all in the [`reascripts`](reascripts) folder of this repository.

**3. Load it.** Actions -> Show action list -> New action -> Load ReaScript,
and pick `Midi Suggester.lua`. Put it on a toolbar or a key if you like: its
button lights up while the window is open.

## Using it

1. **Get your MIDI in.** Drag a `.mid` file onto a track (or record
   something). REAPER turns it into a MIDI item.
2. **Select that item** and run Midi Suggester. If the window is already
   open, press **Use selected item**.
3. **Check the two guesses** at the top: is it a *Melody* or *Chords*, and is
   the *Key* right? Click to change either.
4. **Pick a suggestion** from the list. The picture underneath shows your
   notes in grey and the suggestion in yellow.
5. Press **Audition** to hear it with your original, **Insert on new track**
   to keep it, or **More ideas** for a different set.

### For a melody - chord progressions

| Control | What it does |
| --- | --- |
| **Change chord** | How often the chord changes: twice a bar, once a bar, or every two bars. |
| **Chords from** | *Triads* - the seven basic chords of the key. *Sevenths* - those plus their seventh chords. *Colourful* - those plus chords borrowed from the minor/major key (like the bVII in rock) and "secondary dominants" that lead strongly into the next chord. |
| **Bass note** | Adds each chord's root, low down. |

Each suggestion shows the progression as Roman numerals (I IV V ...), the
chord names in your key, and how much of your melody lands on the chord's own
notes ("fits 100%").

For *Twinkle Twinkle Little Star* in C, two chords a bar, the first
suggestion is the one in every songbook:

```
I IV I IV I V I     C F C F C G C     fits 100%
I V vi I IV I V I   C G Amin C F C G C
I ii I IV vi V I    C Dmin C F Amin G C
```

### For chords - melodies

| Control | What it does |
| --- | --- |
| **Notes** | *Sparse* (long notes), *Medium*, or *Busy* (quick runs). |
| **Register** | Where the tune sits: low, middle or high. |

The melodies follow the rules songwriters use: a chord note on every strong
beat, mostly small steps, a leap answered by a step back, a shape that rises
and comes home, a rhythm that repeats like a real tune does, and a last note
on the key's home note.

### What "Insert on new track" does

It adds a new track right under your original, named after the suggestion
(for example `Chords: C F C G`), with the MIDI lined up with your original
bar for bar. **The new track gets a copy of your original track's
instrument**, so it plays straight away - change it to whatever you like.
It is one undo step: Ctrl+Z (Cmd+Z) takes it all back.

### What "Audition" does

It puts the suggestion on a temporary track and plays your project from the
start of your item, so you hear the suggestion together with the original.
Press **Stop** (or stop REAPER) and the temporary track disappears again, and
the edit cursor goes back to where it was.

## If something goes wrong

**It says it needs ReaImGui.** The extension is not installed, or REAPER has
not been restarted since it was.

**It says "Select a MIDI item first".** Click the item in the arrange view
so it is highlighted, then press **Use selected item**. Audio items are not
MIDI - it needs a MIDI item.

**It cannot find `ms_theory.lua`** (or another `ms_` file). The six files are
not all in the same folder.

**It guessed melody when it is chords (or the other way round).** Click the
right one next to *It is*. Chords played one note at a time (arpeggios) can
look like a melody.

**It guessed the wrong key.** Click the right one. Short melodies are the
hardest: the first phrase of *Ode to Joy* ends on D and genuinely sounds as
much like D minor as C major until the tune continues.

**Audition makes no sound.** The temporary track copies your original
track's instrument. If the original track has no instrument on it (the MIDI
is going out to hardware, say), the preview has none either - use Insert
instead, and set up the new track's output.

## For developers

Everything musical is plain Lua with no REAPER in it, and is tested outside
REAPER:

```
tools/test.sh          # every test suite
lua5.4 tools/demo.lua  # what it suggests for the test tunes, printed
```

[`CLAUDE.md`](CLAUDE.md) explains how it is put together and why;
[`docs/decisions`](docs/decisions) records the choices that shaped it.
