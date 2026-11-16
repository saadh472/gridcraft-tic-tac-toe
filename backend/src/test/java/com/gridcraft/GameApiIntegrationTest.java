package com.gridcraft;
import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;

class GameApiIntegrationTest {
    static final ObjectMapper json=new ObjectMapper();
    static ServletWebServerApplicationContext context;
    static Path database;
    HttpClient client;
    String csrf;
    record Result(int status,JsonNode body) {}
    @BeforeAll static void startup() throws Exception {
        database=Files.createTempDirectory("gridcraft-api-").resolve("test.sqlite");
        context=open();
    }
    static ServletWebServerApplicationContext open() {
        return (ServletWebServerApplicationContext)new SpringApplicationBuilder(GridCraftApplication.class)
            .run("--server.port=0","--gridcraft.database="+database,"--logging.level.root=ERROR");
    }
    @AfterAll static void shutdown() { if(context!=null) context.close(); }
    @BeforeEach void reset() {
        JdbcTemplate db=context.getBean(JdbcTemplate.class);
        for(String table:List.of("requests","moves","games")) db.update("DELETE FROM "+table);
        client=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
        csrf=null;
    }
    Result call(String method,String path,Object body,boolean token) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+context.getWebServer().getPort()+"/api"+path));
        if(token&&csrf!=null) request.header("X-CSRF-TOKEN",csrf);
        if(body!=null) request.header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        else request.method(method,HttpRequest.BodyPublishers.noBody());
        var response=client.send(request.build(),HttpResponse.BodyHandlers.ofString());
        return new Result(response.statusCode(),response.body().isBlank()?json.nullNode():json.readTree(response.body()));
    }
    void login() throws Exception {
        csrf=call("GET","/session",null,false).body.path("csrfToken").asText();
        var result=call("POST","/login",Map.of("username","player","password","DemoPass123!"),true);
        assertEquals(200,result.status,result.body.toString()); csrf=result.body.path("csrfToken").asText();
    }
    JsonNode create(String mode) throws Exception {
        var result=call("POST","/games",Map.of("mode",mode,"requestId",UUID.randomUUID().toString()),true);
        assertEquals(201,result.status,result.body.toString()); return result.body;
    }
    Result move(JsonNode game,int position) throws Exception {
        return call("POST","/games/"+game.path("id").asLong()+"/moves",Map.of("position",position,"version",game.path("version").asInt(),"requestId",UUID.randomUUID().toString()),true);
    }
    @Test void authenticationCsrfAndLogoutAreEnforced() throws Exception {
        assertEquals(200,call("GET","/health",null,false).status);
        assertEquals(401,call("GET","/games",null,false).status);
        assertEquals(403,call("POST","/games",Map.of("mode","LOCAL","requestId",UUID.randomUUID().toString()),false).status);
        csrf=call("GET","/session",null,false).body.path("csrfToken").asText(); String before=csrf;
        assertEquals(401,call("POST","/login",Map.of("username","player","password","wrong"),true).status);
        assertEquals(401,call("POST","/login",Map.of("username","player","password","x".repeat(100)),true).status);
        login(); assertNotEquals(before,csrf);
        assertEquals(200,call("GET","/games",null,false).status);
        assertEquals(200,call("POST","/logout",Map.of(),true).status);
        assertEquals(401,call("GET","/stats",null,false).status);
    }
    @Test void localGameAlternatesAndFinishesWithARecordedWinningLine() throws Exception {
        login(); JsonNode game=create("LOCAL");
        for(int square:new int[]{0,3,1,4,2}) {
            var result=move(game,square); assertEquals(200,result.status,result.body.toString()); game=result.body;
        }
        assertEquals("FINISHED",game.path("status").asText()); assertEquals("X",game.path("winner").asText());
        assertTrue(game.path("nextPlayer").isNull()); assertEquals(json.readTree("[0,1,2]"),game.path("winningLine")); assertEquals(5,game.path("moves").size());
        assertEquals(409,move(game,8).status);
        var stats=call("GET","/stats",null,false).body; assertEquals(1,stats.path("xWins").asInt()); assertEquals(0,stats.path("activeGames").asInt());
    }
    @Test void soloHumanAndComputerMovesAreAtomicAndServerAuthoritative() throws Exception {
        login(); JsonNode game=create("SOLO"); var result=move(game,0);
        assertEquals(200,result.status); game=result.body;
        assertEquals(1,game.path("version").asInt()); assertEquals(2,game.path("moves").size());
        assertEquals("X",game.path("board").get(0).asText()); assertEquals("O",game.path("board").get(4).asText());
        assertEquals("X",game.path("nextPlayer").asText());
        assertEquals(1,game.path("moves").get(0).path("moveNumber").asInt()); assertEquals(2,game.path("moves").get(1).path("moveNumber").asInt());
        assertEquals(409,move(game,4).status);
    }
    @Test void localDrawIsPersistedAndCounted() throws Exception {
        login(); JsonNode game=create("LOCAL");
        for(int square:new int[]{0,1,2,4,3,5,7,6,8}) { var result=move(game,square); assertEquals(200,result.status); game=result.body; }
        assertEquals("DRAW",game.path("winner").asText()); assertEquals("FINISHED",game.path("status").asText());
        assertEquals(0,game.path("winningLine").size()); assertEquals(1,call("GET","/stats",null,false).body.path("draws").asInt());
    }
    @Test void rejectsUnknownFieldsFloatsNumericStringsAndInvalidRanges() throws Exception {
        login();
        var wrong=new LinkedHashMap<String,Object>(Map.of("mode","SOLO","requestId",UUID.randomUUID().toString())); wrong.put("board",List.of("X"));
        assertEquals(400,call("POST","/games",wrong,true).status);
        assertEquals(400,call("POST","/games",Map.of("mode","OTHER","requestId",UUID.randomUUID().toString()),true).status);
        JsonNode game=create("LOCAL"); long id=game.path("id").asLong();
        for(Object position:List.of(-1,9,1.5,"1")) assertEquals(400,call("POST","/games/"+id+"/moves",Map.of("position",position,"version",0,"requestId",UUID.randomUUID().toString()),true).status);
        assertEquals(400,call("POST","/games/"+id+"/moves",Map.of("position",0,"version",-1,"requestId",UUID.randomUUID().toString()),true).status);
        assertEquals(0,call("GET","/games/"+id,null,false).body.path("moves").size());
    }
    @Test void createAndMoveRequestIdsAreDurableIdempotencyKeys() throws Exception {
        login(); var input=new LinkedHashMap<String,Object>(Map.of("mode","LOCAL","requestId",UUID.randomUUID().toString()));
        var first=call("POST","/games",input,true); long id=first.body.path("id").asLong();
        assertEquals(id,call("POST","/games",input,true).body.path("id").asLong());
        input.put("mode","SOLO"); assertEquals(409,call("POST","/games",input,true).status);
        var move=new LinkedHashMap<String,Object>(Map.of("position",0,"version",0,"requestId",UUID.randomUUID().toString()));
        assertEquals(200,call("POST","/games/"+id+"/moves",move,true).status);
        var retried=call("POST","/games/"+id+"/moves",move,true); assertEquals(200,retried.status); assertEquals(1,retried.body.path("moves").size());
        move.put("position",1); assertEquals(409,call("POST","/games/"+id+"/moves",move,true).status);
        assertEquals(1,call("GET","/games",null,false).body.size());
    }
    @Test void staleAndSimultaneousMovesCannotTakeTwoTurns() throws Exception {
        login(); JsonNode game=create("LOCAL"); long id=game.path("id").asLong();
        ExecutorService pool=Executors.newFixedThreadPool(2);
        try {
            var tasks=List.<Callable<Result>>of(
                ()->call("POST","/games/"+id+"/moves",Map.of("position",0,"version",0,"requestId",UUID.randomUUID().toString()),true),
                ()->call("POST","/games/"+id+"/moves",Map.of("position",1,"version",0,"requestId",UUID.randomUUID().toString()),true));
            var results=pool.invokeAll(tasks).stream().map(f->{try{return f.get().status;}catch(Exception ex){throw new RuntimeException(ex);}}).sorted().toList();
            assertEquals(List.of(200,409),results); assertEquals(1,call("GET","/games/"+id,null,false).body.path("moves").size());
        } finally { pool.shutdownNow(); }
    }
    @Test void concurrentIdenticalRetriesApplyTheMoveOnce() throws Exception {
        login(); long id=create("SOLO").path("id").asLong();
        var payload=Map.of("position",0,"version",0,"requestId",UUID.randomUUID().toString());
        ExecutorService pool=Executors.newFixedThreadPool(2);
        try {
            var tasks=List.<Callable<Result>>of(()->call("POST","/games/"+id+"/moves",payload,true),()->call("POST","/games/"+id+"/moves",payload,true));
            for(var result:pool.invokeAll(tasks)) assertEquals(200,result.get().status);
            assertEquals(2,call("GET","/games/"+id,null,false).body.path("moves").size());
        } finally { pool.shutdownNow(); }
    }
    @Test void gamesHistoryAndIdempotencySurviveAnActualRestart() throws Exception {
        login(); var input=Map.of("mode","LOCAL","requestId",UUID.randomUUID().toString());
        long id=call("POST","/games",input,true).body.path("id").asLong();
        var move=Map.of("position",0,"version",0,"requestId",UUID.randomUUID().toString());
        assertEquals(200,call("POST","/games/"+id+"/moves",move,true).status);
        context.close(); context=open(); login();
        var saved=call("GET","/games/"+id,null,false).body;
        assertEquals("X",saved.path("board").get(0).asText()); assertEquals(1,saved.path("moves").size());
        assertEquals(1,call("POST","/games/"+id+"/moves",move,true).body.path("moves").size());
        assertEquals(id,call("POST","/games",input,true).body.path("id").asLong());
    }
}
