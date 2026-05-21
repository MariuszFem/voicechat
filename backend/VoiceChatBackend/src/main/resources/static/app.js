// ===== STATE =====
let stompClient = null;
let localStream = null;
let currentRoomId = null;
let isMuted = false;
let currentTab = 'login';

// Multi-peer: map of peerId -> RTCPeerConnection
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
function switchTab() {
    currentTab = currentTab === 'login' ? 'register' : 'login';
    const isLogin = currentTab === 'login';
    document.getElementById('auth-title').innerText = isLogin ? 'Zaloguj się' : 'Utwórz konto';
    document.getElementById('auth-btn').innerText = isLogin ? 'Zaloguj się' : 'Zarejestruj się';
    document.getElementById('auth-error').style.display = 'none';
}

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

        localStorage.setItem('jwt_token', data.token);
        localStorage.setItem('username', data.username);
        localStorage.setItem('role', data.role);
        showApp(data.username);
    } catch (e) {
        showAuthError('Błąd połączenia.');
    }
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.innerText = msg;
    el.style.display = 'block';
}

// ===== MAIN APP =====
function showApp(username) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('panel-username').innerText = username;
    document.getElementById('my-name').innerText = username;

    // Only teachers see the "Create Room" button
    const role = localStorage.getItem('role');
    const openBtn = document.getElementById('openModalBtn');
    if (openBtn) {
        openBtn.style.display = (role === 'TEACHER') ? 'block' : 'none';
    }

    updateOnlineList(username);
    renderChannels();
}

function updateOnlineList(username) {
    const list = document.getElementById('members-list');
    list.innerHTML = '<div class="member-section-label">Online</div>';
    const el = document.createElement('div');
    el.className = 'member-item';
    el.innerHTML = `
        <div class="member-avatar">${username.charAt(0).toUpperCase()}</div>
        <div class="member-name">${username} (Ty)</div>
    `;
    list.appendChild(el);
    document.getElementById('member-count').innerText = "1";
}

// ===== ROOM LIST =====
async function renderChannels() {
    const list = document.getElementById('channel-list');
    list.innerHTML = '';
    try {
        const res = await fetch('/api/rooms/all', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('jwt_token') }
        });
        if (!res.ok) { console.error("Błąd ładowania pokoi:", res.status); return; }

        const rooms = await res.json();
        rooms.forEach(room => {
            const el = document.createElement('div');
            el.className = 'channel-item';
            el.id = 'ch-' + room.id;
            // Show attendee count if anyone is in the room
            const count = room.attendanceList ? room.attendanceList.length : 0;
            el.innerHTML = `
                <span class="ch-icon">🔊</span>
                <span class="ch-name">${room.name}</span>
                ${count > 0 ? `<span class="ch-count">${count}</span>` : ''}
            `;
            el.onclick = () => joinRoom(room.id, room.name);
            list.appendChild(el);
        });
    } catch (e) {
        console.error("Błąd ładowania pokoi:", e);
    }
}

// ===== ROOM MODAL =====
window.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById("roomModal");
    const openBtn = document.getElementById("openModalBtn");
    const submitBtn = document.getElementById("submitRoomBtn");

    if (openBtn) openBtn.onclick = () => modal.style.display = "flex";

    if (submitBtn) submitBtn.onclick = async () => {
        const name = document.getElementById("roomName").value.trim();
        const description = document.getElementById("roomDesc").value.trim();

        if (!name) { alert("Podaj nazwę serwera!"); return; }

        try {
            const res = await fetch('/api/rooms/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('jwt_token')
                },
                // No username in body — backend reads it from JWT
                body: JSON.stringify({ name, description })
            });

            if (res.ok) {
                modal.style.display = "none";
                document.getElementById("roomName").value = '';
                document.getElementById("roomDesc").value = '';
                renderChannels();
            } else {
                const errorMsg = await res.text();
                console.error("Server Error:", errorMsg);
                alert("Błąd serwera: " + errorMsg);
            }
        } catch (e) {
            alert("Błąd połączenia z API.");
        }
    };
});

// ===== JOIN ROOM =====
async function joinRoom(roomId, roomName) {
    if (currentRoomId === roomId) return;
    if (currentRoomId) await leaveRoom();

    // Tell backend we joined — by roomId, no access code needed
    try {
        const res = await fetch('/api/rooms/join/' + roomId, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('jwt_token') }
        });
        if (!res.ok) {
            console.error("Nie udało się dołączyć do sali");
            return;
        }
    } catch (e) {
        console.error("Błąd dołączania do sali:", e);
        return;
    }

    currentRoomId = roomId;

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.getElementById('ch-' + roomId)?.classList.add('active');
    document.getElementById('idle-view').style.display = 'none';
    document.getElementById('voice-view').style.display = 'flex';
    document.getElementById('voice-channel-name').innerText = roomName;

    // Connect WebSocket with JWT in header
    stompClient = Stomp.over(new SockJS('/ws'));
    stompClient.debug = null;
    stompClient.connect(
        { Authorization: 'Bearer ' + localStorage.getItem('jwt_token') },
        async () => {
            // Subscribe to this room's signal topic
            stompClient.subscribe('/topic/signal/' + roomId, msg => {
                handleSignalingData(JSON.parse(msg.body));
            });

            // Start mic and announce to existing peers
            await startLocalAudio();
            sendSignal(roomId, { type: 'join', senderId: myId });
        },
        err => {
            console.error("WebSocket błąd połączenia:", err);
        }
    );
}

