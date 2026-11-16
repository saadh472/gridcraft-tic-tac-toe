package com.gridcraft;

import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<?> request(ResponseStatusException ex) { return ResponseEntity.status(ex.getStatusCode()).body(Map.of("message",ex.getReason()==null?"Request could not be completed.":ex.getReason())); }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> validation(MethodArgumentNotValidException ex) {
        var error=ex.getBindingResult().getFieldErrors().stream().findFirst();
        return ResponseEntity.badRequest().body(Map.of("message",error.map(e->e.getField()+" "+e.getDefaultMessage()).orElse("Check the supplied fields.")));
    }
    @ExceptionHandler({HttpMessageNotReadableException.class,ArithmeticException.class})
    ResponseEntity<?> malformed(Exception ex) { return ResponseEntity.badRequest().body(Map.of("message","Provide valid JSON with whole-number positions and versions, and only the documented fields.")); }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict(DataIntegrityViolationException ex) { return ResponseEntity.status(409).body(Map.of("message","That change conflicts with an existing record.")); }
    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<?> unavailable(DataAccessException ex) { return ResponseEntity.status(503).body(Map.of("message","The database is temporarily unavailable. Refresh records before trying another change.")); }
}
