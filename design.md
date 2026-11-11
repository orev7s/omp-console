# omp.console design system

Status: v1.0, implemented. This is the visual and UX contract for the omp.console
Android app. It is specific enough that a future agent can build a new screen and
match. If code and this document disagree, one of them is a bug.

Scope: the Android app (React Native, no Expo). The backend has no UI. Phase 1 is
connectivity and onboarding, so this covers the onboarding flow and the connected
shell, and leaves room for sessions, monitoring, files, and terminal.

Sources, in priority order:

1. The brand identity package (`OMP-console-identity`, guidelines v1.0). The
   palette, the name, the voice, and the logo rules come from here and are
   authoritative.
2. The `ux-skill` engine, run on brand Signal `#F0561E`
   (`apps/android/docs/design-brief.json`). Used for the WCAG gate and to derive
   the functional status ramps that the brand does not define.
3. `android-ux` and `mobile-design-android` (Material 3) for platform shape,
   targets, motion, and accessibility.

Where the engine's output and the brand differ, the brand wins. Two deliberate
divergences from the engine are noted in sections 3 and 4.

---

## 1. Product and brand direction

omp.console is the surface you reach your machines from. Oh My Pi agents run on
servers you own. The console is the pane of glass in your hand: it connects, it
stays connected, and it lets you steer.

Point of view: this is a connection tool, not a dashboard. The connection is the
hero. Everything technical (port, TLS mode, protocol frames) is real but
secondary, and stays behind an explicit door until the user asks for it.

Personality: quiet, exact, always live. Editorial, not corporate. Technical, not
hacker. Confident enough to use one colour and a lot of space.

Three brand elements carry through the UI:

- The tile: the console, a contained surface.
- The pi mark: the agent, drawn as equipment.
- The node: one live session, a square, the only orange thing at rest.

Product name: written lowercase as `omp.console` in running UI. `OMP Console` only
where a sentence needs a proper noun or in legal text.

The brand's one sentence: Orange means live. If everything is orange, nothing is.

### What the app must never feel like

A developer panel. A settings page. A terminal. A generic Material template. See
section 11.

---

## 2. Color system

Two neutrals and one signal, from the brand guidelines. Every screen colour comes
from a semantic token; primitives are used only to build the semantics and a few
tinted surfaces. Ratio: 60% neutral surface, 30% type and structure, 10% signal.
In practice, one orange element per view.

### 2.1 Primitives

| Token | Hex | Role |
| --- | --- | --- |
| ink | `#14161A` | type, the tile, dark surfaces |
| paper | `#FAF8F3` | light surface, reversed type |
| bone | `#F1EDE4` | secondary surface, rules, fills |
| signal | `#F0561E` | the node: accent, live state, focus |
| signalDeep | `#C4451A` | signal as small text on light |
| graphite | `#4A4D53` | secondary text, captions |

Ink surface ladder for dark UI surfaces (from the brand foundations):
`#14161A`, `#1B1E23`, `#23272D`, `#2E3238`, `#3A3E45`.

Derived neutrals and functional ramps (engine, gated):

| Token | Hex | Use |
| --- | --- | --- |
| paperLift | `#FFFEFB` | card on paper |
| inkCard | `#1E2228` | card on ink |
| inkSunken | `#0F1114` | inset input on ink |
| lineLight | `#8B867C` | control border on paper |
| textTertiaryLight | `#6E7178` | metadata on paper |
| textDisabledLight | `#A8A49B` | disabled on paper |
| textSecondaryDark | `#B4B0A7` | supporting text on ink |
| textTertiaryDark | `#8A877F` | metadata on ink |
| textDisabledDark | `#5C5F66` | disabled on ink |
| danger | `#A8271B` | errors on paper |
| dangerDark | `#EF7A6D` | errors on ink |
| warning | `#8A5A00` | caution on paper |
| warningDark | `#E0A23C` | caution on ink |
| signalSoftLight | `#FBE7DD` | signal tint surface (light) |
| dangerSoftLight | `#F6E4E1` | danger tint surface (light) |
| warningSoftLight | `#F7EFD9` | warning tint surface (light) |
| signalSoftDark | `#3A241C` | signal tint surface (dark) |
| dangerSoftDark | `#34201E` | danger tint surface (dark) |
| warningSoftDark | `#2E2411` | warning tint surface (dark) |

### 2.2 Semantic tokens, light

