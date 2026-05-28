
const myId = Math.random().toString(36).substring(7);
let myUsername = '';
let myRole = '';          // 'STUDENT' | 'TEACHER'
let currentRoomId = null;
let currentChannelId = null;

let stompClient = null;
let peerConnections = {};
let localStream = null;
let screenStream = null;
let isMuted = false;
let isCamOff = false;
let isSharingScreen = false;

// auth tab
let authTab = 'login';
let selectedRole = 'STUDENT';

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
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
    const body = authTab === 'login'
        ? { username, password }
        : { username, password, role: selectedRole };

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

    document.getElementById('btn-add-room').style.display = myRole === 'TEACHER' ? 'flex' : 'none';
    const attWrap = document.getElementById('attendance-btn-wrap');
    if (attWrap) attWrap.style.display = myRole === 'TEACHER' ? 'block' : 'none';

    await loadRooms();
}

function logout() {
    if (currentChannelId) leaveVoice();
    localStorage.clear();
    window.location.reload();
}


async function loadRooms() {
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/rooms', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) { console.error('loadRooms', res.status); return; }
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
        el.dataset.roomOwner = room.ownerUsername || '';
        el.onclick = function () { selectRoom(this); };
        bar.insertBefore(el, divider);
    });
}

function selectRoom(el) {
    const roomId    = el.dataset.roomId;
    const roomName  = el.dataset.roomName;

    currentRoomId = roomId;

    bar_icons().forEach(i => i.classList.remove('active'));
    el.classList.add('active');

    document.getElementById('room-header-name').innerText = roomName;

    document.getElementById('btn-add-channel').style.display = myRole === 'TEACHER' ? 'inline' : 'none';

    loadChannels(roomId);
}

function bar_icons() {
    return document.querySelectorAll('#servers-bar .server-icon:not(.add-server)');
}

async function loadChannels(roomId) {
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/rooms/' + roomId + '/channels', {
            headers: { Authorization: 'Bearer ' + token }
        });
        if (!res.ok) { console.error('loadChannels', res.status, await res.text()); return; }
        const channels = await res.json();
        renderChannels(Array.isArray(channels) ? channels : []);
    } catch (e) { console.error('loadChannels', e); }
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
        el.id        = 'ch-' + ch.id;
        el.innerHTML = `<span class="ch-icon">🔊</span><span>${ch.name}</span>`;
        el.onclick   = () => joinVoice(ch.id, ch.name);
        list.appendChild(el);
    });
}


function showModal(id) {
    document.getElementById(id).style.display = 'flex';
    const input = document.querySelector('#' + id + ' input');
    if (input) setTimeout(() => input.focus(), 50);
}

function hideModal(id) {
    document.getElementById(id).style.display = 'none';
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
            if (document.getElementById('new-room-desc'))
                document.getElementById('new-room-desc').value = '';
            await loadRooms();
        } else {
            const err = await res.json().catch(() => ({}));
            alert('Błąd: ' + (err.error || res.status));
        }
    } catch (e) { console.error(e); }
}

async function createChannel() {
    const name = document.getElementById('new-channel-name').value.trim();
    if (!name) { alert('Wpisz nazwę kanału.'); return; }
    if (!currentRoomId) { 
        alert('Najpierw kliknij pokój w lewej kolumnie, a potem dodaj kanał.');
        hideModal('modal-channel');
        return; 
    }
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/rooms/' + currentRoomId + '/channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ name })
        });
        if (res.ok) {
            hideModal('modal-channel');
            document.getElementById('new-channel-name').value = '';
            await loadChannels(currentRoomId);
        } else {
            const err = await res.json().catch(() => ({}));
            alert('Błąd tworzenia kanału: ' + (err.error || res.status));
        }
    } catch (e) { console.error(e); alert('Błąd połączenia z serwerem.'); }
}


async function joinVoice(channelId, channelName) {
    if (currentChannelId === channelId) return;
    if (currentChannelId) await leaveVoice();

    currentChannelId = channelId;

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const chEl = document.getElementById('ch-' + channelId);
    if (chEl) chEl.classList.add('active');

    document.getElementById('idle-view').style.display  = 'none';
    document.getElementById('voice-view').style.display = 'flex';
    document.getElementById('voice-channel-name').innerText = channelName;
    document.getElementById('participants-grid').innerHTML  = '';
    document.getElementById('members-list').innerHTML       = '';
    document.getElementById('member-count').innerText       = '0';

    addParticipantCard(myId, myUsername, true);

    const token  = localStorage.getItem('jwt_token');
    const socket = new SockJS('/ws');
    stompClient  = Stomp.over(socket);
    stompClient.debug = null;

    stompClient.connect({ Authorization: 'Bearer ' + token, senderId: myId }, async () => {
        stompClient.subscribe('/topic/voice/' + channelId, msg => {
            handleSignal(JSON.parse(msg.body));
        });

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch {
            try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
            catch (e) { alert('Brak dostępu do mikrofonu!'); leaveVoice(); return; }
        }

        const videoEl = document.getElementById('video-' + myId);
        if (videoEl) videoEl.srcObject = localStream;

        sendSignal({ type: 'join', username: myUsername, role: myRole });
        await recordJoin(currentRoomId, channelId);

    }, err => { console.error('STOMP error', err); alert('Błąd połączenia WebSocket!'); });
}

