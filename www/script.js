import { MatrixService } from './matrix-client.js';

// ─── PERSONALIZAÇÃO: TEMA (idêntico ao original, não depende de backend) ──
(function applyStoredTheme() {
    const savedTheme  = localStorage.getItem('chatbuddy_theme')  || 'dark';
    const savedAccent = localStorage.getItem('chatbuddy_accent') || 'blue';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.documentElement.setAttribute('data-accent', savedAccent);
})();

const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs>' +
    '<circle cx="50" cy="50" r="50" fill="#8e8e93"/>' +
    '<g clip-path="url(#c)" fill="#e5e5ea"><circle cx="50" cy="40" r="18"/><ellipse cx="50" cy="96" rx="34" ry="30"/></g></svg>'
);

// ─── ESTADO GLOBAL ──────────────────────────────────────────────────────────
let currentUser   = null;   // { uid, nickname, username, avatar }
let activeRoomId  = null;
let activeIsGroup = false;
let pendingAvatarFile = null;
let replyingToId  = null;

// ─── VIEWS ──────────────────────────────────────────────────────────────────
const viewPages = {
    login:    document.getElementById('login-page'),
    register: document.getElementById('register-page'),
    profile:  document.getElementById('profile-page'),
    chat:     document.getElementById('chat-page')
};
function changeView(target) {
    Object.keys(viewPages).forEach(k => viewPages[k].classList.add('hidden'));
    viewPages[target].classList.remove('hidden');
    hideSplashScreen();
}
function hideSplashScreen() {
    const el = document.getElementById('app-splash-screen');
    if (el) el.classList.add('splash-hide');
}

function showError(msg) {
    alert(msg); // simples e direto — troque por um toast se preferir
}

// ─── BOOT: primeiro checa se voltamos do account.matrix.org, depois tenta sessão salva ──
(async function boot() {
    try {
        const oidcClient = await MatrixService.handleOidcRedirect();
        if (oidcClient) {
            currentUser = await MatrixService.getMyProfile();
            enterApp();
            return;
        }
    } catch (e) {
        showError('Erro ao concluir login: ' + e.message);
    }
    try {
        const client = await MatrixService.restoreSession();
        if (client) {
            currentUser = await MatrixService.getMyProfile();
            enterApp();
            return;
        }
    } catch (e) { /* segue pro login */ }
    changeView('login');
})();

// ─── LOGIN / CRIAR CONTA — via account.matrix.org (OIDC) ────────────────────
// O matrix.org hoje usa um sistema próprio de login (parecido com "Continuar com
// Google"), então login e criação de conta acontecem na página deles mesmo.
document.getElementById('btn-login').addEventListener('click', async () => {
    try {
        await MatrixService.startOidcFlow('login');
    } catch (err) {
        showError('Erro ao iniciar login: ' + err.message);
    }
});

