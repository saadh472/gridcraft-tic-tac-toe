import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, KeyboardEvent, ReactNode } from 'react';
import { api, ApiError } from './api';
import type { Game, Mark, Mode, Session, Stats } from './types';

const storageKey = 'gridcraft-last-game';
function savedGame() { try { const id = Number(localStorage.getItem(storageKey)); return Number.isSafeInteger(id) && id > 0 ? id : null; } catch { return null; } }
function rememberGame(id: number) { try { localStorage.setItem(storageKey, String(id)); } catch { /* Play remains available without browser storage. */ } }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'This action could not be completed.'; }
function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Saved round' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
export function replayBoard(game: Game, step: number): Mark[] {
  const board: Mark[] = Array<Mark>(9).fill('');
  for (const move of game.moves.slice(0, step)) board[move.position] = move.player;
  return board;
}
function Icon({ name, className = '' }: { name: 'arrow' | 'refresh' | 'logout' | 'plus' | 'history' | 'chevron' | 'play' | 'shield' | 'people' | 'check'; className?: string }) {
  const paths = {
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    refresh: 'M20 11a8 8 0 1 0-2 6M20 4v7h-7',
    logout: 'M9 4H5v16h4m5-12 4 4-4 4m-5-4h9',
    plus: 'M12 5v14M5 12h14',
    history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2',
    chevron: 'm9 5 7 7-7 7',
    play: 'm8 5 11 7-11 7V5Z',
    shield: 'm12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3Zm-4 9 3 3 5-6',
    people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m19 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7.87a4 4 0 0 1 0 7.75',
    check: 'm5 12 4 4L19 6'
  };
  return <svg className={'icon ' + className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function Symbol({ mark, className = '' }: { mark: Mark; className?: string }) {
  return mark ? <svg className={'symbol mark-' + mark.toLowerCase() + ' ' + className} viewBox="0 0 100 100" aria-hidden="true">
    {mark === 'X' ? <path d="M25 25 75 75M75 25 25 75" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" /> :
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="10" />}
  </svg> : null;
}
function Brand({ inverse = false }: { inverse?: boolean }) {
  return <div className={'brand ' + (inverse ? 'brand-inverse' : '')}><span className="brand-icon" aria-hidden="true"><span /><span /><span /><span /></span><span>GridCraft<span className="brand-period">.</span></span></div>;
}
function Notice({ children, action, label = 'Retry' }: { children: ReactNode; action?: () => void; label?: string }) {
  return <div className="notice" role="alert"><p>{children}</p>{action && <button className="button button-quiet" onClick={action}>{label}<Icon name="refresh" /></button>}</div>;
}
function Loading({ text }: { text: string }) { return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />{text}</div>; }

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [bootError, setBootError] = useState('');
  const [expired, setExpired] = useState(false);
  const bootSequence = useRef(0);
  const bootstrap = useCallback(async () => {
    const current = ++bootSequence.current;
    setBootError('');
    try { const result = await api.session(); if (current === bootSequence.current) setSession(result); }
    catch (error) { if (current === bootSequence.current) setBootError(errorMessage(error)); }
  }, []);
  useEffect(() => {
    void bootstrap();
    const expire = () => { ++bootSequence.current; setSession(null); setExpired(true); void bootstrap(); };
    window.addEventListener('gridcraft:session-expired', expire);
    return () => { ++bootSequence.current; window.removeEventListener('gridcraft:session-expired', expire); };
  }, [bootstrap]);
  function signedIn(value: Session) { ++bootSequence.current; setExpired(false); setSession(value); }
  function signedOut(value: Session) { ++bootSequence.current; setSession(value); setExpired(false); }
  if (bootError) return <main className="startup"><Brand /><Notice action={() => void bootstrap()}>We couldn’t open your session. {bootError}</Notice></main>;
  if (!session) return <main className="startup"><Brand /><Loading text="Opening your workspace…" /></main>;
  return session.authenticated ? <Workspace session={session} onSignedOut={signedOut} /> :
    <SignIn expired={expired} onSignedIn={signedIn} />;
}

function SignIn({ expired, onSignedIn }: { expired: boolean; onSignedIn: (session: Session) => void }) {
  const [username, setUsername] = useState('player');
  const [password, setPassword] = useState('DemoPass123!');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const usernameInput = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (!username.trim() || !password) { setError('Enter your username and password.'); usernameInput.current?.focus(); return; }
    pending.current = true; setBusy(true); setError('');
    try { onSignedIn(await api.login(username.trim(), password)); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="login-layout">
    <section className="login-story" aria-label="About GridCraft">
      <Brand inverse />
      <div className="story-copy"><span className="eyebrow light">THREE IN A ROW. EVERY MOVE COUNTS.</span><h1>A little strategy.<br />A great next move.</h1><p>Challenge a perfect opponent, play a friend, and revisit the moves that made your round.</p></div>
      <div className="preview-board" aria-hidden="true">{(['X', '', 'O', '', 'X', '', 'O', '', 'X'] as Mark[]).map((mark, i) => <div key={i}><Symbol mark={mark} /></div>)}</div>
      <div className="story-footer"><span className="live-dot" />Thoughtful play. Every round saved.</div>
    </section>
    <section className="login-form-side">
      <div className="login-form-wrap"><span className="eyebrow">WELCOME TO YOUR PLAY SPACE</span><h2>Ready to play?</h2><p className="muted">Sign in to keep your rounds and replays together.</p>
        {expired && <div className="inline-message" role="status">Your session ended. Sign in again to continue your saved games.</div>}
        <form onSubmit={submit} aria-label="Sign in" noValidate>
          <label htmlFor="username">Username</label><input ref={usernameInput} id="username" name="username" autoComplete="username" maxLength={100} value={username} disabled={busy} onChange={e => setUsername(e.target.value)} />
          <div className="label-row"><label htmlFor="password">Password</label><button className="text-button" type="button" onClick={() => setVisible(!visible)} aria-pressed={visible} aria-controls="password">{visible ? 'Hide' : 'Show'} password</button></div>
          <input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary login-submit" disabled={busy}>{busy ? <><span className="spinner" />Signing in…</> : <>Enter play space<Icon name="arrow" /></>}</button>
        </form>
        <section className="demo-box" aria-label="Local demo account"><div><strong>Try the local demo</strong><p><code>player</code> / <code>DemoPass123!</code></p></div><button type="button" className="button button-quiet" disabled={busy} onClick={() => { setUsername('player'); setPassword('DemoPass123!'); setError(''); usernameInput.current?.focus(); }}>Fill account</button></section>
        <p className="login-footnote">For local testing with fictional game data. Your games are stored by this installation.</p>
      </div>
    </section>
  </main>;
}

function Workspace({ session, onSignedOut }: { session: Session; onSignedOut: (session: Session) => void }) {
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [mode, setMode] = useState<Mode>('SOLO');
  const [pending, setPending] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [replayStep, setReplayStep] = useState<number | null>(null);
  const [historyFilter, setHistoryFilter] = useState('ALL');
  const [focusIndex, setFocusIndex] = useState(0);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const busy = useRef(false);
  const selected = useRef<number | null>(savedGame());
  const cells = useRef<Array<HTMLButtonElement | null>>([]);
  const focusNewBoard = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++sequence.current; }; }, []);
  const refresh = useCallback(async (preferred: number | null = selected.current, refreshSession = false) => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      if (refreshSession) await api.session();
      const [rounds, totals] = await Promise.all([api.games(), api.stats()]);
      if (!mounted.current || current !== sequence.current) return;
      const next = rounds.find(round => round.id === preferred) || rounds[0] || null;
      setGames(rounds); setStats(totals); setGame(next); selected.current = next?.id ?? null;
      if (next) rememberGame(next.id);
      setNeedsRefresh(false); setError(''); setReplayStep(null);
    } catch (failure) { if (mounted.current && current === sequence.current) setError(errorMessage(failure)); }
    finally { if (mounted.current && current === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (focusNewBoard.current && game) { focusNewBoard.current = false; setFocusIndex(0); cells.current[0]?.focus(); }
  }, [game?.id]);
  async function mutate(kind: string, operation: () => Promise<Game>) {
    if (busy.current || needsRefresh) return;
    busy.current = true; ++sequence.current; setPending(kind); setError(''); setLoading(false);
    try {
      const result = await operation();
      if (!mounted.current) return;
      selected.current = result.id; rememberGame(result.id); setGame(result); setReplayStep(null);
      setGames(previous => [result, ...previous.filter(round => round.id !== result.id)].sort((a, b) => b.id - a.id));
      await refresh(result.id);
    } catch (failure) {
      if (!mounted.current) return;
      const uncertain = failure instanceof ApiError && (failure.uncertain || [403, 409].includes(failure.status));
      setError(errorMessage(failure)); setNeedsRefresh(uncertain);
      if (kind === 'create' && uncertain) selected.current = null;
    } finally { busy.current = false; if (mounted.current) setPending(''); }
  }
  function newGame() {
    if (busy.current || loading || needsRefresh) return;
    const requestId = crypto.randomUUID();
    focusNewBoard.current = true;
    void mutate('create', () => api.create(mode, requestId));
  }
  function play(position: number) {
    if (!game || game.status !== 'ACTIVE' || game.board[position] || pending || loading || needsRefresh || replayStep !== null) return;
    const requestId = crypto.randomUUID();
    void mutate('move', () => api.move(game.id, position, game.version, requestId));
  }
  async function selectGame(round: Game) {
    if (busy.current) return;
    const current = ++sequence.current;
    selected.current = round.id; setGame(round); setReplayStep(null); setError(''); setLoading(true); setNeedsRefresh(false);
    try {
      const latest = await api.game(round.id);
      if (mounted.current && current === sequence.current) { setGame(latest); rememberGame(latest.id); }
    } catch (failure) {
      if (mounted.current && current === sequence.current) { setError(errorMessage(failure)); setNeedsRefresh(true); }
    } finally { if (mounted.current && current === sequence.current) setLoading(false); }
  }
  async function signOut() {
    if (busy.current) return;
    busy.current = true; setPending('logout'); ++sequence.current;
    try { onSignedOut(await api.logout()); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { busy.current = false; if (mounted.current) setPending(''); }
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const shifts: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 };
    let next: number | undefined;
    if (event.key in shifts) next = (index + shifts[event.key] + 9) % 9;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = 8;
    if (next === undefined) return;
    event.preventDefault(); setFocusIndex(next); cells.current[next]?.focus();
  }
  const replaying = replayStep !== null;
  const board = game ? (replaying ? replayBoard(game, replayStep) : game.board) : Array<Mark>(9).fill('');
  const canPlay = !!game && game.status === 'ACTIVE' && !pending && !loading && !needsRefresh && !replaying;
  const winningLine = game && (!replaying || replayStep === game.moves.length) ? game.winningLine : [];
  const heading = !game ? 'Your board is ready.' : replaying ? 'Revisit every move.' :
    game.winner === 'DRAW' ? 'A well-played draw.' : game.winner ? game.winner + ' takes the round.' : game.nextPlayer + ' to move.';
  const subheading = !game ? 'Choose a mode and start a new round.' : replaying ? 'Replay mode · The saved game stays unchanged.' :
    game.status === 'FINISHED' ? 'Every move is saved. Start another or explore the replay.' :
    pending === 'move' ? 'Saving your move and updating the board…' :
    game.mode === 'SOLO' ? 'You’re X. The AI plays O.' : 'Two players, one board. Take turns on this device.';
  const filtered = games.filter(round => historyFilter === 'ALL' || round.status === historyFilter);
  return <div className="app">
    <a className="skip-link" href="#game-area">Skip to game board</a>
    <header className="topbar"><div className="topbar-inner"><Brand /><span className="topbar-divider" /><span className="workspace-label">Your play space</span><div className="account"><span className="avatar">{(session.user?.displayName || 'Player').slice(0, 1).toUpperCase()}</span><div><strong>{session.user?.displayName || 'Player'}</strong><small>Local workspace</small></div><button className="icon-button" aria-label="Sign out" disabled={!!pending} onClick={() => void signOut()}><Icon name="logout" /></button></div></div></header>
    <main className="workspace">
      <section className="page-heading"><div><span className="eyebrow">THE CLASSIC, A MOVE AT A TIME</span><h1>Make your move<span>.</span></h1><p>A quick challenge. A friendly rematch. Your next great round.</p></div><div className="saved-indicator"><span className="live-dot" />Rounds saved automatically</div></section>
      {error && <Notice action={() => void refresh(selected.current, true)} label={needsRefresh ? 'Refresh game' : 'Retry loading'}>{error}{needsRefresh && <span className="notice-detail">Your action will not be repeated automatically. Refresh to see what was saved.</span>}</Notice>}
      <div className="play-layout">
        <section className="game-column" id="game-area" tabIndex={-1} aria-label="Current game">
          <div className="board-card">
            <div className="board-topline"><span className="round-chip">{game ? game.mode === 'SOLO' ? 'SOLO CHALLENGE' : 'LOCAL TWO-PLAYER' : 'YOUR NEXT ROUND'}</span><button className="board-refresh" aria-label="Refresh current game" title="Refresh current game" disabled={!!pending || loading} onClick={() => void refresh(selected.current, true)}><Icon name="refresh" /></button></div>
            <div className="board-heading" aria-live="polite" aria-atomic="true"><h2>{heading}</h2><p>{subheading}</p></div>
            <div className="player-pair"><div className={'player-tag player-x ' + (game?.nextPlayer === 'X' && game.status === 'ACTIVE' && !replaying ? 'is-current' : '')}><Symbol mark="X" /><span>{game?.mode === 'LOCAL' ? 'Player X' : 'You'}<small>{game?.nextPlayer === 'X' && game.status === 'ACTIVE' ? 'Your turn' : 'Crosses'}</small></span>{game?.nextPlayer === 'X' && game.status === 'ACTIVE' && <span className="turn-light" />}</div><span className="versus">VS</span><div className={'player-tag player-o ' + (game?.nextPlayer === 'O' && game.status === 'ACTIVE' && !replaying ? 'is-current' : '')}><Symbol mark="O" /><span>{game?.mode === 'LOCAL' ? 'Player O' : 'Perfect AI'}<small>{game?.nextPlayer === 'O' && game.status === 'ACTIVE' ? 'Your turn' : 'Noughts'}</small></span>{game?.nextPlayer === 'O' && game.status === 'ACTIVE' && <span className="turn-light" />}</div></div>
            <div className={'board-grid ' + (loading ? 'board-loading' : '')} role="grid" aria-label="Tic-tac-toe board" aria-busy={pending === 'move' || loading}>
              {[0, 1, 2].map(row => <div className="board-row" role="row" key={row}>{[0, 1, 2].map(column => {
                const index = row * 3 + column, mark = board[index], winning = winningLine.includes(index);
                return <button role="gridcell" key={index} ref={element => { cells.current[index] = element; }}
                  className={'board-cell ' + (mark ? 'occupied mark-' + mark.toLowerCase() : 'empty') + (winning ? ' winning' : '')}
                  aria-label={'Row ' + (row + 1) + ', column ' + (column + 1) + ', ' + (mark || 'empty')}
                  aria-disabled={!canPlay || !!mark} tabIndex={focusIndex === index ? 0 : -1} onFocus={() => setFocusIndex(index)}
                  onKeyDown={event => keyboard(event, index)} onClick={() => play(index)} style={{ '--cell-index': index } as CSSProperties}>
                  <Symbol mark={mark} /><span className="cell-preview" aria-hidden="true">{!mark && canPlay && <Symbol mark={game?.nextPlayer || 'X'} />}</span>
                </button>;
              })}</div>)}
            </div>
            <div className="board-bottomline"><span>{loading ? <><span className="small-spinner" />Updating saved game…</> : game ? <><span className={'status-dot ' + (game.status === 'FINISHED' ? 'finished' : '')} />{replaying ? 'Replay · Move ' + replayStep + ' of ' + game.moves.length : game.status === 'FINISHED' ? 'Round complete' : 'Round in progress'}</> : 'A new challenge starts with X.'}</span><span>{game ? game.moves.length + ' / 9 moves' : '3 × 3 board'}</span></div>
          </div>
          <section className="replay-card" aria-labelledby="replay-title"><div className="section-heading"><div><span className="small-label">LOOK BACK, PLAY BETTER</span><h3 id="replay-title"><Icon name="history" />Round replay</h3></div>{replaying && <button className="text-button" onClick={() => setReplayStep(null)}>Return to {game?.status === 'ACTIVE' ? 'live board' : 'final board'}<Icon name="arrow" /></button>}</div>
            {game?.moves.length ? <><label className="sr-only" htmlFor="replay-range">Replay move</label><div className="replay-controls"><button className="icon-button" aria-label="Previous replay move" disabled={!!pending || loading || (replayStep ?? game.moves.length) === 0} onClick={() => setReplayStep(Math.max(0, (replayStep ?? game.moves.length) - 1))}><span aria-hidden="true">‹</span></button><input id="replay-range" type="range" min={0} max={game.moves.length} value={replayStep ?? game.moves.length} disabled={!!pending || loading} onChange={event => setReplayStep(Number(event.target.value))} /><button className="icon-button" aria-label="Next replay move" disabled={!!pending || loading || (replayStep ?? game.moves.length) === game.moves.length} onClick={() => setReplayStep(Math.min(game.moves.length, (replayStep ?? 0) + 1))}><span aria-hidden="true">›</span></button><output htmlFor="replay-range">{replayStep ?? game.moves.length}<span> / {game.moves.length}</span></output></div><p className="replay-hint">{replaying ? 'You’re viewing a saved moment. Return to the live board to continue playing.' : 'Move the slider to explore the round without changing its result.'}</p></> : <p className="empty-copy">Your first move starts the story. Play a round to explore its replay here.</p>}
          </section>
          <p className="keyboard-hint"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd><span>Navigate the board</span><kbd>Enter</kbd><span>Place your mark</span></p>
        </section>
        <aside className="side-column" aria-label="Game options and history">
          <section className="new-game-card"><div className="section-heading"><div><span className="small-label">FIND YOUR CHALLENGE</span><h3>Start a new round</h3></div><span className="decorative-plus" aria-hidden="true">+</span></div><div className="mode-options" aria-label="Game mode"><button className={'mode-option ' + (mode === 'SOLO' ? 'selected' : '')} aria-pressed={mode === 'SOLO'} disabled={!!pending} onClick={() => setMode('SOLO')}><span className="mode-icon"><Icon name="shield" /></span><span><strong>Solo challenge</strong><small>Take on the perfect AI</small></span><span className="radio-indicator" /></button><button className={'mode-option ' + (mode === 'LOCAL' ? 'selected' : '')} aria-pressed={mode === 'LOCAL'} disabled={!!pending} onClick={() => setMode('LOCAL')}><span className="mode-icon"><Icon name="people" /></span><span><strong>Play a friend</strong><small>Two players, one device</small></span><span className="radio-indicator" /></button></div><button className="button button-primary new-game-button" disabled={!!pending || loading || needsRefresh} onClick={newGame}>{pending === 'create' ? <><span className="spinner" />Creating round…</> : <>Start new game<Icon name="arrow" /></>}</button><p className="micro-copy">Previous rounds stay in your history.</p></section>
          <section className="stats-card" aria-labelledby="stats-title"><div className="section-heading"><div><span className="small-label">EVERY ROUND ADDS UP</span><h3 id="stats-title">Your scoreboard</h3></div><span className="section-count">{stats?.totalGames ?? '—'} rounds</span></div><div className="stats-grid"><div className="stat stat-x"><span><Symbol mark="X" />X wins</span><strong>{stats?.xWins ?? '—'}</strong></div><div className="stat stat-o"><span><Symbol mark="O" />O wins</span><strong>{stats?.oWins ?? '—'}</strong></div><div className="stat"><span>Draws</span><strong>{stats?.draws ?? '—'}</strong></div><div className="stat"><span>In progress</span><strong>{stats?.activeGames ?? '—'}</strong></div></div><p className="stats-footnote">Across solo and local games · {stats?.completedGames ?? '—'} completed</p></section>
          <section className="history-card" aria-labelledby="history-title"><div className="section-heading"><div><span className="small-label">PICK UP WHERE YOU LEFT OFF</span><h3 id="history-title">Recent rounds</h3></div><Icon name="history" /></div><label className="sr-only" htmlFor="history-filter">Filter game history</label><select id="history-filter" className="history-filter" value={historyFilter} disabled={!!pending} onChange={event => setHistoryFilter(event.target.value)}><option value="ALL">All rounds</option><option value="ACTIVE">In progress</option><option value="FINISHED">Completed</option></select><div className="history-list">{filtered.length ? filtered.map(round => <button className={'history-item ' + (game?.id === round.id ? 'is-selected' : '')} key={round.id} aria-label={'Open ' + (round.mode === 'SOLO' ? 'solo' : 'two-player') + ' game ' + round.id} aria-current={game?.id === round.id ? 'true' : undefined} disabled={!!pending} onClick={() => void selectGame(round)}><span className={'history-symbol ' + (round.winner === 'X' ? 'result-x' : round.winner === 'O' ? 'result-o' : '')}>{round.winner === 'X' || round.winner === 'O' ? <Symbol mark={round.winner} /> : round.winner === 'DRAW' ? <span aria-hidden="true">=</span> : <Icon name="play" />}</span><span className="history-description"><strong>{round.mode === 'SOLO' ? 'Solo challenge' : 'Two-player round'}<span className={'result-badge ' + (round.status === 'ACTIVE' ? 'active' : '')}>{round.winner === 'DRAW' ? 'Draw' : round.winner ? round.winner + ' wins' : 'In progress'}</span></strong><small>{timestamp(round.updatedAt)}</small></span><Icon name="chevron" /></button>) : <div className="history-empty"><Icon name="history" /><strong>{loading ? 'Loading saved rounds…' : historyFilter === 'ALL' ? 'Your next move starts here.' : 'No rounds in this view.'}</strong><p>{historyFilter === 'ALL' ? 'Start a game to build your history.' : 'Choose another filter to see more games.'}</p></div>}</div></section>
        </aside>
      </div>
      <footer className="workspace-footer"><Brand /><p>A classic game. Room for a better next move.</p><span>Play. Learn. Replay.</span></footer>
    </main>
  </div>;
}
