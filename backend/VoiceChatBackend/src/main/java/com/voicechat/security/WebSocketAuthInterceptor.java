package com.voicechat.security;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import java.util.List;

// NEW FILE: Validates JWT when a user connects via WebSocket.
// Without this, anyone could connect to /ws without being logged in.
@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private final JwtUtil jwtUtil;

    public WebSocketAuthInterceptor(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        // Only check on initial CONNECT, not every message
        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String authHeader = accessor.getFirstNativeHeader("Authorization");

            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                throw new MessagingException("Brak tokenu autoryzacji");
            }

            String token = authHeader.substring(7);

            if (!jwtUtil.isValid(token)) {
                throw new MessagingException("Nieprawidłowy token JWT");
            }

            String username = jwtUtil.extractUsername(token);
            String role = jwtUtil.extractRole(token);
            String roleWithPrefix = role.startsWith("ROLE_") ? role : "ROLE_" + role;

            var auth = new UsernamePasswordAuthenticationToken(
                    username,
                    null,
                    List.of(new SimpleGrantedAuthority(roleWithPrefix))
            );

            // Attach the authenticated user to the WebSocket session
            accessor.setUser(auth);
        }

        return message;
    }
}