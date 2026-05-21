package com.voicechat.security;

import java.util.List;
import java.util.Map;

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

        if (accessor != null && StompCommand.SEND.equals(accessor.getCommand())) {
            String dest = accessor.getDestination();
            Map<String, Object> attrs = accessor.getSessionAttributes();
            if (dest != null && dest.startsWith("/topic/voice/") && attrs != null) {
                attrs.put("channelId", dest.replace("/topic/voice/", ""));
            }
        }

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

            accessor.setUser(auth);

            String senderId = accessor.getFirstNativeHeader("senderId");
            Map<String, Object> attrs = accessor.getSessionAttributes();
            if (senderId != null && attrs != null) {
                attrs.put("senderId", senderId);
            }
        }

        return message;
    }
}