package com.gridcraft;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class GameRulesTest {
    @Test void allEightLinesAreDetectedForBothPlayers() {
        for(int[] line:GameRules.LINES) for(char player:new char[]{'X','O'}) {
            char[] board="---------".toCharArray();
            for(int square:line) board[square]=player;
            assertEquals(String.valueOf(player),GameRules.outcome(board));
            assertEquals(List.of(line[0],line[1],line[2]),GameRules.winningLine(board));
        }
    }
    @Test void fullUnwonBoardIsADrawAndIncompleteBoardIsActive() {
        assertEquals("DRAW",GameRules.outcome("XOXXOOOXX".toCharArray()));
        assertNull(GameRules.outcome("X--------".toCharArray()));
        assertTrue(GameRules.winningLine("XOXXOOOXX".toCharArray()).isEmpty());
    }
    @Test void solverWinsOrBlocksAndNeverChangesItsInput() {
        char[] winning="OO-XX----".toCharArray(), block="XX--O----".toCharArray();
        assertEquals(2,GameRules.bestMove(winning));
        assertEquals("OO-XX----",new String(winning));
        assertEquals(2,GameRules.bestMove(block));
        assertEquals("XX--O----",new String(block));
    }
    @Test void minimaxNeverLosesAgainstEveryPossibleHumanContinuation() {
        int[] terminal={0};
        explore("---------".toCharArray(),terminal);
        assertTrue(terminal[0]>100,"Exhaustive traversal should explore every human choice, not a sample game.");
    }
    private void explore(char[] board,int[] terminal) {
        for(int square=0;square<9;square++) if(board[square]=='-') {
            board[square]='X';
            String result=GameRules.outcome(board);
            assertNotEquals("X",result,"Computer lost on "+new String(board));
            if(result==null) {
                int computer=GameRules.bestMove(board);
                assertEquals('-',board[computer]);
                board[computer]='O';
                result=GameRules.outcome(board);
                if(result==null) explore(board,terminal); else terminal[0]++;
                board[computer]='-';
            } else terminal[0]++;
            board[square]='-';
        }
    }
}
