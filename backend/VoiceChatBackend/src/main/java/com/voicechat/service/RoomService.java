package com.voicechat.service;

import com.voicechat.model.Room;
import com.voicechat.repository.RoomRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class RoomService {

    private final RoomRepository roomRepository;

    public RoomService(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    public Room createRoom() {
        String roomId = UUID.randomUUID().toString();
        String accessCode = generateCode();
        Room room = new Room(roomId, accessCode);
        return roomRepository.save(room);
    }

    public Room joinRoom(String roomId, String accessCode) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));

        if (!room.getAccessCode().equals(accessCode)) {
            throw new RuntimeException("Invalid access code");
        }

        return room;
    }

    private String generateCode() {
        return String.valueOf((int)(Math.random() * 900000 + 100000));
    }
}
