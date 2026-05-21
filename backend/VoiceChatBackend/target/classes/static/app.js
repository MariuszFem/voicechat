// ===== STAN GLOBALNY =====
let stompClient = null;
let peerConnections = {};   // { peerId: RTCPeerConnection }
let localStream = null;
let screenStream = null;
let currentRoomId = null;
let currentChannelId = null;
let isMuted = false;
let isCamOff = false;
let isSharingScreen = false;
const myId = Math.random().toString(36).substring(7);

let myUsername = '';
let myRole = '';     // 'STUDENT' | 'TEACHER'
let selectedRole = 'STUDENT';
let currentRoomOwner = '';

const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// ===== INIT =====
window.onload = function () {
    const token = localStorage.getItem('jwt_token');
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    if (token && username) {
        myUsername = username;
        myRole = role || 'STUDENT';
        showApp();
    }
};

// ===== AUTH =====
let authTab = 'login';

function switchTab() {
    authTab = authTab === 'login' ? 'register' : 'login';
    const isLogin = authTab === 'login';
    document.getElementById('auth-title').innerText = isLogin ? 'Zaloguj się' : 'Utwórz konto';
    document.getElementById('auth-subtitle').innerText = isLogin ? 'Wpisz dane swojego konta' : 'Wypełnij poniższe dane';
    document.getElementById('auth-btn').innerText = isLogin ? 'Zaloguj się' : 'Zarejestruj się';
    document.getElementById('auth-switch-text').innerText = isLogin ? 'Nie masz konta?' : 'Masz już konto?';
    document.getElementById('auth-switch-link').innerText = isLogin ? ' Zarejestruj się' : ' Zaloguj się';
    document.getElementById('role-group').style.display = isLogin ? 'none' : 'block';
    document.getElementById('auth-error').style.display = 'none';
}

function selectRole(role) {
    selectedRole = role;
    document.getElementById('role-student').classList.toggle('active', role === 'STUDENT');
    document.getElementById('role-teacher').classList.toggle('active', role === 'TEACHER');
}

async function submitAuth() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!username || !password) { showAuthError('Wypełnij wszystkie pola.'); return; }

    const endpoint = authTab === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body = authTab === 'login'
        ? { username, password }
        : { username, password, role: selectedRole };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) { showAuthError(data.error || 'Błąd serwera.'); return; }

        localStorage.setItem('jwt_token', data.token);
        localStorage.setItem('username', data.username);
        localStorage.setItem('role', data.role);
        myUsername = data.username;
        myRole = data.role;
        showApp();
    } catch (e) {
        showAuthError('Nie można połączyć się z serwerem.');
    }
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.innerText = msg;
    el.style.display = 'block';
}

// ===== SHOW APP =====
async function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    document.getElementById('panel-username').innerText = myUsername;
    document.getElementById('user-avatar-icon').innerText = myUsername.charAt(0).toUpperCase();
    document.getElementById('panel-role').innerText = myRole === 'TEACHER' ? '👨‍🏫 Wykładowca' : '🎒 Student';

    // Tylko nauczyciel może tworzyć pokoje i kanały
    if (myRole === 'TEACHER') {
        document.getElementById('btn-add-room').style.display = 'flex';
    } else {
        document.getElementById('btn-add-room').style.display = 'none';
    }

    await loadRooms();
}

function logout() {
    if (currentChannelId) leaveVoice();
    localStorage.clear();
    window.location.reload();
}

// ===== POKOJE =====
async function loadRooms() {
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/rooms', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) {
            console.error('loadRooms HTTP error:', res.status, await res.text());
            return;
        }
        const rooms = await res.json();
        renderRooms(Array.isArray(rooms) ? rooms : []);
    } catch (e) {
        console.error('Błąd ładowania pokojów', e);
    }
}

let currentRoomOwner = '';

