package com.voicechat.repository;

import com.voicechat.model.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

// FIX: Changed String -> Long to match Room's @Id type (was crashing at startup)
public interface RoomRepository extends JpaRepository<Room, Long> {
    Optional<Room> findByAccessCode(String accessCode);
}