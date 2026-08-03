// ─── TEMA E PERSONALIZAÇÃO ─────────────────────────────────────────────────
(function applyStoredTheme() {
    const savedTheme          = localStorage.getItem('chatbuddy_theme')          || 'dark';
    const savedAccent         = localStorage.getItem('chatbuddy_accent')         || 'blue';
    const savedFont           = localStorage.getItem('chatbuddy_font')           || 'padrao';
    const savedBubble         = localStorage.getItem('chatbuddy_bubble')         || 'blue';
    const savedBubbleMode     = localStorage.getItem('chatbuddy_bubble_mode')    || 'normal';
    const savedBubbleGradient = localStorage.getItem('chatbuddy_bubble_gradient')|| 'oceano';
    const savedAnimation      = localStorage.getItem('chatbuddy_animation')      || 'padrao';
    const savedWallpaper      = localStorage.getItem('chatbuddy_wallpaper')      || 'padrao';

    document.documentElement.setAttribute('data-theme', savedTheme);
    document.documentElement.setAttribute('data-accent', savedAccent);
    document.documentElement.setAttribute('data-font', savedFont);
    document.documentElement.setAttribute('data-bubble', savedBubble);
    document.documentElement.setAttribute('data-bubble-mode', savedBubbleMode);
    document.documentElement.setAttribute('data-bubble-gradient', savedBubbleGradient);
    document.documentElement.setAttribute('data-animation', savedAnimation);
    document.documentElement.setAttribute('data-chat-wallpaper', savedWallpaper);
})();

// ─── AVATAR PADRÃO ─────────────────────────────────────────────────────────
const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs>' +
    '<circle cx="50" cy="50" r="50" fill="#8e8e93"/>' +
    '<g clip-path="url(#c)" fill="#e5e5ea">' +
    '<circle cx="50" cy="40" r="18"/>' +
    '<ellipse cx="50" cy="96" rx="34" ry="30"/>' +
    '</g></svg>'
);

const HOMESERVER_URL = "https://matrix.org";
let matrixClient = null;
let activeRoomId = null;

// ─── CONTROLE DE TELAS ──────────────────────────────────────────────────────
const viewPages = {
    login:   document.getElementById('login-page'),
    profile: document.getElementById('profile-page'),
    chat:    document.getElementById('chat-page')
};

function changeView(target) {
    Object.keys(viewPages).forEach(k => {
        if (viewPages[k]) viewPages[k].classList.add('hidden');
    });
    if (viewPages[target]) viewPages[target].classList.remove('hidden');
}

// ─── NOTIFICAÇÃO POPUP SISTEMA ──────────────────────────────────────────────
function triggerSystemPopup(title, text, avatarUrl) {
    const popup = document.getElementById('popup-notification');
    if (!popup) return;
    document.getElementById('popup-title').innerText = title;
    document.getElementById('popup-text').innerText  = text;
    const img = document.getElementById('popup-avatar');
    if (img) img.src = avatarUrl || DEFAULT_AVATAR;

    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('expanded'), 10);
    setTimeout(() => {
        popup.classList.remove('expanded');
        setTimeout(() => popup.classList.add('hidden'), 300);
    }, 3500);
}

// ─── BOTÃO SSO MATRIX (DIRECIONAMENTO OFICIAL MATRIX.ORG) ────────────────────
document.addEventListener('click', (e) => {
    if (e.target && (e.target.id === 'btn-login-matrix' || e.target.closest('#btn-login-matrix'))) {
        e.preventDefault();
        
        // Pega a URL limpa atual para o Matrix.org redirecionar de volta
        const redirectUrl = window.location.origin + window.location.pathname;
        const directSsoUrl = `${HOMESERVER_URL}/_matrix/client/v3/login/sso/redirect?redirectUrl=${encodeURIComponent(redirectUrl)}`;
        
        window.location.href = directSsoUrl;
    }
});

// ─── VALIDAÇÃO E TROCA DO TOKEN DE SSO DO MATRIX.ORG ───────────────────────
async function validateAndStartMatrixSession() {
    const urlParams = new URLSearchParams(window.location.search);
    let loginToken = urlParams.get('loginToken');

    if (!loginToken && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
        loginToken = hashParams.get('loginToken');
    }

    if (loginToken) {
        // Limpa a URL imediatamente para remover o token por segurança
        window.history.replaceState({}, document.title, window.location.pathname);
        
        try {
            // Cria cliente temporário focado estritamente na troca do token SSO oficial
            const baseClient = matrixcs.createClient({ baseUrl: HOMESERVER_URL });
            const response = await baseClient.login("m.login.token", { token: loginToken });

            localStorage.setItem('matrix_access_token', response.access_token);
            localStorage.setItem('matrix_user_id', response.user_id);
            localStorage.setItem('matrix_device_id', response.device_id);

            initMatrixClient(response.access_token, response.user_id);
            return;
        } catch (err) {
            console.error("Erro ao processar o token de SSO do Matrix:", err);
            alert("O token de autenticação expirou ou não pôde ser validado pelo Matrix.org. Tente novamente.");
            changeView('login');
            return;
        }
    }

    // Verifica se já existe sessão salva no navegador
    const savedToken  = localStorage.getItem('matrix_access_token');
    const savedUserId = localStorage.getItem('matrix_user_id');

    if (savedToken && savedUserId) {
        initMatrixClient(savedToken, savedUserId);
    } else {
        changeView('login');
    }
}

