const myId = Math.random().toString(36).substring(7);
let myUsername = '';
let myRole = '';
let currentRoomId = null;
let currentChannelId = null;
let currentChannelType = null;
let chatSubscription = null;
let channelTypeToCreate = 'VOICE';

let stompClient = null;
let dmStompClient = null;      // osobne połączenie STOMP dla DM (działa globalnie, niezależnie od kanału)
let dmSubscription = null;
let currentDmUser = null;      // aktualnie otwarty DM
let dmUnreadCounts = {};       // { username: count }
let allUsers = [];             // cache listy użytkowników
let peerConnections = {};
let earlyIceCandidates = {};
let localStream = null;
let screenStream = null;
let isMuted = false;
let isCamOff = false;
let isSharingScreen = false;
let isHandRaised = false;

// Whiteboard
let wbOpen = false;
let wbDrawing = false;
let wbTool = 'pen';
let wbLastX = 0;
let wbLastY = 0;
let wbCanvas = null;
let wbCtx = null;

// Status mikrofonu uczestników: { username: bool (true=wyciszony) }
let participantMuteState = {};

let authTab = 'login';
let selectedRole = 'STUDENT';

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

window.onload = function () {
    const token = localStorage.getItem('jwt_token');
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    if (token && username && role) {
        myUsername = username;
        myRole = role;
        showApp();
    }
};

function switchAuthTab() {
    authTab = authTab === 'login' ? 'register' : 'login';
    const isLogin = authTab === 'login';
    document.getElementById('auth-title').innerText        = isLogin ? 'Zaloguj się'              : 'Utwórz konto';
    document.getElementById('auth-subtitle').innerText     = isLogin ? 'Wpisz dane swojego konta' : 'Wypełnij poniższe dane';
    document.getElementById('auth-btn').innerText          = isLogin ? 'Zaloguj się'              : 'Zarejestruj się';
    document.getElementById('auth-switch-text').innerText  = isLogin ? 'Nie masz konta?'          : 'Masz już konto?';
    document.getElementById('auth-switch-link').innerText  = isLogin ? ' Zarejestruj się'         : ' Zaloguj się';
    document.getElementById('role-group').style.display    = isLogin ? 'none'                     : 'block';
    document.getElementById('auth-error').style.display    = 'none';
}

function selectRole(role) {
    selectedRole = role;
    document.getElementById('role-opt-student').classList.toggle('active', role === 'STUDENT');
    document.getElementById('role-opt-teacher').classList.toggle('active', role === 'TEACHER');
}

async function submitAuth() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;

    if (!username || !password) { showAuthError('Wypełnij wszystkie pola.'); return; }

    const url  = authTab === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body = authTab === 'login' ? { username, password } : { username, password, role: selectedRole };

    try {
        const res  = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok) { showAuthError(data.error || 'Błąd serwera (' + res.status + ')'); return; }

        localStorage.setItem('jwt_token', data.token);
        localStorage.setItem('username',  data.username);
        localStorage.setItem('role',      data.role);
        myUsername = data.username;
        myRole     = data.role;
        showApp();
    } catch (e) {
        showAuthError('Nie można połączyć się z serwerem.');
        console.error(e);
    }
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.innerText = msg;
    el.style.display = 'block';
}

async function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display         = 'flex';

    document.getElementById('panel-username').innerText    = myUsername;
    document.getElementById('user-avatar-icon').innerText  = myUsername.charAt(0).toUpperCase();
    document.getElementById('panel-role').innerText        = myRole === 'TEACHER' ? '👨‍🏫 Wykładowca' : '🎒 Student';

    document.getElementById('btn-add-room').style.display = 'flex';
    const attWrap = document.getElementById('attendance-btn-wrap');
    if (attWrap) attWrap.style.display = myRole === 'TEACHER' ? 'block' : 'none';

    await loadRooms();
    initDmConnection();
    await loadUserList();
}

function logout() {
    if (currentChannelId) leaveChannel();
    if (dmStompClient) { dmStompClient.disconnect(); dmStompClient = null; }
    localStorage.clear();
    window.location.reload();
}

async function loadRooms() {
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/rooms', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) return;
        const rooms = await res.json();
        renderRooms(Array.isArray(rooms) ? rooms : []);
    } catch (e) { console.error('loadRooms', e); }
}

function renderRooms(rooms) {
    const bar     = document.getElementById('servers-bar');
    const divider = bar.querySelector('.server-divider');
    bar.querySelectorAll('.server-icon:not(.add-server)').forEach(el => el.remove());

    rooms.forEach(room => {
        const el = document.createElement('div');
        el.className = 'server-icon';
        el.title     = room.name;
        el.innerText = room.name.charAt(0).toUpperCase();
        el.dataset.roomId    = room.roomId;
        el.dataset.roomName  = room.name;
        el.onclick = function () { selectRoom(this); };
        bar.insertBefore(el, divider);
    });
}

function selectRoom(el) {
    const roomId    = el.dataset.roomId;
    const roomName  = el.dataset.roomName;
    currentRoomId = roomId;

    document.querySelectorAll('#servers-bar .server-icon:not(.add-server)').forEach(i => i.classList.remove('active'));
    el.classList.add('active');

    document.getElementById('room-header-name').innerText = roomName;
    document.getElementById('btn-add-channel').style.display = myRole === 'TEACHER' ? 'inline' : 'none';
    document.getElementById('btn-add-text-channel').style.display = myRole === 'TEACHER' ? 'inline' : 'none';

    loadChannels(roomId);
}

async function loadChannels(roomId) {
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/rooms/' + roomId + '/channels', {
            headers: { Authorization: 'Bearer ' + token }
        });
        if (!res.ok) return;
        const channels = await res.json();
        renderChannels(Array.isArray(channels) ? channels : []);
    } catch (e) { console.error('loadChannels', e); }
}