function renderRooms(rooms) {
    const bar = document.getElementById('servers-bar');
    bar.querySelectorAll('.server-icon:not(.add-server)').forEach(el => el.remove());

    const divider = bar.querySelector('.server-divider');

    rooms.forEach(room => {
        const el = document.createElement('div');
        el.className = 'server-icon';
        el.title = room.name;
        el.innerText = room.name.charAt(0).toUpperCase();
        el.onclick = (e) => selectRoom(room.roomId, room.name, room.ownerUsername, e.currentTarget);
        bar.insertBefore(el, divider);
    });
}

async function selectRoom(roomId, roomName, ownerUsername, el) {
    currentRoomId = roomId;
    currentRoomOwner = ownerUsername;

    document.querySelectorAll('.server-icon:not(.add-server)').forEach(e => e.classList.remove('active'));
    if (el) el.classList.add('active');

    document.getElementById('room-header-name').innerText = roomName;

    // Teacher zawsze może dodawać kanały
    document.getElementById('btn-add-channel').style.display = myRole === 'TEACHER' ? 'inline' : 'none';

    await loadChannels(roomId);
}

async function loadChannels(roomId) {
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch(`/api/rooms/${roomId}/channels`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) {
            console.error('loadChannels error:', res.status, await res.text());
            return;
        }
        const channels = await res.json();
        renderChannels(Array.isArray(channels) ? channels : []);
    } catch (e) {
        console.error('loadChannels fetch error:', e);
    }
}

function renderChannels(channels) {
    const list = document.getElementById('channel-list');
    list.innerHTML = '';
    if (channels.length === 0) {
        list.innerHTML = '<div class="channels-empty">Brak kanałów</div>';
        return;
    }
    channels.forEach(ch => {
        const el = document.createElement('div');
        el.className = 'channel-item';
        el.id = 'ch-' + ch.id;
        el.innerHTML = `<span class="ch-icon">🔊</span><span>${ch.name}</span>`;
        el.onclick = () => joinVoice(ch.id, ch.name);
        list.appendChild(el);
    });
}

// ===== MODALS =====
function showCreateRoomModal() {
    document.getElementById('modal-room').style.display = 'flex';
    setTimeout(() => document.getElementById('new-room-name').focus(), 50);
}

function showCreateChannelModal() {
    if (!currentRoomId) return alert('Najpierw wybierz pokój.');
    document.getElementById('modal-channel').style.display = 'flex';
    setTimeout(() => document.getElementById('new-channel-name').focus(), 50);
}

function hideModal(id) {
    document.getElementById(id).style.display = 'none';
}

async function createRoom() {
    const name = document.getElementById('new-room-name').value.trim();
    if (!name) return;
    const token = localStorage.getItem('jwt_token');
    const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ name })
    });
    if (res.ok) {
        hideModal('modal-room');
        document.getElementById('new-room-name').value = '';
        await loadRooms();
    }
}

