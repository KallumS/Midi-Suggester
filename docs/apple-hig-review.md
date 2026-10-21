# Review against Apple's Human Interface Guidelines: Foundations

Midi Suggester checked against all 19 Foundations pages (the user's copy,
October 2026), the same review Transient Shuffler had. Writing was done
first, on its own ([0008](decisions/0008-window-text-follows-apples-writing-guidelines.md));
this covers the rest ([0009](decisions/0009-apples-hig-foundations.md)).

The window is drawn by ReaImGui inside REAPER, so some guidance cannot apply:
a script cannot reach VoiceOver, Dynamic Type or Increase Contrast, or read the
system's appearance. Where a guideline is not met for that reason, this says
so rather than counting it as met.

## What changed (1.2)

| Guideline | Before | Now |
| --- | --- | --- |
| **Accessibility: the keyboard alone** | Mouse only. | Keyboard navigation is on: Tab and the arrow keys move between controls, Space or Return presses one, and a near-white ring shows where you are. |
| **Accessibility, Typography: larger text** | One fixed size. | **View → Text Size**: 100%, 125%, 150% or 200%, also Cmd+= and Cmd+- (Ctrl on Windows), Cmd+0 for 100%. Remembered between runs. Buttons grow with the text and rows wrap at the window's edge. |
| **Typography: default size** | ReaImGui's own font. | The system's sans-serif at 13 points, the Mac's default text size. |
| **Accessibility: control size and spacing** | Buttons 19 points tall, 8 apart. | 28 points tall (Apple's Mac default) with 12 between them. |
| **Accessibility, Dark Mode: contrast** | Secondary text 4.7:1, warnings 3.4:1. | Every line of text is at least 7:1, the target for small text in a dark window: secondary text `#B0B6C0` (7.4:1), warnings `#FF9E96` (7.6:1). The house red is no longer used for words. |
| **Accessibility, Color: more than colour alone** | A chosen button was shown only by being yellow. | It also has a dark bar under its label. |
| **Layout: nothing important at the bottom of a window** | The message line came last, under the roll. | It sits at the top, above step 1. |
| **Accessibility: avoid time-boxed elements** | (Messages stayed, but could not be cleared.) | A message stays until **Dismiss**, or a newer one replaces it. |

## Already met

- **Design principles.** One job, three numbered steps in reading order,
  only step 1 until something is read. Insert is one REAPER undo step; *Put
  Back as Suggested* undoes chord edits. The original item is never changed.
- **Feedback.** Controls change on hover and press; the playhead moves while
  auditioning; Audition turns into Stop.
- **Playback you control.** Nothing plays until Audition is clicked, and Stop
  (or REAPER's own stop) ends it.
- **Colour.** One yellow, meaning *chosen* on a button and *what you would add*
  in the roll ([0005](decisions/0005-source-grey-suggestion-yellow.md)); the
  source is grey. In the roll the two also differ in lightness (3.96:1 and
  15:1 on the roll's ground), not only hue.
- **Dark Mode.** Always dark. Apple allows this for apps built around media,
  and advises against an app-only appearance setting; it is also the house
  scheme.
- **Writing.** Decision 0008.
- **Motion.** Nothing animates except the playhead, which follows playback.
- **Privacy.** Nothing is collected or sent. Only preferences are saved, in
  REAPER's own settings.
- **Inclusion.** Plain musical words; the tooltips explain each choice.

## Not met, because a ReaImGui script can't

- **VoiceOver, Voice Control and Switch Control** cannot read a ReaImGui
  window.
- **Dynamic Type and Increase Contrast** cannot be read from a script. Text
  Size and the 7:1 colours stand in for them.
- **Right to left.** The window is English only; time runs left to right, as in
  every DAW.
- **Escape closes the window**, as in every window in the family, rather than
  only letting go of the keyboard focus.

## Not relevant

Materials (Liquid Glass), app icons, icons and SF Symbols, images, spatial
layout and immersive experiences: the window has none of these.

## Unverified in REAPER

- Whether REAPER hands Cmd+=, Cmd+- and Cmd+0 to the window (the View menu
  does the same either way).
- Which face "sans-serif" gives on each system (Helvetica or San Francisco on
  a Mac, Segoe UI or Arial on Windows).

## Checked by

`tests/test_ui.lua`: keyboard navigation on; 13-point text, 28-point
controls, 12 points apart; every line of text 7:1 on the ground and every
button's ink 7:1 on its fill; the message above step 1 and still there twenty
frames later until dismissed; a bar on every chosen button; the View menu's
sizes, the keys, every button wide enough for its label at 200%, and the size
saved and clamped. Each was broken on purpose and the suite failed.

## Final sweep (16 October 2026)

Every guideline in the 19 Foundations pages that a ReaImGui window can act
on, checked again one by one, with the family's shared decisions applied.
Fixed in 1.3.

| Guideline (page) | Verdict |
| --- | --- |
| Text 7:1, Text Size to 200%, 13 pt, 28-pt controls 12 apart, the keyboard alone, chosen bar, message at the top (Accessibility, Typography, Layout) | Met (1.2) |
| No text under 10 pt, axis or footnote included (Typography) | Met: every word is 13 pt at 100% |
| A menu's words 7:1, its keys too (Accessibility) | **Fixed**: ImGui draws the keys (Cmd+=) in the "disabled" colour, 4.2:1 on the menu; now `#BFC5CE`, 7.8:1 |
| Surfaces in front a step lighter (Dark Mode) | **Fixed**: menus and tooltips `#1B1F25` → `#2A2F37`, edge `#3A404A` |
| Every grey blue-shifted (house) | **Fixed**: the menu bar, menu highlight and resize corner were ImGui's own neutral grey and blue; the test now checks every theme colour R < G < B (it did not before) |
| Non-text contrast 3:1 for controls (Accessibility, Color) | **Fixed**: the Bass Note box's edge (was 1.1:1, now `#8A919C` 4.7:1), the scrollbar thumb (2.6:1 → `#6D7581` 3.6:1), the resize corner. Source notes 4.0:1, focus ring 13.6:1: met |
| Colour never alone (Accessibility, Color) | **Fixed**: a line under the roll says the darker notes are the source and the bright ones the suggestion, and names the shaded chord. The two also differ in lightness, which any eyes see |
| Grid lines in the roll (Color) | Not applicable: decorative; the bar count is in words and the chord row lines up with the bars |
| Text wraps rather than being cut off at 200% (Layout, Typography) | **Fixed**: rows of buttons and long lines wrap at the window's edge; at 200% the bottom row and the eight swap choices used to run off it |
| Minimum window size (Layout) | **Fixed**: 400 × 300 points, grown with the text |
| Truncation shows the full text (Typography) | Met: no label is ever narrower than its text |
| Hierarchy by weight (Typography: Headline is 13-pt bold) | **Fixed**: step headings bold |
| Leading for multi-line text (Typography) | Not possible: ReaImGui has no line-spacing setting |
| Icons and lines grow with the text (Accessibility) | **Fixed**: the playhead; grid lines sit on whole pixels (Images) |
| Hit targets, icon-only controls (Accessibility) | Not applicable: every control is a framed button with words |
| Escape lets go before it closes (Accessibility: familiar keys) | **Fixed**: with the keyboard on a control or the View menu open, Esc lets go of that; only with nothing held does it close the window |
| Nothing that can't be undone without asking (Accessibility, Design principles) | **Fixed**: chord edits live only in the window, and new suggestions or closing threw them away. Now REAPER's own dialog asks first (which VoiceOver can read). *Put Back as Suggested* can be undone with *Restore the Changes* |
| Window title (Accessibility: what VoiceOver can read) | **Fixed**: "Midi Suggester — <item>" |
| Jargon explained (Inclusion) | **Fixed**: every chord-rhythm, note-density and register choice has a hint; *Auto* says what it does |
| Words: "we", idioms, gendered or ableist words, "OK" buttons (Writing, Inclusion) | Met: none in the window |
| Sound: plays only when asked, Stop always where Audition was, a playhead (Accessibility) | Met |
| Mouse-only actions (Accessibility) | Met: there are none |
| System shortcuts (Accessibility) | Met: only Cmd+=, Cmd+-, Cmd+0 and Esc |
| No time limits; no flashing; motion (Accessibility, Motion) | Met: only the playhead moves, and it follows playback |
| Errors beside the control (Writing) | User's decision: messages sit at the top until dismissed (0009) |
| Selection dims when the window isn't focused; recolouring (Color) | User's decision: the three house colours are settled |
| Controls that appear and disappear (Design principles) | User's decision: "no dead controls" |
| Light page, zebra rows, centred content in wide windows | Not applicable: no page, a short list, the roll uses the width |
| VoiceOver, Dynamic Type, Increase Contrast, system appearance, SF Symbols, Liquid Glass, right to left | Not possible from a script (as above) |
| App icons, images, immersive, spatial, privacy beyond "nothing is collected" | Not applicable |

Checked by `tests/test_ui.lua`; each of twenty rules was broken on purpose
in a copy and the suite failed every time.