function renderChannels(channels) {
    const voiceList = document.getElementById('channel-list');
    const textList = document.getElementById('text-channel-list');
    voiceList.innerHTML = '';
    textList.innerHTML = '';

    if (!channels || channels.length === 0) {
        voiceList.innerHTML = '<div class="channels-empty">Brak kanałów</div>';
        textList.innerHTML = '<div class="channels-empty">Brak kanałów</div>';
        return;
    }

    channels.forEach(ch => {
        const el = document.createElement('div');
        el.className = 'channel-item';
        el.id        = 'ch-' + ch.id;
        const isText = ch.type === 'TEXT';
        el.innerHTML = `<span class="ch-icon">${isText ? '#' : '🔊'}</span><span>${ch.name}</span>`;

        if (isText) {
            el.onclick = () => joinTextChannel(ch.id, ch.name);
            textList.appendChild(el);
        } else {
            el.onclick = () => joinVoice(ch.id, ch.name);
            voiceList.appendChild(el);
        }
    });

    if (textList.children.length === 0) textList.innerHTML = '<div class="channels-empty">Brak kanałów</div>';
    if (voiceList.children.length === 0) voiceList.innerHTML = '<div class="channels-empty">Brak kanałów</div>';
}

function showModal(id) {
    document.getElementById(id).style.display = 'flex';
    const input = document.querySelector('#' + id + ' input');
    if (input) setTimeout(() => input.focus(), 50);
}

function hideModal(id) {
    document.getElementById(id).style.display = 'none';
}

function openChannelModal(type) {
    channelTypeToCreate = type;
    const modalTitle = document.querySelector('#modal-channel h3');
    if (modalTitle) modalTitle.innerText = type === 'TEXT' ? 'Dodaj kanał tekstowy' : 'Dodaj kanał głosowy';
    showModal('modal-channel');
}

async function createRoom() {
    const name = document.getElementById('new-room-name').value.trim();
    const description = document.getElementById('new-room-desc')?.value.trim() || '';
    if (!name) return;
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ name, description })
        });
        if (res.ok) {
            hideModal('modal-room');
            document.getElementById('new-room-name').value = '';
            await loadRooms();
        } else alert('Błąd: ' + res.status);
    } catch (e) { console.error(e); }
}

async function createChannel() {
    const name = document.getElementById('new-channel-name').value.trim();
    if (!name || !currentRoomId) return hideModal('modal-channel');

    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/rooms/' + currentRoomId + '/channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ name: name, type: channelTypeToCreate })
        });
        if (res.ok) {
            hideModal('modal-channel');
            document.getElementById('new-channel-name').value = '';
            await loadChannels(currentRoomId);
        } else alert('Błąd tworzenia kanału.');
    } catch (e) { console.error(e); }
}

async function joinTextChannel(channelId, channelName) {
    if (currentChannelId === channelId) return;
    if (currentChannelId) await leaveChannel();

    currentChannelId = channelId;
    currentChannelType = 'TEXT';

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.getElementById('ch-' + channelId)?.classList.add('active');

    document.getElementById('idle-view').style.display  = 'none';
    document.getElementById('voice-view').style.display = 'none';
    document.getElementById('voice-chat-section').style.display = 'none';
    document.getElementById('text-view').style.display  = 'flex';
    document.getElementById('text-channel-name').innerText = channelName;
    document.getElementById('main-chat-messages').innerHTML = '';

    // Załaduj historię wiadomości
    await loadChannelHistory(channelId);

    const token = localStorage.getItem('jwt_token');
    stompClient = Stomp.over(new SockJS('/ws'));
    stompClient.debug = null;

    stompClient.connect({ Authorization: 'Bearer ' + token }, () => {
        chatSubscription = stompClient.subscribe('/topic/room/' + channelId, msg => {
            handleIncomingChatMessage(JSON.parse(msg.body), true);
        });
    });
}

async function joinVoice(channelId, channelName) {
    if (currentChannelId === channelId) return;
    if (currentChannelId) await leaveChannel();

    currentChannelId = channelId;
    currentChannelType = 'VOICE';

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.getElementById('ch-' + channelId)?.classList.add('active');

    document.getElementById('idle-view').style.display  = 'none';
    document.getElementById('text-view').style.display  = 'none';
    document.getElementById('voice-view').style.display = 'flex';
    document.getElementById('voice-chat-section').style.display = 'flex';
    document.getElementById('voice-channel-name').innerText = channelName;
    document.getElementById('participants-grid').innerHTML  = '';
    document.getElementById('members-list').innerHTML       = '';
    document.getElementById('voice-chat-messages').innerHTML = '';
    document.getElementById('member-count').innerText       = '0';

    addParticipantCard(myId, myUsername, true);
    addMemberItem(myId, myUsername, myRole);

    const token = localStorage.getItem('jwt_token');
    stompClient = Stomp.over(new SockJS('/ws'));
    stompClient.debug = null;

    stompClient.connect({ Authorization: 'Bearer ' + token, senderId: myId }, async () => {
        stompClient.subscribe('/topic/voice/' + channelId, msg => {
            handleSignal(JSON.parse(msg.body));
        });

        chatSubscription = stompClient.subscribe('/topic/room/' + channelId, msg => {
            handleIncomingChatMessage(JSON.parse(msg.body), false);
        });

        // Załaduj historię czatu głosowego
        await loadChannelHistory(channelId, false);

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch {
            try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
            catch (e) { alert('Brak dostępu do mikrofonu/kamery!'); leaveChannel(); return; }
        }

        const videoEl = document.getElementById('video-' + myId);
        if (videoEl) videoEl.srcObject = localStream;

        sendSignal({ type: 'join', username: myUsername, role: myRole });

        // Wyślij własny status mikrofonu zaraz po dołączeniu
        stompClient.send('/app/room/' + channelId + '/chat', {}, JSON.stringify({
            sender: myUsername,
            content: isMuted.toString(),
            type: 'MIC_STATUS'
        }));

        await recordJoin(currentRoomId, channelId);
    }, err => { alert('Błąd połączenia ze STOMP!'); });
}

