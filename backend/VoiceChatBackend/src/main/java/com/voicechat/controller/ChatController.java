package com.voicechat.controller;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.voicechat.model.ChatMessage;
import com.voicechat.model.StoredMessage;
import com.voicechat.repository.MessageRepository;

@RestController
@RequestMapping("/api")
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;
    private final MessageRepository messageRepository;

    public ChatController(SimpMessagingTemplate messagingTemplate,
                          MessageRepository messageRepository) {
        this.messagingTemplate = messagingTemplate;
        this.messageRepository = messageRepository;
    }

    // ----------------------------------------------------------------
    // WebSocket: wiadomości kanałowe
    // ----------------------------------------------------------------

    @MessageMapping("/room/{channelId}/chat")
    public void processChannelMessage(@DestinationVariable String channelId,
                                      ChatMessage message,
                                      Principal principal) {

        String senderName = principal != null ? principal.getName() : message.getSender();
        message.setSender(senderName);
        message.setRoomId(channelId);
        message.stampNow();

        System.out.println("[Kanał: " + channelId + "] Typ: " + message.getType() + " od: " + senderName);

        // Zapisujemy tylko zwykłe wiadomości CHAT
        if ("CHAT".equals(message.getType())) {
            try {
                Long chId = Long.parseLong(channelId);
                messageRepository.save(new StoredMessage(chId, senderName, message.getContent()));
            } catch (NumberFormatException ignored) {
                // channelId nie jest Long — nie zapisujemy (np. roomId)
            }
        }

        messagingTemplate.convertAndSend("/topic/room/" + channelId, message);
    }

    // ----------------------------------------------------------------
    // WebSocket: prywatne wiadomości (DM)
    // ----------------------------------------------------------------

    @MessageMapping("/dm")
    public void processDm(ChatMessage message, Principal principal) {
        String senderName = principal != null ? principal.getName() : message.getSender();
        String targetUser = message.getTargetUser();

        if (targetUser == null || targetUser.isBlank()) return;

        message.setSender(senderName);
        message.setType("DM");
        message.stampNow();

        String convKey = buildConversationKey(senderName, targetUser);
        messageRepository.save(new StoredMessage(convKey, senderName, message.getContent()));

        // Wysyłamy do obu uczestników na ich prywatne tematy
        messagingTemplate.convertAndSend("/topic/dm/" + senderName, message);
        if (!targetUser.equals(senderName)) {
            messagingTemplate.convertAndSend("/topic/dm/" + targetUser, message);
        }
    }

    // ----------------------------------------------------------------
    // REST: historia wiadomości kanału
    // ----------------------------------------------------------------

    @GetMapping("/channels/{channelId}/messages")
    public ResponseEntity<List<Map<String, String>>> getChannelHistory(
            @PathVariable Long channelId) {

        List<Map<String, String>> result = messageRepository
                .findTop100ByChannelIdOrderBySentAtAsc(channelId)
                .stream()
                .map(m -> Map.of(
                        "sender", m.getSender(),
                        "content", m.getContent(),
                        "timestamp", m.getSentAt().toString(),
                        "type", "CHAT"
                ))
                .collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    // ----------------------------------------------------------------
    // REST: historia prywatnych wiadomości
    // ----------------------------------------------------------------

    @GetMapping("/dm/{otherUser}/history")
    public ResponseEntity<List<Map<String, String>>> getDmHistory(
            @PathVariable String otherUser,
            Authentication auth) {

        String me = auth.getName();
        String convKey = buildConversationKey(me, otherUser);

        List<Map<String, String>> result = messageRepository
                .findTop100ByDmConversationKeyOrderBySentAtAsc(convKey)
                .stream()
                .map(m -> Map.of(
                        "sender", m.getSender(),
                        "content", m.getContent(),
                        "timestamp", m.getSentAt().toString(),
                        "type", "DM",
                        "targetUser", otherUser
                ))
                .collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    // ----------------------------------------------------------------
    // Pomocnicze
    // ----------------------------------------------------------------

    /** Tworzy unikalny klucz konwersacji niezależny od kolejności uczestników */
    private static String buildConversationKey(String user1, String user2) {
        return "dm:" + (user1.compareTo(user2) <= 0
                ? user1 + ":" + user2
                : user2 + ":" + user1);
    }
}
