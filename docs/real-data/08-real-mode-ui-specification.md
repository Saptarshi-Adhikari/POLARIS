# 08 — POLARIS Real Mode UI Specification

## 1. UI Principles
POLARIS maintains a consistent visual design across DEMO and REAL modes. The user interface does NOT redesign or relocate existing controls; instead, it introduces a compact **DATA MODE toggle** and an integrated **Provenance HUD**.

---

## 2. DATA MODE Toggle Specification

Located in the top overlay bar (`#minimal-overlay-controls`):

```html
<!-- DATA MODE Toggle -->
<div class="flex items-center space-x-1.5 border-r border-outline/30 pr-3 font-mono text-xs">
  <span class="text-on-surface font-medium flex items-center gap-1">
    <span class="material-symbols-outlined text-sm text-secondary">database</span> DATA:
  </span>
  <div class="inline-flex rounded-md shadow-sm" role="group">
    <button id="data-mode-demo-btn" class="px-2 py-0.5 text-xs font-bold rounded-l bg-secondary text-surface">DEMO</button>
    <button id="data-mode-real-btn" class="px-2 py-0.5 text-xs font-bold rounded-r bg-surface-container text-on-surface">REAL</button>
  </div>
</div>
```

### Toggle Button States
- **`DEMO` Active**: DEMO button highlighted in `bg-secondary` (green), REAL button in dark `bg-surface-container`.
- **`REAL` Active**: REAL button highlighted in `bg-secondary` (green), DEMO button in dark `bg-surface-container`.

---

## 3. Integrated Real Data Provenance HUD

When `DATA: REAL` is selected, the **Provenance HUD** appears immediately below the top bar:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🌐 DATA: REAL  │  SOURCE: USNIC / Copernicus  │  TIME: 2026-03-15 12:00:00 UTC  │  MODE: HISTORICAL REPLAY │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

```html
<div id="real-data-provenance-hud" class="fixed top-16 left-4 z-40 flex items-center space-x-3 bg-surface/90 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-secondary/40 shadow-xl text-[11px] font-mono select-none">
  <div class="flex items-center gap-1 text-secondary font-bold">
    <span class="material-symbols-outlined text-sm">public</span> DATA: REAL
  </div>
  <div class="border-r border-outline/30 h-3"></div>
  <div>SOURCE: <span id="provenance-source-text" class="text-primary font-bold">USNIC / Copernicus</span></div>
  <div class="border-r border-outline/30 h-3"></div>
  <div>TIME: <span id="provenance-time-text" class="text-secondary font-bold">2026-03-15 12:00:00 UTC</span></div>
  <div class="border-r border-outline/30 h-3"></div>
  <div>MODE: <span id="provenance-mode-text" class="text-amber-400 font-bold">HISTORICAL REPLAY</span></div>
</div>
```

---

## 4. Error State UI Specification

If a real data payload is missing or corrupted:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🌐 DATA: REAL  │  ERR: Failed to load USNIC dataset  [ RETRY ]  [ TO DEMO ]           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- Action button **`RETRY`**: Re-attempts fetching/parsing real data payload.
- Action button **`TO DEMO`**: Explicitly returns simulator to DEMO mode upon user click.
- **Rule**: NEVER silently convert REAL to DEMO without user action.