| Token | Value | Use |
| --- | --- | --- |
| color.bg.canvas | paper `#FAF8F3` | app background |
| color.bg.card | paperLift `#FFFEFB` | grouped surfaces, sheets |
| color.bg.sunken | bone `#F1EDE4` | inset inputs, code fields |
| color.bg.tint | signalSoftLight `#FBE7DD` | signal-tinted surface |
| color.text.primary | ink `#14161A` | default text |
| color.text.secondary | graphite `#4A4D53` | supporting text |
| color.text.tertiary | `#6E7178` | metadata, captions |
| color.text.disabled | `#A8A49B` | disabled text |
| color.text.onSignal | ink `#14161A` | label on the signal fill (5.22:1) |
| color.text.onDanger | `#FFFFFF` | label on the danger fill (7.07:1) |
| color.accent | signal `#F0561E` | primary fill, live node, focus |
| color.accent.text | signalDeep `#C4451A` | accent text and links (4.70:1) |
| color.border.hairline | `rgba(20,22,26,0.12)` | dividers, card edges |
| color.border.control | `#8B867C` | input and control edges (3.41:1) |
| color.border.strong | graphite `#4A4D53` | emphasis edge |
| color.focus | signal `#F0561E` | focus ring |
| color.status.live | signal `#F0561E` | connected |
| color.status.live.text | signalDeep `#C4451A` | connected text (4.70:1) |
| color.status.live.soft | signalSoftLight `#FBE7DD` | live surface |
| color.status.pending | `#6E7178` | connecting, reconnecting |
| color.status.danger | `#A8271B` | errors, destructive (6.66:1) |
| color.status.danger.soft | `#F6E4E1` | error surface |
| color.status.danger.on | `#FFFFFF` | label on danger fill |
| color.status.warning | `#8A5A00` | caution (5.58:1) |
| color.status.warning.soft | `#F7EFD9` | caution surface |
| color.status.info | graphite `#4A4D53` | neutral hint (7.99:1) |
| color.status.info.soft | bone `#F1EDE4` | neutral hint surface |
| color.insecure | `#8A5A00` | unencrypted indicator |
| color.insecure.soft | `#F7EFD9` | unencrypted banner |
| color.insecure.border | `#B87912` | unencrypted banner edge |

### 2.3 Semantic tokens, dark

| Token | Value | Use |
| --- | --- | --- |
| color.bg.canvas | ink `#14161A` | app background |
| color.bg.card | inkCard `#1E2228` | grouped surfaces, sheets |
| color.bg.sunken | inkSunken `#0F1114` | inset inputs, code fields |
| color.bg.tint | signalSoftDark `#3A241C` | signal-tinted surface |
| color.text.primary | paper `#FAF8F3` | default text |
| color.text.secondary | `#B4B0A7` | supporting text |
| color.text.tertiary | `#8A877F` | metadata, captions |
| color.text.disabled | `#5C5F66` | disabled text |
| color.text.onSignal | ink `#14161A` | label on the signal fill (5.22:1) |
| color.text.onDanger | ink `#14161A` | label on the danger fill (6.62:1) |
| color.accent | signal `#F0561E` | primary fill, live node, focus |
| color.accent.text | signal `#F0561E` | accent text and links (5.22:1) |
| color.border.hairline | `rgba(250,248,243,0.12)` | dividers, card edges |
| color.border.control | `#6E7178` | input and control edges (3.71:1) |
| color.border.strong | `#B4B0A7` | emphasis edge |
| color.focus | signal `#F0561E` | focus ring |
| color.status.live | signal `#F0561E` | connected |
| color.status.live.text | signal `#F0561E` | connected text (5.22:1) |
| color.status.live.soft | signalSoftDark `#3A241C` | live surface |
| color.status.pending | `#8A877F` | connecting, reconnecting |
| color.status.danger | `#EF7A6D` | errors, destructive (6.62:1) |
| color.status.danger.soft | `#34201E` | error surface |
| color.status.danger.on | ink `#14161A` | label on danger fill |
| color.status.warning | `#E0A23C` | caution (8.11:1) |
| color.status.warning.soft | `#2E2411` | caution surface |
| color.status.info | `#B4B0A7` | neutral hint (8.37:1) |
| color.status.info.soft | inkCard `#1E2228` | neutral hint surface |
| color.insecure | `#E0A23C` | unencrypted indicator |
| color.insecure.soft | `#2E2411` | unencrypted banner |
| color.insecure.border | `#8A5A00` | unencrypted banner edge |

