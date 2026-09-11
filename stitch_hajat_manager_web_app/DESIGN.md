---
name: Kondangan Operational Ledger
colors:
  surface: '#fbf8fc'
  surface-dim: '#dcd9dd'
  surface-bright: '#fbf8fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f2f7'
  surface-container: '#f0edf1'
  surface-container-high: '#eae7eb'
  surface-container-highest: '#e4e1e6'
  on-surface: '#1b1b1e'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#303033'
  inverse-on-surface: '#f3f0f4'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855d'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#5e5e67'
  on-secondary: '#ffffff'
  secondary-container: '#e0dee9'
  on-secondary-container: '#62626b'
  tertiary: '#984300'
  on-tertiary: '#ffffff'
  tertiary-container: '#bb5810'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#e3e1ec'
  secondary-fixed-dim: '#c7c5d0'
  on-secondary-fixed: '#1a1b23'
  on-secondary-fixed-variant: '#46464f'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb68e'
  on-tertiary-fixed: '#331200'
  on-tertiary-fixed-variant: '#763300'
  background: '#fbf8fc'
  on-background: '#1b1b1e'
  surface-variant: '#e4e1e6'
typography:
  display-currency:
    fontFamily: Geist
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm-medium:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0em
  label-numeric:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-xs:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-uppercase:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-2: 0.125rem
  space-4: 0.25rem
  space-8: 0.5rem
  space-12: 0.75rem
  space-16: 1rem
  space-20: 1.25rem
  space-24: 1.5rem
  space-32: 2rem
  gutter: 1rem
  margin-mobile: 1rem
  margin-desktop: 1.5rem
---

## Brand & Style
The brand voice is dependable, unhurried, and operationally rigorous. Built for high-throughput live field operations (front reception desks at Indonesian weddings, circumcisions, and family celebrations), the interface prioritizes extreme clarity, rapid entry cadence, and outdoor legibility over decorative excess.

### Design Movement
**Minimal Functional SaaS with Subtle Cultural Warmth.**
- **Anti-AI-Slop & Anti-Norak Directive:** Absolutely no multi-stop purple/blue neon gradients, no frosted glassmorphism, no ambient background blobs, no decorative wedding or batik clip art, and no rainbow status chips. 
- **Physical Ledger Metaphor:** The software behaves like a precision physical ledger digitized for modern devices—focused on tabular balance, zero input latency, unambiguous typography, and clean contrast suitable for both direct midday glare and dimly lit reception tents.
- **Tone:** Professional, respectful, calm under pressure, and trustworthy with financial records.

## Colors
The palette uses high-contrast neutral zinc tones structured around an authoritative emerald core, reserving functional chromatic accents purely for operational alerts.

### Surface System
- **App Background Canvas:** `#fafafa` (Zinc 50) — Reduces glare during prolonged registry shifts.
- **Card & Active Surfaces:** `#ffffff` (Pure White) — Distinct elevated containers for forms and transaction streams.
- **Secondary Surfaces & Inset Wells:** `#f4f4f5` (Zinc 100) — Subtle segmentation for table headers and summary bands.
- **Structural Borders:** `#e4e4e7` (Zinc 200) — Defines grid cells, card edges, and input bounds without visual noise.

### Text Hierarchy
- **Primary Text:** `#18181b` (Zinc 900) — High-contrast legibility for guest names, rupiah tallies, and labels.
- **Secondary Text:** `#52525b` (Zinc 600) — Descriptions, relationship notes, and timestamps.
- **Muted Text:** `#71717a` (Zinc 500) — Placeholders, table column labels, and auxiliary metadata.

### Accent & Functional Statuses
- **Primary / Success:** `#059669` (Emerald 600) default; `#047857` (Emerald 700) hover/pressed. Used for commitment actions, submission triggers, active navigation tabs, and running monetary totals.
- **Warning & Duplicate Detection:** Background `#fffbeb` (Amber 50), Border `#fde68a` (Amber 200), Text `#b45309` (Amber 700). Restricted to real-time duplicate guest notices and special dietary/gift notes.
- **Destructive:** Background `#fef2f2` (Red 50), Foreground `#dc2626` (Red 600). Strictly for deletion and voiding invalid entries.

## Typography
Typography is tuned for numeric fidelity and rapid legibility. **Plus Jakarta Sans** provides a friendly yet disciplined humanist sans-serif baseline for headings and standard form fields. **Geist** is paired specifically for tabular data, currency displays (IDR / Rupiah), time codes, and auxiliary metadata badges due to its tabular numeral spacing and geometric precision.

### Scaling & Contrast Rules
- **Tabular Figures:** Always apply `font-feature-settings: 'tnum' on, 'cv01' on` to numeric fields, preventing layout shift during rapid live total calculations.
- **Title Hierarchy:** Page headers scale at `headline-lg` (`24px`), sections at `headline-md` (`18px`). This keeps vertical density high, avoiding excessive scrolling on laptop screens at check-in desks.
- **Metadata:** Use `label-uppercase` (`11px`, letter-spaced) for table headers and field section markers to ensure clear visual hierarchy against data rows.

## Layout & Spacing
The layout follows a high-density, split-screen operational model optimized for keyboard-first and tablet entry.

