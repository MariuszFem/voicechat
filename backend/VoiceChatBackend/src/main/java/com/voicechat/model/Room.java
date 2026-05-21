package com.voicechat.model;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

@Entity
@Table(name = "rooms")
public class Room {

    @Id
    private String roomId;

    @Column(nullable = false)
    private String name;

    private String ownerUsername;

    private LocalDateTime createdAt = LocalDateTime.now();

    @OneToMany(mappedBy = "room", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Channel> channels = new ArrayList<>();

    public Room() {}

    public Room(String roomId, String name, String ownerUsername) {
        this.roomId = roomId;
        this.name = name;
        this.ownerUsername = ownerUsername;
    }

    public String getRoomId() { return roomId; }
    public String getName() { return name; }
    public String getOwnerUsername() { return ownerUsername; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public List<Channel> getChannels() { return channels; }
}