### 2.4 Contrast results

Measured with the WCAG 2.1 relative luminance formula. Normal text 4.5:1, large
text and UI boundaries 3:1.

Light:

| Pair | Ratio | Result |
| --- | --- | --- |
| text.primary on canvas | 17.07:1 | AAA |
| text.primary on card | 17.96:1 | AAA |
| text.secondary on canvas | 7.99:1 | AAA |
| text.secondary on card | 8.40:1 | AAA |
| text.tertiary on canvas | 4.61:1 | AA |
| text.onSignal on accent | 5.22:1 | AA |
| accent.text on canvas | 4.70:1 | AA |
| accent on canvas | 3.27:1 | large text and UI only |
| border.control on canvas | 3.41:1 | UI pass |
| status.danger on canvas | 6.66:1 | AAA |
| status.warning on canvas | 5.58:1 | AA |
| status.info on canvas | 7.99:1 | AAA |
| status.danger on danger.soft | 5.76:1 | AA |
| status.warning on warning.soft | 5.17:1 | AA |
| ink on signal.soft | 15.16:1 | AAA |

Dark:

| Pair | Ratio | Result |
| --- | --- | --- |
| text.primary on canvas | 17.07:1 | AAA |
| text.primary on card | 15.75:1 | AAA |
| text.secondary on canvas | 8.37:1 | AAA |
| text.secondary on card | 7.73:1 | AAA |
| text.tertiary on canvas | 5.05:1 | AA |
| text.onSignal on accent | 5.22:1 | AA |
| accent on canvas | 5.22:1 | AA (also fine for text) |
| accent on card | 4.82:1 | AA |
| border.control on canvas | 3.71:1 | UI pass |
| status.danger on canvas | 6.62:1 | AAA |
| status.warning on canvas | 8.11:1 | AAA |
| status.info on canvas | 8.37:1 | AAA |
| status.danger on danger.soft | 5.60:1 | AA |
| status.warning on warning.soft | 6.83:1 | AA |

Disabled text is exempt from contrast minimums and is intentionally low.

### 2.5 Colour rules

- One orange element per view. Signal is the primary action, the live node, and
  focus. If two orange things compete, demote one.
- Signal as text on Paper is 3.27:1, which is allowed for icons and large type
  only. Use `accent.text` (Signal Deep) for small accent text, or Ink on a Signal
  tint.
- Never set Signal text on a Signal tint at small sizes (it drops below 4.5:1).
  On a Signal tint, use Ink or Graphite.
- Status is never colour alone. Every state has a dot, an icon, or a word.
- Borders carry structure in dark mode; shadows are lifted and subtle in light.
- No gradients, glass, glow, or shadows on the logo.

---

## 3. Typography

### 3.1 Family

From the brand guidelines:

- UI, body, labels: **Inter**, 400/500 body, 600 labels. Tighten tracking by
  -0.01em at display sizes.
- Code, host names, logs: **JetBrains Mono**, 400/500. Never used for product
  copy.
- Fallback stack: `Inter, "Helvetica Neue", Arial, sans-serif`.

The wordmark is artwork (SVG or PNG), not a font. It is the only "designed" type
object on any screen.

Both faces are bundled with the app as static weights (Inter 400/500/600/700,
JetBrains Mono 400/500). Web harness note: the browser build self-hosts the same
files behind `@font-face`. Divergence from the engine: the engine proposed Space
Grotesk and IBM Plex; the brand sets Inter and JetBrains Mono, so those are used.

### 3.2 Scale

Base scale from the brand: 32 / 24 / 19 / 16 / 14 / 12 px. Line height 1.2 for
headings, 1.45 for body.

| Token | Size | Weight | Line height | Tracking | Use |
| --- | --- | --- | --- | --- | --- |
| type.display | 32 | 700 | 1.15 | -0.32 | Welcome headline |
| type.title1 | 24 | 700 | 1.2 | -0.24 | Screen title |
| type.title2 | 19 | 600 | 1.25 | -0.19 | Section header, server name |
| type.body | 16 | 400 | 1.45 | 0 | body copy, input text |
| type.bodyStrong | 16 | 600 | 1.45 | 0 | emphasis |
| type.label | 14 | 600 | 1.35 | 0 | field labels, buttons |
| type.caption | 12 | 400 | 1.45 | 0 | helper, error, metadata |
| type.overline | 12 | 600 | 1.3 | +1.2 | small uppercase section labels |
| type.code | 22 | 600 | 1.2 | +4 | pairing code |
| type.mono | 13 | 400 | 1.5 | 0 | debug log |
| type.monoLabel | 12 | 600 | 1.4 | +0.8 | technical labels (uppercase) |

