package com.voicechat.service;

import com.voicechat.model.User;
import com.voicechat.repository.UserRepository;
import com.voicechat.security.JwtUtil;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

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

    // Dodaliśmy parametr 'role'
    public String register(String username, String password, String role) {
        if (userRepository.existsByUsername(username)) {
            throw new RuntimeException("Użytkownik już istnieje");
        }

        // Tworzymy użytkownika i ustawiamy wszystkie pola
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        user.setRole(role != null ? role : "STUDENT"); // Domyślnie Student jeśli rola jest pusta

        userRepository.save(user);
        return jwtUtil.generateToken(username);
    }

    public String login(String username, String password) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Nieprawidłowy login lub hasło"));

        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new RuntimeException("Nieprawidłowy login lub hasło");
        }

        return jwtUtil.generateToken(username);
    }
}