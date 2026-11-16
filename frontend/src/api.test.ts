import { api, ApiError } from './api';
import type { Session } from './types';
const makeResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const anonymous: Session = { authenticated: false, csrfToken: 'anonymous-token', user: null };
const signedIn: Session = { authenticated: true, csrfToken: 'rotated-token', user: { username: 'player', displayName: 'Player' } };
afterEach(() => { vi.unstubAllGlobals(); });

test('mutations send the latest CSRF token and same-origin cookies', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(makeResponse(anonymous))
    .mockResolvedValueOnce(makeResponse(signedIn))
    .mockResolvedValueOnce(makeResponse({ ...anonymous, csrfToken: 'logout-token' }));
  vi.stubGlobal('fetch', fetcher);
  await api.session(); await api.login('player', 'DemoPass123!'); await api.logout();
  expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: 'same-origin', headers: { 'X-CSRF-TOKEN': 'anonymous-token' } });
  expect(fetcher.mock.calls[2][1]).toMatchObject({ credentials: 'same-origin', headers: { 'X-CSRF-TOKEN': 'rotated-token' } });
});
test('anonymous bootstrap calls share one in-flight request', async () => {
  let release!: (value: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  const first = api.session(), second = api.session();
  expect(fetcher).toHaveBeenCalledTimes(1);
  release(makeResponse(anonymous));
  await Promise.all([first, second]);
});
test('network failures on a move are uncertain and never automatically replayed', async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError('Offline'));
  vi.stubGlobal('fetch', fetcher);
  await expect(api.move(1, 4, 0, crypto.randomUUID())).rejects.toMatchObject({ uncertain: true, status: 0 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test('expired API sessions notify the auth gate while rejected login does not', async () => {
  const expired = vi.fn(); window.addEventListener('gridcraft:session-expired', expired);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ message: 'Sign in again.' }, 401)));
  try {
    await expect(api.games()).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
    await expect(api.login('player', 'invalid')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener('gridcraft:session-expired', expired); }
});
test('unreadable write responses require explicit recovery rather than another request', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('<html>Error</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(api.create('SOLO', crypto.randomUUID())).rejects.toMatchObject({ uncertain: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test('a stale session response cannot replace the token established by sign-out', async () => {
  let release!: (value: Response) => void;
  const fetcher = vi.fn()
    .mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
    .mockResolvedValueOnce(makeResponse({ ...anonymous, csrfToken: 'fresh-logout-token' }))
    .mockResolvedValueOnce(makeResponse(signedIn));
  vi.stubGlobal('fetch', fetcher);
  const previous = api.session();
  await api.logout();
  release(makeResponse({ ...signedIn, csrfToken: 'stale-token' }));
  await previous;
  await api.login('player', 'DemoPass123!');
  expect(fetcher.mock.calls[2][1].headers['X-CSRF-TOKEN']).toBe('fresh-logout-token');
});
test('a malformed saved game never becomes a playable board', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ id: 1, board: 'unreadable' })));
  await expect(api.game(1)).rejects.toMatchObject({ uncertain: false });
  await expect(api.create('LOCAL', crypto.randomUUID())).rejects.toMatchObject({ uncertain: true });
});
