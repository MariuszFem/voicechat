package com.voicechat.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class Room {

    @Id
    private String roomId;

    private String accessCode;

    public Room() {
    }

    public Room(String roomId, String accessCode) {
        this.roomId = roomId;
        this.accessCode = accessCode;
    }

    public String getRoomId() {
        return roomId;
    }

    public String getAccessCode() {
        return accessCode;
    }
}
