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
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Użytkownik nie istnieje"));

        if (!"TEACHER".equals(user.getRole())) {
            throw new RuntimeException("Tylko prowadzący może tworzyć sale!");
        }

        Room room = new Room();
        room.setName(name);
        room.setDescription(description);
        room.setOwnerId(user.getId());
        room.setAccessCode(generateCode());

        return roomRepository.save(room);
    }

    public Room joinRoom(String accessCode, String username) {
        Room room = roomRepository.findAll().stream()
                .filter(r -> accessCode.equals(r.getAccessCode()))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("Nieprawidłowy kod sali"));

        if (!room.getAttendanceList().contains(username)) {
            room.getAttendanceList().add(username);
        }

        return roomRepository.save(room);
    }

    public List<Room> getAllRooms() {
        return roomRepository.findAll();
    }

    private String generateCode() {
        return UUID.randomUUID().toString().substring(0, 6).toUpperCase();
    }
}