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
            // Username always from JWT, never from request body
            String username = SecurityContextHolder.getContext().getAuthentication().getName();

            Room room = roomService.createRoom(name, description, username);
            return ResponseEntity.ok(room);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("Błąd serwera: " + e.getMessage());
        }
    }

    // JOIN by roomId — student clicks the room, no access code needed
    @PostMapping("/join/{roomId}")
    public ResponseEntity<?> joinRoom(@PathVariable Long roomId) {
        try {
            String username = SecurityContextHolder.getContext().getAuthentication().getName();
            Room room = roomService.joinRoom(roomId, username);
            return ResponseEntity.ok(room);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    // LEAVE by roomId
    @PostMapping("/leave/{roomId}")
    public ResponseEntity<?> leaveRoom(@PathVariable Long roomId) {
        try {
            String username = SecurityContextHolder.getContext().getAuthentication().getName();
            roomService.leaveRoom(roomId, username);
            return ResponseEntity.ok(Map.of("message", "Opuszczono salę"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/all")
    public List<Room> getAllRooms() {
        return roomService.getAllRooms();
    }

    @GetMapping("/{roomId}")
    public ResponseEntity<?> getRoom(@PathVariable Long roomId) {
        return roomService.getRoom(roomId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}