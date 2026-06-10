package com.voicechat.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "messages")
public class StoredMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Dla wiadomości kanałowych: ID kanału; dla DM: null */
    private Long channelId;

    /** Dla prywatnych wiadomości: "dm:{user1}:{user2}" (posortowane); dla kanałów: null */
    private String dmConversationKey;

    @Column(nullable = false)
    private String sender;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    private LocalDateTime sentAt = LocalDateTime.now();

    public StoredMessage() {}

    /** Konstruktor dla wiadomości kanałowej */
    public StoredMessage(Long channelId, String sender, String content) {
        this.channelId = channelId;
        this.sender = sender;
        this.content = content;
        this.sentAt = LocalDateTime.now();
    }

    /** Konstruktor dla wiadomości prywatnej (DM) */
    public StoredMessage(String dmConversationKey, String sender, String content) {
        this.dmConversationKey = dmConversationKey;
        this.sender = sender;
        this.content = content;
        this.sentAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public Long getChannelId() { return channelId; }
    public String getDmConversationKey() { return dmConversationKey; }
    public String getSender() { return sender; }
    public String getContent() { return content; }
    public LocalDateTime getSentAt() { return sentAt; }
}
