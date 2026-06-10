// ─── FIREBASE CONFIG ────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDwW6LoRrGTJqXdYkbhv-0srz7VKKfykh4",
  authDomain: "chatbuddy-96a61.firebaseapp.com",
  databaseURL: "https://chatbuddy-96a61-default-rtdb.firebaseio.com",
  projectId: "chatbuddy-96a61",
  storageBucket: "chatbuddy-96a61.firebasestorage.app",
};

firebase.initializeApp(firebaseConfig);
const auth     = firebase.auth();
const database = firebase.database();

// ─── ESTADO GLOBAL ──────────────────────────────────────────────────────────
let currentUser        = null;
let activeChatId       = null;
let activeRecipientId  = null;
let base64AvatarString = "";
let selectedMessageId  = "";
let selectedMessageData = null;   
let silencedUsers      = {};
let blockedUsers       = JSON.parse(localStorage.getItem('blockedUsers') || '{}');
let deletedForMe       = JSON.parse(localStorage.getItem('deletedForMe') || '{}');
let customNicknames    = JSON.parse(localStorage.getItem('customNicknames') || '{}');
let offlineMessageQueue = JSON.parse(localStorage.getItem('offlineMessageQueue') || '[]');
let replyingTo         = null;    
let longPressTimer     = null;

// Variáveis para Gravação de Áudio
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordStartTime = 0;
let recordTimerInterval = null;
let recordingLocked = false;
let startXMic = 0, startYMic = 0;

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
}

// Monitoramento de Conexão com Popups dinâmicos
window.addEventListener('online', () => {
    triggerSystemPopup("Conexão estabelecida", "Reconexão bem-sucedida!", "https://cdn-icons-png.flaticon.com/512/190/190411.png");
    processOfflineQueue();
});
window.addEventListener('offline', () => {
    triggerSystemPopup("Modo Offline", "Você está desconectado da internet.", "https://cdn-icons-png.flaticon.com/512/565/565340.png");
});

function triggerSystemPopup(title, text, customIconUrl) {
    const popup = document.getElementById('popup-notification');
    if (!popup) return;
    document.getElementById('popup-avatar').src = customIconUrl || "https://via.placeholder.com/150";
    document.getElementById('popup-title').innerText = title;
    document.getElementById('popup-text').innerText  = text;
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('expanded'), 150);
    setTimeout(() => { popup.classList.remove('expanded'); setTimeout(() => popup.classList.add('hidden'), 400); }, 4000);
}

// ─── AVATAR LOADER ──────────────────────────────────────────────────────────
function bindImageLoader(inputId, previewId, placeholderId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            base64AvatarString = ev.target.result;
            const imgEl = document.getElementById(previewId);
            imgEl.src = base64AvatarString;
            imgEl.classList.remove('hidden');
            if (placeholderId) document.getElementById(placeholderId).classList.add('hidden');
        };
        reader.readAsDataURL(file);
    });
}
bindImageLoader('initial-avatar-file', 'initial-avatar-preview', 'initial-avatar-placeholder');
bindImageLoader('settings-avatar-input', 'settings-avatar-preview', null);

// ─── AUTENTICAÇÃO ───────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email-login').value.trim();
    const pass  = document.getElementById('password-login').value;
    if (!email || !pass) return alert("Preencha todos os campos!");
    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.innerText = 'Entrando...';
    
    auth.signInWithEmailAndPassword(email, pass).then((userCredential) => {
        // Salvamento local da conta para persistência e login automático
        localStorage.setItem('localLoggedUser', JSON.stringify({email, pass}));
    }).catch(err => {
        btn.disabled = false; btn.innerText = 'Entrar';
        const msgs = {
            'auth/user-not-found': 'Usuário não encontrado.',
            'auth/wrong-password': 'Senha incorreta.',
            'auth/invalid-email': 'E-mail inválido.',
            'auth/too-many-requests': 'Muitas tentativas. Tente mais tarde.',
            'auth/network-request-failed': 'Sem conexão com a internet.',
            'auth/invalid-credential': 'E-mail ou senha inválidos.'
        };
        alert(msgs[err.code] || 'Erro: ' + err.message);
    });
});

document.getElementById('btn-send-code').addEventListener('click', () => {
    const email = document.getElementById('email-reg').value.trim();
    const pass  = document.getElementById('password-reg').value;
    if (!email || !pass) return alert("Insira credenciais válidas.");
    document.getElementById('reg-step-1').classList.add('hidden');
    document.getElementById('reg-step-2').classList.remove('hidden');
});

document.getElementById('btn-verify-and-register').addEventListener('click', () => {
    const code = document.getElementById('verification-code-input').value.trim();
    if (code !== "123456") return alert("Código inválido!");
    const email = document.getElementById('email-reg').value.trim();
    const pass  = document.getElementById('password-reg').value;
    auth.createUserWithEmailAndPassword(email, pass)
        .then(() => {
            localStorage.setItem('localLoggedUser', JSON.stringify({email, pass}));
            changeView('profile');
        })
        .catch(err => alert("Erro: " + err.message));
});

document.getElementById('btn-google-login').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => alert(err.message));
});

