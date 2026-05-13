package com.voicechat.controller;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

@Controller
public class SignalController {

    @MessageMapping("/signal")
    @SendTo("/topic/signal")
    public String handleSignal(String jsonMessage) {
        return jsonMessage;
    }
}


//kontroler, czyli obsługuje komunikacje ale na backenedzie oraz wysyła wszystkie komunikaty dalej ( do użytkowników)