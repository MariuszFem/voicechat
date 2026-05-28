package com.voicechat.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "attendance")
public class Attendance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String roomId;

    private Long channelId;

    private LocalDateTime joinedAt = LocalDateTime.now();

    private LocalDateTime leftAt;

    public Attendance() {}

    public Attendance(String username, String roomId, Long channelId) {
        this.username  = username;
        this.roomId    = roomId;
        this.channelId = channelId;
    }

    public Long getId()                  { return id; }
    public String getUsername()          { return username; }
    public String getRoomId()            { return roomId; }
    public Long getChannelId()           { return channelId; }
    public LocalDateTime getJoinedAt()   { return joinedAt; }
    public LocalDateTime getLeftAt()     { return leftAt; }
    public void setLeftAt(LocalDateTime t) { this.leftAt = t; }
}
