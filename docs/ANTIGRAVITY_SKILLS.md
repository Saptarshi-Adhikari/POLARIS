# Antigravity Skills Inventory

This document tracks the available Antigravity skills and tools that are relevant to the implementation of the Astralis Navigation Console.

## Available Relevant Skills & Tools

1. **`browser_subagent` (Tool)**
   - **Purpose:** An autonomous browser automation agent capable of loading the application in Chrome, interacting with the DOM (clicking buttons, moving sliders, navigating the UI), and capturing screenshots or videos of the running application.
   - **Usage in Phase 2:** Crucial for STEP 20 (Browser Verification). It will run the 22 mandatory tests to verify the routing synchronization, environment panel persistence, and physics responses in a real browser environment.

2. **`modern-web-guidance-plugin` (Plugin)**
   - **Purpose:** Provides guidance and best practices for modern web development, particularly for building UI layouts without frameworks (Vanilla HTML/CSS).
   - **Usage in Phase 2:** May inform the CSS architecture for the progressive disclosure Environment Drawer and ensuring the Canvas takes 90% of the viewport.

3. **`chrome-devtools-plugin` (Plugin)**
   - **Purpose:** Aids in debugging and profiling within the Chrome browser.
   - **Usage in Phase 2:** Will be used during the browser testing phase to confirm there are no memory leaks (Performance Test) and no unhandled JavaScript exceptions in the console (Test 20).

## Note on Unrelated Skills
Many specialized scientific skills (e.g., `alphafold`, `chembl`, `gnomad`) are available in the Antigravity environment but are **not** applicable to this client-side maritime simulator, as the simulation relies on local mathematical physics (vector fields, A*) rather than live remote genomic or biological databases.
