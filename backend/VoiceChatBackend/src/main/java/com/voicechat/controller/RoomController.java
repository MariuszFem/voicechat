package com.voicechat.controller;

import com.voicechat.model.Room;
import com.voicechat.service.RoomService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @PostMapping("/create")
    public ResponseEntity<?> createRoom(@RequestBody Map<String, String> body) {
        try {
            String name = body.get("name");
            String description = body.get("description");

            // FIX: Username comes from the JWT token, not the request body
            // This prevents anyone from impersonating another user
            String username = SecurityContextHolder.getContext().getAuthentication().getName();

            Room room = roomService.createRoom(name, description, username);
            return ResponseEntity.ok(room);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("Błąd serwera: " + e.getMessage());
        }
    }

    @PostMapping("/join")
    public ResponseEntity<?> joinRoom(@RequestBody Map<String, String> body) {
        try {
            String accessCode = body.get("accessCode");

            // FIX: Username comes from the JWT token, not the request body
            String username = SecurityContextHolder.getContext().getAuthentication().getName();

            Room room = roomService.joinRoom(accessCode, username);
            return ResponseEntity.ok(room);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/leave")
    public ResponseEntity<?> leaveRoom(@RequestBody Map<String, String> body) {
        try {
            String accessCode = body.get("accessCode");
            String username = SecurityContextHolder.getContext().getAuthentication().getName();

            roomService.leaveRoom(accessCode, username);
            return ResponseEntity.ok(Map.of("message", "Opuszczono salę"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/all")
    public List<Room> getAllRooms() {
        return roomService.getAllRooms();
    }
}