### 3.3 Rules

- One display moment per screen. Welcome gets `display`; other screens start at
  `title1` or lower.
- Sentence case everywhere. Field labels are `label`, not a heading.
- No uppercase except `overline` and `monoLabel`, both rare.
- No eyebrow kicker above the headline.
- Keep sentences short rather than shrink the type. Never set UI text below
  weight 400.

---

## 4. Spacing, radius, elevation, borders

### 4.1 Spacing

Base 4. Every gap, pad, and margin is a step; no magic numbers in screens.

| Token | Value | Use |
| --- | --- | --- |
| space.1 | 4 | icon to label |
| space.2 | 8 | within a control |
| space.3 | 12 | related fields |
| space.4 | 16 | standard inset |
| space.5 | 20 | card padding |
| space.6 | 24 | between groups |
| space.8 | 32 | between sections |
| space.10 | 40 | screen rhythm |
| space.12 | 48 | large separation |
| space.16 | 64 | hero breathing room |

Rule: space around a group exceeds space within it. Screen padding is `space.4`
on phones, `space.5` at 600 dp and up.

### 4.2 Radius

Material 3 shape scale, chosen over the engine's near-zero corners because this
is a touch UI and razor corners read as unfinished. The brand's superellipse tile
(`n = 4.2`) is the exception and lives only in the logo and the launcher icon.

| Token | Value | Use |
| --- | --- | --- |
| radius.xs | 4 | tiny badges |
| radius.sm | 8 | code chip, small tags |
| radius.md | 12 | buttons, inputs, rows |
| radius.lg | 16 | cards, banners |
| radius.2xl | 28 | sheets |
| radius.full | 999 | pills, chips, dots |

### 4.3 Elevation

Light: soft layered shadows, four steps. Dark: no shadows, surface tone and
hairlines carry depth. Commit to this per mode.

| Token | Use |
| --- | --- |
| elevation.0 | flat: canvas, and all cards in dark |
| elevation.1 | cards in light, sticky footer edge |
| elevation.2 | popovers |
| elevation.3 | sheets, dialogs |

### 4.4 Borders

| Token | Value | Use |
| --- | --- | --- |
| border.hairline | 1 px `border.hairline` | dividers, card edges |
| border.control | 1 px `border.control` | input and control edges |
| border.emphasis | 2 px accent | selected control, focus |

### 4.5 Touch targets

Minimum 48x48 dp for every interactive element even when the visual shape is
smaller. Primary actions are full width in the footer and at least 52 dp tall.

---

## 5. Iconography

The brand supplies the logo set; the app draws its own small UI icons as
monochrome RN Views. No icon font and no extra dependency.

Brand assets:

- The symbol, wordmark, and launcher icon come from the identity package.
- In-app, the symbol is drawn from the brand grid as Views (see `BrandMark`), so
  it stays crisp with no asset pipeline and no SVG dependency. The launcher icon
  uses the provided Android mipmaps.
- The wordmark and lockups remain available for docs and future chrome.

Rules from the guidelines: clear space 0.5 x plate height (symbol) and 0.42 x
x-height (wordmark); minimum symbol 24 px (compact build 16 px), wordmark 120 px
wide, lockup 160 px wide; never recolour the plate, gradient the node, outline,
rotate, glow, or crop. Do not put the orange symbol on orange.

UI icon set (drawn):

| Icon | Used for |
| --- | --- |
| chevron | back, disclosure, row affordance |
| check | success, chosen secure option |
| close | dismiss, clear |
| spinner | in progress only |
| warning mark | banner status (filled circle with `!`) |
| info mark | banner status (filled circle with `i`) |

Sizes 16 / 20 / 24. Stroke 2 px, round caps. Colour from a semantic token only.
Decorative beside a label; labelled when alone. No emoji, no coloured pictograms.

---

## 6. Motion

Motion confirms state and explains change. It never blocks input and never
dances. User-triggered motion stays under 300 ms.

### 6.1 Durations

