# GridCraft

A full-stack Tic-Tac-Toe application with a React interface, a Java API, and persistent SQLite game history. Play an unbeatable computer opponent or share a board with a second player, then replay the saved moves.

**Java 17 · Spring Boot · Spring Security · React · TypeScript · Vite · SQLite**

[Walkthrough](docs/WALKTHROUGH.md) · [API and configuration](backend/README.md) · [Security policy](SECURITY.md) · [License and attribution](THIRD_PARTY_NOTICES.md)

## Features

- **Solo play:** the human plays X against a deterministic minimax opponent playing O. Exhaustive solver tests cover every possible human continuation.
- **Two players on one device:** alternate X and O on the same board. This is local shared-device play, not remote multiplayer.
- **Authoritative game rules:** the Java service validates turns, squares, board revisions, wins, and draws. The browser renders the returned state.
- **Persistent history and replay:** SQLite stores each board, ordered moves, and results. Resume an active round or step through a saved game.
- **Workspace statistics:** review completed rounds, active games, X wins, O wins, and draws from saved records.
- **Safer requests:** session cookies, CSRF protection, validated JSON, conditional board revisions, and UUID request keys prevent accidental repeated moves.
- **Accessible controls:** keyboard navigation, visible focus, descriptive board buttons, responsive layouts, reduced-motion support, and self-hosted typography.

## Start on Windows

Install **JDK 17**, **Maven 3.9 or newer**, and **Node.js 24**. Open [launcher/Start GridCraft.cmd](launcher/Start%20GridCraft.cmd).

The launcher installs locked dependencies when required, builds changed source, prepares an extracted Java runtime, and starts the frontend and API together. Later starts reuse unchanged builds. It checks for an existing GridCraft instance and selects another port if its preferred port is occupied. Read the printed URL; the default is [http://127.0.0.1:8095](http://127.0.0.1:8095).

Keep the launcher terminal open while playing. Closing it or pressing Ctrl+C stops the instance it started.

| Local demo username | Password |
| --- | --- |
| `player` | `DemoPass123!` |

The published account is for fictional localhost demonstrations. It is not a production credential or a remote player identity.

To force a rebuild or choose a port, run from the project root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File launcher/start-local.ps1 -Rebuild
powershell.exe -NoProfile -ExecutionPolicy Bypass -File launcher/start-local.ps1 -Port 18095
```

Stop a running instance before forcing its rebuild. Use `-CheckOnly -NoBrowser` for a startup check that stops its own new instance when ready.

## Manual setup

Run the following from the repository root. Commands are the same in PowerShell and a POSIX shell when Java, Maven, and Node are on PATH.

```sh
cd frontend
npm ci
npm run build
cd ../backend
mvn --batch-mode verify
java -jar target/gridcraft-1.0.0.jar
```

The Java server serves `frontend/dist` and `/api` on one origin. There is no separate frontend process for the production build. For frontend development, start the backend and run `npm run dev` from `frontend`; Vite proxies API requests to port 8095.

## A complete workflow

1. Sign in with the local demo account and choose **Solo** or **Two players**.
2. Start a round and select a square. In solo mode, the server saves the human move and the computer reply together.
3. Finish the round, review its result, and select it in history.
4. Use replay controls to inspect the move sequence. Return to the saved board to resume an unfinished round.
5. Restart the app and sign in again. Saved games and statistics remain in SQLite.

The browser retains only the selected game ID as a convenience. SQLite remains the source of game state. If a write's result is uncertain, refresh the saved state before making another move; the interface does not silently replay writes.

## Project structure

```text
gridcraft/
├── frontend/                 # React interface, client validation, UI tests
├── backend/                  # Java rules, HTTP API, SQLite, integration tests
├── launcher/                 # Windows startup and incremental build cache
├── docs/                     # Walkthrough and local original reports
├── legacy/8086/coal_project.asm
├── .github/workflows/quality.yml
├── SECURITY.md
└── THIRD_PARTY_NOTICES.md
```

Build outputs, databases, environment secrets, and original report binaries are excluded from Git. The unrelated data-analysis files were retained outside this application in the local `COAL Local Archive` folder.

## Verification

```sh
mvn --batch-mode -f backend/pom.xml verify
npm ci --prefix frontend
npm run typecheck --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
```

Backend checks include wins and draws, exhaustive minimax behavior, authenticated HTTP calls, CSRF, invalid input, concurrent moves, idempotent retries, and a real application restart against the same database. Frontend checks cover authentication, board interaction, history, replay, and failed-request recovery. Tests use isolated records rather than the local demo database.

GitHub Actions runs the Java checks and frontend tests/build on pushes and pull requests. Dependency update proposals still require review and testing before merging.

## Storage and configuration

The launcher places persistent data in `backend/data/gridcraft.sqlite` and keeps the extracted runtime cache under the Windows local application-data directory. Manual startup from `backend` uses the same relative database location. Set `GRIDCRAFT_DATABASE` to an absolute path to choose another database.

Configuration includes `GRIDCRAFT_PORT`, `GRIDCRAFT_USERNAME`, `GRIDCRAFT_PASSWORD`, and `GRIDCRAFT_SECURE_COOKIE`. See the [backend guide](backend/README.md#configuration) for complete defaults and session behavior. Java does not automatically load a `.env` file.

Back up SQLite using its backup API, or stop the application before copying its database and any WAL companion files. Keep the database out of public source control. Startup creates missing schema objects and does not reset game history.

## Scope and attribution

GridCraft is an educational, single-workspace application that binds to loopback by default. Public service hosting would require unique credentials, HTTPS, secure cookies, rate limiting, monitoring, and a reviewed account model. It includes no account registration, password recovery, remote matchmaking, or network multiplayer.

The original project was an 8086 assembly Tic-Tac-Toe game. Its source remains under [legacy/8086](legacy/8086/coal_project.asm), with its original contributor credits preserved: **Muhammad Ahmed, Muhmmad Ammar, Abdul rahman**. This Java service is a new implementation; it does not execute or emulate the assembly program.

The [MIT license](LICENSE) covers the new application code. The original assembly and coursework reports are excluded from that grant. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency licenses and retained attribution.
