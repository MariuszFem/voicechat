// ===== STATE =====
let stompClient = null;
let localStream = null;
let currentRoomId = null;
let isMuted = false;
let currentTab = 'login';

const peers = {};
const myId = Math.random().toString(36).substring(7);

const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// ===== INIT =====
window.onload = function () {
    const token = localStorage.getItem('jwt_token');
    const username = localStorage.getItem('username');
    if (token && username) {
        showApp(username);
    }
};

// ===== AUTH =====
async function submitAuth() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!username || !password) return;

    const endpoint = currentTab === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) { showAuthError(data.error || 'Błąd logowania'); return; }

        let cleanToken = data.token ? data.token.replace("Bearer ", "") : "";
        localStorage.setItem('jwt_token', cleanToken);
        localStorage.setItem('username', data.username);
        localStorage.setItem('role', data.role);
        showApp(data.username);
    } catch (e) {
        showAuthError('Błąd połączenia z serwerem.');
    }
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.innerText = msg;
    el.style.display = 'block';
}

function showApp(username) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('panel-username').innerText = username;
    renderChannels();
}

// ===== ROOM LOGIC =====
async function renderChannels() {
    const list = document.getElementById('channel-list');
    list.innerHTML = '';
    try {
        const res = await fetch('/api/rooms/all', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('jwt_token') }
        });
        if (!res.ok) return;

        const rooms = await res.json();
        rooms.forEach(room => {
            const el = document.createElement('div');
            el.className = 'channel-item';
            el.id = 'ch-' + room.id;
            el.innerHTML = `🔊 ${room.name}`;
            el.onclick = () => joinRoom(room.id, room.name);
            list.appendChild(el);
        });
    } catch (e) { console.error(e); }
}

async function joinRoom(roomId, roomName) {
    if (currentRoomId === roomId) return;
    if (currentRoomId) await leaveRoom();

    try {
        // 1. Backend Join
        const res = await fetch('/api/rooms/join/' + roomId, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('jwt_token') }
        });

        if (!res.ok) throw new Error("Nie udało się dołączyć do bazy pokoi.");

        // 2. Przygotuj audio PRZED połączeniem WebSocket
        await startLocalAudio();

        currentRoomId = roomId;
        document.getElementById('idle-view').style.display = 'none';
        document.getElementById('voice-view').style.display = 'flex';
        document.getElementById('voice-channel-name').innerText = roomName;

        // 3. Połącz WebSocket
        stompClient = Stomp.over(new SockJS('/ws'));
        stompClient.connect(
            { Authorization: 'Bearer ' + localStorage.getItem('jwt_token') },
            () => {
                stompClient.subscribe('/topic/room/' + roomId, msg => {
                    handleSignalingData(JSON.parse(msg.body));
                });
                sendSignal(roomId, { type: 'join', senderId: myId });
            }
        );
    } catch (e) {
        alert(e.message);
    }
}

async function leaveRoom() {
    if (!currentRoomId) return;
    sendSignal(currentRoomId, { type: 'leave', senderId: myId });

    try {
        await fetch('/api/rooms/leave/' + currentRoomId, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('jwt_token') }
        });
    } catch (e) { console.error(e); }

    Object.values(peers).forEach(pc => pc.close());
    for (const key in peers) delete peers[key];

    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    if (stompClient) {
        stompClient.disconnect();
        stompClient = null;
    }

    document.getElementById('idle-view').style.display = 'flex';
    document.getElementById('voice-view').style.display = 'none';
    currentRoomId = null;
}

// ===== WEBRTC =====
async function startLocalAudio() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) { alert("Brak dostępu do mikrofonu."); }
}

function createPeerConnection(peerId) {
    if (peers[peerId]) return peers[peerId];
    const pc = new RTCPeerConnection(rtcConfig);
    peers[peerId] = pc;

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.ontrack = e => addPeerAudio(peerId, e.streams[0]);
    pc.onicecandidate = e => {
        if (e.candidate) sendSignal(currentRoomId, { type: 'ice', candidate: e.candidate, senderId: myId, targetId: peerId });
    };
    return pc;
}

async function handleSignalingData(data) {
    if (data.senderId === myId) return;
    const peerId = data.senderId;

    if (data.type === 'join') {
        const pc = createPeerConnection(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(currentRoomId, { type: 'offer', sdp: offer, senderId: myId, targetId: peerId });
    } else if (data.type === 'offer') {
        if (data.targetId !== myId) return;
        const pc = createPeerConnection(peerId);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(currentRoomId, { type: 'answer', sdp: answer, senderId: myId, targetId: peerId });
    } else if (data.type === 'answer' && data.targetId === myId) {
        await peers[peerId].setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === 'ice' && data.targetId === myId) {
        await peers[peerId].addIceCandidate(new RTCIceCandidate(data.candidate));
    } else if (data.type === 'leave') {
        removePeerCard(peerId);
        if(peers[peerId]) { peers[peerId].close(); delete peers[peerId]; }
    }
}

function sendSignal(roomId, data) {
    if (stompClient?.connected) stompClient.send('/app/signal/' + roomId, {}, JSON.stringify(data));
}

function addPeerAudio(peerId, stream) {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.srcObject = stream;
    document.body.appendChild(audio); // Ukryte audio
}

function removePeerCard(peerId) { /* obsługa UI */ }