// ─── PERFIL INICIAL ─────────────────────────────────────────────────────────
document.getElementById('initial-avatar-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    pendingAvatarFile = file;
    const reader = new FileReader();
    reader.onload = () => {
        document.getElementById('initial-avatar-preview').src = reader.result;
        document.getElementById('initial-avatar-preview').classList.remove('hidden');
        document.getElementById('initial-avatar-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
});
document.getElementById('btn-save-profile').addEventListener('click', async () => {
    const displayName = document.getElementById('display-name').value.trim();
    if (!displayName) return showError('Digite um apelido.');
    try {
        await MatrixService.setProfile(displayName, pendingAvatarFile);
        currentUser = await MatrixService.getMyProfile();
        enterApp();
    } catch (err) {
        showError('Erro ao salvar perfil: ' + err.message);
    }
});

// ─── ENTRAR NO APP ──────────────────────────────────────────────────────────
function enterApp() {
    document.getElementById('current-user-header-nick').innerText = currentUser.nickname;
    document.getElementById('current-user-header-avatar').src = currentUser.avatar || DEFAULT_AVATAR;
    changeView('chat');
    loadChatsList();
    loadGroupsList();

    MatrixService.onNewMessage((roomId, msg) => {
        if (roomId === activeRoomId) appendMessageBubble(msg);
        loadChatsList();
        loadGroupsList();
    });
    MatrixService.onRoomListChange(() => { loadChatsList(); loadGroupsList(); });
    MatrixService.onInvite(() => loadRequestsList());
}

// ─── LISTA DE CONVERSAS (DMs) ───────────────────────────────────────────────
function loadChatsList() {
    const container = document.getElementById('chats-list');
    const rooms = MatrixService.listRooms().filter(r => r.isDM && r.myMembership === 'join');
    rooms.sort((a, b) => b.lastTimestamp - a.lastTimestamp);

    if (rooms.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma conversa ainda.</div>';
    } else {
        container.innerHTML = '';
        rooms.forEach(r => container.appendChild(buildChatRow(r)));
    }
    loadRequestsList();
}

function buildChatRow(room) {
    const row = document.createElement('div');
    row.className = 'chat-item-row';
    const name = room.name || room.otherUserId;
    row.innerHTML = `
        <img src="${room.avatar || DEFAULT_AVATAR}" alt="">
        <div class="chat-item-info">
            <div class="chat-item-header">
                <h4>${name}</h4>
                <span style="font-size:12px;color:var(--text-muted);">${formatTime(room.lastTimestamp)}</span>
            </div>
            <p>${room.lastMessage || 'Nenhuma mensagem ainda'}</p>
        </div>`;
    row.addEventListener('click', () => openDirectChat(room.roomId, name, room.avatar));
    return row;
}

function formatTime(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ─── SOLICITAÇÕES (convites de sala pendentes) ──────────────────────────────
function loadRequestsList() {
    const rooms = MatrixService.listRooms().filter(r => r.myMembership === 'invite');
    document.getElementById('requests-banner').classList.toggle('hidden', rooms.length === 0);
    document.getElementById('requests-badge').classList.toggle('hidden', rooms.length === 0);
    document.getElementById('requests-badge').innerText = rooms.length || '';

    const list = document.getElementById('requests-list');
    list.innerHTML = '';
    rooms.forEach(r => {
        const row = document.createElement('div');
        row.className = 'chat-item-row';
        row.innerHTML = `
            <img src="${r.avatar || DEFAULT_AVATAR}" alt="">
            <div class="chat-item-info"><h4>${r.name || r.otherUserId}</h4><p>Convite para conversar</p></div>
            <div style="display:flex;gap:6px;">
                <button class="ios-btn-primary" style="padding:6px 12px;font-size:12px;" data-action="accept">Aceitar</button>
                <button class="action-danger-btn" style="padding:6px 12px;font-size:12px;" data-action="reject">Recusar</button>
            </div>`;
        row.querySelector('[data-action="accept"]').addEventListener('click', async () => {
            await MatrixService.acceptInvite(r.roomId); loadChatsList(); loadGroupsList();
        });
        row.querySelector('[data-action="reject"]').addEventListener('click', async () => {
            await MatrixService.rejectInvite(r.roomId); loadRequestsList();
        });
        list.appendChild(row);
    });
}

// ─── NOVA CONVERSA (busca por usuário) ──────────────────────────────────────
document.getElementById('btn-new-chat').addEventListener('click', async () => {
    const term = prompt('Digite o @usuário do Matrix (ex: joao ou @joao:matrix.org):');
    if (!term) return;
    try {
        const results = await MatrixService.searchUsers(term);
        if (results.length === 0) return showError('Nenhum usuário encontrado.');
        const target = results[0];
        const roomId = await MatrixService.startDirectChat(target.uid);
        openDirectChat(roomId, target.nickname, target.avatar);
    } catch (err) {
        showError('Erro ao iniciar conversa: ' + err.message);
    }
});

// ─── SALA DE CHAT (DM) ───────────────────────────────────────────────────────
function openDirectChat(roomId, name, avatar) {
    activeRoomId = roomId;
    activeIsGroup = false;
    document.getElementById('active-chat-name').innerText = name;
    document.getElementById('active-chat-avatar').src = avatar || DEFAULT_AVATAR;
    document.getElementById('chat-room-screen').classList.remove('hidden');
    renderMessages(document.getElementById('messages-container'), MatrixService.getRoomMessages(roomId));
    MatrixService.sendReadReceipt(roomId);
}
document.getElementById('btn-back-to-list').addEventListener('click', () => {
    document.getElementById('chat-room-screen').classList.add('hidden');
    activeRoomId = null;
});

function renderMessages(container, messages) {
    container.innerHTML = '';
    messages.forEach(m => container.appendChild(buildMessageBubble(m)));
    container.scrollTop = container.scrollHeight;
}

function appendMessageBubble(msg) {
    const containerId = activeIsGroup ? 'group-messages-container' : 'messages-container';
    const container = document.getElementById(containerId);
    container.appendChild(buildMessageBubble(msg));
    container.scrollTop = container.scrollHeight;
}

function buildMessageBubble(msg) {
    const div = document.createElement('div');
    div.className = 'message ' + (msg.isMine ? 'sent' : 'received');
    let inner = '';
    if (msg.msgtype === 'm.image' && msg.url) {
        inner = `<img src="${msg.url}" style="max-width:200px;border-radius:10px;">`;
    } else {
        inner = `<p>${escapeHtml(msg.body || '')}</p>`;
    }
    div.innerHTML = inner + `<span class="msg-time">${formatTime(msg.timestamp)}</span>`;
    return div;
}
function escapeHtml(str) {
    const d = document.createElement('div'); d.innerText = str; return d.innerHTML;
}

// ─── ENVIO DE MENSAGEM (texto / imagem) ─────────────────────────────────────
document.getElementById('btn-send').addEventListener('click', sendCurrentMessage);
document.getElementById('message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendCurrentMessage();
});
async function sendCurrentMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !activeRoomId) return;
    input.value = '';
    try {
        await MatrixService.sendText(activeRoomId, text, replyingToId);
        replyingToId = null;
    } catch (err) {
        showError('Erro ao enviar mensagem: ' + err.message);
    }
}
document.getElementById('media-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !activeRoomId) return;
    try { await MatrixService.sendImage(activeRoomId, file); }
    catch (err) { showError('Erro ao enviar imagem: ' + err.message); }
    e.target.value = '';
});

