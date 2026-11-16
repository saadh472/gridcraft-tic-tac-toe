package com.gridcraft;
import jakarta.annotation.PostConstruct;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;

@Service
class GameService {
    record NewGame(@NotNull @Pattern(regexp="SOLO|LOCAL") String mode,
        @NotNull @Pattern(regexp="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") String requestId) {}
    record NewMove(@NotNull @Min(0) @Max(8) Integer position, @NotNull @PositiveOrZero Integer version,
        @NotNull @Pattern(regexp="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") String requestId) {}
    record Move(int position,String player,int moveNumber) {}
    record Game(long id,String mode,String status,List<String> board,String nextPlayer,String winner,int version,
        String createdAt,String updatedAt,List<Move> moves,List<Integer> winningLine) {}
    record Stats(long totalGames,long completedGames,long activeGames,long xWins,long oWins,long draws) {}
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    GameService(JdbcTemplate db,PlatformTransactionManager manager) { this.db=db; this.tx=new TransactionTemplate(manager); }
    @PostConstruct void initialize() {
        tx.executeWithoutResult(status -> {
            db.execute("CREATE TABLE IF NOT EXISTS schema_metadata(version INTEGER PRIMARY KEY)");
            if(db.queryForObject("SELECT COUNT(*) FROM schema_metadata WHERE version>1",Long.class)>0) throw new IllegalStateException("Database schema is newer than this application.");
            db.execute("""
                CREATE TABLE IF NOT EXISTS games(id INTEGER PRIMARY KEY AUTOINCREMENT,mode TEXT NOT NULL CHECK(mode IN ('SOLO','LOCAL')),
                status TEXT NOT NULL CHECK(status IN ('ACTIVE','FINISHED')),board TEXT NOT NULL CHECK(length(board)=9),
                next_player TEXT,winner TEXT,version INTEGER NOT NULL CHECK(version>=0),created_at TEXT NOT NULL,updated_at TEXT NOT NULL)
                """);
            db.execute("""
                CREATE TABLE IF NOT EXISTS moves(game_id INTEGER NOT NULL REFERENCES games(id),move_number INTEGER NOT NULL,
                position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 8),player TEXT NOT NULL CHECK(player IN ('X','O')),
                PRIMARY KEY(game_id,move_number),UNIQUE(game_id,position))
                """);
            db.execute("""
                CREATE TABLE IF NOT EXISTS requests(request_id TEXT PRIMARY KEY,kind TEXT NOT NULL,game_id INTEGER NOT NULL REFERENCES games(id),fingerprint TEXT NOT NULL)
                """);
            db.execute("INSERT OR IGNORE INTO schema_metadata(version) VALUES(1)");
        });
    }
    synchronized Game create(NewGame input) {
        String request=UUID.fromString(input.requestId()).toString(), fingerprint=digest("CREATE|"+input.mode());
        return tx.execute(status -> {
            Long previous=previous(request,"CREATE",fingerprint); if(previous!=null) return game(previous);
            String now=Instant.now().toString();
            db.update("INSERT INTO games(mode,status,board,next_player,version,created_at,updated_at) VALUES(?,'ACTIVE','---------','X',0,?,?)",input.mode(),now,now);
            long id=db.queryForObject("SELECT last_insert_rowid()",Long.class);
            remember(request,"CREATE",id,fingerprint); return game(id);
        });
    }
    synchronized List<Game> all() {
        return tx.execute(status -> db.query("SELECT id FROM games ORDER BY id DESC",(row,index)->row.getLong(1)).stream().map(this::game).toList());
    }
    synchronized Game get(long id) { return tx.execute(status -> game(id)); }
    synchronized Game move(long id,NewMove input) {
        String request=UUID.fromString(input.requestId()).toString();
        String fingerprint=digest("MOVE|"+id+"|"+input.position()+"|"+input.version());
        return tx.execute(status -> {
            Long previous=previous(request,"MOVE",fingerprint); if(previous!=null) return game(previous);
            Game current=game(id);
            if(!current.status().equals("ACTIVE")) throw error(CONFLICT,"This game is finished. Start a new game to play again.");
            if(current.version()!=input.version()) throw error(CONFLICT,"The board changed in another window. Refresh before making a move.");
            char[] board=toChars(current.board());
            if(board[input.position()]!='-') throw error(CONFLICT,"That square is occupied. Choose an empty square.");
            if(current.mode().equals("SOLO")&&!"X".equals(current.nextPlayer())) throw error(CONFLICT,"Wait for the server's computer move.");
            String player=current.nextPlayer();
            int number=current.moves().size()+1;
            board[input.position()]=player.charAt(0); recordMove(id,input.position(),player,number++);
            String winner=GameRules.outcome(board);
            String next=winner==null?(player.equals("X")?"O":"X"):null;
            if(current.mode().equals("SOLO")&&winner==null) {
                int selected=GameRules.bestMove(board); board[selected]='O'; recordMove(id,selected,"O",number);
                winner=GameRules.outcome(board); next=winner==null?"X":null;
            }
            int updated=db.update("UPDATE games SET board=?,status=?,next_player=?,winner=?,version=version+1,updated_at=? WHERE id=? AND version=?",
                new String(board),winner==null?"ACTIVE":"FINISHED",next,winner,Instant.now().toString(),id,input.version());
            if(updated!=1) throw error(CONFLICT,"The board changed. Refresh before trying again.");
            remember(request,"MOVE",id,fingerprint); return game(id);
        });
    }
    synchronized Stats stats() {
        return tx.execute(status -> {
            long total=db.queryForObject("SELECT COUNT(*) FROM games",Long.class);
            long completed=db.queryForObject("SELECT COUNT(*) FROM games WHERE status='FINISHED'",Long.class);
            return new Stats(total,completed,total-completed,countWinner("X"),countWinner("O"),countWinner("DRAW"));
        });
    }
    private long countWinner(String winner) { return db.queryForObject("SELECT COUNT(*) FROM games WHERE winner=?",Long.class,winner); }
    private Game game(long id) {
        var games=db.query("SELECT * FROM games WHERE id=?",(row,index)-> {
            char[] board=row.getString("board").toCharArray();
            List<String> values=new ArrayList<>(); for(char cell:board) values.add(cell=='-'?"":String.valueOf(cell));
            List<Move> moves=db.query("SELECT position,player,move_number FROM moves WHERE game_id=? ORDER BY move_number",(move,n)->new Move(move.getInt(1),move.getString(2),move.getInt(3)),id);
            return new Game(row.getLong("id"),row.getString("mode"),row.getString("status"),values,row.getString("next_player"),row.getString("winner"),
                row.getInt("version"),row.getString("created_at"),row.getString("updated_at"),moves,GameRules.winningLine(board));
        },id);
        if(games.isEmpty()) throw error(NOT_FOUND,"Game not found.");
        return games.get(0);
    }
    private void recordMove(long id,int position,String player,int number) {
        db.update("INSERT INTO moves(game_id,position,player,move_number) VALUES(?,?,?,?)",id,position,player,number);
    }
    private static char[] toChars(List<String> board) {
        char[] result=new char[9]; for(int i=0;i<9;i++) result[i]=board.get(i).isEmpty()?'-':board.get(i).charAt(0); return result;
    }
    private Long previous(String id,String kind,String fingerprint) {
        var found=db.queryForList("SELECT kind,game_id,fingerprint FROM requests WHERE request_id=?",id);
        if(found.isEmpty()) return null;
        var row=found.get(0);
        if(!kind.equals(row.get("kind"))||!fingerprint.equals(row.get("fingerprint"))) throw error(CONFLICT,"That request ID was already used for a different action.");
        return ((Number)row.get("game_id")).longValue();
    }
    private void remember(String id,String kind,long game,String fingerprint) { db.update("INSERT INTO requests VALUES(?,?,?,?)",id,kind,game,fingerprint); }
    private static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception ex) { throw new IllegalStateException(ex); }
    }
    private static ResponseStatusException error(HttpStatus status,String message) { return new ResponseStatusException(status,message); }
}
