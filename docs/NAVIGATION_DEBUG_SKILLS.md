# Navigation Debug Skills

## Available Skills
Based on the Antigravity plugin system, the following relevant skills/plugins are available for debugging and verification:
- `chrome-devtools-plugin`: Allows interaction with Chrome DevTools for runtime inspection, performance profiling, and debugging.
- `modern-web-guidance-plugin`: Provides modern web capabilities, though less focused on raw canvas simulation.

## Skills Used
- `chrome-devtools-plugin` (or standard browser automation/DevTools capabilities provided by the environment) will be used to run the simulation, inspect the canvas, trigger interactions, and verify collision prevention in real-time.

## Debugging Capabilities Used
- **Runtime Inspection**: Monitoring `ship.x`, `ship.y`, and iceberg positions during the simulation loop to verify mathematical non-penetration.
- **Canvas Inspection**: Verifying visual rendering of routes, icebergs, and ship envelopes.
- **Performance Profiling**: Checking FPS and A* route recalculation times to ensure dynamic routing doesn't freeze the main thread.