document.getElementById('btn-save-profile').addEventListener('click', () => {
    const nick   = document.getElementById('display-name').value.trim();
    const userAt = document.getElementById('username').value.trim().replace('@', '');
    const bio    = document.getElementById('user-bio').value.trim() || "Disponível no ChatBuddy";
    if (!nick || !userAt) return alert("Campos obrigatórios vazios!");
    
    const profileData = {
        uid: currentUser.uid, nickname: nick, username: '@' + userAt, bio: bio,
        wlstwrus: "Disponível no ChatBuddy 🚀",
        avatar: base64AvatarString || "https://via.placeholder.com/150",
        status: "online", lastSeen: firebase.database.ServerValue.TIMESTAMP
    };
    
    localStorage.setItem(`profile_${currentUser.uid}`, JSON.stringify(profileData));
    database.ref('users/' + currentUser.uid).set(profileData).then(() => changeView('chat'));
});

// Verificação de credenciais locais ao iniciar o app (Login Automático / Offline)
function checkLocalSessionAndLogin() {
    const localUser = localStorage.getItem('localLoggedUser');
    if (localUser) {
        const creds = JSON.parse(localUser);
        if (!navigator.onLine) {
            // Inicializa estrutura mínima offline para uso imediato do app sem travar
            currentUser = { uid: "offline_user", email: creds.email };
            changeView('chat');
            loadChatList();
            triggerSystemPopup("Modo Offline", "Você entrou usando dados salvos localmente.", "https://cdn-icons-png.flaticon.com/512/565/565340.png");
        } else {
            auth.signInWithEmailAndPassword(creds.email, creds.pass).catch(() => {
                changeView('login');
            });
        }
    } else {
        changeView('login');
    }
}

// ─── PRESENÇA ───────────────────────────────────────────────────────────────
function setupPresenceSystem(userId) {
    if (userId === "offline_user") return;
    const userStatusRef = database.ref(`users/${userId}`);
    database.ref(".info/connected").on("value", snap => {
        if (!snap.val()) return;
        userStatusRef.onDisconnect().update({ status: "offline", lastSeen: firebase.database.ServerValue.TIMESTAMP });
        userStatusRef.update({ status: "online", lastSeen: firebase.database.ServerValue.TIMESTAMP });
    });
}

function listenToGlobalMessages() {
    if (currentUser.uid === "offline_user") return;
    database.ref('chats').on('child_changed', snap => {
        const chat = snap.val();
        if (!chat || !chat.messages) return;
        const msgKeys = Object.keys(chat.messages);
        const lastMsg = chat.messages[msgKeys[msgKeys.length - 1]];
        if (!lastMsg || !lastMsg.senderId) return;
        if (lastMsg.senderId !== currentUser.uid && lastMsg.status === 'sending') {
            if (blockedUsers[lastMsg.senderId]) return;
            if (silencedUsers[lastMsg.senderId]) return;
            const toggle = document.getElementById('toggle-popup-global');
            if (!toggle || !toggle.checked) return;
            database.ref(`users/${lastMsg.senderId}`).once('value', uSnap => {
                const sender = uSnap.val();
                if (!sender) return;
                triggerPremiumPopup(sender, lastMsg.text || "Enviou uma mídia");
            });
        }
    });
}

function triggerPremiumPopup(sender, text) {
    const popup = document.getElementById('popup-notification');
    if (!popup) return;
    document.getElementById('popup-avatar').src    = sender.avatar;
    document.getElementById('popup-title').innerText = sender.nickname;
    document.getElementById('popup-text').innerText  = text;
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('expanded'), 150);
    setTimeout(() => { popup.classList.remove('expanded'); setTimeout(() => popup.classList.add('hidden'), 400); }, 3500);
}

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        database.ref('users/' + user.uid).once('value').then(snap => {
            if (snap.exists() && snap.val().username) {
                localStorage.setItem(`profile_${user.uid}`, JSON.stringify(snap.val()));
                changeView('chat');
                setupPresenceSystem(user.uid);
                loadChatList();
                listenToGlobalMessages();
            } else {
                changeView('profile');
            }
        }).catch(() => {
            // Fallback de carregamento local do perfil em caso de flutuação de rede
            const cachedProfile = localStorage.getItem(`profile_${user.uid}`);
            if (cachedProfile) {
                changeView('chat');
                loadChatList();
            } else {
                changeView('profile');
            }
        });
    } else {
        checkLocalSessionAndLogin();
    }
});

// ─── UTILITÁRIOS ────────────────────────────────────────────────────────────
function getDisplayName(user) {
    if (!user) return '';
    return customNicknames[user.uid] || user.nickname || '';
}

function formatLastSeen(timestamp) {
    if (!timestamp) return "offline";
    const diffMins = Math.floor((Date.now() - timestamp) / 60000);
    if (diffMins < 1)  return "offline há instantes";
    if (diffMins < 60) return `offline há ${diffMins} min`;
    const h = Math.floor(diffMins / 60);
    if (h < 24) return `offline há ${h} h`;
    return "offline há algum tempo";
}

function buildTicks(status) {
    if (!status) return '';
    switch (status) {
        case 'offline_pending': return `<span style="color:var(--text-muted); font-size:11px;">🕒</span>`;
        case 'sending':   return `<div class="status-dot-wrapper"><span class="status-dot dot-sending"></span></div>`;
        case 'sent':      return `<div class="status-dot-wrapper"><span class="status-dot dot-sent"></span></div>`;
        case 'delivered': return `<div class="status-dot-wrapper"><span class="status-dot dot-delivered"></span><span class="status-dot dot-delivered"></span></div>`;
        case 'read':      return `<div class="status-dot-wrapper"><span class="status-dot dot-read"></span><span class="status-dot dot-read"></span></div>`;
    }
    return '';
}