async function leaveVoice() {
    if (stompClient) sendSignal({ type: 'leave' });
    if (currentRoomId) await recordLeave(currentRoomId);

    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    if (localStream)  { localStream.getTracks().forEach(t => t.stop());  localStream  = null; }
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};

    if (stompClient) { stompClient.disconnect(); stompClient = null; }

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.getElementById('idle-view').style.display   = 'flex';
    document.getElementById('voice-view').style.display  = 'none';
    document.getElementById('screens-area').style.display = 'none';
    document.getElementById('screens-grid').innerHTML    = '';

    currentChannelId = null;
    isMuted = false; isCamOff = false; isSharingScreen = false;
    updateControls();
}


function sendSignal(data) {
    if (!stompClient || !currentChannelId) return;
    stompClient.send('/topic/voice/' + currentChannelId, {}, JSON.stringify({ ...data, senderId: myId }));
}

async function handleSignal(data) {
    if (data.senderId === myId) return;
    const peerId = data.senderId;

    switch (data.type) {
        case 'join':
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
        sendSignal({ type: 'offer', sdp: offer, targetId: peerId });
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
    } catch (e) { console.error('screen share error', e); }
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
}


function addParticipantCard(peerId, username, isMe) {
    const grid = document.getElementById('participants-grid');
    if (document.getElementById('card-' + peerId)) return;
    const card = document.createElement('div');
    card.className = 'participant-card';
    card.id = 'card-' + peerId;
    card.innerHTML = `
        <video id="video-${peerId}" autoplay ${isMe ? 'muted' : ''} playsinline></video>
        <div class="card-overlay"><div class="card-avatar">${username.charAt(0).toUpperCase()}</div></div>
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
    el.className = 'member-item'; el.id = 'member-' + peerId;
    el.innerHTML = `
        <div class="member-avatar">${username.charAt(0).toUpperCase()}</div>
        <div class="member-info">
            <div class="member-name">${username}</div>
            <div class="member-role">${role === 'TEACHER' ? '👨‍🏫 Wykładowca' : '🎒 Student'}</div>
        </div>`;
    list.appendChild(el);
    updateMemberCount();
}

function updateMemberCount() {
    document.getElementById('member-count').innerText =
        document.getElementById('participants-grid').children.length;
}


function openSettings() {
    document.getElementById('settings-info').innerText =
        'Zalogowany jako: ' + myUsername + ' (' + (myRole === 'TEACHER' ? 'Wykładowca' : 'Student') + ')';
    document.getElementById('settings-error').style.display = 'none';
    document.getElementById('settings-ok').style.display    = 'none';
    document.getElementById('old-password').value = '';
    document.getElementById('new-password').value = '';
    showModal('modal-settings');
}

async function changePassword() {
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const errEl = document.getElementById('settings-error');
    const okEl  = document.getElementById('settings-ok');
    errEl.style.display = 'none';
    okEl.style.display  = 'none';

    if (!oldPassword || !newPassword) {
        errEl.innerText = 'Wypełnij oba pola.';
        errEl.style.display = 'block';
        return;
    }

    const token = localStorage.getItem('jwt_token');
    try {
        const res  = await fetch('/api/users/me/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await res.json();
        if (!res.ok) {
            errEl.innerText = data.error || 'Błąd serwera';
            errEl.style.display = 'block';
        } else {
            okEl.style.display = 'block';
            document.getElementById('old-password').value = '';
            document.getElementById('new-password').value = '';
        }
    } catch (e) { console.error(e); }
}


async function loadAttendance() {
    const roomId = currentRoomId;
    if (!roomId) { alert('Najpierw wybierz pokój z lewego panelu.'); return; }
    const token = localStorage.getItem('jwt_token');
    try {
        const res = await fetch('/api/rooms/' + roomId + '/attendance', {
            headers: { Authorization: 'Bearer ' + token }
        });
        if (res.status === 403) { alert('Tylko wykładowca może sprawdzić listę obecności.'); return; }
        if (!res.ok) { alert('Błąd serwera: ' + res.status); return; }
        const list = await res.json();

        document.getElementById('attendance-room-name').innerText =
            'Pokój: ' + (document.getElementById('room-header-name').innerText || currentRoomId);

        const container = document.getElementById('attendance-list');
        if (!list.length) {
            container.innerHTML = '<p style="color:var(--text-light); font-size:13px;">Brak zapisów obecności.</p>';
        } else {
            container.innerHTML = `
                <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border);">
                            <th style="text-align:left; padding:6px 8px; color:var(--text-mid);">Użytkownik</th>
                            <th style="text-align:left; padding:6px 8px; color:var(--text-mid);">Dołączył</th>
                            <th style="text-align:left; padding:6px 8px; color:var(--text-mid);">Wyszedł</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${list.map(a => `
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
    }).catch(e => console.error('attendance join', e));
}

async function recordLeave(roomId) {
    const token = localStorage.getItem('jwt_token');
    await fetch('/api/attendance/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ roomId })
    }).catch(e => console.error('attendance leave', e));
}
