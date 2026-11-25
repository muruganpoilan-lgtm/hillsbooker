---
version: 1
name: hill-booker
description: |
  Hill Booker is a booking site for hill stations and backwaters in South India, and its
  chrome is built to look like somewhere rather than like software. A deep forest green
  carries the hero and every primary action; a marigold yellow does one job only, which is
  to mark the thing that matters on a page. Type is Bricolage Grotesque for anything that
  names something and Albert Sans for everything that is read. Buttons wear a 2px border
  rather than a hairline, corners are 6px and never softer, and nothing in the system casts
  a shadow. Two motifs carry the brand: a hill-ridge silhouette cut into the bottom of the
  hero, and a marigold highlighter stroke sitting behind every price like someone ran a
  pen under it. Photographs of real properties do the rest of the work.

colors:
  green: "#0e6b58"
  green-dark: "#0a5042"
  on-green: "#ffffff"
  on-green-mute: "#dcece6"
  marigold: "#f4b000"
  marigold-hover: "#ffc531"
  marigold-text: "#8a5b00"
  on-marigold: "#17213b"
  ink: "#17213b"
  ink-soft: "#4a5470"
  indigo: "#2a3a7a"
  brick: "#b3362b"
  paper: "#ffffff"
  chalk: "#f4f6f2"
  line: "#d5ddd6"
  line-input: "#aab5ac"

typography:
  display-xl:
    fontFamily: Bricolage Grotesque
    fontSize: clamp(2.3rem, 7vw, 4.4rem)
    fontWeight: 800
    maxWidth: 14ch
  display-lg:
    fontFamily: Bricolage Grotesque
    fontSize: 1.5rem
    fontWeight: 700
  display-md:
    fontFamily: Bricolage Grotesque
    fontSize: 1.35rem
    fontWeight: 800
  display-sm:
    fontFamily: Bricolage Grotesque
    fontSize: 1.2rem
    fontWeight: 700
  body-lg:
    fontFamily: Albert Sans
    fontSize: 1.12rem
    fontWeight: 400
    maxWidth: 44ch
  body-md:
    fontFamily: Albert Sans
    fontSize: 1rem
    fontWeight: 400
  body-sm:
    fontFamily: Albert Sans
    fontSize: 0.95rem
    fontWeight: 400
  label:
    fontFamily: Albert Sans
    fontSize: 0.85rem
    fontWeight: 700
  button:
    fontFamily: Albert Sans
    fontSize: 1rem
    fontWeight: 700

rounded:
  none: 0px
  photo: 4px
  input: 4px
  default: 6px
  full: 9999px

spacing:
  xs: 0.3rem
  sm: 0.6rem
  md: 1rem
  lg: 1.6rem
  xl: 2.5rem
  page-max: 70rem

