package com.gridcraft;
import java.util.*;
/** Pure board rules used by the authoritative service and exhaustive solver tests. */
final class GameRules {
    static final int[][] LINES={{0,1,2},{3,4,5},{6,7,8},{0,3,6},{1,4,7},{2,5,8},{0,4,8},{2,4,6}};
    private static final int[] PRIORITY={4,0,2,6,8,1,3,5,7};
    private GameRules() {}
    static String outcome(char[] board) {
        for(int[] line:LINES) if(board[line[0]]!='-'&&board[line[0]]==board[line[1]]&&board[line[1]]==board[line[2]]) return String.valueOf(board[line[0]]);
        for(char cell:board) if(cell=='-') return null;
        return "DRAW";
    }
    static List<Integer> winningLine(char[] board) {
        for(int[] line:LINES) if(board[line[0]]!='-'&&board[line[0]]==board[line[1]]&&board[line[1]]==board[line[2]]) return List.of(line[0],line[1],line[2]);
        return List.of();
    }
    static int bestMove(char[] board) {
        if(outcome(board)!=null) throw new IllegalArgumentException("A finished board has no move.");
        int best=-100, selected=-1;
        Map<String,Integer> cache=new HashMap<>();
        for(int position:PRIORITY) if(board[position]=='-') {
            board[position]='O'; int score=minimax(board,'X',1,cache); board[position]='-';
            if(score>best) { best=score; selected=position; }
        }
        return selected;
    }
    private static int minimax(char[] board,char turn,int depth,Map<String,Integer> cache) {
        String result=outcome(board);
        if(result!=null) return result.equals("O")?10-depth:result.equals("X")?depth-10:0;
        String key=new String(board)+turn+depth;
        Integer saved=cache.get(key); if(saved!=null) return saved;
        int best=turn=='O'?-100:100;
        for(int position:PRIORITY) if(board[position]=='-') {
            board[position]=turn;
            int score=minimax(board,turn=='O'?'X':'O',depth+1,cache);
            board[position]='-'; best=turn=='O'?Math.max(best,score):Math.min(best,score);
        }
        cache.put(key,best); return best;
    }
}
