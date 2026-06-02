package com.voicechat.controller;

import com.voicechat.model.ChatMessage;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;

    public ChatController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/room/{roomId}/chat")
    public void processMessage(@DestinationVariable String roomId, ChatMessage message) {
        System.out.println("[Pokój: " + roomId + "] Akcja: " + message.getType() + " od: " + message.getSender());
        message.setRoomId(roomId);
        messagingTemplate.convertAndSend("/topic/room/" + roomId, message);
    }
}