async function leaveChannel() {
    if (currentChannelType === 'VOICE') {
        if (stompClient) sendSignal({ type: 'leave' });
        if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
        if (localStream)  { localStream.getTracks().forEach(t => t.stop());  localStream  = null; }
        Object.values(peerConnections).forEach(pc => pc.close());
        peerConnections = {};
        earlyIceCandidates = {};
        isMuted = false; isCamOff = false; isSharingScreen = false; isHandRaised = false;
        participantMuteState = {};
        if (wbOpen) closeWhiteboard();
        updateControls();
    }

    if (currentRoomId) await recordLeave(currentRoomId);
    if (stompClient) { stompClient.disconnect(); stompClient = null; }
    chatSubscription = null;

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.getElementById('idle-view').style.display   = 'flex';
    document.getElementById('voice-view').style.display  = 'none';
    document.getElementById('text-view').style.display   = 'none';
    document.getElementById('voice-chat-section').style.display = 'none';
    document.getElementById('screens-area').style.display = 'none';
    document.getElementById('screens-grid').innerHTML    = '';

    currentChannelId = null;
    currentChannelType = null;
}

function sendSignal(data) {
    if (!stompClient || !currentChannelId) return;
    stompClient.send('/topic/voice/' + currentChannelId, {}, JSON.stringify({ ...data, senderId: myId }));
}

async function handleSignal(data) {
    if (data.senderId === myId) return;
    if (data.targetId && data.targetId !== myId) return;

    const peerId = data.senderId;

    switch (data.type) {
        case 'join':
            addParticipantCard(peerId, data.username, false);
            addMemberItem(peerId, data.username, data.role);
            sendSignal({ type: 'welcome', targetId: peerId, username: myUsername, role: myRole });
            await createPeerConnection(peerId, true);
            break;

        case 'welcome':
            addParticipantCard(peerId, data.username, false);
            addMemberItem(peerId, data.username, data.role);
            break;

        case 'leave':
            removeParticipant(peerId);
            if (peerConnections[peerId]) { peerConnections[peerId].close(); delete peerConnections[peerId]; }
            break;

        case 'offer':
            addParticipantCard(peerId, data.username || 'Nieznany', false);
            addMemberItem(peerId, data.username || 'Nieznany', data.role || 'STUDENT');

            await createPeerConnection(peerId, false);
            await peerConnections[peerId].setRemoteDescription(new RTCSessionDescription(data.sdp));

            const answer = await peerConnections[peerId].createAnswer();
            await peerConnections[peerId].setLocalDescription(answer);
            sendSignal({ type: 'answer', sdp: answer, targetId: peerId });

            if (earlyIceCandidates[peerId]) {
                earlyIceCandidates[peerId].forEach(c => peerConnections[peerId].addIceCandidate(c).catch(e => console.log(e)));
                delete earlyIceCandidates[peerId];
            }
            break;

        case 'answer':
            await peerConnections[peerId]?.setRemoteDescription(new RTCSessionDescription(data.sdp));
            break;

        case 'ice':
            const candidate = new RTCIceCandidate(data.candidate);
            if (peerConnections[peerId] && peerConnections[peerId].remoteDescription) {
                await peerConnections[peerId].addIceCandidate(candidate).catch(e => console.log(e));
            } else {
                if (!earlyIceCandidates[peerId]) earlyIceCandidates[peerId] = [];
                earlyIceCandidates[peerId].push(candidate);
            }
            break;

        case 'screen-start':
            if (myRole === 'TEACHER') showRemoteScreen(peerId, data.username);
            break;

        case 'screen-stop':
            removeRemoteScreen(peerId);
            break;
    }
}

async function createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[peerId] = pc;

    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    if (isSharingScreen && screenStream) {
        screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));
        sendSignal({ type: 'screen-start', username: myUsername, targetId: peerId });
    }

    pc.ontrack = event => {
        const videoEl = document.getElementById('video-' + peerId);
        if (videoEl) videoEl.srcObject = event.streams[0];
    };

    pc.onicecandidate = event => {
        if (event.candidate) sendSignal({ type: 'ice', candidate: event.candidate, targetId: peerId });
    };

    if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', sdp: offer, targetId: peerId, username: myUsername, role: myRole });
    }
    return pc;
}

async function toggleScreenShare() {
    isSharingScreen ? stopScreenShare() : await startScreenShare();
}

async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        isSharingScreen = true;
        const btn = document.getElementById('btn-share-screen');
        btn.classList.add('active');
        btn.innerText = '🖥️ Zatrzymaj';

        showLocalScreen();
        sendSignal({ type: 'screen-start', username: myUsername });

        const track = screenStream.getVideoTracks()[0];
        Object.values(peerConnections).forEach(pc => pc.addTrack(track, screenStream));
        track.onended = stopScreenShare;
    } catch (e) { console.error(e); }
}

function stopScreenShare() {
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    isSharingScreen = false;
    const btn = document.getElementById('btn-share-screen');
    btn.classList.remove('active');
    btn.innerText = '🖥️ Udostępnij ekran';
    removeLocalScreen();
    sendSignal({ type: 'screen-stop' });
}

function showLocalScreen() {
    const grid = document.getElementById('screens-grid');
    document.getElementById('screens-area').style.display = 'block';
    if (document.getElementById('screen-local')) return;
    const w = document.createElement('div');
    w.className = 'screen-wrapper'; w.id = 'screen-local';
    w.innerHTML = '<div class="screen-label">🖥️ Twój ekran</div>';
    const v = document.createElement('video');
    v.autoplay = true; v.muted = true; v.srcObject = screenStream;
    w.appendChild(v); grid.appendChild(w);
}

function removeLocalScreen() {
    document.getElementById('screen-local')?.remove();
    if (!document.getElementById('screens-grid').children.length)
        document.getElementById('screens-area').style.display = 'none';
}

function showRemoteScreen(peerId, username) {
    const grid = document.getElementById('screens-grid');
    document.getElementById('screens-area').style.display = 'block';
    if (document.getElementById('screen-' + peerId)) return;
    const w = document.createElement('div');
    w.className = 'screen-wrapper'; w.id = 'screen-' + peerId;
    w.innerHTML = `<div class="screen-label">🖥️ ${username}</div>`;
    const v = document.createElement('video');
    v.autoplay = true; v.id = 'screenVideo-' + peerId;
    w.appendChild(v); grid.appendChild(w);
}

function removeRemoteScreen(peerId) {
    document.getElementById('screen-' + peerId)?.remove();
    if (!document.getElementById('screens-grid').children.length)
        document.getElementById('screens-area').style.display = 'none';
}

