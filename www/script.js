// ─── PERSONALIZAÇÃO: TEMA E COR DE DESTAQUE (Aplica antes de carregar para não piscar) ──
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

// ─── AVATAR PADRÃO (Estilo iOS) ─────────────────────────────────────────────
const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs>' +
    '<circle cx="50" cy="50" r="50" fill="#8e8e93"/>' +
    '<g clip-path="url(#c)" fill="#e5e5ea">' +
    '<circle cx="50" cy="40" r="18"/>' +
    '<ellipse cx="50" cy="96" rx="34" ry="30"/>' +
    '</g></svg>'
);

// ─── CONFIGURAÇÕES MATRIX ───────────────────────────────────────────────────
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

// ─── BOTÃO "ENTRAR COM MATRIX" (FALLBACK OFICIAL MATRIX) ────────────────────
document.addEventListener('click', (e) => {
    if (e.target && (e.target.id === 'btn-login-matrix' || e.target.closest('#btn-login-matrix'))) {
        e.preventDefault();
        
        // Endereço exato do seu app no Netlify / Localhost
        const currentUrl = window.location.origin + window.location.pathname;
        
        // Página oficial do Matrix.org para autenticação segura
        const matrixAuthUrl = `${HOMESERVER_URL}/_matrix/static/client/login/#?redirectUrl=${encodeURIComponent(currentUrl)}`;
        
        window.location.href = matrixAuthUrl;
    }
});

// ─── VALIDAÇÃO E INICIALIZAÇÃO DA SESSÃO MATRIX ────────────────────────────
async function validateAndStartMatrixSession() {
    // 1. Verifica se retornou com o token no parâmetro Search ou no Hash da URL
    const urlParams = new URLSearchParams(window.location.search);
    let loginToken = urlParams.get('loginToken');

    if (!loginToken && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
        loginToken = hashParams.get('loginToken');
    }

    if (loginToken) {
        // Limpa a URL para remover o token da barra do navegador
        window.history.replaceState({}, document.title, window.location.pathname);
        
        try {
            const baseClient = matrixcs.createClient({ baseUrl: HOMESERVER_URL });
            const response = await baseClient.login("m.login.token", { token: loginToken });

            // Armazena a sessão permanente no dispositivo do usuário
            localStorage.setItem('matrix_access_token', response.access_token);
            localStorage.setItem('matrix_user_id', response.user_id);
            localStorage.setItem('matrix_device_id', response.device_id);

            initMatrixClient(response.access_token, response.user_id);
        } catch (err) {
            console.error("Erro ao autenticar com token Matrix:", err);
            alert("Erro ao validar login com Matrix. Tente novamente.");
            changeView('login');
        }
        return;
    }

    // 2. Se o usuário já possuir credenciais salvas no armazenamento local
    const savedToken  = localStorage.getItem('matrix_access_token');
    const savedUserId = localStorage.getItem('matrix_user_id');

    if (savedToken && savedUserId) {
        initMatrixClient(savedToken, savedUserId);
    } else {
        changeView('login');
    }
}

// Inicialização do SDK do Matrix
async function initMatrixClient(token, userId) {
    matrixClient = matrixcs.createClient({
        baseUrl: HOMESERVER_URL,
        accessToken: token,
        userId: userId
    });

    changeView('chat');
    await startMatrixSync();
}

// Sincronização e escuta em tempo real
async function startMatrixSync() {
    if (!matrixClient) return;

    try {
        await matrixClient.startClient({ initialSyncLimit: 20 });

        // Carrega dados do perfil logado para exibir no topo
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
        console.warn("Sincronizando com perfil padrão:", e); 
    }

    // Escuta novas mensagens na timeline
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

window.addEventListener('DOMContentLoaded', validateAndStartMatrixSession);

// ─── CARREGAR E EXIBIR LISTA DE CHATS ──────────────────────────────────────
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

// ─── ABRIR SALA DE CHAT E EXIBIR HISTÓRICO ──────────────────────────────────
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

// ─── ENVIAR NOVAS MENSAGENS ─────────────────────────────────────────────────
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

// ─── CONFIGURAÇÕES E PERSONALIZAÇÃO ─────────────────────────────────────────
function bindSettingSelector(selector, storageKey, attrName) {
    document.querySelectorAll(selector).forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset[Object.keys(btn.dataset)[0]];
            document.documentElement.setAttribute(attrName, val);
            localStorage.setItem(storageKey, val);
        });
    });
}

bindSettingSelector('.theme-option', 'chatbuddy_theme', 'data-theme');
bindSettingSelector('.accent-swatch', 'chatbuddy_accent', 'data-accent');
bindSettingSelector('.bubble-swatch', 'chatbuddy_bubble', 'data-bubble');

// Encerrar sessão
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        if (matrixClient) matrixClient.logout();
        localStorage.clear();
        window.location.reload();
    });
}
