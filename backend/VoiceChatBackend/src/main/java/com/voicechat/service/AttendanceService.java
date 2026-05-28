package com.voicechat.service;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;

import com.voicechat.model.Attendance;
import com.voicechat.repository.AttendanceRepository;

@Service
public class AttendanceService {

    private final AttendanceRepository attendanceRepository;

    public AttendanceService(AttendanceRepository attendanceRepository) {
        this.attendanceRepository = attendanceRepository;
    }

    public void recordJoin(String username, String roomId, Long channelId) {
        Attendance a = new Attendance(username, roomId, channelId);
        attendanceRepository.save(a);
    }

    public void recordLeave(String username, String roomId) {
        attendanceRepository
                .findTopByUsernameAndRoomIdAndLeftAtIsNullOrderByJoinedAtDesc(username, roomId)
                .ifPresent(a -> {
                    a.setLeftAt(LocalDateTime.now());
                    attendanceRepository.save(a);
                });
    }

    public List<Attendance> getAttendanceForRoom(String roomId) {
        return attendanceRepository.findByRoomId(roomId);
    }

    public List<Attendance> getAttendanceForUser(String username) {
        return attendanceRepository.findByUsername(username);
    }
}
