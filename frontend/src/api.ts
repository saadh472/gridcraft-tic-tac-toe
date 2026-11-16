import type { Game, Mode, Session, Stats } from './types';

let csrfToken = '';
let sessionPending: Promise<Session> | null = null;
let sessionGeneration = 0;
export class ApiError extends Error {
  constructor(message: string, public status = 0, public uncertain = false) { super(message); this.name = 'ApiError'; }
}
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const mutation = method !== 'GET';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/api' + path, {
      method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(mutation ? { 'X-CSRF-TOKEN': csrfToken } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let payload: unknown;
    try {
      if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('Unexpected content type');
      payload = await response.json();
    } catch {
      throw new ApiError(mutation
        ? 'The server response could not be confirmed. Refresh before making another change.'
        : 'The server returned an unreadable response. Try refreshing.', response.status, mutation);
    }
    if (!response.ok) {
      if (response.status === 401 && path !== '/login') window.dispatchEvent(new Event('gridcraft:session-expired'));
      const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
        ? payload.message : 'This request could not be completed.';
      throw new ApiError(message, response.status, false);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(mutation
      ? 'The connection ended before the result was confirmed. Refresh the game before trying another move.'
      : 'GridCraft cannot reach the local server. Check that it is running, then retry.', 0, mutation);
  } finally { clearTimeout(timer); }
}
function rememberSession(session: Session, remember = true) {
  if (typeof session?.authenticated !== 'boolean' || typeof session.csrfToken !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(session.csrfToken) ||
      (session.authenticated && (!session.user || typeof session.user.username !== 'string' || typeof session.user.displayName !== 'string'))) {
    throw new ApiError('The session response is invalid. Refresh the page before continuing.');
  }
  if (remember) csrfToken = session.csrfToken;
  return session;
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function whole(value: unknown, min = 0): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min; }
function game(value: unknown, mutation = false): Game {
  if (!record(value) || !whole(value.id, 1) || !whole(value.version) || !['SOLO', 'LOCAL'].includes(value.mode as string) ||
      !['ACTIVE', 'FINISHED'].includes(value.status as string) || ![null, 'X', 'O'].includes(value.nextPlayer as null | string) ||
      ![null, 'X', 'O', 'DRAW'].includes(value.winner as null | string) || !Array.isArray(value.board) || value.board.length !== 9 ||
      !value.board.every(mark => ['', 'X', 'O'].includes(mark)) || !Array.isArray(value.moves) || value.moves.length > 9 ||
      !value.moves.every(move => record(move) && whole(move.position) && move.position <= 8 && ['X', 'O'].includes(move.player as string) && whole(move.moveNumber, 1)) ||
      !Array.isArray(value.winningLine) || ![0, 3].includes(value.winningLine.length) || !value.winningLine.every(position => whole(position) && position <= 8) ||
      typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
    throw new ApiError('The saved game response is invalid. Refresh before making another move.', 0, mutation);
  }
  return value as unknown as Game;
}
function games(value: unknown): Game[] {
  if (!Array.isArray(value)) throw new ApiError('The game list could not be read. Refresh to try again.');
  return value.map(value => game(value));
}
function stats(value: unknown): Stats {
  if (!record(value) || !['totalGames', 'completedGames', 'activeGames', 'xWins', 'oWins', 'draws'].every(key => whole(value[key])))
    throw new ApiError('The scoreboard could not be read. Refresh to try again.');
  return value as unknown as Stats;
}
function changeSession(path: string, body: unknown) {
  const generation = ++sessionGeneration;
  sessionPending = null;
  return request<Session>(path, 'POST', body).then(value => rememberSession(value, generation === sessionGeneration));
}
export const api = {
  session(): Promise<Session> {
    if (!sessionPending) {
      const generation = sessionGeneration;
      const pending = request<Session>('/session').then(value => rememberSession(value, generation === sessionGeneration))
        .finally(() => { if (sessionPending === pending) sessionPending = null; });
      sessionPending = pending;
    }
    return sessionPending;
  },
  login: (username: string, password: string) => changeSession('/login', { username, password }),
  logout: () => changeSession('/logout', {}),
  games: () => request<unknown>('/games').then(games),
  game: (id: number) => request<unknown>('/games/' + id).then(value => game(value)),
  stats: () => request<unknown>('/stats').then(stats),
  create: (mode: Mode, requestId: string) => request<unknown>('/games', 'POST', { mode, requestId }).then(value => game(value, true)),
  move: (id: number, position: number, version: number, requestId: string) =>
    request<unknown>('/games/' + id + '/moves', 'POST', { position, version, requestId }).then(value => game(value, true))
};