components:
  button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    border: 2px solid {colors.ink}
    typography: "{typography.button}"
    rounded: "{rounded.default}"
    padding: 0.6rem 1.2rem
    minHeight: 44px
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.on-green}"
    border: 2px solid {colors.green}
    rounded: "{rounded.default}"
    minHeight: 44px
  button-primary-hover:
    backgroundColor: "{colors.green-dark}"
    border: 2px solid {colors.green-dark}
  button-gold:
    backgroundColor: "{colors.marigold}"
    textColor: "{colors.on-marigold}"
    border: 2px solid {colors.marigold}
    rounded: "{rounded.default}"
  button-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.brick}"
    border: 2px solid {colors.brick}
    rounded: "{rounded.default}"
  button-small:
    minHeight: 38px
    padding: 0.35rem 0.9rem
  text-input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    border: 1px solid {colors.line-input}
    rounded: "{rounded.input}"
    padding: 0.5rem 0.7rem
    minHeight: 44px
  field-label:
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
  hero:
    backgroundColor: "{colors.green}"
    textColor: "{colors.on-green}"
    typography: "{typography.display-xl}"
    rounded: "{rounded.none}"
    padding: clamp(2.5rem, 7vw, 5rem) clamp(1rem, 4vw, 2.5rem) 0
  price:
    typography: "{typography.display-md}"
    textColor: "{colors.ink}"
    underlay: inset 0 -0.42em 0 {colors.marigold}
  notice:
    backgroundColor: "{colors.paper}"
    borderLeft: 4px solid {colors.marigold}
    rounded: "{rounded.none}"
    padding: 0.8rem 1rem
  photo:
    rounded: "{rounded.photo}"
    aspectRatio: 4 / 3
    objectFit: cover
    placeholder: "{colors.line}"
  scarce:
    textColor: "{colors.marigold-text}"
    fontWeight: 700
  success:
    textColor: "{colors.green}"
    fontWeight: 700
  error:
    textColor: "{colors.brick}"
    fontWeight: 600
  tile-band:
    height: 26px
    background: conic-gradient(from 45deg, {colors.marigold} 0 25%, {colors.indigo} 0 50%, {colors.paper} 0 75%, {colors.green} 0)
    backgroundSize: 26px 26px
---

## Overview

Hill Booker sells stays in Ooty, Munnar, Kodaikanal, Coorg, Wayanad and the Kerala
backwaters, to guests who are mostly on a phone and mostly deciding by photograph. The
design has one job: make a property legible in three seconds and make the next action
obvious.

The palette is a place, not a brand deck. Forest green (`{colors.green}`) is the hills,
and it owns the hero and every primary button. Marigold (`{colors.marigold}`) is the
flower on every South Indian doorway, and it is rationed — a highlighter stroke under a
price, the left edge of a notice, a scarcity warning, and nothing else. Ink
(`{colors.ink}`) is a deep blue-black rather than grey, which keeps text warm against the
green.

The system has no shadows anywhere. Separation comes from a 2px ink border on buttons,
a 1px `{colors.line}` rule between rows, and the `{colors.chalk}` page tint sitting under
white cards.

**Key characteristics:**
- Forest green hero and primary action; white page with a `{colors.chalk}` tint behind cards
- Marigold used sparingly and always to mark something, never to decorate
- Two typefaces with a strict split: Bricolage Grotesque names things, Albert Sans is read
- 2px borders, not hairlines — the chrome is drawn, not whispered
- 6px corners on controls, 4px on photographs, 0 on full-bleed bands
- No drop shadows in the entire system
- 44px minimum on every interactive element, because almost every guest is on a phone
- A hill-ridge SVG silhouette cut into the bottom edge of the hero, and the marigold
  highlighter behind prices: these two carry the brand

## Colors

### Brand
- **Green** (`{colors.green}` — `#0e6b58`): hero background and primary button. The single
  most-used colour on the site.
- **Green Dark** (`{colors.green-dark}` — `#0a5042`): pressed and hover state for the
  primary button. Never used as a surface.
- **Marigold** (`{colors.marigold}` — `#f4b000`): the accent. Price underline, notice left
  border, gold CTA. Rationed to at most one or two appearances per viewport.
- **Marigold Text** (`{colors.marigold-text}` — `#8a5b00`): the darkened version, used when
  marigold must carry text — "Only 1 left for these dates". Raw marigold on white fails
  contrast; this does not.
- **Indigo** (`{colors.indigo}` — `#2a3a7a`): appears only inside the tile band. Not a UI
  colour.

### Text
- **Ink** (`{colors.ink}` — `#17213b`): all primary text, and the border colour on default
  buttons. A blue-black, not a grey.
- **Ink Soft** (`{colors.ink-soft}` — `#4a5470`): metadata, field labels, secondary copy,
  unavailable states.
- **On Green** (`{colors.on-green}` — `#ffffff`): text on the green hero.
- **On Green Mute** (`{colors.on-green-mute}` — `#dcece6`): hero subtitle — a desaturated
  green-white rather than a transparent white, so it stays legible over the ridge artwork.