// ─── BLOQUEAR / DESBLOQUEAR ─────────────────────────────────────────────────
function isBlocked(uid) { return !!blockedUsers[uid]; }
function saveBlockedUsers() { localStorage.setItem('blockedUsers', JSON.stringify(blockedUsers)); }

function blockUser(uid) {
    blockedUsers[uid] = true;
    saveBlockedUsers();
    applyBlockedStateToChat(uid, true);
}

function unblockUser(uid) {
    delete blockedUsers[uid];
    saveBlockedUsers();
    applyBlockedStateToChat(uid, false);
}

function applyBlockedStateToChat(uid, blocked) {
    const headerBadge = document.getElementById('blocked-header-badge');
    const banner      = document.getElementById('blocked-chat-banner');
    const footer      = document.getElementById('chat-footer-area');
    if (blocked) {
        headerBadge && headerBadge.classList.remove('hidden');
        banner && banner.classList.remove('hidden');
        footer && footer.classList.add('blocked-mode');
    } else {
        headerBadge && headerBadge.classList.add('hidden');
        banner && banner.classList.add('hidden');
        footer && footer.classList.remove('blocked-mode');
    }
    const sheetBadge    = document.getElementById('sheet-blocked-badge');
    const btnBlock      = document.getElementById('btn-sheet-block');
    const btnUnblock    = document.getElementById('btn-sheet-unblock');
    if (blocked) {
        sheetBadge && sheetBadge.classList.remove('hidden');
        btnBlock   && btnBlock.classList.add('hidden');
        btnUnblock && btnUnblock.classList.remove('hidden');
    } else {
        sheetBadge && sheetBadge.classList.add('hidden');
        btnBlock   && btnBlock.classList.remove('hidden');
        btnUnblock && btnUnblock.classList.add('hidden');
    }
    loadChatList();
}

document.getElementById('btn-sheet-block').addEventListener('click', () => {
    if (!activeRecipientId) return;
    if (confirm("Bloquear este usuário? Ele não poderá te enviar mensagens.")) {
        blockUser(activeRecipientId);
        document.getElementById('contact-info-sheet').classList.add('hidden');
    }
});

document.getElementById('btn-sheet-unblock').addEventListener('click', () => {
    if (!activeRecipientId) return;
    if (confirm("Desbloquear este usuário?")) {
        unblockUser(activeRecipientId);
        document.getElementById('contact-info-sheet').classList.add('hidden');
    }
});

document.getElementById('btn-unblock-banner').addEventListener('click', () => {
    if (!activeRecipientId) return;
    unblockUser(activeRecipientId);
});

// ─── CHAT: ABRIR SALA ───────────────────────────────────────────────────────
function openChatRoom(chatId, recipientData) {
    activeChatId      = chatId;
    activeRecipientId = recipientData.uid;
    replyingTo        = null;
    document.getElementById('reply-bar').classList.add('hidden');
    document.getElementById('active-chat-name').innerText  = getDisplayName(recipientData);
    document.getElementById('active-chat-avatar').src      = recipientData.avatar;
    document.getElementById('chat-room-screen').classList.remove('hidden');
    
    // Adiciona classe de marcação visual para desktop
    document.querySelectorAll('.chat-item-row').forEach(el => el.classList.remove('active-desktop-chat'));
    const targetedRow = document.querySelector(`.chat-item-row[data-chat-id="${chatId}"]`);
    if(targetedRow) targetedRow.classList.add('active-desktop-chat');

    const emptyPanel = document.getElementById('empty-chat-panel');
    if (emptyPanel) emptyPanel.classList.add('hidden');

    applyBlockedStateToChat(recipientData.uid, isBlocked(recipientData.uid));

    if (currentUser.uid !== "offline_user") {
        database.ref(`users/${recipientData.uid}`).on('value', rSnap => {
            const rUser = rSnap.val();
            if (!rUser) return;
            const statusEl = document.getElementById('active-chat-status');
            const badgeEl  = document.getElementById('active-chat-online-badge');
            const headerInfo = document.getElementById('btn-open-recipient-info');
            if (rUser.status === 'online') {
                headerInfo.classList.add('is-online');
                statusEl.innerText = "online";
                badgeEl.classList.remove('hidden');
            } else {
                headerInfo.classList.remove('is-online');
                statusEl.innerText = formatLastSeen(rUser.lastSeen);
                badgeEl.classList.add('hidden');
            }
        });

        database.ref(`chats/${chatId}/messages`).off();
        database.ref(`chats/${chatId}/messages`).on('value', snap => {
            renderMessages(snap, recipientData);
            snap.forEach(child => {
                const d = child.val();
                if (d && d.senderId !== currentUser.uid && d.status !== 'read') {
                    database.ref(`chats/${chatId}/messages/${d.id}`).update({ status: 'read', readAt: firebase.database.ServerValue.TIMESTAMP });
                }
            });
        });
    } else {
        // Renderização em Modo Offline estruturado do cache do LocalStorage
        const localHistory = localStorage.getItem(`offline_hist_${chatId}`);
        if(localHistory) {
            const mockedSnap = [];
            const parsed = JSON.parse(localHistory);
            Object.keys(parsed).forEach(k => {
                mockedSnap.push({ val: () => parsed[k] });
            });
            renderMessages(mockedSnap, recipientData, true);
        }
    }
}

