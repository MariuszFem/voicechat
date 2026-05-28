package com.voicechat.handler;

import java.security.Principal;
import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
public class WebSocketDisconnectHandler {

    private final SimpMessagingTemplate messagingTemplate;

    public WebSocketDisconnectHandler(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        Principal user = accessor.getUser();

        if (user == null) return;

        Map<String, Object> sessionAttrs = accessor.getSessionAttributes();
        if (sessionAttrs == null) return;

        String channelId = (String) sessionAttrs.get("channelId");
        String senderId  = (String) sessionAttrs.get("senderId");

        if (channelId != null && senderId != null) {
            // Poinformuj innych uczestników kanału o rozłączeniu
            messagingTemplate.convertAndSend(
                "/topic/voice/" + channelId,
                Map.of("type", "leave", "senderId", senderId)
            );
        }
    }
}