### Surface
- **Paper** (`{colors.paper}` — `#ffffff`): cards, inputs, notices.
- **Chalk** (`{colors.chalk}` — `#f4f6f2`): page background. A green-tinted off-white, not
  neutral grey — it keeps the page warm under the green chrome.
- **Line** (`{colors.line}` — `#d5ddd6`): row separators and photo placeholder fill.
- **Line Input** (`{colors.line-input}` — `#aab5ac`): the 1px border on form fields,
  slightly darker than `{colors.line}` so inputs read as enterable.

### Semantic
- **Brick** (`{colors.brick}` — `#b3362b`): errors, destructive actions. A clay red rather
  than a warning red, which sits better beside the green.
- Success reuses `{colors.green}`. There is no separate success colour.

## Typography

### Families
Two Google fonts, loaded through `next/font`:

- **Bricolage Grotesque** (`--font-display`) — anything that names something: the hero
  headline, property names, room names, prices, section titles, the wordmark. Weights 700
  and 800 only.
- **Albert Sans** (`--font-body`) — everything that is read: paragraphs, metadata, labels,
  buttons, form fields. Weights 400, 600 and 700.

The split is strict. A property name is never Albert Sans; a paragraph is never Bricolage.

### Hierarchy

| Token | Size | Weight | Family | Use |
|---|---|---|---|---|
| `{typography.display-xl}` | clamp(2.3rem, 7vw, 4.4rem) | 800 | Bricolage | Hero headline, capped at 14ch |
| `{typography.display-lg}` | 1.5rem | 700 | Bricolage | Section title |
| `{typography.display-md}` | 1.35rem | 800 | Bricolage | Price |
| `{typography.display-sm}` | 1.2rem | 700 | Bricolage | Property name, room name, booking name |
| `{typography.body-lg}` | 1.12rem | 400 | Albert Sans | Hero subtitle, capped at 44ch |
| `{typography.body-md}` | 1rem | 400 | Albert Sans | Default body |
| `{typography.body-sm}` | 0.95rem | 400 | Albert Sans | Metadata under a name |
| `{typography.label}` | 0.85rem | 700 | Albert Sans | Form field label, in `{colors.ink-soft}` |
| `{typography.button}` | 1rem | 700 | Albert Sans | Button label |

### Principles
Headlines are capped by character count, not pixels — `14ch` on the hero headline and
`44ch` on the subtitle — so they break sensibly in any language. Body copy caps at `52ch`.
The hero scales fluidly with `clamp()` rather than stepping at breakpoints.

## Layout

### Container
- **Page max width:** `{spacing.page-max}` (70rem), centred, with `clamp(1.25rem, 4vw, 2.5rem)`
  padding. The hero and the search slip share the same 70rem measure so their edges line up.
- The search slip overlaps the hero by a negative margin, sitting on top of the ridge.

### Spacing
Nothing is on a strict 8px grid; the system uses rem steps — `0.3rem` inside a field,
`0.6rem` between cards in a grid, `1rem` under a section title, `1.6rem` between blocks,
`2.5rem` at page edges on desktop.

### Grids
- **Room row:** single column on mobile; `120px 1fr auto` from 720px up — thumbnail, copy,
  actions.
- **Photo grid:** `repeat(auto-fill, minmax(8.5rem, 1fr))` with `0.6rem` gaps.
- **Property rows:** a flat list separated by 1px `{colors.line}` rules, not cards.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 | No border | Text on the page, hero copy |
| 1 | 1px `{colors.line}` rule | Row separators, list edges |
| 2 | 1px `{colors.line-input}` border | Form fields |
| 3 | 2px `{colors.ink}` border | Buttons |
| 4 | `{colors.paper}` card on `{colors.chalk}` page | Cards, panels |