function renderMessages(snap, recipientData, isRawArray = false) {
    const box = document.getElementById('messages-container');
    const prevScrollBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
    box.innerHTML = '';

    const cachePayload = {};

    snap.forEach(child => {
        const data = isRawArray ? child.val() : child.val();
        if (!data) return;

        cachePayload[data.id] = data;

        const dmKey = `${activeChatId}_${data.id}`;
        if (deletedForMe[dmKey]) return;

        if (data.deletedForAll) {
            const wrapper = document.createElement('div');
            wrapper.className = `message-wrapper ${data.senderId === currentUser.uid ? 'sent' : 'received'}`;
            const card = document.createElement('div');
            card.className = `message ${data.senderId === currentUser.uid ? 'sent' : 'received'} deleted-msg`;
            card.innerHTML = `<p>🚫 Mensagem apagada</p>`;
            wrapper.appendChild(card);
            box.appendChild(wrapper);
            return;
        }

        const wrapper = document.createElement('div');
        const isSent  = data.senderId === currentUser.uid;
        wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
        wrapper.dataset.msgId = data.id;

        const arrow = document.createElement('div');
        arrow.className = 'reply-arrow';
        arrow.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;"><path fill="currentColor" d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`;

        const card = document.createElement('div');
        card.className = `message ${isSent ? 'sent' : 'received'}`;
        if(data.status === 'offline_pending') {
            card.classList.add('is-offline-pending');
        }

        let quotedHtml = '';
        if (data.replyTo) {
            const who = data.replyTo.senderId === currentUser.uid ? 'Você' : getDisplayName(recipientData);
            quotedHtml = `<div class="quoted-msg"><span>${who}</span>${data.replyTo.text || '📷 Mídia'}</div>`;
        }

        let content = quotedHtml;
        if (data.image) {
            content += `<img src="${data.image}" class="message-img media-target">`;
        } else if (data.video) {
            content += `<video src="${data.video}" class="message-video media-target" controls></video>`;
        } else if (data.audio) {
            content += `
                <div class="audio-message-container">
                    <button class="audio-play-btn" onclick="playAudioMessage('${data.audio}', this)">
                        <svg viewBox="0 0 24 24" style="width:24px;height:24px;"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
                    </button>
                    <span style="font-size:12px;color:var(--text-muted)">Mensagem de áudio</span>
                </div>
            `;
        }
        
        content += data.text  ? `<p>${data.text}</p>` : '';
        if (data.edited) content += `<span class="edited-tag">Editada</span>`;
        const ticks = isSent ? `<div class="msg-meta-row">${buildTicks(data.status)}</div>` : '';
        card.innerHTML = content + ticks;

        applyLongPress(card, (e) => {
            card.classList.remove('pressing');
            openContextMenu(data, card, wrapper, e);
        }, () => card.classList.add('pressing'), () => card.classList.remove('pressing'));

        applySwipeToReply(wrapper, card, arrow, data);

        if (isSent) { wrapper.appendChild(card); wrapper.appendChild(arrow); }
        else        { wrapper.appendChild(arrow); wrapper.appendChild(card); }
        box.appendChild(wrapper);
    });

    if(activeChatId && Object.keys(cachePayload).length > 0) {
        localStorage.setItem(`offline_hist_${activeChatId}`, JSON.stringify(cachePayload));
    }

    if (prevScrollBottom < 80) box.scrollTop = box.scrollHeight;
    bindMediaViewerEvents();
}

function playAudioMessage(src, btn) {
    const audio = new Audio(src);
    btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:24px;height:24px;"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    audio.play();
    audio.onended = () => {
        btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:24px;height:24px;"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`;
    };
}

// ─── VISUALIZADOR DE MÍDIA COM CONTROLES E ZOOM PREMIUM ────────────────────
function bindMediaViewerEvents() {
    document.querySelectorAll('.media-target').forEach(media => {
        media.addEventListener('click', (e) => {
            e.stopPropagation();
            const src = media.getAttribute('src');
            const isVideo = media.classList.contains('message-video');
            const viewer = document.getElementById('media-viewer');
            const container = document.getElementById('media-viewer-container');
            container.innerHTML = '';
            
            let element;
            if(isVideo) {
                element = document.createElement('video');
                element.controls = true;
                element.autoplay = true;
            } else {
                element = document.createElement('img');
            }
            element.src = src;
            element.className = "media-viewer-content";
            container.appendChild(element);
            viewer.classList.remove('hidden');

            // Implementação de Zoom Premium via Toque/Duplo Clique Nativos
            let currentZoom = 1;
            element.addEventListener('click', () => {
                currentZoom = currentZoom === 1 ? 2 : 1;
                element.style.transform = `scale(${currentZoom})`;
            });
        });
    });
}
document.getElementById('media-viewer-close').addEventListener('click', () => {
    document.getElementById('media-viewer').classList.add('hidden');
});

// ─── LONG PRESS ─────────────────────────────────────────────────────────────
function applyLongPress(element, callback, onStart, onCancel) {
    let timer = null; let moved = false;
    const start = (e) => {
        moved = false; onStart && onStart(e);
        timer = setTimeout(() => { if (!moved) callback(e); }, 500);
    };
    const cancel = () => { clearTimeout(timer); onCancel && onCancel(); };
    const move = () => { moved = true; cancel(); };
    element.addEventListener('touchstart',  start,  { passive: true });
    element.addEventListener('touchend',    cancel, { passive: true });
    element.addEventListener('touchmove',   move,   { passive: true });
    element.addEventListener('mousedown',   start);
    element.addEventListener('mouseup',     cancel);
    element.addEventListener('mouseleave',  cancel);
    element.addEventListener('mousemove',   move);
    element.addEventListener('contextmenu', e => e.preventDefault());
}

