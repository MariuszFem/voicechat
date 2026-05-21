package com.voicechat.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.voicechat.model.Room;

public interface RoomRepository extends JpaRepository<Room, String> {
}
