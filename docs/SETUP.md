# Setup and Configuration

## Prerequisites
- Node.js (v18 or higher)
- npm

## Install
```bash
npm install
```

## Development
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

## Build for Production
```bash
npm run build
```
This generates static files in the `dist/` directory.

## Production Preview
```bash
npm run preview
```
Serves the `dist/` directory locally to verify the production build.

## Environment Variables
None required. There is no `.env` file necessary.

## Troubleshooting
- **Canvas Not Resizing:** If you resize the browser window significantly, refresh the page to ensure the canvas scaling is correct.
- **Performance Issues:** If the frame rate drops, avoid spawning more than 50 icebergs, as pathfinding on the main thread will block rendering.