function toggleMute() {
    isMuted = !isMuted;
    localStream?.getAudioTracks().forEach(t => t.enabled = !isMuted);
    updateControls();

    // Broadcast statusu mikrofonu do pozostałych uczestników
    if (stompClient && currentChannelId) {
        stompClient.send('/app/room/' + currentChannelId + '/chat', {}, JSON.stringify({
            sender: myUsername,
            content: isMuted.toString(),
            type: 'MIC_STATUS'
        }));
    }
}

function toggleCamera() {
    isCamOff = !isCamOff;
    localStream?.getVideoTracks().forEach(t => t.enabled = !isCamOff);
    updateControls();
}

function updateControls() {
    const m = document.getElementById('mute-btn');
    const c = document.getElementById('cam-btn');
    if (m) { m.innerText = isMuted  ? '🔇' : '🎤'; m.classList.toggle('muted', isMuted); }
    if (c) { c.innerText = isCamOff ? '📵' : '📷'; c.classList.toggle('muted', isCamOff); }
    // Aktualizuj ikony mikrofonu na własnej karcie i w liście uczestników
    updateMicVisual(myUsername, isMuted);
}

function addParticipantCard(peerId, username, isMe) {
    const grid = document.getElementById('participants-grid');
    if (document.getElementById('card-' + peerId)) return;
    const card = document.createElement('div');
    card.className = 'participant-card';
    card.id = 'card-' + peerId;
    card.dataset.username = username;

    const initMuted = isMe ? isMuted : (participantMuteState[username] || false);

    card.innerHTML = `
        <video id="video-${peerId}" autoplay ${isMe ? 'muted' : ''} playsinline></video>
        <div class="card-overlay"><div class="card-avatar">${username.charAt(0).toUpperCase()}</div></div>
        <div class="card-status-icons">
            <span class="card-mic-icon${initMuted ? ' muted' : ''}" title="${initMuted ? 'Wyciszony' : 'Mikrofon włączony'}">${initMuted ? '🔇' : '🎤'}</span>
            <span class="card-hand-icon"></span>
        </div>
        <div class="card-name">${username}${isMe ? ' (Ty)' : ''}</div>`;
    grid.appendChild(card);
    updateMemberCount();
}

function removeParticipant(peerId) {
    document.getElementById('card-' + peerId)?.remove();
    document.getElementById('member-' + peerId)?.remove();
    updateMemberCount();
}

function addMemberItem(peerId, username, role) {
    const list = document.getElementById('members-list');
    if (document.getElementById('member-' + peerId)) return;

    const el = document.createElement('div');
    el.className = 'member-item';
    el.id = 'member-' + peerId;
    el.dataset.username = username;

    const isMe = (peerId === myId);
    const initMuted = isMe ? isMuted : (participantMuteState[username] || false);

    let hostActions = '';
    if (myRole === 'TEACHER' && peerId !== myId) {
        hostActions = `
            <button class="icon-btn" onclick="muteUser('${peerId}')" title="Wycisz studenta">🔇</button>
            <button class="icon-btn" onclick="kickUser('${peerId}')" title="Wyrzuć z sali">❌</button>
        `;
    }

    el.innerHTML = `
        <div class="member-avatar">${username.charAt(0).toUpperCase()}</div>
        <div class="member-info">
            <div class="member-name">${username} <span class="member-hand-icon"></span></div>
            <div class="member-role">${role === 'TEACHER' ? '👨‍🏫 Wykładowca' : '🎒 Student'}</div>
        </div>
        <span class="member-mic-icon${initMuted ? ' muted' : ''}" title="${initMuted ? 'Wyciszony' : 'Mikrofon włączony'}">${initMuted ? '🔇' : '🎤'}</span>
        ${hostActions}
    `;
    list.appendChild(el);
    updateMemberCount();
}

function updateMemberCount() {
    document.getElementById('member-count').innerText = document.getElementById('participants-grid').children.length;
}

function toggleHand() {
    if (myRole === 'TEACHER') return;

    isHandRaised = !isHandRaised;
    const btn = document.getElementById('btn-hand');
    if (btn) {
        btn.style.backgroundColor = isHandRaised ? 'var(--accent)' : '';
        btn.title = isHandRaised ? 'Opuść rękę' : 'Podnieś rękę';
    }

    // Własna ręka – aktualizuj od razu lokalnie
    updateHandVisual(myUsername, isHandRaised);

    const message = { sender: myUsername, content: isHandRaised.toString(), type: 'RAISE_HAND', roomId: currentChannelId };
    stompClient.send('/app/room/' + currentChannelId + '/chat', {}, JSON.stringify(message));
}

function muteUser(targetId) {
    const message = { sender: myId, content: targetId, type: 'MUTE', roomId: currentChannelId };
    stompClient.send('/app/room/' + currentChannelId + '/chat', {}, JSON.stringify(message));
}

function kickUser(targetId) {
    const message = { sender: myId, content: targetId, type: 'KICK', roomId: currentChannelId };
    stompClient.send('/app/room/' + currentChannelId + '/chat', {}, JSON.stringify(message));
}

function sendChatMessage(isMainView) {
    const inputId = isMainView ? 'main-chat-input' : 'voice-chat-input';
    const input = document.getElementById(inputId);

    if (!input || !input.value.trim() || !stompClient || !currentChannelId) return;

    const message = {
        sender: myUsername,
        content: input.value.trim(),
        type: 'CHAT',
        roomId: currentChannelId
    };

    stompClient.send('/app/room/' + currentChannelId + '/chat', {}, JSON.stringify(message));
    input.value = '';
}

function handleIncomingChatMessage(msg, isMainView) {
    if (msg.type === 'CHAT') {
        const boxId = isMainView ? 'main-chat-messages' : 'voice-chat-messages';
        appendChatBubble(boxId, msg.sender, msg.content, msg.sender === myUsername, msg.timestamp);
    }
    else if (msg.type === 'RAISE_HAND') {
        const username = msg.sender;
        const isRaised = msg.content === 'true';
        updateHandVisual(username, isRaised);
    }
    else if (msg.type === 'MIC_STATUS') {
        const username = msg.sender;
        const muted = msg.content === 'true';
        participantMuteState[username] = muted;
        updateMicVisual(username, muted);
    }
    else if (msg.type === 'WHITEBOARD') {
        handleWhiteboardMessage(msg);
    }
    else if (msg.type === 'MUTE') {
        if (msg.content === myId) {
            alert("Prowadzący wyciszył Twój mikrofon.");
            if (!isMuted) toggleMute();
        }
    }
    else if (msg.type === 'KICK') {
        if (msg.content === myId) {
            alert("Zostałeś wyrzucony z kanału przez prowadzącego.");
            leaveChannel();
        }
    }
}

