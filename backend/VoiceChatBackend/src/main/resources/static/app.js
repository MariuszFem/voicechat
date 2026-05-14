// ===== STAN =====
let stompClient = null;
let pc = null;
let localStream = null;
let currentRoomId = null;
let isMuted = false;
const myId = Math.random().toString(36).substring(7);
let currentTab = 'login';

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// ===== INIT =====
window.onload = function () {
    const token = localStorage.getItem('jwt_token');
    const username = localStorage.getItem('username');
    if (token && username) { showApp(username); }
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
        showApp(data.username);
    } catch (e) { showAuthError('Błąd połączenia.'); }
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.innerText = msg; el.style.display = 'block';
}

// ===== GŁÓWNA APLIKACJA =====
function showApp(username) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('panel-username').innerText = username;
    document.getElementById('my-name').innerText = username;

    // Przywrócenie listy uczestników
    updateOnlineList(username);
    renderChannels();
}

function updateOnlineList(username) {
    const list = document.getElementById('members-list');
    // Czyścimy listę (zostawiając tylko nagłówek "Online")
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

// ===== POBIERANIE POKOI =====
async function renderChannels() {
    const list = document.getElementById('channel-list');
    list.innerHTML = '';
    try {
        const res = await fetch('/api/rooms/all', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('jwt_token') }
        });
        const rooms = await res.json();
        rooms.forEach(ch => {
            const el = document.createElement('div');
            el.className = 'channel-item';
            el.id = 'ch-' + ch.id;
            el.innerHTML = `<span class="ch-icon">🔊</span> ${ch.name}`;
            el.onclick = () => joinRoom(ch.id, ch.name);
            list.appendChild(el);
        });
    } catch (e) { console.error("Błąd ładowania pokoi"); }
}

// ===== OBSŁUGA MODALA =====
const modal = document.getElementById("roomModal");
const openBtn = document.getElementById("openModalBtn");
const submitBtn = document.getElementById("submitRoomBtn");

if (openBtn) openBtn.onclick = () => modal.style.display = "flex";

submitBtn.onclick = async () => {
    const name = document.getElementById("roomName").value.trim();
    const description = document.getElementById("roomDesc").value.trim();
    const username = localStorage.getItem('username');

    if (!name) { alert("Podaj nazwę serwera!"); return; }

    try {
        const res = await fetch('/api/rooms/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('jwt_token')
            },
            body: JSON.stringify({
                name: name,
                description: description,
                username: username
            })
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

// ===== VOICE / WEBRTC (Bez zmian) =====
async function joinRoom(roomId, roomName) {
    if (currentRoomId === roomId) return;
    if (currentRoomId) await leaveRoom();
    currentRoomId = roomId;

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.getElementById('ch-' + roomId)?.classList.add('active');
    document.getElementById('idle-view').style.display = 'none';
    document.getElementById('voice-view').style.display = 'flex';
    document.getElementById('voice-channel-name').innerText = roomName;

    stompClient = Stomp.over(new SockJS('/ws'));
    stompClient.debug = null;
    stompClient.connect({ Authorization: 'Bearer ' + localStorage.getItem('jwt_token') }, async () => {
        stompClient.subscribe('/topic/' + roomId, msg => handleSignalingData(JSON.parse(msg.body)));
        await startWebRTC(roomId);
    });
}

async function leaveRoom() {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (pc) pc.close();
    if (stompClient) stompClient.disconnect();
    document.getElementById('idle-view').style.display = 'flex';
    document.getElementById('voice-view').style.display = 'none';
    currentRoomId = null;
}

async function startWebRTC(roomId) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.ontrack = e => { document.getElementById('remoteAudio').srcObject = e.streams[0]; onPeerConnected(); };
    pc.onicecandidate = e => { if (e.candidate) sendSignal(roomId, { type: 'ice', candidate: e.candidate }); };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(roomId, { type: 'offer', sdp: offer });
}

function onPeerConnected() {
    document.getElementById('peer-card').style.display = 'flex';
    document.getElementById('peer-status').innerText = '🔊 Połączono';
}

function sendSignal(roomId, data) {
    stompClient.send('/topic/' + roomId, {}, JSON.stringify({ ...data, senderId: myId }));
}

async function handleSignalingData(data) {
    if (data.senderId === myId) return;
    if (data.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        sendSignal(currentRoomId, { type: 'answer', sdp: ans });
    } else if (data.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === 'ice') {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
}

function logout() { localStorage.clear(); window.location.reload(); }

function toggleMute() {
    isMuted = !isMuted;
    if(localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    document.getElementById('mute-btn').innerText = isMuted ? '🔇' : '🎤';
}