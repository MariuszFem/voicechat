package com.voicechat.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.voicechat.model.Attendance;

public interface AttendanceRepository extends JpaRepository<Attendance, Long> {
    List<Attendance> findByRoomId(String roomId);
    List<Attendance> findByUsername(String username);
    Optional<Attendance> findTopByUsernameAndRoomIdAndLeftAtIsNullOrderByJoinedAtDesc(
            String username, String roomId);
}