function openSettings() {
    document.getElementById('settings-info').innerText = 'Zalogowany jako: ' + myUsername + ' (' + (myRole === 'TEACHER' ? 'Wykładowca' : 'Student') + ')';
    document.getElementById('settings-error').style.display = 'none';
    document.getElementById('settings-ok').style.display    = 'none';
    showModal('modal-settings');
}

async function changePassword() {
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const errEl = document.getElementById('settings-error');
    const okEl  = document.getElementById('settings-ok');
    errEl.style.display = 'none'; okEl.style.display = 'none';

    if (!oldPassword || !newPassword) {
        errEl.innerText = 'Wypełnij oba pola.'; errEl.style.display = 'block'; return;
    }

    const token = localStorage.getItem('jwt_token');
    try {
        const res  = await fetch('/api/users/me/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ oldPassword, newPassword })
        });
        if (!res.ok) {
            const data = await res.json();
            errEl.innerText = data.error || 'Błąd serwera'; errEl.style.display = 'block';
        } else {
            okEl.style.display = 'block';
            document.getElementById('old-password').value = ''; document.getElementById('new-password').value = '';
        }
    } catch (e) { console.error(e); }
}

async function loadAttendance() {
    const roomId = currentRoomId;
    if (!roomId) { alert('Najpierw wybierz pokój z lewego panelu.'); return; }
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/rooms/' + roomId + '/attendance', { headers: { Authorization: 'Bearer ' + token } });
        if (res.status === 403) { alert('Tylko wykładowca może sprawdzić listę obecności.'); return; }
        if (!res.ok) return;
        const list = await res.json();

        document.getElementById('attendance-room-name').innerText = 'Pokój: ' + (document.getElementById('room-header-name').innerText || currentRoomId);
        const container = document.getElementById('attendance-list');
        if (!list.length) {
            container.innerHTML = '<p style="color:var(--text-light); font-size:13px;">Brak zapisów obecności.</p>';
        } else {
            container.innerHTML = `
                <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead><tr style="border-bottom:1px solid var(--border);">
                        <th style="text-align:left; padding:6px 8px; color:var(--text-mid);">Użytkownik</th>
                        <th style="text-align:left; padding:6px 8px; color:var(--text-mid);">Dołączył</th>
                        <th style="text-align:left; padding:6px 8px; color:var(--text-mid);">Wyszedł</th>
                    </tr></thead>
                    <tbody>${list.map(a => `
                        <tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:6px 8px; font-weight:500;">${a.username}</td>
                            <td style="padding:6px 8px; color:var(--text-mid);">${formatDate(a.joinedAt)}</td>
                            <td style="padding:6px 8px; color:var(--text-mid);">${a.leftAt ? formatDate(a.leftAt) : '— aktywny'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>`;
        }
        showModal('modal-attendance');
    } catch (e) { console.error(e); }
}

function formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('pl-PL') + ' ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

async function recordJoin(roomId, channelId) {
    const token = localStorage.getItem('jwt_token');
    await fetch('/api/attendance/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ roomId, channelId })
    }).catch(e => console.error(e));
}

async function recordLeave(roomId) {
    const token = localStorage.getItem('jwt_token');
    await fetch('/api/attendance/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ roomId })
    }).catch(e => console.error(e));
}

// =====================================================================
// HISTORIA CZATU KANAŁOWEGO
// =====================================================================

async function loadChannelHistory(channelId, isMainView = true) {
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/channels/' + channelId + '/messages', {
            headers: { Authorization: 'Bearer ' + token }
        });
        if (!res.ok) return;
        const messages = await res.json();
        const boxId = isMainView ? 'main-chat-messages' : 'voice-chat-messages';
        messages.forEach(msg => {
            appendChatBubble(boxId, msg.sender, msg.content, msg.sender === myUsername, msg.timestamp);
        });
    } catch (e) { console.error('loadChannelHistory', e); }
}

// =====================================================================
// HELPER: RENDEROWANIE BĄBELKA WIADOMOŚCI
// =====================================================================

function appendChatBubble(boxId, sender, content, isMe, timestamp) {
    const box = document.getElementById(boxId);
    if (!box) return;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble' + (isMe ? ' is-mine' : '');

    const timeStr = timestamp ? formatDate(timestamp) : '';
    const escaped = escapeHtml(content);

    bubble.innerHTML = `
        <div class="bubble-header${isMe ? ' mine' : ''}">${escapeHtml(sender)} <span style="font-weight:400; opacity:0.6; font-size:10px;">${timeStr}</span></div>
        <div class="bubble-body">${escaped}</div>`;

    box.appendChild(bubble);
    box.scrollTop = box.scrollHeight;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =====================================================================
// PRAWA ZAKŁADKA – PRZEŁĄCZANIE
// =====================================================================

function switchRightTab(tab) {
    document.getElementById('tab-participants').classList.toggle('active', tab === 'participants');
    document.getElementById('tab-messages').classList.toggle('active', tab === 'messages');
    document.getElementById('right-participants').style.display = tab === 'participants' ? 'flex' : 'none';
    document.getElementById('right-messages').style.display     = tab === 'messages'     ? 'flex' : 'none';

    // Usuń kropkę powiadomień po wejściu na zakładkę
    if (tab === 'messages') {
        const dot = document.getElementById('tab-messages-dot');
        if (dot) dot.remove();
    }
}

// =====================================================================
// LISTA UŻYTKOWNIKÓW (do DM)
// =====================================================================

async function loadUserList() {
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/users/all', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) return;
        allUsers = await res.json();
        renderDmUserList(allUsers);
    } catch (e) { console.error('loadUserList', e); }
}

function renderDmUserList(users) {
    const list = document.getElementById('dm-users-list');
    if (!list) return;
    list.innerHTML = '';

    if (!users || users.length === 0) {
        list.innerHTML = '<div style="padding:12px; color:var(--text-light); font-size:13px;">Brak innych użytkowników.</div>';
        return;
    }

    users.forEach(u => {
        const el = document.createElement('div');
        el.className = 'dm-user-item' + (dmUnreadCounts[u.username] ? ' has-unread' : '');
        el.id = 'dm-user-' + u.username;

        const roleLabel = u.role === 'TEACHER' ? '👨‍🏫 Wykładowca' : '🎒 Student';
        const unread = dmUnreadCounts[u.username] || 0;

        el.innerHTML = `
            <div class="member-avatar" style="background: var(--navy-light);">${escapeHtml(u.username.charAt(0).toUpperCase())}</div>
            <div class="member-info" style="flex:1; min-width:0;">
                <div class="member-name">${escapeHtml(u.username)}</div>
                <div class="member-role">${roleLabel}</div>
            </div>
            ${unread > 0 ? `<span class="dm-unread-badge">${unread}</span>` : ''}
        `;
        el.onclick = () => openDmConversation(u.username, u.role);
        list.appendChild(el);
    });
}

function filterDmUsers() {
    const query = document.getElementById('dm-search').value.toLowerCase().trim();
    const filtered = allUsers.filter(u => u.username.toLowerCase().includes(query));
    renderDmUserList(filtered);
}

// =====================================================================
// DM – POŁĄCZENIE STOMP (globalne, niezależne od kanałów)
// =====================================================================

function initDmConnection() {
    if (dmStompClient) return;
    const token = localStorage.getItem('jwt_token');
    dmStompClient = Stomp.over(new SockJS('/ws'));
    dmStompClient.debug = null;

    dmStompClient.connect({ Authorization: 'Bearer ' + token }, () => {
        // Subskrybujemy osobisty temat DM dla zalogowanego użytkownika
        dmSubscription = dmStompClient.subscribe('/topic/dm/' + myUsername, msg => {
            handleIncomingDm(JSON.parse(msg.body));
        });
        console.log('[DM] Połączono, nasłuchuję /topic/dm/' + myUsername);
    }, err => {
        console.warn('[DM] Błąd połączenia STOMP:', err);
        dmStompClient = null;
    });
}

// =====================================================================
// DM – OTWIERANIE ROZMOWY
// =====================================================================

async function openDmConversation(username, role) {
    currentDmUser = username;

    // Wyczyść licznik nieprzeczytanych
    dmUnreadCounts[username] = 0;
    const badge = document.querySelector('#dm-user-' + CSS.escape(username) + ' .dm-unread-badge');
    if (badge) badge.remove();
    const userEl = document.getElementById('dm-user-' + username);
    if (userEl) userEl.classList.remove('has-unread');

    // Pokaż widok rozmowy
    document.getElementById('dm-user-list-view').style.display      = 'none';
    document.getElementById('dm-conversation-view').style.display   = 'flex';
    document.getElementById('dm-conv-avatar').innerText             = username.charAt(0).toUpperCase();
    document.getElementById('dm-conv-name').innerText               = username;
    document.getElementById('dm-conv-role').innerText               = role === 'TEACHER' ? '👨‍🏫 Wykładowca' : '🎒 Student';
    document.getElementById('dm-messages').innerHTML                 = '';
    document.getElementById('dm-input').value                        = '';

    // Upewnij się, że jesteśmy na zakładce Wiadomości
    switchRightTab('messages');

    // Załaduj historię
    await loadDmHistory(username);

    setTimeout(() => document.getElementById('dm-input')?.focus(), 100);
}

function closeDmConversation() {
    currentDmUser = null;
    document.getElementById('dm-conversation-view').style.display  = 'none';
    document.getElementById('dm-user-list-view').style.display     = 'flex';
}

// =====================================================================
// DM – HISTORIA
// =====================================================================

async function loadDmHistory(otherUser) {
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/dm/' + encodeURIComponent(otherUser) + '/history', {
            headers: { Authorization: 'Bearer ' + token }
        });
        if (!res.ok) return;
        const messages = await res.json();
        messages.forEach(msg => {
            appendDmBubble(msg.sender, msg.content, msg.sender === myUsername, msg.timestamp);
        });
    } catch (e) { console.error('loadDmHistory', e); }
}

// =====================================================================
// DM – WYSYŁANIE
// =====================================================================

function sendDm() {
    const input = document.getElementById('dm-input');
    if (!input || !input.value.trim() || !currentDmUser) return;

    if (!dmStompClient || !dmStompClient.connected) {
        alert('Brak połączenia z serwerem wiadomości. Spróbuj ponownie za chwilę.');
        initDmConnection();
        return;
    }

    const message = {
        type: 'DM',
        sender: myUsername,
        content: input.value.trim(),
        targetUser: currentDmUser
    };

    dmStompClient.send('/app/dm', {}, JSON.stringify(message));
    input.value = '';
}

// =====================================================================
// DM – ODBIÓR WIADOMOŚCI PRZYCHODZĄCYCH
// =====================================================================

function handleIncomingDm(msg) {
    const otherUser = msg.sender === myUsername ? msg.targetUser : msg.sender;

    // Jeśli rozmowa jest otwarta – dołącz bąbelek
    if (currentDmUser === otherUser) {
        appendDmBubble(msg.sender, msg.content, msg.sender === myUsername, msg.timestamp);
    } else {
        // Zwiększ licznik nieprzeczytanych
        dmUnreadCounts[otherUser] = (dmUnreadCounts[otherUser] || 0) + 1;
        updateDmBadge(otherUser);

        // Jeśli nie jesteśmy na zakładce wiadomości – pokaż powiadomienie w zakładce
        const tabMessages = document.getElementById('tab-messages');
        if (tabMessages && !tabMessages.classList.contains('active')) {
            tabMessages.style.position = 'relative';
            if (!document.getElementById('tab-messages-dot')) {
                const dot = document.createElement('span');
                dot.id = 'tab-messages-dot';
                dot.style.cssText = 'position:absolute; top:4px; right:4px; width:7px; height:7px; background:var(--danger); border-radius:50%;';
                tabMessages.appendChild(dot);
            }
        }
    }
}

function updateDmBadge(username) {
    const userEl = document.getElementById('dm-user-' + username);
    if (!userEl) {
        // Odśwież listę jeśli użytkownik nie jest widoczny (np. po filtrze)
        renderDmUserList(allUsers);
        return;
    }
    userEl.classList.add('has-unread');
    let badge = userEl.querySelector('.dm-unread-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'dm-unread-badge';
        userEl.appendChild(badge);
    }
    badge.innerText = dmUnreadCounts[username];
}

// =====================================================================
// DM – RENDEROWANIE BĄBELKA
// =====================================================================

function appendDmBubble(sender, content, isMe, timestamp) {
    appendChatBubble('dm-messages', sender, content, isMe, timestamp);
}

// Czyść kropkę powiadomienia przy przełączaniu na zakładkę wiadomości — obsługa w switchRightTab powyżej

// =====================================================================
// PODNIESIENIE RĘKI – WIZUALIZACJA
// =====================================================================

/**
 * Aktualizuje wszystkie elementy UI związane z podniesieniem ręki dla danego użytkownika.
 * Szuka kart i wpisów na liście uczestników po atrybucie data-username.
 */
function updateHandVisual(username, isRaised) {
    // --- Karta wideo w siatce ---
    const card = document.querySelector('.participant-card[data-username="' + CSS.escape(username) + '"]');
    if (card) {
        const handIcon = card.querySelector('.card-hand-icon');
        if (handIcon) handIcon.innerText = isRaised ? '✋' : '';

        if (isRaised) {
            card.classList.add('hand-raised');
            // Usuń po 3 sekundach animację wejścia (ale zostaw stan)
            setTimeout(() => card.classList.remove('hand-raised-bounce'), 300);
            card.classList.add('hand-raised-bounce');
        } else {
            card.classList.remove('hand-raised');
            card.classList.remove('hand-raised-bounce');
        }
    }

    // --- Wpis na liście uczestników po prawej ---
    const memberEl = document.querySelector('.member-item[data-username="' + CSS.escape(username) + '"]');
    if (memberEl) {
        const handIcon = memberEl.querySelector('.member-hand-icon');
        if (handIcon) handIcon.innerText = isRaised ? '✋' : '';

        if (isRaised) {
            memberEl.classList.add('member-hand-raised');
        } else {
            memberEl.classList.remove('member-hand-raised');
        }
    }
}

// =====================================================================
// STATUS MIKROFONU – WIZUALIZACJA
// =====================================================================

function updateMicVisual(username, muted) {
    // Karta wideo
    const card = document.querySelector('.participant-card[data-username="' + CSS.escape(username) + '"]');
    if (card) {
        const icon = card.querySelector('.card-mic-icon');
        if (icon) {
            icon.innerText = muted ? '🔇' : '🎤';
            icon.title     = muted ? 'Wyciszony' : 'Mikrofon włączony';
            icon.classList.toggle('muted', muted);
        }
    }

    // Lista uczestników
    const member = document.querySelector('.member-item[data-username="' + CSS.escape(username) + '"]');
    if (member) {
        const icon = member.querySelector('.member-mic-icon');
        if (icon) {
            icon.innerText = muted ? '🔇' : '🎤';
            icon.title     = muted ? 'Wyciszony' : 'Mikrofon włączony';
            icon.classList.toggle('muted', muted);
        }
    }
}

// Aktualizuj własną kartę i wpis po zmianie stanu przycisku wyciszenia
function updateOwnMicVisual() {
    updateMicVisual(myUsername, isMuted);
}

// =====================================================================
// PODNIESIENIE RĘKI – WIZUALIZACJA
// =====================================================================

function updateHandVisual(username, isRaised) {
    const card = document.querySelector('.participant-card[data-username="' + CSS.escape(username) + '"]');
    if (card) {
        const handIcon = card.querySelector('.card-hand-icon');
        if (handIcon) handIcon.innerText = isRaised ? '✋' : '';
        if (isRaised) {
            card.classList.add('hand-raised');
            card.classList.remove('hand-raised-bounce');
            void card.offsetWidth; // reflow
            card.classList.add('hand-raised-bounce');
        } else {
            card.classList.remove('hand-raised', 'hand-raised-bounce');
        }
    }

    const memberEl = document.querySelector('.member-item[data-username="' + CSS.escape(username) + '"]');
    if (memberEl) {
        const handIcon = memberEl.querySelector('.member-hand-icon');
        if (handIcon) handIcon.innerText = isRaised ? '✋' : '';
        memberEl.classList.toggle('member-hand-raised', isRaised);
    }
}

// =====================================================================
// WHITEBOARD – TABLICA WSPÓLNA
// =====================================================================

function openWhiteboard() {
    const overlay = document.getElementById('modal-whiteboard');
    overlay.style.display = 'flex';
    wbOpen = true;

    wbCanvas = document.getElementById('wb-canvas');
    wbCtx    = wbCanvas.getContext('2d');

    // Dopasuj canvas do kontenera
    resizeWbCanvas();
    window.addEventListener('resize', resizeWbCanvas);

    // Zdarzenia rysowania – mysz
    wbCanvas.addEventListener('mousedown',  wbStartDraw);
    wbCanvas.addEventListener('mousemove',  wbDraw);
    wbCanvas.addEventListener('mouseup',    wbStopDraw);
    wbCanvas.addEventListener('mouseleave', wbStopDraw);

    // Zdarzenia rysowania – dotyk
    wbCanvas.addEventListener('touchstart',  wbTouchStart,  { passive: false });
    wbCanvas.addEventListener('touchmove',   wbTouchMove,   { passive: false });
    wbCanvas.addEventListener('touchend',    wbStopDraw);

    // Slider grubości
    const sizeSlider = document.getElementById('wb-size');
    const sizeLabel  = document.getElementById('wb-size-label');
    sizeSlider.oninput = () => { sizeLabel.innerText = sizeSlider.value + 'px'; };

    // Zaznacz aktywne narzędzie
    setWbTool('pen');
}

function closeWhiteboard() {
    const overlay = document.getElementById('modal-whiteboard');
    overlay.style.display = 'none';
    wbOpen = false;
    wbDrawing = false;
    window.removeEventListener('resize', resizeWbCanvas);

    if (wbCanvas) {
        wbCanvas.removeEventListener('mousedown',  wbStartDraw);
        wbCanvas.removeEventListener('mousemove',  wbDraw);
        wbCanvas.removeEventListener('mouseup',    wbStopDraw);
        wbCanvas.removeEventListener('mouseleave', wbStopDraw);
        wbCanvas.removeEventListener('touchstart', wbTouchStart);
        wbCanvas.removeEventListener('touchmove',  wbTouchMove);
        wbCanvas.removeEventListener('touchend',   wbStopDraw);
    }
}

function resizeWbCanvas() {
    if (!wbCanvas) return;
    const wrap = wbCanvas.parentElement;
    // Zapisz obraz przed resizem
    const imgData = (wbCanvas.width > 0 && wbCanvas.height > 0)
        ? wbCtx.getImageData(0, 0, wbCanvas.width, wbCanvas.height)
        : null;

    wbCanvas.width  = wrap.clientWidth;
    wbCanvas.height = wrap.clientHeight;

    // Przywróć obraz
    if (imgData) wbCtx.putImageData(imgData, 0, 0);
}

function setWbTool(tool) {
    wbTool = tool;
    document.getElementById('wb-tool-pen')   .classList.toggle('active', tool === 'pen');
    document.getElementById('wb-tool-eraser').classList.toggle('active', tool === 'eraser');
    wbCanvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
}

// --- Mysz ---
function wbStartDraw(e) {
    wbDrawing = true;
    const pos = wbPos(e);
    wbLastX = pos.x;
    wbLastY = pos.y;
    // Kropka przy kliknięciu (bez ruchu)
    wbDrawLine(pos.x, pos.y, pos.x, pos.y);
    wbSendStroke(pos.x, pos.y, pos.x, pos.y);
}

function wbDraw(e) {
    if (!wbDrawing) return;
    const pos = wbPos(e);
    wbDrawLine(wbLastX, wbLastY, pos.x, pos.y);
    wbSendStroke(wbLastX, wbLastY, pos.x, pos.y);
    wbLastX = pos.x;
    wbLastY = pos.y;
}

function wbStopDraw() { wbDrawing = false; }

// --- Dotyk ---
function wbTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    wbDrawing = true;
    const pos = wbPos(t);
    wbLastX = pos.x; wbLastY = pos.y;
    wbDrawLine(pos.x, pos.y, pos.x, pos.y);
    wbSendStroke(pos.x, pos.y, pos.x, pos.y);
}

function wbTouchMove(e) {
    e.preventDefault();
    if (!wbDrawing) return;
    const pos = wbPos(e.touches[0]);
    wbDrawLine(wbLastX, wbLastY, pos.x, pos.y);
    wbSendStroke(wbLastX, wbLastY, pos.x, pos.y);
    wbLastX = pos.x; wbLastY = pos.y;
}

// --- Rysowanie lokalne ---
function wbDrawLine(x1, y1, x2, y2, color, size, tool) {
    if (!wbCtx) return;
    const c    = color || document.getElementById('wb-color').value;
    const s    = size  || parseInt(document.getElementById('wb-size').value);
    const t    = tool  || wbTool;

    wbCtx.save();
    wbCtx.globalCompositeOperation = (t === 'eraser') ? 'destination-out' : 'source-over';
    wbCtx.strokeStyle = c;
    wbCtx.lineWidth   = (t === 'eraser') ? s * 4 : s;
    wbCtx.lineCap     = 'round';
    wbCtx.lineJoin    = 'round';
    wbCtx.beginPath();
    wbCtx.moveTo(x1, y1);
    wbCtx.lineTo(x2, y2);
    wbCtx.stroke();
    wbCtx.restore();
}

// --- Wysyłanie kreski przez WebSocket ---
function wbSendStroke(x1, y1, x2, y2) {
    if (!stompClient || !currentChannelId || !wbCanvas) return;
    // Normalizuj do [0,1] żeby działało niezależnie od rozmiaru okna
    const w = wbCanvas.width;
    const h = wbCanvas.height;
    const msg = {
        type:    'WHITEBOARD',
        sender:  myUsername,
        content: JSON.stringify({
            action: 'draw',
            x1: x1 / w, y1: y1 / h,
            x2: x2 / w, y2: y2 / h,
            color: document.getElementById('wb-color').value,
            size:  parseInt(document.getElementById('wb-size').value),
            tool:  wbTool
        })
    };
    stompClient.send('/app/room/' + currentChannelId + '/chat', {}, JSON.stringify(msg));
}

// --- Wyczyszczenie tablicy ---
function clearWhiteboard(broadcast) {
    if (!wbCtx || !wbCanvas) return;
    wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);

    if (broadcast && stompClient && currentChannelId) {
        stompClient.send('/app/room/' + currentChannelId + '/chat', {}, JSON.stringify({
            type:    'WHITEBOARD',
            sender:  myUsername,
            content: JSON.stringify({ action: 'clear' })
        }));
    }
}

// --- Odbiór zdarzeń tablicy ---
function handleWhiteboardMessage(msg) {
    // Ignoruj własne wiadomości (już narysowane lokalnie)
    if (msg.sender === myUsername) return;

    // Otwórz tablicę dla wszystkich gdy ktoś rysuje
    if (!wbOpen) openWhiteboard();

    let data;
    try { data = JSON.parse(msg.content); } catch { return; }

    if (data.action === 'clear') {
        clearWhiteboard(false);
        return;
    }

    if (data.action === 'draw' && wbCanvas) {
        const w = wbCanvas.width;
        const h = wbCanvas.height;
        wbDrawLine(
            data.x1 * w, data.y1 * h,
            data.x2 * w, data.y2 * h,
            data.color, data.size, data.tool
        );
    }
}

// --- Pozycja myszy/dotyku względem canvas ---
function wbPos(e) {
    const rect = wbCanvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (wbCanvas.width  / rect.width),
        y: (e.clientY - rect.top)  * (wbCanvas.height / rect.height)
    };
}
