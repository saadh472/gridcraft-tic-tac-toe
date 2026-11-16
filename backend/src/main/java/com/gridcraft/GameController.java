package com.gridcraft;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api")
class GameController {
    private final GameService service;
    GameController(GameService service) { this.service=service; }
    @GetMapping("/health") Map<String,String> health() { return Map.of("application","gridcraft","status","ok"); }
    @GetMapping("/games") List<GameService.Game> games() { return service.all(); }
    @GetMapping("/games/{id}") GameService.Game game(@PathVariable long id) { return service.get(id); }
    @PostMapping("/games") @ResponseStatus(HttpStatus.CREATED)
    GameService.Game create(@Valid @RequestBody GameService.NewGame input) { return service.create(input); }
    @PostMapping("/games/{id}/moves")
    GameService.Game move(@PathVariable long id,@Valid @RequestBody GameService.NewMove input) { return service.move(id,input); }
    @GetMapping("/stats") GameService.Stats stats() { return service.stats(); }
}