// ─── MENU DE CONTEXTO ───────────────────────────────────────────────────────
function openContextMenu(data, card, wrapper, event) {
    selectedMessageId   = data.id;
    selectedMessageData = data;
    const isSent = data.senderId === currentUser.uid;

    document.getElementById('ctx-edit-msg').style.display  = isSent && data.text ? 'flex' : 'none';
    document.getElementById('ctx-copy-direct').style.display = data.text ? 'flex' : 'none';

    const clone = card.cloneNode(true);
    const wrapClone = document.createElement('div');
    wrapClone.className = wrapper.className;
    wrapClone.appendChild(clone);

    const focusWrapper = document.getElementById('focused-message-wrapper');
    focusWrapper.innerHTML = ''; focusWrapper.appendChild(wrapClone);

    const overlay   = document.getElementById('blur-overlay');
    const container = document.getElementById('focused-container');
    overlay.classList.remove('hidden');

    const rect      = card.getBoundingClientRect();
    const menuBox   = document.getElementById('context-menu-box');
    const menuW     = 220; const padding   = 12; const vpW       = window.innerWidth;

    container.classList.toggle('align-right', isSent);
    container.classList.toggle('align-left',  !isSent);

    let left = isSent ? Math.max(padding, rect.right - menuW) : Math.min(rect.left, vpW - menuW - padding);
    let msgTop = Math.max(padding, rect.top - 20);

    container.style.left = left + 'px';
    container.style.top  = msgTop + 'px';
    container.style.width = menuW + 'px';
}

// ─── AÇÕES DO MENU DE CONTEXTO ───────────────────────────────────────────────
document.getElementById('ctx-reply-msg').addEventListener('click', () => {
    if (!selectedMessageData) return;
    replyingTo = { id: selectedMessageData.id, text: selectedMessageData.text || '', senderId: selectedMessageData.senderId };
    document.getElementById('reply-bar-text').innerText = selectedMessageData.text || 'Mídia';
    document.getElementById('reply-bar').classList.remove('hidden');
    document.getElementById('message-input').focus();
    document.getElementById('blur-overlay').classList.add('hidden');
});

document.getElementById('ctx-info-msg').addEventListener('click', () => {
    if(currentUser.uid === "offline_user") return alert("Indisponível no modo offline.");
    database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).once('value').then(snap => {
        const data = snap.val(); if (!data) return;
        document.getElementById('info-sent-time').innerText = new Date(data.timestamp).toLocaleTimeString();
        document.getElementById('info-read-time').innerText = data.status === 'read' ? (data.readAt ? new Date(data.readAt).toLocaleTimeString() : 'Sim') : 'Não lido';
        document.getElementById('blur-overlay').classList.add('hidden');
        document.getElementById('msg-info-modal').classList.remove('hidden');
    });
});

document.getElementById('btn-close-msg-info').addEventListener('click', () => document.getElementById('msg-info-modal').classList.add('hidden'));

document.getElementById('ctx-edit-msg').addEventListener('click', () => {
    if (!selectedMessageData || selectedMessageData.senderId !== currentUser.uid) return;
    document.getElementById('edit-msg-input').value = selectedMessageData.text;
    document.getElementById('blur-overlay').classList.add('hidden');
    document.getElementById('edit-msg-modal').classList.remove('hidden');
});
document.getElementById('btn-cancel-edit').addEventListener('click', () => document.getElementById('edit-msg-modal').classList.add('hidden'));
document.getElementById('btn-confirm-edit').addEventListener('click', () => {
    const newText = document.getElementById('edit-msg-input').value.trim();
    if (!newText) return;
    if(currentUser.uid !== "offline_user") {
        database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).update({ text: newText, edited: true });
    }
    document.getElementById('edit-msg-modal').classList.add('hidden');
});

document.getElementById('ctx-delete-single').addEventListener('click', () => {
    document.getElementById('blur-overlay').classList.add('hidden');
    const isSent = selectedMessageData && selectedMessageData.senderId === currentUser.uid;
    document.getElementById('btn-delete-for-all').style.display = isSent ? 'block' : 'none';
    document.getElementById('delete-options-modal').classList.remove('hidden');
});
document.getElementById('btn-delete-for-all').addEventListener('click', () => {
    if(currentUser.uid !== "offline_user") {
        database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).update({ deletedForAll: true, text: '', image: '', video: '', audio: '' });
    }
    document.getElementById('delete-options-modal').classList.add('hidden');
});
document.getElementById('btn-delete-for-me').addEventListener('click', () => {
    const dmKey = `${activeChatId}_${selectedMessageId}`;
    deletedForMe[dmKey] = true;
    localStorage.setItem('deletedForMe', JSON.stringify(deletedForMe));
    document.getElementById('delete-options-modal').classList.add('hidden');
    loadChatList();
});
document.getElementById('btn-cancel-delete').addEventListener('click', () => document.getElementById('delete-options-modal').classList.add('hidden'));