### Operational Layout Architecture
- **Desktop / Tablet Landscape (Split Horizon):**
  - **Left / Input Dock (380px to 440px fixed):** Pinned entry panel for the active donation form. Does not scroll away; tab index is strictly bound to guest name -> origin/pax -> amount -> gift type -> enter.
  - **Right / Ledger Stream (Fluid):** Live auto-refreshing feed of incoming guests, key totals, and duplicate warning banners.
- **Mobile (Single Column Field Mode):**
  - Pinned bottom action sheet for fast-add trigger, sticky top stat-bar showing current attendee count and total recorded sum.
- **Rhythm:** An 8pt base grid governs component positioning. Micro-gaps inside input groupings use 8px (`space-8`), inter-card stacking uses 16px (`space-16`), and structural module margins use 24px (`space-24`).

## Elevation & Depth
Depth is created through low-contrast borders and surgical micro-shadows rather than layered blurs or dramatic drops. This keeps rendering performant on lower-spec mobile devices and maintains edge definition under direct sunlight.

### Layer Hierarchy
- **Level 0 (Canvas):** `#fafafa` background surface.
- **Level 1 (Structural Cards / Panels):** `#ffffff` background with a crisp `1px solid #e4e4e7` border and an ambient low-spread shadow: `0 1px 2px 0 rgba(24, 24, 27, 0.04)`.
- **Level 2 (Popovers, Autocomplete, Quick-Action Menus):** `#ffffff` background, `1px solid #e4e4e7`, with `0 4px 12px -2px rgba(24, 24, 27, 0.08)`.
- **Level 3 (Modal / Confirmation Dialogs):** `#ffffff` background, `1px solid #e4e4e7`, accompanied by a solid backdrop veil of `rgba(24, 24, 27, 0.45)` (no blur).
- **Focus Rings:** High-visibility double ring: `box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #059669`.

## Shapes
A disciplined shape hierarchy ensures functional components remain visually crisp while structural panels feel approachable and modern.

### Corner Radius Mapping
- **Primary Modules & Dialogs (`rounded-2xl` / 16px):** Outer application cards, quick-entry dock, and modal sheets.
- **Form Controls & Triggers (`rounded-xl` / 12px):** All text inputs, select dropdowns, operational push buttons, and monetary denomination chips.
- **Inline Badges & Indicators (`rounded-full` / 9999px):** Duplicate warnings, category tags, attendance status chips, and count indicators only.

## Components

### Buttons
- **Primary (Action):** Background `#059669`, text `#ffffff`, radius `rounded-xl`, height `44px` on desktop / `48px` on mobile for tactile thumb reach. Focus ring emerald. Hover `#047857`. Active scale transform none (maintains precision).
- **Secondary (Utility):** Background `#ffffff`, border `1px solid #e4e4e7`, text `#18181b`. Hover `#f4f4f5`.
- **Destructive Sub-action:** Background `#ffffff`, border `1px solid #fecaca`, text `#dc2626`. Hover `#fef2f2`.
- **Denomination Quick-Pills:** Surface `#f4f4f5`, text `#18181b`, radius `rounded-lg`, border `1px solid transparent`. Hover: border `#e4e4e7`, surface `#ffffff`. Used for single-click cash amounts (`50.000`, `100.000`, `200.000`, `500.000`).

### Input Fields & Rapid Entry Form
- **Default State:** Height `44px`, background `#ffffff`, border `1px solid #e4e4e7`, radius `rounded-xl`, typography `body-sm`.
- **Active Focus State:** Border color `#059669`, ring shadow `0 0 0 3px rgba(5, 150, 105, 0.15)`.
- **Currency Entry:** Left-anchored fixed prefix (`Rp`), tabular bold numerals (`Geist`), right-aligned clear action. Auto-formats thousands separators instantly on keystroke.

### Live Duplicate Alert Banner
- **Container:** Background `#fffbeb`, border `1px solid #fde68a`, padding `12px 16px`, radius `rounded-xl`.
- **Content:** Amber-700 icon and bold warning string ("Kemungkinan nama sama terdeteksi") showing match preview and past record comparison to avoid duplicate envelope entries.

### Data Tables & Transaction Rows
- **Header:** Height `36px`, background `#f4f4f5`, text `#71717a`, typography `label-uppercase`, border-bottom `1px solid #e4e4e7`.
- **Row Item:** Height `52px`, background `#ffffff`, border-bottom `1px solid #f4f4f5`. Alternating colors are forbidden; visual structure is sustained purely by thin borders.
- **Columns:** Timestamp (`12px`, zinc-500), Guest Name & Origin (`14px`, zinc-900 bold with zinc-600 subtext), Gift Category (full pill badge), Nominal Value (`label-numeric`, emerald-700).

### Status Badges & Chips
- **Geometry:** Height `24px`, padding `0 10px`, radius `rounded-full`, typography `label-xs`.
- **Cash / Amplop:** Surface `#ecfdf5`, border `#a7f3d0`, text `#047857`.
- **Transfer / QRIS:** Surface `#eff6ff`, border `#bfdbfe`, text `#1d4ed8`.
- **Physical Gift (Kado):** Surface `#f4f4f5`, border `#e4e4e7`, text `#52525b`.