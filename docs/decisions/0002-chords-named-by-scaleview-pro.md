# 0002. Chords are named by ScaleView Pro's reader, copied unchanged

Taken 2026-09-27. Stands.

## Context

A chord progression that is imported has to be named, and so does every
chord this script suggests. ScaleView Pro already names chords from their
notes, measured at 99.999% over 1.2 million sonorities of real music, and was
chosen over a table-based engine after the two were built side by side.

## Decision

Copy its reader - `CORE_RANK` through `analyse`, and `detectChord` with the
key passed in rather than read from globals - into `ms_theory.lua`,
unchanged, and use it for both the chords read and the chords suggested.

## Consequences

- The user's tools agree: a chord is called the same thing in ScaleView and
  here.
- The weights are not tuned here. A change goes into ScaleView, is measured
  against its corpora, and is copied across. `test_theory.lua` carries
  ScaleView's own expected names to catch a copy that drifted.
- One exception, deliberately: a suggested root from outside the key is
  spelled the way its numeral is (bVII in C is `Bb`, not `A#`).

## Alternatives

**Name suggestions from their construction** (root + "m7" and so on).
Rejected: two vocabularies in one window, `Am` in one list and `Amin` in the
other, and a second naming scheme to keep correct.

**A shared library file used by both repos.** Rejected for now: ScaleView
keeps its scripts as independent single files on purpose, and ReaPack
installs them that way.
