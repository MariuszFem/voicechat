package com.voicechat.controller;

import com.voicechat.model.Room;
import com.voicechat.service.RoomService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @PostMapping
    public Room createRoom() {
        return roomService.createRoom();
    }

    @PostMapping("/{roomId}/join")
    public Room joinRoom(
            @PathVariable String roomId,
            @RequestParam String code
    ) {
        return roomService.joinRoom(roomId, code);
    }
}


//pozwala tworzyć pokoje, dołączać do pokoi,