| Token | ms | Use |
| --- | --- | --- |
| motion.instant | 0 | reduced-motion fallback |
| motion.fast | 120 | press feedback, icon state |
| motion.base | 180 | colour and opacity state |
| motion.medium | 240 | banner and disclosure reveal |
| motion.slow | 320 | screen content enter, sheet |
| motion.slower | 420 | live status settle |

### 6.2 Easing

| Token | Curve | Use |
| --- | --- | --- |
| motion.standard | cubic-bezier(0.2, 0, 0, 1) | most transitions |
| motion.decelerate | cubic-bezier(0.05, 0.7, 0.1, 1) | entering |
| motion.accelerate | cubic-bezier(0.3, 0, 0.8, 0.15) | exiting |
| motion.spring | stiffness 210, damping 22 | press, status settle |

### 6.3 Where motion is used

- Button press: scale to 0.97 on press in, spring back on release. The single
  most felt detail.
- Live node: a soft pulse while connecting, one settle when connected, then
  still. Nothing loops forever.
- Screen content: a short fade and 8 dp rise on enter, staggered 40 ms for up to
  three items, never blocking input.
- Insecure banner: expands in with `motion.medium` when Plain HTTP is chosen, so
  the choice and its consequence are linked.

### 6.4 Where motion is not used

- Keyboard and back navigation.
- The debug log.
- Anything tapped more than a few times per session.

### 6.5 Reduced motion

Read `AccessibilityInfo.isReduceMotionEnabled()`. When on: transforms are
instant, presses do not scale, the pulse becomes a static dot, and reveals become
a plain fade at `motion.fast`. Colour and opacity changes that aid comprehension
stay.

---

## 7. Component specs

Named, typed units in `src/ui/components/`. Screens compose them and never
hardcode a token. Each interactive component exposes a role, label, and state.

### 7.1 Button

Variants: `primary` (Signal fill, Ink label), `secondary` (card fill,
`border.control`), `ghost` (no fill, `accent.text`), `destructive` (danger fill,
`onDanger` label). Sizes: `lg` 52 (footers), `md` 48 (inline), `sm` 40 (dense
headers only). States: default, pressed (scale 0.97, fill darkens), disabled
(`bg.sunken`, `text.disabled`), loading (label replaced by a spinner, stays
disabled and keeps its size).

Accessibility: role `button`, `accessibilityState` `disabled`/`busy`, min target
48, label is the visible text.

### 7.2 Text field

Label above (`label`, `text.secondary`), input (height 52, `radius.md`,
`bg.sunken`, 1 px `border.control`, `body` text), helper or error below
(`caption`). Focus sets the border to `accent` at 2 px. Error sets it to danger
with an icon and an error line. Disabled uses `text.disabled`.

Accessibility: label attached, error announced with a live region.

### 7.3 Server address field

A specialised text field that accepts `host`, `host:port`, or a full URL. One
field, not three; parsing happens on submit. Placeholder `vps.example.com`. URL
keyboard, no autocapitalise or autocorrect. On submit it resolves host and port
(default 443 secure, 80 HTTP) and hands them to the store. Invalid input gets a
friendly inline error, never a parse error.

### 7.4 Code field

One large field for the pairing code: `type.code` (22 mono, wide tracking),
centred, uppercase display, height 64, `radius.md`, `bg.sunken`. Auto-uppercase,
autocorrect off. A `Paste` ghost button beside it. Do not gate submit on a guessed
length; let the server reject a wrong code.

### 7.5 Segmented control

Exclusive choice (connection type). Pill track (`radius.full`, `bg.sunken`),
selected segment filled `accent` with `onSignal` label, height 48, equal width,
`label` text. More than three options become a list.

Accessibility: each segment a button with `accessibilityState.selected`.

### 7.6 Chip

Small tag (Secure, Unencrypted). `radius.full`, height 28, `caption` or
`monoLabel`. Tinted from the relevant ramp with matching text. Never the only
carrier of meaning.

### 7.7 List row

Optional leading dot or icon, title (`body` or `bodyStrong`), optional subtitle
(`caption`), optional value, trailing chevron. Height 56 to 64, hairline dividers,
no box per row. Pressed uses `bg.sunken`. The row merges into one accessible
element.

### 7.8 Card

`bg.card`, `radius.lg`, padding `space.5`, hairline edge in dark, `elevation.1`
in light. A card groups related content and is not a section title bar. At most
one hero card per screen.

### 7.9 Banner

