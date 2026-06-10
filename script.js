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
let selectedMessageData = null;   // objeto completo da msg selecionada
let silencedUsers      = {};
let blockedUsers       = JSON.parse(localStorage.getItem('blockedUsers') || '{}');
let deletedForMe       = JSON.parse(localStorage.getItem('deletedForMe') || '{}');
let customNicknames    = JSON.parse(localStorage.getItem('customNicknames') || '{}');
let replyingTo         = null;    // { id, text, senderId }
let longPressTimer     = null;

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

// ─── AUTENTICAÇÃO ───────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email-login').value.trim();
    const pass  = document.getElementById('password-login').value;
    if (!email || !pass) return alert("Preencha todos os campos!");
    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.innerText = 'Entrando...';
    auth.signInWithEmailAndPassword(email, pass).catch(err => {
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
        .then(() => changeView('profile'))
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
    database.ref('users/' + currentUser.uid).set({
        uid: currentUser.uid, nickname: nick, username: '@' + userAt, bio: bio,
        wlstwrus: "Disponível no ChatBuddy 🚀",
        avatar: base64AvatarString || "https://via.placeholder.com/150",
        status: "online", lastSeen: firebase.database.ServerValue.TIMESTAMP
    }).then(() => changeView('chat'));
});

// ─── PRESENÇA ───────────────────────────────────────────────────────────────
function setupPresenceSystem(userId) {
    const userStatusRef = database.ref(`users/${userId}`);
    database.ref(".info/connected").on("value", snap => {
        if (!snap.val()) return;
        userStatusRef.onDisconnect().update({ status: "offline", lastSeen: firebase.database.ServerValue.TIMESTAMP });
        userStatusRef.update({ status: "online", lastSeen: firebase.database.ServerValue.TIMESTAMP });
    });
}

