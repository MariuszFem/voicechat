package com.voicechat.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.voicechat.model.Channel;
import com.voicechat.model.Room;
import com.voicechat.repository.ChannelRepository;
import com.voicechat.repository.RoomRepository;

@Service
public class RoomService {

    private final RoomRepository roomRepository;
    private final ChannelRepository channelRepository;

    public RoomService(RoomRepository roomRepository, ChannelRepository channelRepository) {
        this.roomRepository = roomRepository;
        this.channelRepository = channelRepository;
    }

    public Room createRoom(String name, String ownerUsername) {
        String roomId = UUID.randomUUID().toString().substring(0, 8);
        Room room = new Room(roomId, name, ownerUsername);
        room = roomRepository.save(room);
        // domyślny kanał głosowy
        channelRepository.save(new Channel("ogólny", room));
        return room;
    }

    public List<Room> getAllRooms() {
        return roomRepository.findAll();
    }

    public Room getRoom(String roomId) {
        return roomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Pokój nie istnieje"));
    }

    public Channel createChannel(String roomId, String name) {
        Room room = getRoom(roomId);
        return channelRepository.save(new Channel(name, room));
    }

    public List<Channel> getChannels(String roomId) {
        return channelRepository.findByRoomRoomId(roomId);
    }
}
