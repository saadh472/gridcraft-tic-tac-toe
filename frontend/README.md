# GridCraft frontend

React and TypeScript render the game board, saved-round history, replay controls, and scoreboard. The Java API owns the game rules and persistent records; replay changes only the displayed board.

## Development

Use Node.js 24. Start the Java backend on port 8095, then run:

```sh
npm ci
npm run dev
```

Vite serves the development interface at `http://127.0.0.1:5175` and proxies `/api` to the local backend. If you change the backend port, update the development proxy in `vite.config.ts`. The built application uses relative API paths and is served by Java on one origin.

## Verify and build

```sh
npm run typecheck
npm test
npm run build
```

The production output is `dist/`. It includes the bundled Inter font and its [OFL notice](public/licenses/Inter-OFL.txt); no external font service is required.

## Browser behavior

The client checks session, game, and scoreboard responses before rendering them. Mutations include the current CSRF token and an action-specific UUID. A lost or conflicting response requires a refresh of the authoritative board before further moves; writes are not automatically repeated.

The browser may store the selected game ID in local storage. Game boards, moves, results, and statistics remain in SQLite on the server. The interface remains usable if browser storage is unavailable.

Board controls have descriptive cell labels, arrow-key navigation, visible focus, and reduced-motion styles. History and replay remain available after a completed round. The root [README](../README.md) describes the complete application's setup, local demo account, and deployment limits.