function listenToGlobalMessages() {
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
                changeView('chat');
                setupPresenceSystem(user.uid);
                loadChatList();
                listenToGlobalMessages();
            } else {
                changeView('profile');
            }
        });
    } else {
        changeView('login');
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

// ─── STATUS DOTS ────────────────────────────────────────────────────────────
function buildTicks(status) {
    if (!status) return '';
    switch (status) {
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
    // Atualiza header badge
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
    // Atualiza sheet
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
    // Atualiza lista
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

    // Estado de bloqueio
    applyBlockedStateToChat(recipientData.uid, isBlocked(recipientData.uid));

    // Presença do destinatário
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

    // Mensagens em tempo real
    database.ref(`chats/${chatId}/messages`).off();
    database.ref(`chats/${chatId}/messages`).on('value', snap => {
        renderMessages(snap, recipientData);
        // Marcar como lido (status read) nas mensagens recebidas
        snap.forEach(child => {
            const d = child.val();
            if (d && d.senderId !== currentUser.uid && d.status !== 'read') {
                database.ref(`chats/${chatId}/messages/${d.id}`).update({ status: 'read', readAt: firebase.database.ServerValue.TIMESTAMP });
            }
        });
    });
}

function renderMessages(snap, recipientData) {
    const box = document.getElementById('messages-container');
    const prevScrollBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
    box.innerHTML = '';

    snap.forEach(child => {
        const data = child.val();
        if (!data) return;

        // Apagadas "só pra mim"
        const dmKey = `${activeChatId}_${data.id}`;
        if (deletedForMe[dmKey]) return;

        // Mensagem apagada para todos
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

        let quotedHtml = '';
        if (data.replyTo) {
            const who = data.replyTo.senderId === currentUser.uid ? 'Você' : getDisplayName(recipientData);
            quotedHtml = `<div class="quoted-msg"><span>${who}</span>${data.replyTo.text || '📷 Mídia'}</div>`;
        }

        let content = quotedHtml;
        content += data.image ? `<img src="${data.image}" class="message-img">` : '';
        content += data.text  ? `<p>${data.text}</p>` : '';
        if (data.edited) content += `<span class="edited-tag">Editada</span>`;
        const ticks = isSent ? `<div class="msg-meta-row">${buildTicks(data.status)}</div>` : '';
        card.innerHTML = content + ticks;

        // Long press com animação de pressionar
        applyLongPress(card, (e) => {
            card.classList.remove('pressing');
            openContextMenu(data, card, wrapper, e);
        }, () => card.classList.add('pressing'), () => card.classList.remove('pressing'));

        // Swipe to reply
        applySwipeToReply(wrapper, card, arrow, data);

        if (isSent) { wrapper.appendChild(card); wrapper.appendChild(arrow); }
        else        { wrapper.appendChild(arrow); wrapper.appendChild(card); }
        box.appendChild(wrapper);
    });

    // Mantém scroll no fundo se já estava perto do fundo
    if (prevScrollBottom < 80) box.scrollTop = box.scrollHeight;
}

// ─── LONG PRESS COM ANIMAÇÃO ────────────────────────────────────────────────
function applyLongPress(element, callback, onStart, onCancel) {
    let timer = null;
    let moved = false;

    const start = (e) => {
        moved = false;
        onStart && onStart(e);
        timer = setTimeout(() => {
            if (!moved) callback(e);
        }, 500);
    };
    const cancel = () => {
        clearTimeout(timer);
        onCancel && onCancel();
    };
    const move = () => { moved = true; cancel(); };

    element.addEventListener('touchstart',  start,  { passive: true });
    element.addEventListener('touchend',    cancel, { passive: true });
    element.addEventListener('touchmove',   move,   { passive: true });
    element.addEventListener('mousedown',   start);
    element.addEventListener('mouseup',     cancel);
    element.addEventListener('mouseleave',  cancel);
    element.addEventListener('mousemove',   move);
    // Impede menu de contexto nativo em mobile
    element.addEventListener('contextmenu', e => e.preventDefault());
}

// ─── MENU DE CONTEXTO POSICIONADO ───────────────────────────────────────────
function openContextMenu(data, card, wrapper, event) {
    selectedMessageId   = data.id;
    selectedMessageData = data;
    const isSent = data.senderId === currentUser.uid;

    // Mostrar/ocultar "Editar" apenas para próprias mensagens
    document.getElementById('ctx-edit-msg').style.display  = isSent && data.text ? 'flex' : 'none';
    // Mostrar "Copiar" apenas se tem texto
    document.getElementById('ctx-copy-direct').style.display = data.text ? 'flex' : 'none';

    // Clonar mensagem para o overlay
    const clone     = card.cloneNode(true);
    const wrapClone = document.createElement('div');
    wrapClone.className = wrapper.className;
    wrapClone.appendChild(clone);

    const focusWrapper = document.getElementById('focused-message-wrapper');
    focusWrapper.innerHTML = '';
    focusWrapper.appendChild(wrapClone);

    const overlay   = document.getElementById('blur-overlay');
    const container = document.getElementById('focused-container');
    overlay.classList.remove('hidden');

    // Posicionamento: descobre posição original da mensagem
    const rect      = card.getBoundingClientRect();
    const menuBox   = document.getElementById('context-menu-box');
    const menuH     = 260; // altura estimada do menu
    const menuW     = 220;
    const padding   = 12;
    const vpH       = window.innerHeight;
    const vpW       = window.innerWidth;

    // Alinha menu ao lado da mensagem (esquerda ou direita)
    container.classList.toggle('align-right', isSent);
    container.classList.toggle('align-left',  !isSent);

    // Posição horizontal
    let left;
    if (isSent) {
        left = Math.max(padding, rect.right - menuW);
    } else {
        left = Math.min(rect.left, vpW - menuW - padding);
    }

    // Posição vertical: mensagem fica acima, menu abaixo; se não cabe, inverte
    let msgTop = rect.top - 20; // 20px acima da posição original
    if (msgTop < padding) msgTop = padding;

    // Container vem logo abaixo da mensagem clonada, mas sobe se perto do fundo
    const msgH = rect.height;
    let containerTop = msgTop;
    if (containerTop + msgH + menuH + 10 > vpH) {
        containerTop = vpH - msgH - menuH - padding - 20;
    }
    if (containerTop < padding) containerTop = padding;

    container.style.left = left + 'px';
    container.style.top  = containerTop + 'px';
    container.style.width = menuW + 'px';
}

// ─── AÇÕES DO MENU DE CONTEXTO ───────────────────────────────────────────────
document.getElementById('ctx-reply-msg').addEventListener('click', () => {
    if (!selectedMessageData) return;
    replyingTo = { id: selectedMessageData.id, text: selectedMessageData.text || '', senderId: selectedMessageData.senderId };
    document.getElementById('reply-bar-text').innerText = selectedMessageData.text || '📷 Mídia';
    document.getElementById('reply-bar').classList.remove('hidden');
    document.getElementById('message-input').focus();
    document.getElementById('blur-overlay').classList.add('hidden');
});

document.getElementById('ctx-info-msg').addEventListener('click', () => {
    if (!selectedMessageId || !activeChatId) return;
    database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).once('value').then(snap => {
        const data = snap.val();
        if (!data) return;
        document.getElementById('info-sent-time').innerText = new Date(data.timestamp).toLocaleTimeString();
        document.getElementById('info-read-time').innerText = data.status === 'read'
            ? (data.readAt ? new Date(data.readAt).toLocaleTimeString() : 'Sim')
            : 'Não lido';
        document.getElementById('blur-overlay').classList.add('hidden');
        document.getElementById('msg-info-modal').classList.remove('hidden');
    });
});

document.getElementById('btn-close-msg-info').addEventListener('click', () => document.getElementById('msg-info-modal').classList.add('hidden'));

// Editar: só para mensagens próprias, abre modal bonito
document.getElementById('ctx-edit-msg').addEventListener('click', () => {
    if (!selectedMessageData || selectedMessageData.senderId !== currentUser.uid) return;
    if (!selectedMessageData.text) return alert("Apenas textos podem ser editados!");
    document.getElementById('edit-msg-input').value = selectedMessageData.text;
    document.getElementById('blur-overlay').classList.add('hidden');
    document.getElementById('edit-msg-modal').classList.remove('hidden');
});
document.getElementById('btn-cancel-edit').addEventListener('click', () => document.getElementById('edit-msg-modal').classList.add('hidden'));
document.getElementById('btn-confirm-edit').addEventListener('click', () => {
    const newText = document.getElementById('edit-msg-input').value.trim();
    if (!newText) return;
    database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).update({ text: newText, edited: true });
    document.getElementById('edit-msg-modal').classList.add('hidden');
});