// ===== LEAVE ROOM =====
async function leaveRoom() {
    if (!currentRoomId) return;

    // Announce to other peers we're leaving
    sendSignal(currentRoomId, { type: 'leave', senderId: myId });

    // Tell backend we left
    try {
        await fetch('/api/rooms/leave/' + currentRoomId, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('jwt_token') }
        });
    } catch (e) {
        console.error("Błąd opuszczania sali:", e);
    }

    // Clean up all peer connections
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
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    clearPeerCards();

    currentRoomId = null;
    renderChannels(); // refresh room list to update attendee counts
}

// ===== WEBRTC - MULTI PEER =====
async function startLocalAudio() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        console.error("Brak dostępu do mikrofonu:", e);
        alert("Nie można uzyskać dostępu do mikrofonu.");
    }
}

function createPeerConnection(peerId) {
    if (peers[peerId]) return peers[peerId];

    const pc = new RTCPeerConnection(rtcConfig);
    peers[peerId] = pc;

    // Add our local audio to this connection
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // Play incoming audio from this peer
    pc.ontrack = e => {
        addPeerAudio(peerId, e.streams[0]);
    };

    // Forward ICE candidates through signaling
    pc.onicecandidate = e => {
        if (e.candidate) {
            sendSignal(currentRoomId, {
                type: 'ice',
                candidate: e.candidate,
                senderId: myId,
                targetId: peerId
            });
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            removePeerCard(peerId);
            pc.close();
            delete peers[peerId];
        }
    };

    return pc;
}

async function handleSignalingData(data) {
    if (data.senderId === myId) return; // ignore our own messages

    const peerId = data.senderId;

    if (data.type === 'join') {
        // New person joined — send them an offer
        const pc = createPeerConnection(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(currentRoomId, {
            type: 'offer',
            sdp: offer,
            senderId: myId,
            targetId: peerId
        });

    } else if (data.type === 'offer') {
        if (data.targetId && data.targetId !== myId) return;

        const pc = createPeerConnection(peerId);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(currentRoomId, {
            type: 'answer',
            sdp: answer,
            senderId: myId,
            targetId: peerId
        });

    } else if (data.type === 'answer') {
        if (data.targetId && data.targetId !== myId) return;

        const pc = peers[peerId];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

    } else if (data.type === 'ice') {
        if (data.targetId && data.targetId !== myId) return;

        const pc = peers[peerId];
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));

    } else if (data.type === 'leave') {
        removePeerCard(peerId);
        if (peers[peerId]) {
            peers[peerId].close();
            delete peers[peerId];
        }
    }
}

// Send through /app/signal/{roomId} -> SignalController -> /topic/signal/{roomId}
function sendSignal(roomId, data) {
    if (stompClient && stompClient.connected) {
        stompClient.send('/app/signal/' + roomId, {}, JSON.stringify(data));
    }
}

// ===== PEER AUDIO UI =====
function addPeerAudio(peerId, stream) {
    removePeerCard(peerId); // avoid duplicates

    const card = document.createElement('div');
    card.className = 'peer-card';
    card.id = 'peer-' + peerId;
    card.innerHTML = `
        <div class="peer-avatar">🎙️</div>
        <div class="peer-info">
            <div class="peer-name">Uczestnik</div>
            <div class="peer-status">🔊 Połączono</div>
        </div>
    `;

    const audio = document.createElement('audio');
    audio.id = 'audio-' + peerId;
    audio.autoplay = true;
    audio.srcObject = stream;
    card.appendChild(audio);

    const container = document.getElementById('peers-container') || document.getElementById('voice-view');
    if (container) container.appendChild(card);
}

function removePeerCard(peerId) {
    document.getElementById('peer-' + peerId)?.remove();
}

function clearPeerCards() {
    document.querySelectorAll('.peer-card').forEach(el => el.remove());
}

// ===== MISC =====
function toggleMute() {
    isMuted = !isMuted;
    if (localStream) {
        localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    }
    document.getElementById('mute-btn').innerText = isMuted ? '🔇' : '🎤';
}

function logout() {
    if (currentRoomId) leaveRoom();
    localStorage.clear();
    window.location.reload();
}