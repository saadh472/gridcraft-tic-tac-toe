# GridCraft API

A Java 17 and Spring Boot Tic-Tac-Toe API with persistent SQLite games, session authentication, CSRF protection, and a deterministic minimax opponent. The browser never decides the winner or writes a board snapshot. The service validates moves and saves the board, ordered move history, and retry key together.

This is a new web implementation inspired by the original 8086 Tic-Tac-Toe coursework. The original assembly source and its credits remain unchanged. It is not an 8086 emulator and does not execute the assembly program.

## Run locally

Install JDK 17 and Maven 3.9 or newer. From this directory:

```sh
mvn --batch-mode verify
java -jar target/gridcraft-1.0.0.jar
```

The API runs at `http://127.0.0.1:8095`. Build the sibling React frontend first to serve the complete application; its production files are read from `../frontend/dist`. The root launcher builds both parts.

| Local username | Password |
| --- | --- |
| `player` | `DemoPass123!` |

These are published localhost demo credentials. Use invented names and test data. Public repository access does not expose the local game database.

## Configuration

Set environment variables before starting the Java process. `.env.example` is documentation; the Java server does not automatically load a `.env` file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GRIDCRAFT_HOST` | `127.0.0.1` | Loopback binding |
| `GRIDCRAFT_PORT` | `8095` | HTTP port |
| `GRIDCRAFT_DATABASE` | `./data/gridcraft.sqlite` | SQLite file, relative to the process working directory |
| `GRIDCRAFT_FRONTEND` | `../frontend/dist` | Built frontend directory |
| `GRIDCRAFT_USERNAME` | `player` | Single local workspace account |
| `GRIDCRAFT_PASSWORD` | `DemoPass123!` | Account password; use 12–72 UTF-8 bytes |
| `GRIDCRAFT_SECURE_COOKIE` | `false` | Set true when hosted exclusively over HTTPS |

Sessions expire after two hours of inactivity. Sign-in changes the session identifier and CSRF token; sign-out invalidates the authenticated session. BCrypt hashes the configured password in memory. There is no registration, password recovery, or remote multiplayer account system.

## Session contract

Request `GET /api/session` and retain its cookie and `csrfToken`. Every POST, including login and logout, requires that token in `X-CSRF-TOKEN`. Login and logout return a fresh token; update the browser's stored token from the response. API responses use `Cache-Control: no-store`.

```json
{
  "authenticated": false,
  "csrfToken": "token returned by the server",
  "user": null
}
```

After login, `user` contains `username` and `displayName`. Calls should remain on the same origin; the backend does not permit cross-origin browser API access.

## Routes

| Method and path | Request or response |
| --- | --- |
| `GET /api/health` | Public `{application:"gridcraft",status:"ok"}` liveness response |
| `GET /api/session` | Public session and CSRF token |
| `POST /api/login` | `{username,password}` → authenticated session |
| `POST /api/logout` | Invalidate session → anonymous session |
| `GET /api/games` | All games in the local workspace, newest first |
| `POST /api/games` | `{mode,requestId}` → new game, HTTP 201 |
| `GET /api/games/{id}` | Current board and complete ordered move history |
| `POST /api/games/{id}/moves` | `{position,version,requestId}` → updated game |
| `GET /api/stats` | `{totalGames,completedGames,activeGames,xWins,oWins,draws}` |

`mode` is `SOLO` or `LOCAL`. In `SOLO`, the human uses X and the computer uses O. A human move and any resulting computer reply commit in one transaction. In `LOCAL`, two people share the same device and alternate X and O; this does not provide separate remote players or player identities.

### Game shape

```json
{
  "id": 1,
  "mode": "LOCAL",
  "status": "ACTIVE",
  "board": ["X", "", "", "", "", "", "", "", ""],
  "nextPlayer": "O",
  "winner": null,
  "version": 1,
  "createdAt": "2026-11-15T12:00:00Z",
  "updatedAt": "2026-11-15T12:00:01Z",
  "moves": [{"position": 0, "player": "X", "moveNumber": 1}],
  "winningLine": []
}
```

IDs are numeric. Positions run from 0 through 8, left-to-right and top-to-bottom. Empty cells are empty strings. A finished game has `status:"FINISHED"`, `nextPlayer:null`, and `winner:"X"`, `"O"`, or `"DRAW"`. A winning line contains three zero-based positions; a draw has no winning line.

New games start at version 0. Each accepted move request increments the version once; in solo mode this can record two individual moves. Move numbers start at 1 and increment for each mark. Always use the returned version for the next request rather than calculating it from the number of marks.

## Validation and safe retries

- Positions and versions must be JSON integers. Floats, numeric strings, unknown fields, invalid modes, out-of-range squares, and missing request IDs return HTTP 400.
- An occupied square, finished game, stale version, or reused request ID with different data returns HTTP 409.
- `requestId` must be a canonical UUID. Generate a new ID for each new action and retain it until its outcome is known.
- An explicit retry of the same create or move payload returns the game's current state without creating another game or placing another mark. If later moves occurred, the returned board includes those later moves.
- Retry matching includes the original game ID, square, and version. Do not replace the version in a retained retry payload. A new intended move needs a new UUID.
- The server serializes changes in one process and commits a move, its computer response, the board revision, and request key in one SQLite transaction. Concurrent requests for the same board revision cannot both take a turn.

Missing authentication returns 401; invalid CSRF returns 403; unknown games return 404; database conflicts return 409 and unavailable database operations return 503. Errors include a human-readable `message`. The client should refresh after uncertain writes and never silently replay them.

## Rules and computer opponent

The pure `GameRules` class checks all eight winning lines before checking for a draw. Minimax explores legal continuations, prefers a quicker computer win and a slower loss, and uses deterministic tie breaking. The computer cannot lose when playing O under the implemented rules. An exhaustive test explores every possible human continuation against that solver rather than sampling a few games.

## Persistence and tests

SQLite stores game snapshots, individual moves, UUID request fingerprints, and schema version 1. Startup creates missing schema objects without deleting history. Future schema changes need an explicit migration; this application is intended for a single server instance and local workspace, not multiple replicas.

Back up with SQLite's backup API, or stop the application and copy the SQLite file and any WAL companion files. Keep databases and backups outside public source control. The API does not expose a delete or destructive reset route.

```sh
mvn --batch-mode verify
```

Tests cover both players' eight winning lines, draws, exhaustive minimax behavior, authenticated HTTP calls, CSRF, invalid numeric and unknown-field input, stale and concurrent moves, idempotent retries, and a real application restart against the same SQLite file. Test fixtures use temporary databases and do not change the local demo database.

The localhost demo credentials and cookie defaults are not a public-service deployment configuration. Shared hosting needs unique credentials, HTTPS and secure cookies, rate limiting, operational monitoring, backups, and a reviewed account model.