// Apagar: abre modal com opções contextuais
document.getElementById('ctx-delete-single').addEventListener('click', () => {
    document.getElementById('blur-overlay').classList.add('hidden');
    const isSent = selectedMessageData && selectedMessageData.senderId === currentUser.uid;
    // Mostra/oculta opção "apagar para todos" conforme dono
    document.getElementById('btn-delete-for-all').style.display = isSent ? 'block' : 'none';
    document.getElementById('delete-options-modal').classList.remove('hidden');
});
document.getElementById('btn-delete-for-all').addEventListener('click', () => {
    database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).update({ deletedForAll: true, text: '', image: '' });
    document.getElementById('delete-options-modal').classList.add('hidden');
});
document.getElementById('btn-delete-for-me').addEventListener('click', () => {
    const dmKey = `${activeChatId}_${selectedMessageId}`;
    deletedForMe[dmKey] = true;
    localStorage.setItem('deletedForMe', JSON.stringify(deletedForMe));
    document.getElementById('delete-options-modal').classList.add('hidden');
    // Re-renderiza
    database.ref(`chats/${activeChatId}/messages`).once('value').then(snap => {
        database.ref(`users/${activeRecipientId}`).once('value').then(uSnap => renderMessages(snap, uSnap.val()));
    });
});
document.getElementById('btn-cancel-delete').addEventListener('click', () => document.getElementById('delete-options-modal').classList.add('hidden'));

document.getElementById('ctx-copy-direct').addEventListener('click', () => {
    if (selectedMessageData && selectedMessageData.text) navigator.clipboard.writeText(selectedMessageData.text);
    document.getElementById('blur-overlay').classList.add('hidden');
});

document.getElementById('ctx-close-menu').addEventListener('click', () => document.getElementById('blur-overlay').classList.add('hidden'));

// Fechar clicando fora
document.getElementById('blur-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('blur-overlay')) document.getElementById('blur-overlay').classList.add('hidden');
});

