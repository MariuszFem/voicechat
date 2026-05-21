package com.voicechat.handler;

import com.voicechat.service.RoomService;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;

@Component
public class WebSocketDisconnectHandler {

    private final RoomService roomService;

    public WebSocketDisconnectHandler(RoomService roomService) {
        this.roomService = roomService;
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        Principal user = accessor.getUser();

        if (user != null) {
            // Remove user from all rooms when they close the tab or lose connection
            roomService.removeUserFromAllRooms(user.getName());
        }
    }
}