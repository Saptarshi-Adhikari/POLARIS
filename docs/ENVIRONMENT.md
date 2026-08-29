# Environment Assumptions

- **Node Version:** Not strictly specified, but `vite` requires Node.js v18+.
- **npm Version:** Standard with Node 18+.
- **Browser Assumptions:** Requires modern browsers supporting ES modules, Canvas 2D API, and CSS Grid. Will not work on IE11.
- **Operating System Assumptions:** OS agnostic (runs in browser).
- **GPU Requirements:** While it uses CPU-bound Canvas 2D, hardware acceleration in modern browsers helps maintain 60fps. No dedicated GPU required for ML (as there is no ML).
- **Network Requirements:** Requires an internet connection only on first load to fetch Tailwind and Google Fonts from CDNs.
- **External Services:** None required for core logic.