window.addEventListener('DOMContentLoaded', validateAndStartMatrixSession);

// ─── INICIALIZAÇÃO DO SDK MATRIX ────────────────────────────────────────────
async function initMatrixClient(token, userId) {
    matrixClient = matrixcs.createClient({
        baseUrl: HOMESERVER_URL,
        accessToken: token,
        userId: userId
    });

    changeView('chat');
    await startMatrixSync();
}

// ─── SINCRONIZAÇÃO EM TEMPO REAL ────────────────────────────────────────────
async function startMatrixSync() {
    if (!matrixClient) return;

    try {
        await matrixClient.startClient({ initialSyncLimit: 20 });

        const profile = await matrixClient.getProfileInfo(matrixClient.getUserId());
        const nickEl = document.getElementById('current-user-header-nick');
        const avatarEl = document.getElementById('current-user-header-avatar');
        
        if (nickEl) nickEl.innerText = profile.displayname || matrixClient.getUserId();
        if (avatarEl && profile.avatar_url) {
            avatarEl.src = matrixClient.mxcUrlToHttp(profile.avatar_url, 50, 50, 'crop');
        } else if (avatarEl) {
            avatarEl.src = DEFAULT_AVATAR;
        }
    } catch (e) {
        console.warn("Perfil carregado com padrões:", e);
    }

    matrixClient.on("Room.timeline", (event, room) => {
        loadChatList();
        if (room.roomId === activeRoomId) {
            renderMessages(room);
        } else if (event.getType() === "m.room.message" && event.getSender() !== matrixClient.getUserId()) {
            triggerSystemPopup(room.name, event.getContent().body);
        }
    });

    matrixClient.on("Room", () => loadChatList());
    loadChatList();
}

// ─── LISTAGEM DE CONVERSAS ──────────────────────────────────────────────────
function loadChatList() {
    if (!matrixClient) return;
    const rooms = matrixClient.getRooms();
    const listContainer = document.getElementById('chats-list-container') || document.getElementById('chats-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (rooms.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);">Nenhuma conversa ativa no momento.</div>`;
        return;
    }

    rooms.forEach(room => {
        const row = document.createElement('div');
        row.className = 'chat-item-row';
        if (room.roomId === activeRoomId) row.classList.add('active-desktop-chat');

        const name = room.name || "Sala Matrix";
        const events = room.timeline;
        let lastMsg = "Sem mensagens";
        if (events.length > 0) {
            const ev = events[events.length - 1].event;
            if (ev.content && ev.content.body) lastMsg = ev.content.body;
        }

        row.innerHTML = `
            <img src="${DEFAULT_AVATAR}" class="chat-item-avatar">
            <div class="chat-item-info">
                <div class="chat-item-header"><h4>${name}</h4></div>
                <p>${lastMsg}</p>
            </div>
        `;
        row.addEventListener('click', () => openChatRoom(room));
        listContainer.appendChild(row);
    });
}

// ─── ABRIR SALA E MENSAGENS ────────────────────────────────────────────────
function openChatRoom(room) {
    activeRoomId = room.roomId;
    const titleEl = document.getElementById('active-chat-name');
    if (titleEl) titleEl.innerText = room.name;

    const chatScreen = document.getElementById('chat-room-screen');
    const emptyPanel = document.getElementById('empty-chat-panel');
    if (chatScreen) chatScreen.classList.remove('hidden');
    if (emptyPanel) emptyPanel.classList.add('hidden');

    renderMessages(room);
}

function renderMessages(room) {
    const box = document.getElementById('messages-container');
    if (!box) return;

    box.innerHTML = '';

    room.timeline.forEach(event => {
        const ev = event.event;
        if (ev.type !== "m.room.message") return;

        const isSent = ev.sender === matrixClient.getUserId();
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;

        const card = document.createElement('div');
        card.className = `message ${isSent ? 'sent' : 'received'}`;

        if (ev.content.msgtype === "m.text") {
            card.innerHTML = `<p>${ev.content.body}</p>`;
        } else if (ev.content.msgtype === "m.image") {
            const httpUrl = matrixClient.mxcUrlToHttp(ev.content.url);
            card.innerHTML = `<img src="${httpUrl}" style="max-width:220px;border-radius:12px;">`;
        }

        wrapper.appendChild(card);
        box.appendChild(wrapper);
    });

    box.scrollTop = box.scrollHeight;
}

// ─── ENVIAR MENSAGENS ────────────────────────────────────────────────────────
const msgInput = document.getElementById('message-input');
const btnSend  = document.getElementById('btn-send');

if (msgInput && btnSend) {
    msgInput.addEventListener('input', () => {
        if (msgInput.value.trim().length > 0) btnSend.classList.remove('hidden');
        else btnSend.classList.add('hidden');
    });

    btnSend.addEventListener('click', () => {
        const txt = msgInput.value.trim();
        if (!txt || !activeRoomId || !matrixClient) return;

        matrixClient.sendEvent(activeRoomId, "m.room.message", {
            msgtype: "m.text",
            body: txt
        }).then(() => {
            msgInput.value = '';
            btnSend.classList.add('hidden');
        }).catch(err => alert("Erro ao enviar mensagem: " + err));
    });
}

// ─── CONTROLE DE LOGOUT ─────────────────────────────────────────────────────
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        if (matrixClient) matrixClient.logout();
        localStorage.clear();
        window.location.reload();
    });
}