// ─── SWIPE TO REPLY ─────────────────────────────────────────────────────────
function applySwipeToReply(wrapper, card, arrow, data) {
    let startX = 0, isDragging = false, triggered = false;
    const threshold = 60;
    const isSent = data.senderId === currentUser.uid;

    const onStart = (clientX) => { startX = clientX; isDragging = true; triggered = false; card.style.transition = 'none'; };
    const onMove  = (clientX) => {
        if (!isDragging) return;
        const diff = clientX - startX;
        if (isSent && diff > 0) return;
        if (!isSent && diff < 0) return;
        const cur = isSent ? Math.max(diff, -threshold * 1.2) : Math.min(diff, threshold * 1.2);
        card.style.transform = `translateX(${cur}px)`;
        const p = Math.abs(cur) / threshold;
        arrow.style.opacity = Math.min(p, 1);
        arrow.classList.toggle('visible', p > 0.2);
        if (Math.abs(cur) >= threshold && !triggered) {
            triggered = true;
            arrow.classList.add('bounce');
            setTimeout(() => arrow.classList.remove('bounce'), 300);
        }
    };
    const onEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        card.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        card.style.transform = 'translateX(0)';
        arrow.style.opacity = '0';
        if (triggered) {
            replyingTo = { id: data.id, text: data.text || '', senderId: data.senderId };
            document.getElementById('reply-bar-text').innerText = data.text || '📷 Mídia';
            document.getElementById('reply-bar').classList.remove('hidden');
            document.getElementById('message-input').focus();
        }
    };

    wrapper.addEventListener('touchstart', e => onStart(e.touches[0].clientX), { passive: true });
    wrapper.addEventListener('touchmove',  e => onMove(e.touches[0].clientX),  { passive: true });
    wrapper.addEventListener('touchend',   onEnd, { passive: true });
    wrapper.addEventListener('mousedown',  e => onStart(e.clientX));
    window.addEventListener('mousemove',   e => { if (isDragging) onMove(e.clientX); });
    window.addEventListener('mouseup',     () => { if (isDragging) onEnd(); });
}

document.getElementById('btn-cancel-reply').addEventListener('click', () => {
    replyingTo = null;
    document.getElementById('reply-bar').classList.add('hidden');
});

// ─── ENVIO DE MENSAGENS ──────────────────────────────────────────────────────
function pushMessage(text, imgBase64 = null) {
    if (!activeChatId || !currentUser) return;
    if (!text.trim() && !imgBase64) return;
    if (isBlocked(activeRecipientId)) return alert("Você bloqueou este usuário.");

    const ref = database.ref(`chats/${activeChatId}/messages`).push();
    const payload = {
        id: ref.key,
        senderId: currentUser.uid,
        text: text.trim(),
        status: 'sending',
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    if (imgBase64)  payload.image   = imgBase64;
    if (replyingTo) {
        payload.replyTo = { id: replyingTo.id, text: replyingTo.text, senderId: replyingTo.senderId };
        replyingTo = null;
        document.getElementById('reply-bar').classList.add('hidden');
    }
    // Status em tempo real: sending → sent → delivered → read
    ref.set(payload).then(() => {
        setTimeout(() => ref.update({ status: 'sent' }),      400);
        setTimeout(() => ref.update({ status: 'delivered' }), 900);
        // 'read' é atualizado pelo destinatário ao abrir o chat (no renderMessages)
    });
    document.getElementById('message-input').value = '';
}

document.getElementById('message-input').addEventListener('keypress', e => { if (e.key === 'Enter') pushMessage(e.target.value); });
document.getElementById('btn-send').addEventListener('click', () => { const inp = document.getElementById('message-input'); pushMessage(inp.value); });
document.getElementById('btn-attach').addEventListener('click', () => document.getElementById('media-file-input').click());
document.getElementById('media-file-input').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => pushMessage("", ev.target.result);
    reader.readAsDataURL(file);
});

