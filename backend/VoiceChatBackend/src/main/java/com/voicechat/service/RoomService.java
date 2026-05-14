package com.voicechat.service;

import com.voicechat.model.Room;
import com.voicechat.model.User;
import com.voicechat.repository.RoomRepository;
import com.voicechat.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class RoomService {

    private final RoomRepository roomRepository;
    private final UserRepository userRepository;

    public RoomService(RoomRepository roomRepository, UserRepository userRepository) {
        this.roomRepository = roomRepository;
        this.userRepository = userRepository;
    }

    public Room createRoom(String name, String description, String username) {
        User user = userRepository.findByUsername(username).orElse(null);

        Room room = new Room();
        room.setName(name);
        room.setDescription(description);
        room.setOwnerId(user != null ? user.getId() : 1L);

        // FIX: generateCode now checks for duplicates
        room.setAccessCode(generateCode());

        return roomRepository.save(room);
    }

    public Room joinRoom(String accessCode, String username) {
        // FIX: No longer loads all rooms — uses indexed query
        Room room = roomRepository.findByAccessCode(accessCode)
                .orElseThrow(() -> new RuntimeException("Nieprawidłowy kod sali"));

        if (!room.getAttendanceList().contains(username)) {
            room.getAttendanceList().add(username);
        }

        return roomRepository.save(room);
    }

    // FIX: Remove user from attendance list when they leave/disconnect
    public void leaveRoom(String accessCode, String username) {
        roomRepository.findByAccessCode(accessCode).ifPresent(room -> {
            room.getAttendanceList().remove(username);
            roomRepository.save(room);
        });
    }

    // Remove user from ALL rooms (used on WebSocket disconnect)
    public void removeUserFromAllRooms(String username) {
        List<Room> rooms = roomRepository.findAll();
        for (Room room : rooms) {
            if (room.getAttendanceList().remove(username)) {
                roomRepository.save(room);
            }
        }
    }

    public List<Room> getAllRooms() {
        return roomRepository.findAll();
    }

    // FIX: Keeps generating until a unique code is found
    private String generateCode() {
        String code;
        do {
            code = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        } while (roomRepository.findByAccessCode(code).isPresent());
        return code;
    }
}