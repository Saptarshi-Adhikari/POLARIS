# Dependencies Audit

| Dependency | Version | Type | Purpose | Critical | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `vite` | `^5.4.2` | devDependency | Local dev server and production bundler. | Yes | Required to run or build the app. |
| `Tailwind CSS` | CDN | runtime | UI styling. | Yes | Loaded via `<script>` in index.html. |
| `Google Fonts` | CDN | runtime | Typography (Inter, JetBrains Mono). | No | Visual only. |
| `Material Symbols`| CDN | runtime | UI Icons. | No | Visual only. |

No unused or suspicious dependencies found. No backend or ML dependencies exist.