// ─── LISTA DE CHATS ──────────────────────────────────────────────────────────
function loadChatList() {
    database.ref('users').on('value', snap => {
        const parent = document.getElementById('chats-list');
        parent.innerHTML = '';
        snap.forEach(child => {
            const user = child.val();
            if (!user || !user.uid || user.uid === currentUser.uid) return;
            const row = document.createElement('div');
            row.className = "chat-item-row";
            const blockedBadge = isBlocked(user.uid) ? `<span class="blocked-list-badge">BLOQ</span>` : '';
            row.innerHTML = `
                <img src="${user.avatar}" onerror="this.src='https://via.placeholder.com/150'">
                <div class="chat-item-info">
                    <div class="chat-item-header"><h4>${getDisplayName(user)}${blockedBadge}</h4></div>
                    <p>${user.username}</p>
                </div>`;
            row.addEventListener('click', () => {
                const combinedId = currentUser.uid < user.uid ? currentUser.uid + "_" + user.uid : user.uid + "_" + currentUser.uid;
                openChatRoom(combinedId, user);
            });
            parent.appendChild(row);
        });
    });
}

// ─── INFO DO CONTATO ─────────────────────────────────────────────────────────
document.getElementById('btn-open-recipient-info').addEventListener('click', () => {
    database.ref('users/' + activeRecipientId).once('value').then(s => {
        const u = s.val(); if (!u) return;
        document.getElementById('sheet-contact-nick').innerText  = getDisplayName(u);
        document.getElementById('sheet-contact-user').innerText  = u.username;
        document.getElementById('sheet-contact-avatar').src      = u.avatar;
        document.getElementById('sheet-contact-bio').innerText   = u.bio || "Sem biografia.";
        document.getElementById('sheet-contact-wlstwrus').innerText = u.wlstwrus || "Disponível";
        document.getElementById('toggle-silence-user').checked   = !!silencedUsers[activeRecipientId];
        // Estado de bloqueio no sheet
        const blocked = isBlocked(activeRecipientId);
        document.getElementById('sheet-blocked-badge').classList.toggle('hidden', !blocked);
        document.getElementById('btn-sheet-block').classList.toggle('hidden', blocked);
        document.getElementById('btn-sheet-unblock').classList.toggle('hidden', !blocked);
        document.getElementById('contact-info-sheet').classList.remove('hidden');
    });
});

document.getElementById('toggle-silence-user').addEventListener('change', e => { silencedUsers[activeRecipientId] = e.target.checked; });
document.getElementById('btn-close-info-sheet').addEventListener('click', () => document.getElementById('contact-info-sheet').classList.add('hidden'));

// ─── APELIDOS ────────────────────────────────────────────────────────────────
document.getElementById('btn-set-nickname').addEventListener('click', () => {
    document.getElementById('nickname-input').value = customNicknames[activeRecipientId] || '';
    document.getElementById('nickname-modal').classList.remove('hidden');
    document.getElementById('contact-info-sheet').classList.add('hidden');
});
document.getElementById('btn-cancel-nickname').addEventListener('click', () => {
    document.getElementById('nickname-modal').classList.add('hidden');
    document.getElementById('contact-info-sheet').classList.remove('hidden');
});
document.getElementById('btn-save-nickname').addEventListener('click', () => {
    const nick = document.getElementById('nickname-input').value.trim();
    if (nick) customNicknames[activeRecipientId] = nick;
    else delete customNicknames[activeRecipientId];
    localStorage.setItem('customNicknames', JSON.stringify(customNicknames));
    document.getElementById('nickname-modal').classList.add('hidden');
    database.ref('users/' + activeRecipientId).once('value').then(s => {
        const u = s.val(); if (!u) return;
        document.getElementById('active-chat-name').innerText   = getDisplayName(u);
        document.getElementById('sheet-contact-nick').innerText = nick || u.nickname;
    });
    loadChatList();
});

// ─── NAVEGAÇÃO ───────────────────────────────────────────────────────────────
document.getElementById('btn-back-to-list').addEventListener('click', () => {
    database.ref(`users/${activeRecipientId}`).off();
    database.ref(`chats/${activeChatId}/messages`).off();
    document.getElementById('chat-room-screen').classList.add('hidden');
});
document.getElementById('btn-back-settings').addEventListener('click', () => document.getElementById('settings-screen').classList.add('hidden'));
document.getElementById('btn-logout').addEventListener('click', () => { auth.signOut().then(() => window.location.reload()); });
document.getElementById('btn-to-register').addEventListener('click', () => changeView('register'));
document.getElementById('btn-to-login').addEventListener('click',    () => changeView('login'));
document.getElementById('btn-contact-menu').addEventListener('click', () => document.getElementById('btn-open-recipient-info').click());

