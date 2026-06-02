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

    public Room createRoom(String name, String description, String ownerUsername) {
        String roomId = UUID.randomUUID().toString().substring(0, 8);
        Room room = new Room(roomId, name, description, ownerUsername);
        room = roomRepository.save(room);
        channelRepository.save(new Channel("ogólny", room));
        return room;
    }

    // backward compat
    public Room createRoom(String name, String ownerUsername) {
        return createRoom(name, "", ownerUsername);
    }

    public Room updateRoom(String roomId, String name, String description, String requesterUsername) {
        Room room = getRoom(roomId);
        if (!room.getOwnerUsername().equals(requesterUsername)) {
            throw new RuntimeException("Brak uprawnień do edycji tego pokoju");
        }
        if (name != null && !name.isBlank()) room.setName(name);
        if (description != null) room.setDescription(description);
        return roomRepository.save(room);
    }

    public void deleteRoom(String roomId, String requesterUsername) {
        Room room = getRoom(roomId);
        if (!room.getOwnerUsername().equals(requesterUsername)) {
            throw new RuntimeException("Brak uprawnień do usunięcia tego pokoju");
        }
        roomRepository.delete(room);
    }

    public List<Room> getAllRooms() {
        return roomRepository.findAll();
    }

    public Room getRoom(String roomId) {
        return roomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Pokój nie istnieje"));
    }

    public Channel createChannel(String roomId, String name, String type) {
        Room room = roomRepository.findById(roomId).orElseThrow();
        Channel channel = new Channel(name, room);
        channel.setType(type);
        return channelRepository.save(channel);
    }

    public List<Channel> getChannels(String roomId) {
        return channelRepository.findByRoomRoomId(roomId);
    }
}
