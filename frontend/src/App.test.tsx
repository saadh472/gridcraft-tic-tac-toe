import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { Game, Session } from './types';

function round(id = 1): Game {
  return { id, mode: 'SOLO', status: 'ACTIVE', board: Array(9).fill(''), nextPlayer: 'X', winner: null,
    version: 0, createdAt: '2026-11-15T10:00:00Z', updatedAt: '2026-11-15T10:00:00Z', moves: [], winningLine: [] };
}
let games: Game[];
let authenticated: boolean;
let token: string;
let failMove: boolean;
let holdMove: Promise<void> | null;
let calls: Array<{ path: string; method: string; body: Record<string, unknown>; headers: Record<string, string> }>;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const session = (): Session => ({ authenticated, csrfToken: token, user: authenticated ? { username: 'player', displayName: 'Demo player' } : null });

beforeEach(() => {
  games = [round()]; authenticated = true; token = 'test-session-token'; failMove = false; holdMove = null; calls = [];
  vi.stubGlobal('fetch', vi.fn(async (path: string, options: RequestInit = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body as string) as Record<string, unknown> : {};
    const headers = options.headers as Record<string, string>;
    calls.push({ path, method, body, headers });
    if (path === '/api/session') return response(session());
    if (method !== 'GET' && headers['X-CSRF-TOKEN'] !== token) return response({ message: 'Security token is invalid.' }, 403);
    if (path === '/api/login') { authenticated = true; token = 'signed-in-token'; return response(session()); }
    if (path === '/api/logout') { authenticated = false; token = 'signed-out-token'; return response(session()); }
    if (!authenticated) return response({ message: 'Sign in to continue.' }, 401);
    if (path === '/api/games' && method === 'GET') return response(games);
    if (path === '/api/stats') return response({
      totalGames: games.length, completedGames: games.filter(g => g.status === 'FINISHED').length,
      activeGames: games.filter(g => g.status === 'ACTIVE').length, xWins: games.filter(g => g.winner === 'X').length,
      oWins: games.filter(g => g.winner === 'O').length, draws: games.filter(g => g.winner === 'DRAW').length
    });
    if (path === '/api/games' && method === 'POST') {
      const created = { ...round(Math.max(0, ...games.map(g => g.id)) + 1), mode: body.mode as Game['mode'] };
      games = [created, ...games]; return response(created, 201);
    }
    const match = path.match(/^\/api\/games\/(\d+)(\/moves)?$/);
    if (match) {
      const game = games.find(g => g.id === Number(match[1]));
      if (!game) return response({ message: 'Game not found.' }, 404);
      if (match[2]) {
        if (failMove) throw new TypeError('Connection interrupted');
        if (holdMove) await holdMove;
        if (body.version !== game.version) return response({ message: 'Game changed. Refresh before moving.' }, 409);
        const position = Number(body.position);
        if (game.board[position]) return response({ message: 'That square is occupied.' }, 409);
        const mark = game.nextPlayer!;
        game.board[position] = mark; game.moves.push({ position, player: mark, moveNumber: game.moves.length + 1 });
        game.nextPlayer = mark === 'X' ? 'O' : 'X'; game.version++;
        if (game.mode === 'SOLO') {
          const bot = game.board[4] ? game.board.findIndex(cell => cell === '') : 4;
          if (bot >= 0) { game.board[bot] = 'O'; game.moves.push({ position: bot, player: 'O', moveNumber: game.moves.length + 1 }); game.nextPlayer = 'X'; }
        }
      }
      return response(game);
    }
    return response({ message: 'Unexpected test request.' }, 404);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function ready() {
  render(<App />);
  await screen.findByRole('heading', { name: 'Make your move.' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start new game' })).toBeEnabled());
}

test('sign-in uses the bootstrap CSRF token and opens the saved workspace', async () => {
  authenticated = false;
  render(<App />);
  await screen.findByRole('heading', { name: 'Ready to play?' });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Fill account' }));
  expect(screen.getByLabelText('Username')).toHaveValue('player');
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('DemoPass123!');
  await user.click(screen.getByRole('button', { name: 'Enter play space' }));
  await screen.findByRole('heading', { name: 'Make your move.' });
  const login = calls.find(call => call.path === '/api/login')!;
  expect(login.headers['X-CSRF-TOKEN']).toBe('test-session-token');
  expect(login.body).toEqual({ username: 'player', password: 'DemoPass123!' });
});

test('starting a local round sends one mode and a canonical request ID', async () => {
  await ready(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Play a friend/ }));
  await user.click(screen.getByRole('button', { name: 'Start new game' }));
  await waitFor(() => expect(screen.getByText('LOCAL TWO-PLAYER')).toBeInTheDocument());
  const created = calls.filter(call => call.path === '/api/games' && call.method === 'POST');
  expect(created).toHaveLength(1);
  expect(created[0].body.mode).toBe('LOCAL');
  expect(created[0].body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(localStorage.getItem('gridcraft-last-game')).toBe('2');
});

test('a move uses server version and displays the returned human and AI moves', async () => {
  await ready(); const user = userEvent.setup();
  await user.click(screen.getByRole('gridcell', { name: 'Row 1, column 1, empty' }));
  await screen.findByRole('gridcell', { name: 'Row 1, column 1, X' });
  expect(screen.getByRole('gridcell', { name: 'Row 2, column 2, O' })).toBeInTheDocument();
  const moves = calls.filter(call => call.path.endsWith('/moves'));
  expect(moves).toHaveLength(1);
  expect(moves[0].body).toMatchObject({ position: 0, version: 0 });
  expect(moves[0].body.requestId).toMatch(/^[0-9a-f-]{36}$/);
});

test('busy board clicks never send a duplicate move', async () => {
  let release!: () => void;
  holdMove = new Promise(resolve => { release = resolve; });
  await ready(); const user = userEvent.setup();
  await user.click(screen.getByRole('gridcell', { name: 'Row 1, column 1, empty' }));
  await user.click(screen.getByRole('gridcell', { name: 'Row 1, column 2, empty' }));
  expect(calls.filter(call => call.path.endsWith('/moves'))).toHaveLength(1);
  release();
  await screen.findByRole('gridcell', { name: 'Row 1, column 1, X' });
});

test('uncertain writes block further moves until an explicit refresh without replaying', async () => {
  await ready(); failMove = true; const user = userEvent.setup();
  await user.click(screen.getByRole('gridcell', { name: 'Row 1, column 1, empty' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Start new game' })).toBeDisabled();
  await user.click(screen.getByRole('gridcell', { name: 'Row 1, column 2, empty' }));
  expect(calls.filter(call => call.path.endsWith('/moves'))).toHaveLength(1);
  failMove = false;
  await user.click(screen.getByRole('button', { name: 'Refresh game' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(calls.filter(call => call.path.endsWith('/moves'))).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Start new game' })).toBeEnabled();
});

test('board arrows move focus and Enter submits the selected empty square', async () => {
  games[0].mode = 'LOCAL';
  await ready(); const user = userEvent.setup();
  const first = screen.getByRole('gridcell', { name: 'Row 1, column 1, empty' });
  first.focus();
  await user.keyboard('{ArrowRight}{ArrowDown}');
  expect(screen.getByRole('gridcell', { name: 'Row 2, column 2, empty' })).toHaveFocus();
  await user.keyboard('{Enter}');
  await screen.findByRole('gridcell', { name: 'Row 2, column 2, X' });
  expect(calls.filter(call => call.path.endsWith('/moves'))[0].body.position).toBe(4);
});

function finishedRound(): Game {
  return { ...round(), status: 'FINISHED', board: ['X', 'X', 'X', 'O', 'O', '', '', '', ''], winner: 'X', nextPlayer: null, version: 5,
    moves: [{ position: 0, player: 'X', moveNumber: 1 }, { position: 3, player: 'O', moveNumber: 2 }, { position: 1, player: 'X', moveNumber: 3 },
      { position: 4, player: 'O', moveNumber: 4 }, { position: 2, player: 'X', moveNumber: 5 }], winningLine: [0, 1, 2] };
}
test('replay shows saved positions without mutating the completed round', async () => {
  games = [finishedRound()];
  await ready(); const user = userEvent.setup();
  expect(screen.getByRole('heading', { name: 'X takes the round.' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Previous replay move' }));
  expect(screen.getByRole('heading', { name: 'Revisit every move.' })).toBeInTheDocument();
  expect(screen.getByRole('gridcell', { name: 'Row 1, column 3, empty' })).toHaveAttribute('aria-disabled', 'true');
  await user.click(screen.getByRole('gridcell', { name: 'Row 1, column 3, empty' }));
  expect(calls.filter(call => call.method !== 'GET')).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Return to final board' }));
  expect(screen.getByRole('gridcell', { name: 'Row 1, column 3, X' })).toBeInTheDocument();
});

test('history filters and selecting a saved game loads its fresh server snapshot', async () => {
  games = [{ ...round(2), mode: 'LOCAL' }, finishedRound()];
  await ready(); const user = userEvent.setup();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Filter game history' }), 'FINISHED');
  expect(screen.queryByRole('button', { name: 'Open two-player game 2' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Open solo game 1' }));
  await screen.findByRole('heading', { name: 'X takes the round.' });
  expect(calls.some(call => call.path === '/api/games/1' && call.method === 'GET')).toBe(true);
});

test('a persisted selected game is restored after reload', async () => {
  games = [round(2), finishedRound()];
  localStorage.setItem('gridcraft-last-game', '1');
  await ready();
  expect(screen.getByRole('heading', { name: 'X takes the round.' })).toBeInTheDocument();
});

test('sign-out returns to the form and keeps only the harmless saved game identifier', async () => {
  await ready(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('heading', { name: 'Ready to play?' });
  expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  expect(calls.find(call => call.path === '/api/logout')?.headers['X-CSRF-TOKEN']).toBe('test-session-token');
  expect(localStorage.getItem('gridcraft-last-game')).toBe('1');
});

test('empty and loaded scoreboards distinguish a real zero from pending data', async () => {
  games = [];
  await ready();
  expect(screen.getByText('0 rounds')).toBeInTheDocument();
  expect(screen.getByText('Your next move starts here.')).toBeInTheDocument();
  const stats = screen.getByRole('heading', { name: 'Your scoreboard' }).closest('section')!;
  expect(within(stats).getByText('X wins')).toBeInTheDocument();
  expect(within(stats).getAllByText('0')).toHaveLength(4);
});
