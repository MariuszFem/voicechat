// ===== STAN =====
let stompClient = null;
let pc = null;
let localStream = null;
let currentRoomId = null;
let isMuted = false;
const myId = Math.random().toString(36).substring(7);
let currentTab = 'login';

const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// Przykładowe kanały (w prawdziwej apce byłyby z API)
const channels = [
    { id: 'ogolny', name: 'ogólny' },
    { id: 'muzyka', name: 'muzyka' },
    { id: 'gaming', name: 'gaming' },
];

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
    document.getElementById('auth-title').innerText = isLogin ? 'Miło Cię widzieć!' : 'Utwórz konto';
    document.getElementById('auth-subtitle').innerText = isLogin ? 'Zaloguj się, aby kontynuować' : 'Wypełnij poniższe dane';
    document.getElementById('auth-btn').innerText = isLogin ? 'Zaloguj się' : 'Zarejestruj się';
    document.getElementById('auth-switch-text').innerText = isLogin ? 'Potrzebujesz konta?' : 'Masz już konto?';
    document.getElementById('auth-switch-link').innerText = isLogin ? ' Zarejestruj się' : ' Zaloguj się';
    document.getElementById('auth-error').style.display = 'none';
}

async function submitAuth() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;

    if (!username || !password) { showAuthError('Wypełnij wszystkie pola.'); return; }

    const endpoint = currentTab === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) { showAuthError(data.error || 'Błąd serwera.'); return; }

        localStorage.setItem('jwt_token', data.token);
        localStorage.setItem('username', data.username);
        showApp(data.username);
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
function showApp(username) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Ustaw dane użytkownika
    document.getElementById('panel-username').innerText = username;
    document.getElementById('user-avatar-icon').innerText = username.charAt(0).toUpperCase();
    document.getElementById('my-name').innerText = username;
    document.getElementById('my-avatar').innerText = username.charAt(0).toUpperCase();

    renderChannels();
    addMember(username, true);
}

function logout() {
    if (currentRoomId) leaveRoom();
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('username');
    window.location.reload();
}

// ===== KANAŁY =====
function renderChannels() {
    const list = document.getElementById('channel-list');
    list.innerHTML = '';
    channels.forEach(ch => {
        const el = document.createElement('div');
        el.className = 'channel-item';
        el.id = 'ch-' + ch.id;
        el.innerHTML = `<span class="ch-icon">🔊</span> ${ch.name}`;
        el.onclick = () => joinRoom(ch.id, ch.name);
        list.appendChild(el);
    });
}

function showCreateRoom() {
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('new-room-name').focus();
}

function hideCreateRoom() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.getElementById('new-room-name').value = '';
}

function createRoom() {
    const name = document.getElementById('new-room-name').value.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, '-');
    channels.push({ id, name });
    renderChannels();
    hideCreateRoom();
    joinRoom(id, name);
}

// ===== WEBRTC / VOICE =====
async function joinRoom(roomId, roomName) {
    if (currentRoomId === roomId) return;
    if (currentRoomId) await leaveRoom();

    currentRoomId = roomId;

    // Podświetl kanał
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const chEl = document.getElementById('ch-' + roomId);
    if (chEl) chEl.classList.add('active');

    // Pokaż widok głosowy
    document.getElementById('idle-view').style.display = 'none';
    document.getElementById('voice-view').style.display = 'flex';
    document.getElementById('voice-channel-name').innerText = roomName;
    document.getElementById('peer-card').style.display = 'none';

    const token = localStorage.getItem('jwt_token');
    const socket = new SockJS('/ws');
    stompClient = Stomp.over(socket);
    stompClient.debug = null;

    stompClient.connect({ Authorization: 'Bearer ' + token }, async () => {
        stompClient.subscribe('/topic/' + roomId, msg => {
            handleSignalingData(JSON.parse(msg.body));
        });
        await startWebRTC(roomId);
    }, err => {
        console.error(err);
        alert('Błąd połączenia WebSocket!');
    });
}

async function leaveRoom() {
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (pc) { pc.close(); pc = null; }
    if (stompClient) { stompClient.disconnect(); stompClient = null; }

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.getElementById('idle-view').style.display = 'flex';
    document.getElementById('voice-view').style.display = 'none';
    document.getElementById('peer-card').style.display = 'none';
    document.getElementById('peer-card').classList.remove('speaking');
    document.getElementById('connectionStatus') && (document.getElementById('connectionStatus').innerHTML = '⏳ Oczekiwanie na rozmówcę...');

    currentRoomId = null;
    isMuted = false;
    updateMuteBtn();
}

async function startWebRTC(roomId) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        pc = new RTCPeerConnection(rtcConfig);

        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        pc.ontrack = event => {
            const audio = document.getElementById('remoteAudio');
            if (audio.srcObject !== event.streams[0]) {
                audio.srcObject = event.streams[0];
                onPeerConnected();
            }
        };

        pc.onicecandidate = event => {
            if (event.candidate) sendSignal(roomId, { type: 'ice', candidate: event.candidate });
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(roomId, { type: 'offer', sdp: offer });

    } catch (e) {
        console.error(e);
        alert('Brak dostępu do mikrofonu!');
        leaveRoom();
    }
}

function onPeerConnected() {
    const card = document.getElementById('peer-card');
    card.style.display = 'flex';
    card.classList.remove('dimmed');
    card.classList.add('speaking');
    document.getElementById('peer-status').innerText = '🔊 Połączono';
}

function sendSignal(roomId, data) {
    stompClient.send('/topic/' + roomId, {}, JSON.stringify({ ...data, senderId: myId }));
}

async function handleSignalingData(data) {
    if (data.senderId === myId) return;
    try {
        if (data.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal(currentRoomId, { type: 'answer', sdp: answer });
        } else if (data.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (data.type === 'ice') {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (e) { console.error(e); }
}

// ===== MUTE =====
function toggleMute() {
    isMuted = !isMuted;
    if (localStream) {
        localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    }
    updateMuteBtn();
}

function updateMuteBtn() {
    const btn = document.getElementById('mute-btn');
    btn.innerText = isMuted ? '🔇' : '🎤';
    btn.classList.toggle('muted', isMuted);
}

// ===== MEMBERS PANEL =====
function addMember(username, isMe) {
    const list = document.getElementById('members-list');
    const el = document.createElement('div');
    el.className = 'member-item';
    el.innerHTML = `
        <div class="member-avatar">${username.charAt(0).toUpperCase()}</div>
        <div class="member-name">${username}${isMe ? ' (Ty)' : ''}</div>
    `;
    list.appendChild(el);
    document.getElementById('member-count').innerText = list.querySelectorAll('.member-item').length;
}