document.getElementById('ctx-copy-direct').addEventListener('click', () => {
    if (selectedMessageData && selectedMessageData.text) navigator.clipboard.writeText(selectedMessageData.text);
    document.getElementById('blur-overlay').classList.add('hidden');
});
document.getElementById('ctx-close-menu').addEventListener('click', () => document.getElementById('blur-overlay').classList.add('hidden'));

// ─── SWIPE TO REPLY ─────────────────────────────────────────────────────────
function applySwipeToReply(wrapper, card, arrow, data) {
    let startX = 0, isDragging = false, triggered = false;
    const threshold = 60; const isSent = data.senderId === currentUser.uid;
    const onStart = (clientX) => { startX = clientX; isDragging = true; triggered = false; card.style.transition = 'none'; };
    const onMove  = (clientX) => {
        if (!isDragging) return;
        const diff = clientX - startX;
        if (isSent && diff > 0) return; if (!isSent && diff < 0) return;
        const cur = isSent ? Math.max(diff, -threshold * 1.2) : Math.min(diff, threshold * 1.2);
        card.style.transform = `translateX(${cur}px)`;
        const p = Math.abs(cur) / threshold;
        arrow.style.opacity = Math.min(p, 1); arrow.classList.toggle('visible', p > 0.2);
        if (Math.abs(cur) >= threshold && !triggered) { triggered = true; arrow.classList.add('bounce'); setTimeout(() => arrow.classList.remove('bounce'), 300); }
    };
    const onEnd = () => {
        if (!isDragging) return; isDragging = false;
        card.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        card.style.transform = 'translateX(0)'; arrow.style.opacity = '0';
        if (triggered) {
            replyingTo = { id: data.id, text: data.text || '', senderId: data.senderId };
            document.getElementById('reply-bar-text').innerText = data.text || 'Mídia';
            document.getElementById('reply-bar').classList.remove('hidden');
            document.getElementById('message-input').focus();
        }
    };
    wrapper.addEventListener('touchstart', e => onStart(e.touches[0].clientX), { passive: true });
    wrapper.addEventListener('touchmove',  e => onMove(e.touches[0].clientX),  { passive: true });
    wrapper.addEventListener('touchend',   onEnd, { passive: true });
}

document.getElementById('btn-cancel-reply').addEventListener('click', () => { replyingTo = null; document.getElementById('reply-bar').classList.add('hidden'); });

// ─── ENVIO DE MENSAGENS COM FILA OFFLINE ADAPTADA ───────────────────────────
function pushMessage(text, imgBase64 = null, videoBase64 = null, audioBase64 = null) {
    if (!activeChatId || !currentUser) return;
    if (!text.trim() && !imgBase64 && !videoBase64 && !audioBase64) return;
    if (isBlocked(activeRecipientId)) return alert("Você bloqueou este usuário.");

    const mockedKey = "msg_" + Math.random().toString(36).substr(2, 9);
    const payload = {
        id: mockedKey,
        senderId: currentUser.uid,
        text: text.trim(),
        status: navigator.onLine ? 'sending' : 'offline_pending',
        timestamp: Date.now()
    };
    if (imgBase64)   payload.image = imgBase64;
    if (videoBase64) payload.video = videoBase64;
    if (audioBase64) payload.audio = audioBase64;

    if (!navigator.onLine) {
        // Envia para a fila local temporária
        offlineMessageQueue.push({ chatId: activeChatId, payload: payload });
        localStorage.setItem('offlineMessageQueue', JSON.stringify(offlineMessageQueue));
        
        // Renderização imediata na tela piscando
        const localHistory = JSON.parse(localStorage.getItem(`offline_hist_${activeChatId}`) || '{}');
        localHistory[mockedKey] = payload;
        localStorage.setItem(`offline_hist_${activeChatId}`, JSON.stringify(localHistory));
        
        // Re-renderização forçada instantânea
        const mockedSnap = Object.keys(localHistory).map(k => ({ val: () => localHistory[k] }));
        database.ref(`users/${activeRecipientId}`).once('value', uSnap => {
            renderMessages(mockedSnap, uSnap.val(), true);
        });
        document.getElementById('message-input').value = '';
        return;
    }

    const ref = database.ref(`chats/${activeChatId}/messages`).push();
    payload.id = ref.key;
    payload.status = 'sending';

    ref.set(payload).then(() => {
        setTimeout(() => ref.update({ status: 'sent' }),      400);
        setTimeout(() => ref.update({ status: 'delivered' }), 900);
    });
    document.getElementById('message-input').value = '';
}

function processOfflineQueue() {
    if(offlineMessageQueue.length === 0) return;
    const workingQueue = [...offlineMessageQueue];
    offlineMessageQueue = [];
    localStorage.setItem('offlineMessageQueue', JSON.stringify([]));

    workingQueue.forEach(item => {
        const ref = database.ref(`chats/${item.chatId}/messages`).push();
        const p = item.payload;
        p.id = ref.key;
        p.status = 'sending';
        ref.set(p).then(() => {
            ref.update({ status: 'sent' });
        });
    });
}

// ─── SISTEMA DE GRAVAÇÃO DE ÁUDIO PREMIUM (ESTILO WHATSAPP) ─────────────────
const micBtn = document.getElementById('btn-mic');
const msgInput = document.getElementById('message-input');
const sendBtn = document.getElementById('btn-send');

msgInput.addEventListener('input', () => {
    if(msgInput.value.trim().length > 0) {
        micBtn.classList.add('hidden');
        sendBtn.classList.remove('hidden');
    } else {
        micBtn.classList.remove('hidden');
        sendBtn.classList.add('hidden');
    }
});

function startAudioRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        isRecording = true;
        recordingLocked = false;
        recordStartTime = Date.now();

        // Insere a barra flutuante do gravador dinamicamente
        const bar = document.createElement('div');
        bar.id = "audio-recorder-overlay";
        bar.className = "audio-recorder-overlay";
        bar.innerHTML = `
            <div class="recorder-info">
                <div class="recorder-blink"></div>
                <span id="recorder-timer">0:00</span>
            </div>
            <div class="recorder-slide-tip" id="recorder-slide-tip">⬅ Deslize para cancelar ou ⬆ Travar</div>
        `;
        document.getElementById('chat-footer-area').insertBefore(bar, micBtn);

        recordTimerInterval = setInterval(() => {
            const sec = Math.floor((Date.now() - recordStartTime) / 1000);
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            document.getElementById('recorder-timer').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
        }, 1000);

        mediaRecorder.ondataavailable = e => { audioChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            clearInterval(recordTimerInterval);
            const overlay = document.getElementById('audio-recorder-overlay');
            if(overlay) overlay.remove();
            
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const reader = new FileReader();
            reader.onload = ev => {
                pushMessage("", null, null, ev.target.result);
            };
            reader.readAsDataURL(audioBlob);
            isRecording = false;
            micBtn.classList.remove('recording');
        };

        mediaRecorder.start();
        micBtn.classList.add('recording');
    }).catch(() => alert("Permissão de áudio negada."));
}

function cancelAudioRecording() {
    clearInterval(recordTimerInterval);
    if(mediaRecorder && isRecording) {
        mediaRecorder.ondataavailable = null;
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    const overlay = document.getElementById('audio-recorder-overlay');
    if(overlay) overlay.remove();
    isRecording = false;
    micBtn.classList.remove('recording');
}

function stopAndSendAudio() {
    if(mediaRecorder && isRecording) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

// Eventos de Toque/Arraste Nativos do Botão de Microfone
micBtn.addEventListener('mousedown', (e) => {
    startXMic = e.clientX; startYMic = e.clientY;
    startAudioRecording();
});

window.addEventListener('mousemove', (e) => {
    if(!isRecording || recordingLocked) return;
    const diffX = e.clientX - startXMic;
    const diffY = e.clientY - startYMic;

    // Arrastou para cima: trava gravação
    if(diffY < -50) {
        recordingLocked = true;
        const tip = document.getElementById('recorder-slide-tip');
        if(tip) tip.innerHTML = `🔒 Gravando travado... Clique para enviar ou 🗑`;
        tip.style.color = "var(--ios-green)";
    }
    // Arrastou para a esquerda: cancela
    if(diffX < -60) {
        cancelAudioRecording();
    }
});

micBtn.addEventListener('mouseup', () => {
    if(!isRecording) return;
    if(!recordingLocked) {
        stopAndSendAudio();
    }
});

// Suporte total a gestos Mobile (Touch)
micBtn.addEventListener('touchstart', (e) => {
    startXMic = e.touches[0].clientX; startYMic = e.touches[0].clientY;
    startAudioRecording();
}, {passive: true});

micBtn.addEventListener('touchmove', (e) => {
    if(!isRecording || recordingLocked) return;
    const diffX = e.touches[0].clientX - startXMic;
    const diffY = e.touches[0].clientY - startYMic;

    if(diffY < -50) {
        recordingLocked = true;
        const tip = document.getElementById('recorder-slide-tip');
        if(tip) tip.innerHTML = `🔒 Travado... Toque para enviar`;
    }
    if(diffX < -60) {
        cancelAudioRecording();
    }
}, {passive: true});

micBtn.addEventListener('touchend', () => {
    if(!isRecording) return;
    if(!recordingLocked) {
        stopAndSendAudio();
    }
});

// Cliques extras quando travado
micBtn.addEventListener('click', () => {
    if(isRecording && recordingLocked) {
        stopAndSendAudio();
    }
});

// ─── SELEÇÃO DE MÍDIA ADAPTADA (IMAGEM E VÍDEO) ──────────────────────────────
document.getElementById('message-input').addEventListener('keypress', e => { if (e.key === 'Enter') pushMessage(e.target.value); });
document.getElementById('btn-send').addEventListener('click', () => { const inp = document.getElementById('message-input'); pushMessage(inp.value); });
document.getElementById('btn-attach').addEventListener('click', () => document.getElementById('media-file-input').click());
document.getElementById('media-file-input').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        if(file.type.includes('video')) {
            pushMessage("", null, ev.target.result, null);
        } else {
            pushMessage("", ev.target.result, null, null);
        }
    };
    reader.readAsDataURL(file);
});

