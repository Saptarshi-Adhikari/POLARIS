---
name: Scientific Futurism
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#bec8ca'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#889394'
  outline-variant: '#3f494a'
  surface-tint: '#85d3dc'
  primary: '#ffffff'
  on-primary: '#00363b'
  primary-container: '#a1eff8'
  on-primary-container: '#126f77'
  inverse-primary: '#026971'
  secondary: '#a4d64c'
  on-secondary: '#233600'
  secondary-container: '#719e13'
  on-secondary-container: '#1e2f00'
  tertiary: '#ffffff'
  on-tertiary: '#4f2500'
  tertiary-container: '#ffdcc5'
  on-tertiary-container: '#9d4f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#a1eff8'
  primary-fixed-dim: '#85d3dc'
  on-primary-fixed: '#002023'
  on-primary-fixed-variant: '#004f55'
  secondary-fixed: '#bff365'
  secondary-fixed-dim: '#a4d64c'
  on-secondary-fixed: '#131f00'
  on-secondary-fixed-variant: '#354e00'
  tertiary-fixed: '#ffdcc5'
  tertiary-fixed-dim: '#ffb783'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#713700'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-data:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0.02em
  headline-sm:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.1em
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 12px
  gutter: 8px
  panel-gap: 4px
  touch-target: 44px
---

## Brand & Style

The design system is engineered for high-stakes maritime simulation and AI-assisted navigation. It prioritizes "Scientific Futurism"—a bridge between a rigorous research terminal and a cutting-edge cockpit interface. The UI should evoke a sense of precision, technical authority, and calm under pressure.

The style utilizes a **Dark-Mode Glassmorphism** approach. Interfaces are composed of semi-transparent, high-density data panels that float over dynamic ocean simulations. The aesthetic is "Technical-Functional," avoiding decorative fluff in favor of high-information density, glowing indicators, and data-rich readouts that feel mission-critical.

## Colors

The palette is rooted in deep oceanic tones to maintain night-vision compatibility and reduce eye strain during extended monitoring.

- **Primary (Ice Blue):** Used for primary telemetry, active UI borders, and core navigation markers. It should possess a subtle outer glow (0-2px) to simulate a light-emitting display.
- **Secondary (Cyber Lime):** Exclusively reserved for "Safe Paths," optimal simulation results, and "System Nominal" statuses.
- **Tertiary (Warning Orange):** Reserved for high-risk zones, collision warnings, and critical system failures.
- **Surface/Neutral:** The foundation is a mix of `Deep Navy (#0F172A)` and `Charcoal (#1E293B)`. Backgrounds use these colors at varying opacities (60-80%) to facilitate glassmorphism.

## Typography

This design system uses a dual-font strategy to balance technical grit with readability.

- **JetBrains Mono** is the primary driver for all numerical data, headings, and system labels. It conveys the "terminal" aesthetic and ensures that tabular data remains perfectly aligned.
- **Inter** is used for descriptive text, tooltips, and settings, providing a soft, highly legible contrast to the rigid monospaced elements.

All labels should default to uppercase with slight letter spacing to mimic industrial hardware engraving.

## Layout & Spacing

The layout follows a **High-Density Fluid Grid** model. Because this is a mobile dashboard, every pixel must be functional. 

- **Base Unit:** A strict 4px grid.
- **Layout:** Use a "Panel-Stack" approach. Information is grouped into modules separated by thin 1px borders rather than wide margins.
- **Safe Areas:** Maintain a 12px margin from the screen edges, but allow glass panels to bleed into the safe area behind a blur effect.
- **Mobile Density:** Information density should be high; use "Micro-layouts" within cards to show 3-4 data points simultaneously (e.g., Lat/Long, Speed, Depth).

## Elevation & Depth

Depth is conveyed through **Transparency and Luminance** rather than traditional drop shadows.

- **Layers:** 
    - *Level 0 (Base):* The 3D Ocean Simulation.
    - *Level 1 (Panels):* 60% opacity Navy surfaces with a 20px Backdrop Blur.
    - *Level 2 (Active Elements):* Solid Charcoal surfaces with 1px Ice Blue borders.
- **Glowing Borders:** Instead of shadows, use `inner-glow` or `drop-shadow` with 0px spread and 2-4px blur in the primary color to indicate focus or activity.
- **Intersections:** Where panels overlap, use a 1px "Specular Edge" (a white or light blue line at 10% opacity) on the top and left sides to define the physical edge.

## Shapes

The shape language is "Aggressive-Technical." Elements use a **Soft (4px)** radius to feel modern but retain a structural, machined quality. 

Avoid large pill shapes or perfect circles except for status pips. UI panels should feel like interlocking components. Cut corners (beveled edges) are encouraged for primary action buttons to reinforce the futuristic military-grade aesthetic.

## Components

### Glass Panels
The core container for all data. Must include:
- Background: `#0F172A` at 60% opacity.
- Backdrop Blur: 16px - 24px.
- Border: 1px solid `rgba(165, 243, 252, 0.2)`.

### Primary Action Buttons
- **Style:** Solid `Ice Blue` or beveled outline.
- **Typography:** `label-caps` in bold.
- **Feedback:** On press, the border glow intensity should double.

### Data Readouts (High-Density)
- Use `mono-data` for the value and `label-caps` for the key.
- Values should be right-aligned in grid columns to ensure decimal points line up.

### Navigation Paths (Polylines)
- **Safe Path:** 2px solid `Cyber Lime` with a faint outer neon glow.
- **Projected Path:** Dashed `Ice Blue`.
- **Restricted Path:** 2px solid `Warning Orange` with a pulsing animation.

### Inputs & Toggles
- **Inputs:** Minimalist bottom-border only, or a fully enclosed glass box.
- **Toggles:** Rectangular sliders instead of rounded ones, using `Cyber Lime` for the 'On' state.

### Micro-interactions
- Use "Scanning" animations (a horizontal line moving vertically) over data panels when AI is processing.
- Screen transitions should use "Wipe" or "Iris" effects to mimic camera shutters or digital re-initialization.