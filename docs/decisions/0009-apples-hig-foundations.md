# 0009. Apple's HIG Foundations are the standard for the window

Taken 2026-10-15. Stands.

## Context

The user asked for every repository to follow Apple's Human Interface
Guidelines, as Transient Shuffler does, and sent the 19 Foundations pages.
Wording was already done (0008). Checked against the rest, the window fell
short on contrast, text size, control size, the keyboard, colour alone, and
where its messages sat ([`docs/apple-hig-review.md`](../apple-hig-review.md)).

## Decision

- **Contrast.** Every line of text is at least 7:1 on the ground, Apple's
  target for small text in a dark window: secondary text is `#B0B6C0`,
  warnings `#FF9E96`. The house red `#D2483F` and the ramp's `#8A919C` are
  no longer used for words. Disabled text keeps `#8A919C`; Apple exempts it.
- **Text Size** in a View menu: 100%, 125%, 150%, 200%, with Cmd+=, Cmd+- and
  Cmd+0. Every fixed width goes through `px()`, and `fit()` never makes a
  button narrower than its label. Saved with the preferences, clamped on load.
- **The system's sans-serif at 13 points**, the Mac's default size.
- **Controls 28 points tall, 12 apart** (Apple's Mac default size and
  spacing), pushed with the font before `Begin`.
- **Keyboard navigation** (`ConfigFlags_NavEnableKeyboard`), its ring in the
  near-white `#F2F4F7`: yellow means *on*, and a focused control need not be.
- **Not colour alone**: a chosen button carries an ink bar under its label.
- **The message at the top**, until dismissed or replaced.

## Consequences

- The window is taller and wider at the same content; rows of choices wrap.
- Every new control goes through `pick()`/`chooser()`, so it gets the sizes,
  the ink and the chosen bar for nothing. A fixed width must go through `px()`.
- Not met, because a script can't: VoiceOver, Dynamic Type, Increase
  Contrast, right to left. Escape still closes the window.
- Unverified in REAPER: the zoom keys reaching the window, and which face
  "sans-serif" resolves to.

## Final sweep, 16 October 2026 (1.3)

Every Foundations guideline checked again
([`apple-hig-review.md`](../apple-hig-review.md#final-sweep-16-october-2026)),
with the family's shared decisions:

- **Menus and tooltips a step lighter** than the window (`#2A2F37`, edge
  `#3A404A`); the menu bar, its highlight and the resize corner from the
  ramp, not ImGui's. Menu keys in `#BFC5CE`, 7:1 on the menu.
- **Controls' edges 3:1**: the box's edge `#8A919C`, the scrollbar thumb
  `#6D7581`.
- **Rows wrap** (`rowStart`/`place`/`button`/`words`) and secondary text is
  `TextWrapped`; a minimum window size.
- **Escape** lets go of the keyboard's place or a menu before it closes the
  window. This reverses "Escape still closes the window" above.
- **Asking first** (`letGo`): new suggestions or closing over chord edits
  ask in REAPER's dialog; *Put Back as Suggested* can be undone.
- Bold step headings; the title names the item; a line names the roll's
  notes; hints for every chord rhythm, density and register.
