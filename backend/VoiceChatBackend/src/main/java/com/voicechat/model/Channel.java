package com.voicechat.model;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "channels")
public class Channel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "room_id")
    @JsonIgnore
    private Room room;

    // convenience field for JSON responses
    private String roomId;

    public Channel() {}

    public Channel(String name, Room room) {
        this.name = name;
        this.room = room;
        this.roomId = room.getRoomId();
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public Room getRoom() { return room; }
    public String getRoomId() { return roomId; }
}
