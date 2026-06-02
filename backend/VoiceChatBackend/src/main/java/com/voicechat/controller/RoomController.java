package com.voicechat.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.voicechat.model.Channel;
import com.voicechat.model.Room;
import com.voicechat.service.RoomService;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @GetMapping
    public List<Room> getAllRooms() {
        return roomService.getAllRooms();
    }

    @PostMapping
    public ResponseEntity<?> createRoom(@RequestBody Map<String, String> body, Authentication auth) {
        String name = body.get("name");
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Podaj nazwę pokoju"));
        }
        String description = body.getOrDefault("description", "");
        Room room = roomService.createRoom(name, description, auth.getName());
        return ResponseEntity.ok(room);
    }

    @PutMapping("/{roomId}")
    public ResponseEntity<?> updateRoom(@PathVariable("roomId") String roomId,
                                        @RequestBody Map<String, String> body,
                                        Authentication auth) {
        try {
            Room room = roomService.updateRoom(roomId, body.get("name"), body.get("description"), auth.getName());
            return ResponseEntity.ok(room);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{roomId}")
    public ResponseEntity<?> deleteRoom(@PathVariable("roomId") String roomId, Authentication auth) {
        try {
            roomService.deleteRoom(roomId, auth.getName());
            return ResponseEntity.ok(Map.of("status", "Pokój usunięty"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{roomId}/channels")
    public List<Channel> getChannels(@PathVariable("roomId") String roomId) {
        return roomService.getChannels(roomId);
    }

    @PostMapping("/{roomId}/channels")
    public ResponseEntity<?> createChannel(@PathVariable("roomId") String roomId,
                                           @RequestBody Map<String, String> body) {
        String name = body.get("name");
        // TUTAJ DODANO: Pobieramy typ z frontendu (domyślnie VOICE, jeśli nie podano)
        String type = body.getOrDefault("type", "VOICE");

        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Podaj nazwę kanału"));
        }

        // TUTAJ ZMIENIONO: Przekazujemy 'type' do metody serwisu
        return ResponseEntity.ok(roomService.createChannel(roomId, name, type));
    }
}