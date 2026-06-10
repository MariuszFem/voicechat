package com.voicechat.model;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class ChatMessage {

    /** Typy: CHAT, RAISE_HAND, MUTE, KICK, DM, USER_LIST */
    private String type;

    private String sender;
    private String content;
    private String roomId;

    /** Tylko dla DM: nazwa użytkownika-odbiorcy */
    private String targetUser;

    /** Timestamp wiadomości (ISO string) */
    private String timestamp;

    public ChatMessage() {}

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getSender() { return sender; }
    public void setSender(String sender) { this.sender = sender; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public String getTargetUser() { return targetUser; }
    public void setTargetUser(String targetUser) { this.targetUser = targetUser; }

    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }

    public void stampNow() {
        this.timestamp = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }
}
