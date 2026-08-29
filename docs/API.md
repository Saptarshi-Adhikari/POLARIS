# API

**Current application is client-side and does not expose a backend API.**

There is no REST API, no FastAPI server, no Express server, and no WebSockets. There are zero `fetch()` or `axios` calls in the entire codebase.

## Internal "APIs" (Class Methods)
While there is no network API, the JS classes communicate via standard method calls:
- `aiNavigator.evaluate(ship, icebergs, vectorField)`: The primary interface for requesting a new route.
- `vectorField.setParams(config)`: The interface the UI uses to alter the environment.
- `SimulationEngine.loadAntarcticPreset(name)`: Triggers storm events.
