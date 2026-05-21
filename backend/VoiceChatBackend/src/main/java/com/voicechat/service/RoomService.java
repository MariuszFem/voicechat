package com.voicechat.service;

import com.voicechat.model.Room;
import com.voicechat.model.User;
import com.voicechat.repository.RoomRepository;
import com.voicechat.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
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
        room.setAccessCode(generateCode()); // kept for future access-code flow

        return roomRepository.save(room);
    }

    // Join by roomId — no access code needed
    public Room joinRoom(Long roomId, String username) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Sala nie istnieje"));

        if (!room.getAttendanceList().contains(username)) {
            room.getAttendanceList().add(username);
        }

        return roomRepository.save(room);
    }

    // Leave by roomId
    public void leaveRoom(Long roomId, String username) {
        roomRepository.findById(roomId).ifPresent(room -> {
            room.getAttendanceList().remove(username);
            roomRepository.save(room);
        });
    }

    // Called on WebSocket disconnect — removes user from every room
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

    public Optional<Room> getRoom(Long roomId) {
        return roomRepository.findById(roomId);
    }

    private String generateCode() {
        String code;
        do {
            code = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        } while (roomRepository.findByAccessCode(code).isPresent());
        return code;
    }
}