// ─── LISTA DE CHATS CONFORME PRIVACIDADE ISOLADA + PESQUISA ───
function loadChatList() {
    const searchQuery = document.getElementById('search-contacts-input').value.toLowerCase();
    
    database.ref('chat_relations').once('value', relationSnap => {
        const relations = relationSnap.val() || {};

        // Resgate local em caso de inicialização offline
        const localUsersCache = JSON.parse(localStorage.getItem('global_users_cache') || '{}');

        const processList = (dataSnapshotOrObj, isRaw = false) => {
            const parent = document.getElementById('chats-list');
            parent.innerHTML = '';
            
            const iterate = (child) => {
                const user = isRaw ? child : child.val();
                if (!user || !user.uid || (currentUser && user.uid === currentUser.uid)) return;

                const combinedId = currentUser ? (currentUser.uid < user.uid ? currentUser.uid + "_" + user.uid : user.uid + "_" + currentUser.uid) : "";
                const relationData = relations[combinedId];
                const iAddedThem = relationData && relationData[currentUser.uid] === true;
                if (!iAddedThem) return;

                const displayName = getDisplayName(user).toLowerCase();
                const username = (user.username || '').toLowerCase();
                if (searchQuery && !displayName.includes(searchQuery) && !username.includes(searchQuery)) return;

                const row = document.createElement('div');
                row.className = "chat-item-row";
                row.setAttribute('data-chat-id', combinedId);
                if(activeChatId === combinedId) row.classList.add('active-desktop-chat');
                
                row.innerHTML = `
                    <img src="${user.avatar || 'https://via.placeholder.com/150'}">
                    <div class="chat-item-info">
                        <div class="chat-item-header">
                            <h4>${getDisplayName(user)} ${isBlocked(user.uid) ? '<span class="blocked-list-badge">BLOQ</span>' : ''}</h4>
                        </div>
                        <p>${user.username || ''}</p>
                    </div>
                `;
                row.addEventListener('click', () => openChatRoom(combinedId, user));
                parent.appendChild(row);
            };

            if(isRaw) Object.keys(dataSnapshotOrObj).forEach(k => iterate(dataSnapshotOrObj[k]));
            else dataSnapshotOrObj.forEach(iterate);
        };

        if(currentUser.uid !== "offline_user") {
            database.ref('users').on('value', snap => {
                const rawUsers = {};
                snap.forEach(c => { rawUsers[c.key] = c.val(); });
                localStorage.setItem('global_users_cache', JSON.stringify(rawUsers));
                processList(snap, false);
            });
        } else {
            processList(localUsersCache, true);
        }
    });
}

document.getElementById('search-contacts-input').addEventListener('input', loadChatList);

// MODAIS EXTRA E CHAVES DE SELEÇÃO DE ABAS DAS CONFIGURAÇÕES
document.getElementById('btn-main-settings').addEventListener('click', () => {
    if(currentUser.uid !== "offline_user") {
        database.ref(`users/${currentUser.uid}`).once('value').then(snap => {
            const data = snap.val(); if(!data) return;
            document.getElementById('settings-nickname').value = data.nickname || '';
            document.getElementById('settings-username').value = (data.username || '').replace('@','');
            document.getElementById('settings-bio').value = data.bio || '';
            document.getElementById('settings-avatar-preview').src = data.avatar || '';
        });
    }
    document.getElementById('settings-screen').classList.remove('hidden');
});

document.getElementById('btn-back-settings').addEventListener('click', () => document.getElementById('settings-screen').classList.add('hidden'));

document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.querySelectorAll('.settings-tab-pane').forEach(pane => pane.classList.add('hidden'));
        document.getElementById(`stab-${target}`).classList.remove('hidden');
    });
});

document.getElementById('btn-save-account').addEventListener('click', () => {
    const nick = document.getElementById('settings-nickname').value.trim();
    const userAt = document.getElementById('settings-username').value.trim().replace('@','');
    const bio = document.getElementById('settings-bio').value.trim();
    if(!nick || !userAt) return alert("Campos vazios!");
    
    const upd = { nickname: nick, username: '@'+userAt, bio: bio };
    if(base64AvatarString) upd.avatar = base64AvatarString;
    
    if(currentUser.uid !== "offline_user") {
        database.ref(`users/${currentUser.uid}`).update(upd);
    }
    // Salva localmente de forma sincronizada imediatamente
    const currentLoc = JSON.parse(localStorage.getItem(`profile_${currentUser.uid}`) || '{}');
    localStorage.setItem(`profile_${currentUser.uid}`, JSON.stringify({...currentLoc, ...upd}));
    alert("Alterações salvas localmente e na nuvem!");
});

document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('localLoggedUser');
    auth.signOut().then(() => window.location.reload());
});

document.getElementById('btn-new-chat').addEventListener('click', () => {
    if(currentUser.uid === "offline_user") return alert("Indisponível offline.");
    database.ref('users').once('value').then(snap => {
        const modalList = document.getElementById('contacts-list-modal');
        modalList.innerHTML = '';
        snap.forEach(child => {
            const u = child.val(); if(u.uid === currentUser.uid) return;
            const row = document.createElement('div'); row.className = "chat-item-row";
            row.innerHTML = `<img src="${u.avatar}"><h4>${u.nickname}</h4>`;
            row.addEventListener('click', () => {
                const cid = currentUser.uid < u.uid ? currentUser.uid+"_"+u.uid : u.uid+"_"+currentUser.uid;
                database.ref(`chat_relations/${cid}/${currentUser.uid}`).set(true).then(() => {
                    document.getElementById('contacts-modal').classList.add('hidden');
                    openChatRoom(cid, u);
                });
            });
            modalList.appendChild(row);
        });
        document.getElementById('contacts-modal').classList.remove('hidden');
    });
});
document.getElementById('btn-close-modal').addEventListener('click', () => document.getElementById('contacts-modal').classList.add('hidden'));
document.getElementById('btn-back-to-list').addEventListener('click', () => document.getElementById('chat-room-screen').classList.add('hidden'));
