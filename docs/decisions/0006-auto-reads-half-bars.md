# 0006. Auto chord timing reads half bars, not beats

Taken 2026-09-27. Stands.

## Context

Asked for: chord suggestions whose timing follows the melody, so chords can
be different lengths, in the manner of Wingman by Mixed In Key. The fixed
rhythms (2 a bar, 1 a bar, 1 per 2 bars) already let a chord hold across
changes; what was missing was changes placed by the tune.

## Decision

**Auto** reads the melody in half bars - whole bars where a bar does not
divide into two equal halves of beats (3/4, 5/8). A change on the bar line
is free; a change on the half bar costs `CHANGE_HALF` (-0.25) and has to be
earned by the melody. Chords hold for as long as the tune lets them.

## Consequences

Chords come out half a bar, a bar or several bars long: the minor test tune
gives `Amin | Dmin E | Amin Amin`. No chord ever changes on beat two or four.

## Alternatives

**A beat-by-beat grid, with a cost per beat by how strong it is.** Built
first and abandoned, measured. Every change also collects a reward for
moving well (T -> S -> D), so the finer the grid the more changes paid for
themselves: the minor tune changed chord on nine of its sixteen beats, and
kept doing so at every beat cost tried (-0.45 to -1.5) short of forbidding
changes there. Scaling each beat's fit by its length, and treating only the
bar and half bar as accented, each helped and neither stopped it. Tonal and
pop harmony changes on the bar and half bar anyway, so the grid was made to
match rather than fought.
