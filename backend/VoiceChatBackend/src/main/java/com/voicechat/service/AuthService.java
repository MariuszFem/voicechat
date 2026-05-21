package com.voicechat.service;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.voicechat.model.User;
import com.voicechat.repository.UserRepository;
import com.voicechat.security.JwtUtil;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    public record AuthResult(String token, String username, String role) {}

    public AuthResult register(String username, String password, String role) {
        if (userRepository.existsByUsername(username)) {
            throw new RuntimeException("Użytkownik już istnieje");
        }
        String normalizedRole = "TEACHER".equalsIgnoreCase(role) ? "TEACHER" : "STUDENT";
        User user = new User(username, passwordEncoder.encode(password), normalizedRole);
        userRepository.save(user);
        return new AuthResult(jwtUtil.generateToken(username, normalizedRole), username, normalizedRole);
    }

    public AuthResult login(String username, String password) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Nieprawidłowy login lub hasło"));
        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new RuntimeException("Nieprawidłowy login lub hasło");
        }
        return new AuthResult(jwtUtil.generateToken(username, user.getRole()), username, user.getRole());
    }
}
