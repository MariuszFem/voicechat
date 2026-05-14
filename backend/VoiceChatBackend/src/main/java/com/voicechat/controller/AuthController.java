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
            String username = body.get("username");
            String password = body.get("password");

            // FIX: Role is always STUDENT on self-registration.
            // Anyone could previously send "role":"TEACHER" and get full privileges.
            // To create a TEACHER account, use the /api/auth/register-teacher endpoint (secured).
            String role = "STUDENT";

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

    // Separate endpoint to register a teacher — only existing TEACHERs can do this.
    // Secured in SecurityConfig with .hasRole("TEACHER")
    @PostMapping("/register-teacher")
    public ResponseEntity<?> registerTeacher(@RequestBody Map<String, String> body) {
        try {
            String username = body.get("username");
            String password = body.get("password");

            String token = authService.register(username, password, "TEACHER");

            return ResponseEntity.ok(Map.of(
                    "token", token,
                    "username", username,
                    "role", "TEACHER"
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        try {
            String username = body.get("username");
            String password = body.get("password");

            String token = authService.login(username, password);
            var user = authService.getUserByUsername(username);

            return ResponseEntity.ok(Map.of(
                    "token", token,
                    "username", username,
                    "role", user.getRole()
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}