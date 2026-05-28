package com.voicechat.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.voicechat.model.Attendance;
import com.voicechat.service.AttendanceService;

@RestController
@RequestMapping("/api")
public class AttendanceController {

    private final AttendanceService attendanceService;

    public AttendanceController(AttendanceService attendanceService) {
        this.attendanceService = attendanceService;
    }

    @GetMapping("/rooms/{roomId}/attendance")
    public ResponseEntity<?> getRoomAttendance(@PathVariable("roomId") String roomId, Authentication auth) {
        boolean isTeacher = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_TEACHER"));
        if (!isTeacher) {
            return ResponseEntity.status(403).body(Map.of("error", "Brak uprawnień"));
        }
        List<Attendance> list = attendanceService.getAttendanceForRoom(roomId);
        return ResponseEntity.ok(list);
    }

    // Zapis wejścia do kanału
    @PostMapping("/attendance/join")
    public ResponseEntity<?> join(@RequestBody Map<String, Object> body, Authentication auth) {
        String roomId    = (String) body.get("roomId");
        Long   channelId = body.get("channelId") != null
                ? Long.valueOf(body.get("channelId").toString()) : null;
        attendanceService.recordJoin(auth.getName(), roomId, channelId);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    // Zapis wyjścia z kanału
    @PostMapping("/attendance/leave")
    public ResponseEntity<?> leave(@RequestBody Map<String, String> body, Authentication auth) {
        attendanceService.recordLeave(auth.getName(), body.get("roomId"));
        return ResponseEntity.ok(Map.of("status", "ok"));
    }
}
