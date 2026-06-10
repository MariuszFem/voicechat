package com.voicechat.controller;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.voicechat.model.User;
import com.voicechat.repository.UserRepository;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserController(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository  = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /** Lista wszystkich użytkowników (do otwierania DM) — zwraca username i rolę */
    @GetMapping("/all")
    public ResponseEntity<List<Map<String, String>>> listAllUsers(Authentication auth) {
        String me = auth.getName();
        List<Map<String, String>> users = userRepository.findAll()
                .stream()
                .filter(u -> !u.getUsername().equals(me))
                .map(u -> Map.of(
                        "username", u.getUsername(),
                        "role", u.getRole() != null ? u.getRole() : "STUDENT"
                ))
                .collect(Collectors.toList());
        return ResponseEntity.ok(users);
    }

    @GetMapping("/me")
    public ResponseEntity<?> getMe(Authentication auth) {
        return userRepository.findByUsername(auth.getName())
                .map(u -> ResponseEntity.ok(Map.of(
                        "username", u.getUsername(),
                        "role",     u.getRole()
                )))
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/me/password")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, String> body,
                                            Authentication auth) {
        String oldPassword = body.get("oldPassword");
        String newPassword = body.get("newPassword");

        if (oldPassword == null || newPassword == null || newPassword.length() < 4) {
            return ResponseEntity.badRequest().body(Map.of("error", "Nieprawidłowe dane"));
        }

        User user = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new RuntimeException("Użytkownik nie istnieje"));

        if (!passwordEncoder.matches(oldPassword, user.getPassword())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Stare hasło jest nieprawidłowe"));
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("status", "Hasło zmienione"));
    }
}
