package com.voicechat.controller;

import com.voicechat.service.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body) {
        try {
            // Wyciągamy role z body. Jeśli nie ma, ustawiamy domyślnie STUDENT
            String username = body.get("username");
            String password = body.get("password");
            String role = body.getOrDefault("role", "STUDENT");

            String token = authService.register(username, password, role);

            return ResponseEntity.ok(Map.of(
                    "token", token,
                    "username", username,
                    "role", role
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        try {
            String token = authService.login(body.get("username"), body.get("password"));
            // Warto dodać zwracanie roli przy loginie, żeby frontend wiedział co wyświetlić
            return ResponseEntity.ok(Map.of("token", token, "username", body.get("username")));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}