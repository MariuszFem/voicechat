package com.voicechat.controller;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class SignalController {

    private final SimpMessagingTemplate messagingTemplate;

    public SignalController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    // FIX: Was broadcasting to ALL users in ALL rooms before.
    // Now each room gets its own topic: /topic/signal/{roomId}
    // Frontend must subscribe to /topic/signal/{roomId}
    // and send signals to /app/signal/{roomId}
    @MessageMapping("/signal/{roomId}")
    public void handleSignal(@DestinationVariable String roomId, String jsonMessage) {
        messagingTemplate.convertAndSend("/topic/signal/" + roomId, jsonMessage);
    }
}