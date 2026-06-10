package com.voicechat.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.voicechat.model.StoredMessage;

public interface MessageRepository extends JpaRepository<StoredMessage, Long> {

    /** Historia wiadomości dla kanału (ostatnie 100, posortowane rosnąco po czasie) */
    List<StoredMessage> findTop100ByChannelIdOrderBySentAtAsc(Long channelId);

    /** Historia prywatnych wiadomości (ostatnie 100) */
    List<StoredMessage> findTop100ByDmConversationKeyOrderBySentAtAsc(String dmConversationKey);
}
