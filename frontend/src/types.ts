export type Mark = '' | 'X' | 'O';
export type Mode = 'SOLO' | 'LOCAL';
export type Outcome = 'X' | 'O' | 'DRAW' | null;
export interface Move { position: number; player: 'X' | 'O'; moveNumber: number; }
export interface Game {
  id: number;
  mode: Mode;
  status: 'ACTIVE' | 'FINISHED';
  board: Mark[];
  nextPlayer: 'X' | 'O' | null;
  winner: Outcome;
  version: number;
  createdAt: string;
  updatedAt: string;
  moves: Move[];
  winningLine: number[];
}
export interface Stats { totalGames: number; completedGames: number; activeGames: number; xWins: number; oWins: number; draws: number; }
export interface Session { authenticated: boolean; csrfToken: string; user: { username: string; displayName: string } | null; }
