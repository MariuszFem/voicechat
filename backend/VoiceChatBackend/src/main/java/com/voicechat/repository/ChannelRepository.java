package com.voicechat.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.voicechat.model.Channel;

public interface ChannelRepository extends JpaRepository<Channel, Long> {
    List<Channel> findByRoomRoomId(String roomId);
}