async function createChannel() {
    const name = document.getElementById('new-channel-name').value.trim();
    if (!name) return;
    if (!currentRoomId) { alert('Najpierw wybierz pokój!'); return; }
    const token = localStorage.getItem('jwt_token');
    const res = await fetch(`/api/rooms/${currentRoomId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ name })
    });
    if (res.ok) {
        hideModal('modal-channel');
        document.getElementById('new-channel-name').value = '';
        await loadChannels(currentRoomId);
    } else {
        const err = await res.json().catch(() => ({}));
        alert('Błąd: ' + (err.error || res.status));
    }
}

// ===== VOICE / WEBRTC =====
async function joinVoice(channelId, channelName) {
    if (currentChannelId === channelId) return;
    if (currentChannelId) await leaveVoice();

    currentChannelId = channelId;

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const chEl = document.getElementById('ch-' + channelId);
    if (chEl) chEl.classList.add('active');

    document.getElementById('idle-view').style.display = 'none';
    document.getElementById('voice-view').style.display = 'flex';
    document.getElementById('voice-channel-name').innerText = channelName;

    // Wyczyść siatkę
    document.getElementById('participants-grid').innerHTML = '';
    document.getElementById('members-list').innerHTML = '';
    document.getElementById('member-count').innerText = '0';

    // Dodaj siebie do siatki
    addParticipantCard(myId, myUsername, true);

    const token = localStorage.getItem('jwt_token');
    const socket = new SockJS('/ws');
    stompClient = Stomp.over(socket);
    stompClient.debug = null;

    stompClient.connect({ Authorization: 'Bearer ' + token, senderId: myId }, async () => {
        stompClient.subscribe('/topic/voice/' + channelId, msg => {
            handleSignal(JSON.parse(msg.body));
        });

        // Pobierz audio (i opcjonalnie wideo)
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        // Pokaż własny podgląd
        setLocalVideo(localStream);

        // Ogłoś dołączenie
        sendSignal({ type: 'join', username: myUsername, role: myRole });

    }, err => {
        console.error(err);
        alert('Błąd połączenia!');
    });
}

async function leaveVoice() {
    sendSignal({ type: 'leave' });

    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; isSharingScreen = false; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};

    if (stompClient) { stompClient.disconnect(); stompClient = null; }

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.getElementById('idle-view').style.display = 'flex';
    document.getElementById('voice-view').style.display = 'none';
    document.getElementById('screens-area').style.display = 'none';
    document.getElementById('screens-grid').innerHTML = '';

    currentChannelId = null;
    isMuted = false; isCamOff = false; isSharingScreen = false;
    updateControls();
}

function leaveRoom() { leaveVoice(); }

// ===== SYGNALIZACJA =====
function sendSignal(data) {
    if (!stompClient) return;
    stompClient.send('/topic/voice/' + currentChannelId, {}, JSON.stringify({ ...data, senderId: myId }));
}

async function handleSignal(data) {
    if (data.senderId === myId) return;
    const peerId = data.senderId;

    switch (data.type) {
        case 'join':
            // Nowa osoba dołączyła - utwórz połączenie i wyślij offer
            addParticipantCard(peerId, data.username, false);
            addMemberItem(peerId, data.username, data.role);
            await createPeerConnection(peerId, true);
            break;

        case 'leave':
            removeParticipant(peerId);
            if (peerConnections[peerId]) { peerConnections[peerId].close(); delete peerConnections[peerId]; }
            break;

        case 'offer':
            await createPeerConnection(peerId, false);
            await peerConnections[peerId].setRemoteDescription(new RTCSessionDescription(data.sdp));
            const answer = await peerConnections[peerId].createAnswer();
            await peerConnections[peerId].setLocalDescription(answer);
            sendSignal({ type: 'answer', sdp: answer, targetId: peerId });
            break;

        case 'answer':
            if (data.targetId !== myId) return;
            await peerConnections[peerId]?.setRemoteDescription(new RTCSessionDescription(data.sdp));
            break;

        case 'ice':
            if (data.targetId !== myId) return;
            await peerConnections[peerId]?.addIceCandidate(new RTCIceCandidate(data.candidate));
            break;

        case 'screen-start':
            // Nauczyciel widzi wszystkie ekrany, student widzi tylko swój
            if (myRole === 'TEACHER' || peerId === myId) {
                showRemoteScreen(peerId, data.username);
            }
            break;

        case 'screen-stop':
            removeRemoteScreen(peerId);
            break;
    }
}

async function createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[peerId] = pc;

    // Dodaj lokalne tory
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.ontrack = event => {
        const stream = event.streams[0];
        const videoEl = document.getElementById('video-' + peerId);
        if (videoEl) videoEl.srcObject = stream;
    };

    pc.onicecandidate = event => {
        if (event.candidate) {
            sendSignal({ type: 'ice', candidate: event.candidate, targetId: peerId });
        }
    };

    if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', sdp: offer, targetId: peerId });
    }

    return pc;
}

// ===== UDOSTĘPNIANIE EKRANU =====
async function toggleScreenShare() {
    if (isSharingScreen) {
        stopScreenShare();
    } else {
        await startScreenShare();
    }
}

async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        isSharingScreen = true;

        const btn = document.getElementById('btn-share-screen');
        btn.classList.add('active');
        btn.innerText = '🖥️ Zatrzymaj';

        // Pokaż własny podgląd ekranu
        showLocalScreen();

        // Poinformuj innych
        sendSignal({ type: 'screen-start', username: myUsername });

        // Dodaj track ekranu do wszystkich połączeń
        const screenTrack = screenStream.getVideoTracks()[0];
        Object.values(peerConnections).forEach(pc => pc.addTrack(screenTrack, screenStream));

        screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (e) {
        console.error('Błąd udostępniania ekranu:', e);
    }
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
    const area = document.getElementById('screens-area');
    const grid = document.getElementById('screens-grid');
    area.style.display = 'block';

    const wrapper = document.createElement('div');
    wrapper.className = 'screen-wrapper';
    wrapper.id = 'screen-local';
    wrapper.innerHTML = `<div class="screen-label">🖥️ Twój ekran</div>`;
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.srcObject = screenStream;
    wrapper.appendChild(video);
    grid.appendChild(wrapper);
}

function removeLocalScreen() {
    document.getElementById('screen-local')?.remove();
    if (document.getElementById('screens-grid').children.length === 0) {
        document.getElementById('screens-area').style.display = 'none';
    }
}

function showRemoteScreen(peerId, username) {
    const area = document.getElementById('screens-area');
    const grid = document.getElementById('screens-grid');
    area.style.display = 'block';

    if (document.getElementById('screen-' + peerId)) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'screen-wrapper';
    wrapper.id = 'screen-' + peerId;
    wrapper.innerHTML = `<div class="screen-label">🖥️ ${username}</div>`;
    const video = document.createElement('video');
    video.autoplay = true;
    video.id = 'screenVideo-' + peerId;
    wrapper.appendChild(video);
    grid.appendChild(wrapper);
}

function removeRemoteScreen(peerId) {
    document.getElementById('screen-' + peerId)?.remove();
    if (document.getElementById('screens-grid').children.length === 0) {
        document.getElementById('screens-area').style.display = 'none';
    }
}

// ===== KONTROLKI =====
function toggleMute() {
    isMuted = !isMuted;
    localStream?.getAudioTracks().forEach(t => t.enabled = !isMuted);
    updateControls();
}

function toggleCamera() {
    isCamOff = !isCamOff;
    localStream?.getVideoTracks().forEach(t => t.enabled = !isCamOff);
    const videoEl = document.getElementById('video-' + myId);
    if (videoEl) videoEl.style.opacity = isCamOff ? '0' : '1';
    updateControls();
}

function updateControls() {
    const muteBtn = document.getElementById('mute-btn');
    const camBtn = document.getElementById('cam-btn');
    if (muteBtn) { muteBtn.innerText = isMuted ? '🔇' : '🎤'; muteBtn.classList.toggle('muted', isMuted); }
    if (camBtn) { camBtn.innerText = isCamOff ? '📵' : '📷'; camBtn.classList.toggle('muted', isCamOff); }
}

// ===== UI: KARTY UCZESTNIKÓW =====
function addParticipantCard(peerId, username, isMe) {
    const grid = document.getElementById('participants-grid');
    if (document.getElementById('card-' + peerId)) return;

    const card = document.createElement('div');
    card.className = 'participant-card';
    card.id = 'card-' + peerId;
    card.innerHTML = `
        <video id="video-${peerId}" autoplay ${isMe ? 'muted' : ''} playsinline></video>
        <div class="card-overlay">
            <div class="card-avatar">${username.charAt(0).toUpperCase()}</div>
        </div>
        <div class="card-name">${username}${isMe ? ' (Ty)' : ''}</div>
    `;
    grid.appendChild(card);
    updateMemberCount();
}

function setLocalVideo(stream) {
    const videoEl = document.getElementById('video-' + myId);
    if (videoEl) videoEl.srcObject = stream;
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
    el.innerHTML = `
        <div class="member-avatar">${username.charAt(0).toUpperCase()}</div>
        <div class="member-info">
            <div class="member-name">${username}</div>
            <div class="member-role">${role === 'TEACHER' ? '👨‍🏫 Wykładowca' : '🎒 Student'}</div>
        </div>
    `;
    list.appendChild(el);
    updateMemberCount();
}

function updateMemberCount() {
    const count = document.getElementById('participants-grid').children.length;
    document.getElementById('member-count').innerText = count;
}