// ─── GRUPOS ─────────────────────────────────────────────────────────────────
function loadGroupsList() {
    const container = document.getElementById('groups-list');
    const rooms = MatrixService.listRooms().filter(r => !r.isDM && r.myMembership === 'join');
    rooms.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
    if (rooms.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhum grupo ainda.</div>';
        return;
    }
    container.innerHTML = '';
    rooms.forEach(r => {
        const row = document.createElement('div');
        row.className = 'chat-item-row';
        row.innerHTML = `
            <img src="${r.avatar || DEFAULT_AVATAR}" alt="">
            <div class="chat-item-info">
                <div class="chat-item-header">
                    <h4>${r.name}</h4>
                    <span style="font-size:12px;color:var(--text-muted);">${formatTime(r.lastTimestamp)}</span>
                </div>
                <p>${r.lastMessage || 'Nenhuma mensagem ainda'}</p>
            </div>`;
        row.addEventListener('click', () => openGroupChat(r.roomId, r.name, r.avatar));
        container.appendChild(row);
    });
}

document.getElementById('btn-new-group').addEventListener('click', () => {
    document.getElementById('create-group-modal').classList.remove('hidden');
});
document.getElementById('btn-close-create-group').addEventListener('click', () => {
    document.getElementById('create-group-modal').classList.add('hidden');
});
document.getElementById('btn-confirm-create-group').addEventListener('click', async () => {
    const name = document.getElementById('group-name-input').value.trim();
    const desc = document.getElementById('group-desc-input').value.trim();
    if (!name) return showError('Dê um nome ao grupo.');
    try {
        const roomId = await MatrixService.createGroup(name, desc, null, []);
        document.getElementById('create-group-modal').classList.add('hidden');
        loadGroupsList();
        openGroupChat(roomId, name, '');
    } catch (err) {
        showError('Erro ao criar grupo: ' + err.message);
    }
});

function openGroupChat(roomId, name, avatar) {
    activeRoomId = roomId;
    activeIsGroup = true;
    document.getElementById('active-group-name').innerText = name;
    document.getElementById('active-group-avatar').src = avatar || DEFAULT_AVATAR;
    const members = MatrixService.getRoomMembers(roomId);
    document.getElementById('active-group-members-count').innerText = members.length + ' membros';
    document.getElementById('group-room-screen').classList.remove('hidden');
    renderMessages(document.getElementById('group-messages-container'), MatrixService.getRoomMessages(roomId));
    MatrixService.sendReadReceipt(roomId);
}
document.getElementById('btn-back-group').addEventListener('click', () => {
    document.getElementById('group-room-screen').classList.add('hidden');
    activeRoomId = null; activeIsGroup = false;
});
document.getElementById('btn-group-send').addEventListener('click', sendCurrentGroupMessage);
async function sendCurrentGroupMessage() {
    const input = document.getElementById('group-message-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !activeRoomId) return;
    input.value = '';
    try { await MatrixService.sendText(activeRoomId, text); }
    catch (err) { showError('Erro ao enviar: ' + err.message); }
}
document.getElementById('group-message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendCurrentGroupMessage();
});
document.getElementById('group-media-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !activeRoomId) return;
    try { await MatrixService.sendImage(activeRoomId, file); }
    catch (err) { showError('Erro ao enviar imagem: ' + err.message); }
    e.target.value = '';
});

// ─── CONFIGURAÇÕES / LOGOUT ──────────────────────────────────────────────────
document.getElementById('btn-main-settings')?.addEventListener('click', () => {
    document.getElementById('settings-nickname').value = currentUser.nickname || '';
    document.getElementById('settings-username').value = currentUser.username || '';
    document.getElementById('settings-avatar-preview').src = currentUser.avatar || DEFAULT_AVATAR;
    document.getElementById('settings-screen').classList.remove('hidden');
});
document.getElementById('btn-logout').addEventListener('click', () => {
    if (confirm('Deseja sair da conta?')) {
        MatrixService.logout();
        location.reload();
    }
});
