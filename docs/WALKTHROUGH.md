# GridCraft walkthrough

Use fictional local game records for this walkthrough. The application stores its authoritative state in SQLite; the browser displays the board returned by the Java API.

## 1. Open the workspace

Start `launcher/Start GridCraft.cmd` and wait for the ready message before opening the printed URL. The normal port is 8095; an occupied port causes the launcher to select another available one. Sign in with `player` / `DemoPass123!`.

The interface includes the board, game-mode controls, statistics, and saved-round history. Loading states prevent a move while the application is still opening or refreshing a game.

## 2. Play against the computer

Choose solo play and start a new round. You play X, and the computer plays O. Selecting an empty square sends a move request containing the square, the board revision, and a unique request ID.

The server validates that request, applies the human move, calculates the minimax response if the game continues, and commits both marks together. The computer is deterministic and cannot lose under the tested rules. A draw is a normal result of perfect play.

## 3. Share a board

Choose two-player mode and start a new round. Two people use the same device, alternating X and O. The active turn and board result come from the server. This mode does not create separate remote sessions or player accounts.

Board cells are buttons with descriptions for their row, column, and current mark. Use the arrow keys, Home, or End to move keyboard focus, then Enter or Space to choose an available square. Completed rounds cannot receive additional moves.

## 4. Review and replay

Select a saved round from history. Step through its ordered moves using the replay controls. Replay changes the displayed board only; it does not modify stored moves or create a new game.

Return to the saved board to resume a round that is still active. The application remembers the selected game ID where browser storage is available, while game content and statistics remain in SQLite.

## 5. Check persistence and recovery

Stop the local app, start it again, and sign in. The saved history should remain available. Tests also verify this with a real application restart against a temporary SQLite file.

If the connection fails while submitting a move, use the interface's refresh action to retrieve the authoritative board. Do not submit a different move until the current state is known. The server's retry keys and board revisions complement this recovery behavior; the client does not automatically repeat a write.

## Local boundaries

The shared demo account belongs to this installation. It is not a production account or an online multiplayer identity. Use the [security policy](../SECURITY.md) to report vulnerabilities privately, and review the [API guide](../backend/README.md) before changing deployment settings.