document.getElementById('btn-new-chat').addEventListener('click', () => {
    database.ref('users').once('value').then(snap => {
        const list = document.getElementById('contacts-list-modal');
        list.innerHTML = '';
        snap.forEach(c => {
            const u = c.val();
            if (!u || !u.uid || u.uid === currentUser.uid) return;
            const item = document.createElement('div');
            item.className = "chat-item-row";
            item.innerHTML = `<img src="${u.avatar}" onerror="this.src='https://via.placeholder.com/150'"><div><h4>${u.nickname}</h4></div>`;
            item.addEventListener('click', () => {
                document.getElementById('contacts-modal').classList.add('hidden');
                const combinedId = currentUser.uid < u.uid ? currentUser.uid + "_" + u.uid : u.uid + "_" + currentUser.uid;
                openChatRoom(combinedId, u);
            });
            list.appendChild(item);
        });
        document.getElementById('contacts-modal').classList.remove('hidden');
    });
});
document.getElementById('btn-close-modal').addEventListener('click', () => document.getElementById('contacts-modal').classList.add('hidden'));

// ─── TABS PRINCIPAIS ─────────────────────────────────────────────────────────
['chats','status','calls'].forEach(tab => {
    document.getElementById('tab-' + tab).addEventListener('click', () => {
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
        document.getElementById('tab-' + tab).classList.add('active');
        document.getElementById('content-' + tab).classList.remove('hidden');
    });
});

// ─── SETTINGS ────────────────────────────────────────────────────────────────
document.getElementById('btn-main-settings').addEventListener('click', () => {
    document.getElementById('settings-screen').classList.remove('hidden');
    if (currentUser) {
        database.ref('users/' + currentUser.uid).once('value').then(snap => {
            const u = snap.val(); if (!u) return;
            document.getElementById('settings-nickname').value = u.nickname || '';
            document.getElementById('settings-username').value = (u.username || '').replace('@', '');
            document.getElementById('settings-bio').value      = u.bio || '';
            document.getElementById('settings-avatar-preview').src = u.avatar || '';
        });
    }
});

document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.add('hidden'));
        tab.classList.add('active');
        document.getElementById('stab-' + tab.dataset.tab).classList.remove('hidden');
    });
});

document.getElementById('settings-avatar-input').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { base64AvatarString = ev.target.result; document.getElementById('settings-avatar-preview').src = base64AvatarString; };
    reader.readAsDataURL(file);
});

document.getElementById('btn-save-account').addEventListener('click', () => {
    const nick   = document.getElementById('settings-nickname').value.trim();
    const userAt = document.getElementById('settings-username').value.trim().replace('@', '');
    const bio    = document.getElementById('settings-bio').value.trim() || "Disponível no ChatBuddy";
    if (!nick || !userAt) return alert("Nickname e usuário são obrigatórios!");
    const updates = { nickname: nick, username: '@' + userAt, bio: bio };
    if (base64AvatarString) updates.avatar = base64AvatarString;
    database.ref('users/' + currentUser.uid).update(updates).then(() => { alert("Perfil atualizado!"); base64AvatarString = ''; });
});

document.getElementById('btn-change-password').addEventListener('click', () => {
    if (!currentUser || !currentUser.email) return alert("Nenhum usuário logado.");
    auth.sendPasswordResetEmail(currentUser.email)
        .then(() => alert("E-mail de redefinição enviado para " + currentUser.email))
        .catch(err => alert("Erro: " + err.message));
});

document.getElementById('btn-active-sessions').addEventListener('click', () => {
    const device = (navigator.userAgent.split(')')[0].split('(')[1] || 'desconhecido');
    alert("Sessão atual:\n\nDispositivo: " + device + "\nLogado como: " + (currentUser ? currentUser.email : "—"));
});
