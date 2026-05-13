package com.voicechat.model;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
public class Room {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String description;
    private String accessCode;
    private Long ownerId;

    @ElementCollection
    private List<String> attendanceList = new ArrayList<>();

    public Room() {}

    public Room(String name, String description, String accessCode, Long ownerId) {
        this.name = name;
        this.description = description;
        this.accessCode = accessCode;
        this.ownerId = ownerId;
    }

    public Long getId() { return id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getAccessCode() { return accessCode; }
    public void setAccessCode(String accessCode) { this.accessCode = accessCode; }

    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long ownerId) { this.ownerId = ownerId; }

    public List<String> getAttendanceList() { return attendanceList; }
    public void setAttendanceList(List<String> attendanceList) { this.attendanceList = attendanceList; }
}