package com.voicechat.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocketMessageBroker  //wiadomości wysylanie i odbieranie na serwerze
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {


    //konfiguracja gdzie beda wysyłane wiadmosci na ktorych kanalach
    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic");
        config.setApplicationDestinationPrefixes("/app");
    }


    //ustawilem adres websocketu aby na froncie bylo latwiej dzialac oraz dodalem .withsocketJS aby obsluzyc starsze przegladarki
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOriginPatterns("*").withSockJS();
    }
}
