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

    public String register(String username, String password, String role) {
        if (userRepository.existsByUsername(username)) {
            throw new RuntimeException("Użytkownik już istnieje");
        }

        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));

        // Upewniamy się, że rola jest zapisana dużymi literami (standard w Spring Security)
        String userRole = (role != null && !role.isEmpty()) ? role.toUpperCase() : "STUDENT";
        user.setRole(userRole);

        userRepository.save(user);

        // KLUCZOWA ZMIANA: Przekazujemy username i role do tokena
        return jwtUtil.generateToken(user.getUsername(), user.getRole());
    }

    public String login(String username, String password) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Nieprawidłowy login lub hasło"));

        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new RuntimeException("Nieprawidłowy login lub hasło");
        }

        // KLUCZOWA ZMIANA: Przekazujemy username i role do tokena przy logowaniu
        return jwtUtil.generateToken(user.getUsername(), user.getRole());
    }

    public User getUserByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Użytkownik nie znaleziony"));
    }
}