**There are no drop shadows anywhere in this system.** Depth is border weight and the
white-on-chalk contrast. Do not add shadows to lift a card.

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Hero, tile band, notices, full-bleed bands |
| `{rounded.photo}` | 4px | Photographs, thumbnails |
| `{rounded.input}` | 4px | Form fields |
| `{rounded.default}` | 6px | Buttons |
| `{rounded.full}` | 9999px | Avatar circles only |

Corners stay tight. Nothing in the chrome goes above 6px, and the system never uses the
soft 12–16px radius common to SaaS products — it would make a travel site look like a
dashboard.

### Photography
Photographs are the main visual content and always `4 / 3`, `object-fit: cover`, 4px
corners, with `{colors.line}` as the placeholder fill while loading. Where a property has
no photo, a generated hill-ridge SVG fills the frame instead of a grey box.

## Signature Elements

Two things make a page recognisably Hill Booker. Both should survive any redesign.

**The ridge.** An SVG hill silhouette sits at the bottom edge of the hero, full width,
`clamp(110px, 22vw, 230px)` tall, with the green above it and the page below. It is the
reason the hero does not read as a coloured rectangle. The same ridge shape is reused as
the placeholder for a property with no photograph.

**The marigold highlighter.** Prices carry `inset 0 -0.42em 0 {colors.marigold}` as a
box-shadow, which paints a marigold band through the bottom 42% of the text — a felt-pen
stroke under the number. It is the fastest way for a guest scanning a list to find the
price, and it is the only decorative use of marigold in the system.

**The tile band** is a third, used sparingly: a 26px conic-gradient strip in marigold,
indigo, white and green that reads as patterned cement floor tiles. It marks a section
boundary. One per page at most.

## Do's and Don'ts

### Do
- Use `{colors.green}` for the primary action on every surface. There is one primary colour.
- Keep marigold rationed. If a viewport already has a highlighted price, it does not also
  need a gold button.
- Use `{colors.marigold-text}` whenever marigold has to carry text on white.
- Give every interactive element a 44px minimum height. Guests are on phones, often outdoors.
- Use Bricolage Grotesque for names and numbers, Albert Sans for sentences.
- Let photographs carry the page. The chrome is deliberately plain so the properties stand out.
- Cap text by character count (`ch`), not pixels.

### Don't
- Don't add drop shadows. Not on cards, not on buttons, not on the search slip.
- Don't soften corners past 6px on chrome.
- Don't use raw `{colors.marigold}` as a text colour on white — it fails contrast.
- Don't introduce a second accent colour. Indigo belongs in the tile band and nowhere else.
- Don't replace the 2px button border with a hairline. The weight is deliberate.
- Don't use a dark mode. The system is light-only and the content is daylight photography.
- Don't put a gradient on a button or a card. The only gradient in the system is the tile band.

## Responsive Behaviour

| Width | Changes |
|---|---|
| 1120px+ | Page holds at 70rem, gutters grow |
| 720px | Room rows go to `120px 1fr auto`; actions move to a right column |
| below 720px | Everything single column; room actions sit below the copy |

Hero type scales continuously with `clamp()` rather than stepping. Photo grids reflow by
`auto-fill` with no explicit breakpoints. Page padding runs `clamp(1.25rem, 4vw, 2.5rem)`.

### Touch targets
Buttons and inputs are 44px minimum, small buttons 38px. This is a floor, not a target —
the booking flow is used one-handed on a phone, often on patchy rural connections where a
mis-tap costs a page load.

## Known Gaps

- **No dark mode**, by design.
- **Hover states** are defined only for the primary and gold buttons.
- **Focus rings** are browser defaults and have not been designed.
- **The Tamil interface** (`frontend/lib/i18n/ta.js`) uses the same type scale; Tamil script
  needs more line height than Latin at the same size, and this has not been tuned.
- **Loading and skeleton states** are not specified beyond the photo placeholder fill.