Variants: info, live, warning, danger, insecure. A status mark, a title
(`bodyStrong`), a message (`caption`), and an optional action. Soft background
from the ramp, 1 px border from the ramp, text from the ramp's readable step.
Keep banners rare, and do not stack them where avoidable. A banner is not a
section.

### 7.10 Status indicator

A dot plus a label, with a pulse ring on the live node while connecting.

| State | Dot | Label |
| --- | --- | --- |
| offline | `text.tertiary` | Not connected |
| connecting | `status.pending` + pulse | Connecting |
| live | `accent` | Connected |
| error | `status.danger` | Cannot reach server |

The dot is 10 dp; the label is `body` inline, `title2` as a hero. Screen readers
hear the same sentence the dot implies.

### 7.11 Progress

Indeterminate only in Phase 1 (a spinner on the acting button). No fake progress,
no unmeasurable percentage.

### 7.12 Empty and error states

Empty: what is missing plus the action that fixes it. Error: a plain-sentence
banner with one action. The technical cause lives in the debug screen, never in
the banner, never a stack, status number, or wire value.

### 7.13 Bottom sheet

The default phone pattern for a choice or confirmation: `radius.2xl` top corners,
drag handle, backdrop `rgba(20,22,26,0.4)`. Destructive confirmations name the
action and consequence, confirm with `destructive`, cancel with `ghost`. In Phase
1 the sheet confirms the insecure-HTTP choice. The warning itself is shown inline
at the moment of choice; the sheet is the explicit acknowledgement.

### 7.14 Screen scaffold

`Screen` provides the themed background, safe-area insets, an optional header
(back chevron, title, optional trailing action), a scrollable content region with
standard padding and an 840 dp max width, and an optional footer pinned above the
keyboard-safe bottom inset holding the primary action. Exactly one primary action
per screen. Secondary actions are quieter and sit above the footer or in the
header.

---

## 8. Copy and tone

Voice: a competent operator, plain English, no jargon, no marketing. Short
sentences. Concrete nouns. No exclamation marks. No "supercharge", no "unleash".

- Say what the user does, not what the system does: "Connect to your server",
  not "Configure control plane endpoint".
- Never show wire values. No `secure=false`, mode names, server ids, or frame
  types on a user surface.
- Name machines the way operators do: `vps-fra-02`, not "your server".
- Sentence case everywhere; the product name is lowercase `omp.console` in
  running UI.

Button verbs: a verb and the outcome. Connect, Continue, Pair device, Try again,
Disconnect. Never Submit, OK, Send, or a bare Next when a real verb exists.

Error rules: one sentence, plain, then the fix. Blame the situation, never the
user. Name the next step. Never expose a status code, stack, or raw server
message; the raw cause goes to the debug screen.

| Situation | Copy |
| --- | --- |
| Wrong code | "That pairing code was not accepted. Check the code and try again." |
| Server unreachable | "Could not reach your server. Check the address and that it is running." |
| Secure connection failed | "Could not make a secure connection. Check the certificate setup, or use another connection type in Advanced." |
| Timeout | "Your server took too long to answer. Try again." |
| Connected | "You are connected to <name>." |
| Insecure choice | "This sends your pairing code and everything else without encryption. Only use it on a network you trust." |

---

## 9. Flow and screen map

One primary action per screen. Technical detail hidden until asked for. The flow
is short by default and forgiving of mistakes.

```
Splash (hydrating)
  | token + address exist -> Home
  | otherwise             -> Welcome
Welcome
  | Connect to my server  -> Connect
  | I already have a code -> Pair
Connect
  | address + mode valid  -> Pair (no token) | Home (token exists)
Pair
  | correct code          -> Home
  | Skip (token exists)   -> Home
Home
  | Activity (debug)      -> Debug
Debug
```

Screen jobs:

1. Splash. Decide where to start. Brand symbol and a quiet spinner while the
   store hydrates.
2. Welcome. One line of what this is and the one thing to do: brand symbol,
   `display` headline "Reach your agent from your phone", one supporting line,
   primary "Connect to my server", ghost "I already have a code". No fields.
3. Connect. Collect the server address. Header "Connect to your server", one
   Server address field, an Advanced disclosure (port, connection type, device
   name), footer primary "Continue". Choosing Plain HTTP reveals the insecure
   banner inline at the choice, and its acknowledgement control opens the
   confirmation sheet; Continue stays disabled until it is accepted. A quiet
   Unencrypted chip stays visible under the address. Transition: push to Pair, or
   replace to Home when a token already exists.
