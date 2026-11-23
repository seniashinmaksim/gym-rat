# Gym Rat — design system (Part 6, 2026-11-23)

One page. Every screen follows it; shared pieces live in `src/ui/components/ui.tsx` and
`src/ui/train/`. Tokens are CSS variables in `src/index.css` and Tailwind names in `tailwind.config.js`.

## 1. Principles

1. **One primary action per screen.** It is the largest, filled, lowest control in the thumb zone. Nothing shares its row.
2. **Numbers first.** A number is the biggest thing on the screen; its label is small, uppercase and above it.
3. **The training mode is a different room.** Near-black, one hot accent, no navigation, no cards with secondary text.
   The rest of the app keeps light / dark and the same type and spacing system.
4. **Honest motivation.** Colour and size celebrate only what the owner's own numbers show (`+1`, `BEST`). No praise text.
5. **Nothing destructive next to something constructive.** Opposite consequences are never neighbours.
6. **Every value is editable, every removal has Undo.** Warnings never block.

## 2. Type

Two families, both from the system (no network fonts — the CSP forbids them):

- `font-display` — condensed, heavy, UPPERCASE, tabular numerals: `'Avenir Next Condensed', 'HelveticaNeue-CondensedBold',
  'Roboto Condensed', 'Bahnschrift', 'Arial Narrow', system-ui`. Used for numbers, screen titles in training mode, primary buttons, labels.
- `font-sans` — the system UI font. Used for body text, forms, explanations.

| Token | Size / line | Use |
|---|---|---|
| `text-hero` | 96 / 0.9 (clamp 72–120 px) | rest-timer digits |
| `text-num-xl` | 56 / 1 | weight and reps being entered |
| `text-num-lg` | 36 / 1 | logged-set chips, Week table numbers |
| `text-title` | 28 / 1.1 | exercise name (training), page title |
| `text-body` | 15 / 1.45 | text |
| `text-label` | 11 / 1.2, uppercase, tracking 0.12em, weight 700 | labels above numbers, section heads |
| `text-note` | 12 / 1.4 | secondary notes |

Numbers always use `tabular-nums`. Russian words are longer: labels never rely on a fixed width; buttons wrap to two lines before they truncate.

## 3. Spacing and shape

4-px grid: 4 · 8 · 12 · 16 · 24 · 32 · 48. Screen gutter 16 px (phones), 24 px (≥ 640 px).
Radius: 12 px controls, 16 px cards, full for chips. Borders 1 px; in training mode borders replace shadows.

## 4. Colour tokens

App (light / dark, unchanged structure): `ink-*` neutrals, `accent-*` for links and selected states.

Training theme (always dark; independent of the app theme), CSS variables on `.train`:

| Variable | Value | Use |
|---|---|---|
| `--t-bg` | `#0a0a0b` | background |
| `--t-surface` | `#151518` | steppers, chips |
| `--t-line` | `#2a2a30` | borders |
| `--t-text` | `#ffffff` | numbers, names |
| `--t-dim` | `#a1a1aa` | labels, last-time line (contrast 7.6 : 1 on bg) |
| `--t-accent` | preset | primary button, ring, deltas |
| `--t-on-accent` | `#0a0a0b` | text on the accent |
| `--t-good` | `#4ade80` | `+n`, `BEST` |
| `--t-warn` | `#fbbf24` | rest overrun, `−n` |
| `--t-danger` | `#f87171` | remove, pain |

Accent presets (`settings.trainAccent`): **Ember** `#ff5a1f` (default) · **Volt** `#c6f432` · **Ice** `#38bdf8`.
All three give ≥ 4.5 : 1 against `--t-bg` and ≥ 7 : 1 for `--t-on-accent` text on them.

## 5. Buttons

| Level | Look | Min size | Examples |
|---|---|---|---|
| **Primary** | filled accent, `font-display`, uppercase | 64 px high, full width | LOG SET · NEXT SET · NEXT EXERCISE · START |
| **Secondary** | surface fill, 1 px line | 52 px high | −15 / +15, effort answers, ONE MORE SET |
| **Quiet** | text only, dim | 48 × 48 px | ← back, ⋯ menu, Skip rest |
| **Destructive** | outline in `--t-danger`, never filled | 48 px | Remove set, Delete workout |
| **Finish** | outline in `--t-text`, not filled | 56 px | Finish workout (overview only) |

Rules checked by the e2e suite on every training state:
- exactly one primary button is visible;
- Finish and every removing control are ≥ 24 px away from the primary button and never on the set-entry or rest screen;
- no two tap targets are closer than 12 px; main actions ≥ 56 px high, others ≥ 48 px (375-px phones: steppers may shrink to 44 px wide, never lower).

States: pressed = scale 0.98 + 8 % darker; disabled = 40 % opacity; focus-visible = 2 px accent outline. A just-logged set briefly flashes the accent (150 ms); a new best flashes `--t-good`. No other motion except the timer ring. `prefers-reduced-motion` removes the flashes.

## 6. Training mode screens

```
SET ENTRY                      REST                          OVERVIEW
←   12:34   2 / 6   ⋯          ←   14:02   2 / 6            ← Back to set      14:02
PEC DECK                       PEC DECK · set 2 logged       1 Incline press   3 / 3  ✓
Technogym · seat 4             ┌──────────────┐              2 Pec deck        2 / 3  ●
LAST TIME  60 × 12 · 11 · 10   │              │              3 Lat pulldown    0 / 3
TODAY      3 × 60 × 12–13      │    2:14      │              ...  (⋯: Later · Busy · Replace ·
[1 60×13 +1] [2 60×11 =]       │              │                    Change · Skip · ↑ ↓)
WEIGHT                         └──────────────┘              + Add exercise
[−2.5]   60 kg   [+2.5]        [−15]          [+15]
‹ruler, swipe›                 HOW WAS IT?
REPS                           [EASY][GOOD][HARD][FAILED]
[ − ]     12     [ + ]         More…           Skip rest      ─────── 24 px+ ───────
[        LOG SET        ]      [       NEXT SET        ]      (  Finish workout  )
```

- Top line: quiet back button (to the overview), the workout clock (starts at the first logged set), exercise n / N.
- The weight control: big number (tap to type), a swipeable ruler snapping to the machine's step, and ± step buttons. The step chip (`2.5 kg`) opens the step chooser, remembered per machine.
- Logged sets are chips: number, weight × reps, and the delta against the same set last time. Tap a chip to edit or remove (Undo).
- After the exercise's target is reached the primary button becomes NEXT EXERCISE and ONE MORE SET is secondary above it.
- The overview holds everything else: reorder, Later, Machine busy, Replace, Change exercise, Skip, Add exercise, session details, and Finish workout at the very end.

## 7. App screens (light / dark)

Same type scale and spacing. Page title `text-title`; the Week table uses `text-num-lg` for done / target and a `text-label`
status. Cards: 16 px radius, 16 px padding, one title, no nested cards. Lists use 52-px rows. Forms: 48-px fields, labels above.
Language (EN / RU) and theme toggles sit together at the top right (header on phones, sidebar on desktop, and on the lock screen).

## 8. Accessibility and devices

Text contrast ≥ 4.5 : 1; targets as in section 5; safe-area insets respected at the top and bottom of the training mode;
landscape keeps the primary button visible (two-column layout); the rest timer keeps the screen awake where the browser allows.