4. Pair. Exchange the code for a device token. Header "Pair your device", a line
   on where the code comes from, the Code field, a Paste action, footer primary
   "Pair device". If no address is set, an inline row returns to Connect. If a
   token exists, a ghost "Skip" is offered. On success, replace to Home.
5. Home. Confirm the connection and show the next useful thing: "You are
   connected", the server name, a live status indicator, a Secure or Unencrypted
   chip, a small details block, footer secondary "Disconnect", and a quiet
   "Activity" row into Debug. A failed reconnect shows a banner with Try again.
6. Debug. The server facts, the echo round trip, and the raw event log, off the
   main path. Reachable only from Home.

Deep-link readiness: routes accept optional `host`, `port`, `mode`, `code`
params and the navigator defines a `linking` config, so a future installer or QR
can open `ompconsole://pair?host=..&code=..` or `ompconsole://connect`. Nothing
builds the deep link in Phase 1, but the routes are already the right shape.

Removed from the main flow: the raw event log, `secure=false`, the `api` server
id, mode identifiers, frame types, and a pairing section competing with a
connection section on one scroll.

---

## 10. How tokens map to code

Tokens live under `apps/android/src/ui/theme/`.

| Group | File |
| --- | --- |
| raw ramps, spacing, radius, border, elevation, type, motion | `src/ui/theme/primitives.ts` |
| semantic roles per mode | `src/ui/theme/semantic.ts` |
| type styles, platform-resolved families | `src/ui/theme/typography.ts` |
| easing and spring helpers, reduced-motion hook | `src/ui/theme/motion.ts` |
| `Theme` type, `lightTheme`, `darkTheme`, `themeFor`, `useTheme` | `src/ui/theme/index.ts` |

Components in `src/ui/components/`: `Text.tsx`, `Icon.tsx`, `BrandMark.tsx`,
`Button.tsx`, `TextField.tsx`, `ServerAddressField.tsx`, `CodeField.tsx`,
`SegmentedControl.tsx`, `Chip.tsx`, `ListRow.tsx`, `Card.tsx`, `Banner.tsx`,
`StatusIndicator.tsx`, `Spinner.tsx`, `BottomSheet.tsx`, `Screen.tsx`.

Screens in `src/features/` (onboarding, connect, pair, home, debug). Navigation
lives in `src/app/`: `navigationTypes.ts` (routes and the `AppNavigation`
contract), `hooks.ts` and `hooks.web.ts` (platform-resolved hooks), and
`nav.tsx` (native, React Navigation native-stack) with `nav.web.tsx` (browser
harness, a small in-memory stack). `App.tsx` stays thin and renders `AppShell`.

Token names mirror the semantic tables with dots as object paths:
`theme.color.text.secondary`, `theme.space.4`, `theme.radius.md`,
`theme.type.body`, `theme.motion.fast`. Screens reference `theme.color.*` only.

Screens in `src/features/` (onboarding, connect, pair, home, debug), navigation
in `src/app/`, and `App.tsx` stays thin. `src/ui/theme.ts` (the old file) is
removed.

---

## 11. Anti-patterns

The old UI did all of these. Never again.

- One long scroll that crams serving, pairing, connecting, and a raw log.
- A raw event log with timestamps on the main screen. It lives in Debug.
- Wire values shown to the user: `secure=false`, `api 63iiGaPI`, mode names,
  frame types.
- Evenly spaced bordered cards stacked down the page.
- Every element the same weight, so nothing is the primary action.
- Default-template colour and type, or a borrowed default accent.
- Desktop density on a phone: dense rows, small targets, long forms.
- Three fields where one smart field works.
- A warning banner shouting before the user chose anything.
- Blue/indigo accents, purple-to-blue gradients, decorative gradients.
- Emoji as icons, or any coloured pictogram.
- Recolouring the plate, gradienting the node, or cropping the mark.
- More than one orange action or status in a view. The logo node is part of the
  mark and does not compete.
- Grey text on a coloured fill.
- Fake progress or a spinner implying work that is not happening.
- A destructive action styled as the loudest thing on screen.
- Silent HTTPS to HTTP downgrade, ever.

---

## 12. Open items

- Session, monitoring, files, and terminal screens are later phases. Their
  tokens exist; their flows are not designed here.
- Light and dark were verified in the browser harness. Android device rendering
  is pending (no reliable emulator on the build host).
- Native font bundling is in place; it was not device-verified.
