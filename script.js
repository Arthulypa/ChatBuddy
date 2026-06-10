// INSIRA SUAS CREDENCIAIS DO BANCO DO FIREBASE CHATBUDDY AQUI
const firebaseConfig = {
  apiKey: "AIzaSyDwW6LoRrGTJqXdYkbhv-0srz7VKKfykh4",
  authDomain: "chatbuddy-96a61.firebaseapp.com",
  databaseURL: "https://chatbuddy-96a61-default-rtdb.firebaseio.com",
  projectId: "chatbuddy-96a61",
  storageBucket: "chatbuddy-96a61.firebasestorage.app",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

let currentUser = null;
let activeChatId = null;
let activeRecipientId = null;
let base64AvatarString = "";
let selectedMessageText = "";
let selectedMessageId = "";
let silencedUsers = {};
let customNicknames = JSON.parse(localStorage.getItem('customNicknames') || '{}');
let replyingTo = null; // { id, text, senderId }

const viewPages = {
    login: document.getElementById('login-page'),
    register: document.getElementById('register-page'),
    profile: document.getElementById('profile-page'),
    chat: document.getElementById('chat-page')
};

function changeView(target) {
    Object.keys(viewPages).forEach(k => viewPages[k].classList.add('hidden'));
    viewPages[target].classList.remove('hidden');
}

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

// ─── AUTENTICAÇÃO ─────────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email-login').value.trim();
    const pass = document.getElementById('password-login').value;
    if (!email || !pass) return alert("Preencha todos os campos!");

    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.innerText = 'Entrando...';

    auth.signInWithEmailAndPassword(email, pass)
        .catch(err => {
            btn.disabled = false;
            btn.innerText = 'Entrar';
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
    const pass = document.getElementById('password-reg').value;
    if (!email || !pass) return alert("Insira credenciais válidas.");
    document.getElementById('reg-step-1').classList.add('hidden');
    document.getElementById('reg-step-2').classList.remove('hidden');
});

document.getElementById('btn-verify-and-register').addEventListener('click', () => {
    const code = document.getElementById('verification-code-input').value.trim();
    if (code !== "123456") return alert("Código ChatBuddy inválido!");
    const email = document.getElementById('email-reg').value.trim();
    const pass = document.getElementById('password-reg').value;
    auth.createUserWithEmailAndPassword(email, pass)
        .then(() => changeView('profile'))
        .catch(err => alert("Erro: " + err.message));
});

document.getElementById('btn-google-login').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => alert(err.message));
});

document.getElementById('btn-save-profile').addEventListener('click', () => {
    const nick = document.getElementById('display-name').value.trim();
    const userAt = document.getElementById('username').value.trim().replace('@', '');
    const bio = document.getElementById('user-bio').value.trim() || "Disponível no ChatBuddy";
    if (!nick || !userAt) return alert("Campos obrigatórios vazios!");
    database.ref('users/' + currentUser.uid).set({
        uid: currentUser.uid,
        nickname: nick,
        username: '@' + userAt,
        bio: bio,
        wlstwrus: "Disponível no ChatBuddy 🚀",
        avatar: base64AvatarString || "https://via.placeholder.com/150",
        status: "online",
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    }).then(() => changeView('chat'));
});

// ─── PRESENÇA REAL-TIME ───────────────────────────────────────────────────────
function setupPresenceSystem(userId) {
    const userStatusRef = database.ref(`users/${userId}`);
    const connectedRef = database.ref(".info/connected");
    connectedRef.on("value", (snap) => {
        if (snap.val() === false) return;
        userStatusRef.onDisconnect().update({
            status: "offline",
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            userStatusRef.update({
                status: "online",
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        });
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
    document.getElementById('popup-avatar').src = sender.avatar;
    document.getElementById('popup-title').innerText = sender.nickname;
    document.getElementById('popup-text').innerText = text;
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('expanded'), 150);
    setTimeout(() => {
        popup.classList.remove('expanded');
        setTimeout(() => popup.classList.add('hidden'), 400);
    }, 3500);
}

auth.onAuthStateChanged(user => {
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) { btnLogin.disabled = false; btnLogin.innerText = 'Entrar'; }

    if (user) {
        currentUser = user;
        database.ref('users/' + user.uid).once('value').then(snap => {
            if (snap.exists() && snap.val() && snap.val().username) {
                changeView('chat');
                setupPresenceSystem(user.uid);
                loadChatList();
                listenToGlobalMessages();
            } else {
                changeView('profile');
            }
        });
    } else {
        currentUser = null;
        changeView('login');
    }
});

// ─── UTILITÁRIOS ──────────────────────────────────────────────────────────────
function getDisplayName(user) {
    if (!user) return '';
    return customNicknames[user.uid] || user.nickname || '';
}

function applyLongPress(element, actionCallback) {
    let timer;
    const start = (e) => timer = setTimeout(() => actionCallback(e), 600);
    const stop = () => clearTimeout(timer);
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchend', stop, { passive: true });
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', stop);
    element.addEventListener('mouseleave', stop);
}

function buildTicks(status) {
    if (!status) return '';
    switch (status) {
        case 'sending':   return `<div class="status-dot-wrapper"><span class="status-dot dot-sending"></span></div>`;
        case 'sent':      return `<div class="status-dot-wrapper"><span class="status-dot dot-sent-unreceived"></span></div>`;
        case 'delivered': return `<div class="status-dot-wrapper"><span class="status-dot dot-delivered"></span><span class="status-dot dot-delivered"></span></div>`;
        case 'read':      return `<div class="status-dot-wrapper"><span class="status-dot dot-read"></span><span class="status-dot dot-read"></span></div>`;
    }
    return '';
}

function formatLastSeen(timestamp) {
    if (!timestamp) return "offline";
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "offline há instantes";
    if (diffMins < 60) return `offline há ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `offline há ${diffHours} h`;
    return "offline há algum tempo";
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
function openChatRoom(chatId, recipientData) {
    activeChatId = chatId;
    activeRecipientId = recipientData.uid;
    replyingTo = null;
    document.getElementById('reply-bar').classList.add('hidden');

    document.getElementById('active-chat-name').innerText = getDisplayName(recipientData);
    document.getElementById('active-chat-avatar').src = recipientData.avatar;
    document.getElementById('chat-room-screen').classList.remove('hidden');

    database.ref(`users/${recipientData.uid}`).on('value', rSnap => {
        const rUser = rSnap.val();
        if (!rUser) return;
        const statusTextEl = document.getElementById('active-chat-status');
        const badgeEl = document.getElementById('active-chat-online-badge');
        const infoHeader = document.getElementById('btn-open-recipient-info');
        if (rUser.status === 'online') {
            infoHeader.classList.add('is-online');
            statusTextEl.innerText = "online";
            badgeEl.classList.remove('hidden');
        } else {
            infoHeader.classList.remove('is-online');
            statusTextEl.innerText = formatLastSeen(rUser.lastSeen);
            badgeEl.classList.add('hidden');
        }
    });

    database.ref(`chats/${chatId}/messages`).off();
    database.ref(`chats/${chatId}/messages`).on('value', snap => {
        const box = document.getElementById('messages-container');
        box.innerHTML = '';

        snap.forEach(child => {
            const data = child.val();
            if (!data) return;

            const wrapper = document.createElement('div');
            wrapper.className = `message-wrapper ${data.senderId === currentUser.uid ? 'sent' : 'received'}`;
            wrapper.dataset.msgId = data.id;

            const arrow = document.createElement('div');
            arrow.className = 'reply-arrow';
            arrow.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;"><path fill="currentColor" d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`;

            const card = document.createElement('div');
            card.className = `message ${data.senderId === currentUser.uid ? 'sent' : 'received'}`;

            let quotedHtml = '';
            if (data.replyTo) {
                const who = data.replyTo.senderId === currentUser.uid ? 'Você' : getDisplayName(recipientData);
                quotedHtml = `<div class="quoted-msg"><span>${who}</span>${data.replyTo.text || '📷 Mídia'}</div>`;
            }

            let content = quotedHtml;
            content += data.image ? `<img src="${data.image}" class="message-img">` : '';
            content += data.text ? `<p>${data.text}</p>` : '';
            let ticks = data.senderId === currentUser.uid ? `<div class="msg-meta-row">${buildTicks(data.status)}</div>` : '';
            card.innerHTML = content + ticks;

            applyLongPress(card, () => {
                selectedMessageText = data.text || "";
                selectedMessageId = data.id;

                const clone = card.cloneNode(true);
                const wrapClone = document.createElement('div');
                wrapClone.className = `message-wrapper ${data.senderId === currentUser.uid ? 'sent' : 'received'}`;
                wrapClone.appendChild(clone);

                const focusWrapper = document.getElementById('focused-message-wrapper');
                focusWrapper.innerHTML = '';
                focusWrapper.appendChild(wrapClone);

                document.getElementById('blur-overlay').classList.remove('hidden');
            });

            applySwipeToReply(wrapper, card, arrow, data);

            if (data.senderId === currentUser.uid) {
                wrapper.appendChild(card);
                wrapper.appendChild(arrow);
            } else {
                wrapper.appendChild(arrow);
                wrapper.appendChild(card);
            }
            box.appendChild(wrapper);
        });
        box.scrollTop = box.scrollHeight;
    });
}

// ─── SWIPE TO REPLY ───────────────────────────────────────────────────────────
function applySwipeToReply(wrapper, card, arrow, data) {
    let startX = 0, currentX = 0, isDragging = false, triggered = false;
    const threshold = 60;
    const isSent = data.senderId === currentUser.uid;

    const onStart = (clientX) => {
        startX = clientX; isDragging = true; triggered = false;
        card.style.transition = 'none';
    };
    const onMove = (clientX) => {
        if (!isDragging) return;
        const diff = clientX - startX;
        if (isSent && diff > 0) return;
        if (!isSent && diff < 0) return;
        currentX = isSent ? Math.max(diff, -threshold * 1.2) : Math.min(diff, threshold * 1.2);
        card.style.transform = `translateX(${currentX}px)`;
        const progress = Math.abs(currentX) / threshold;
        arrow.style.opacity = Math.min(progress, 1);
        arrow.classList.toggle('visible', progress > 0.2);
        if (Math.abs(currentX) >= threshold && !triggered) {
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
    wrapper.addEventListener('touchmove', e => onMove(e.touches[0].clientX), { passive: true });
    wrapper.addEventListener('touchend', onEnd, { passive: true });
    wrapper.addEventListener('mousedown', e => onStart(e.clientX));
    window.addEventListener('mousemove', e => { if (isDragging) onMove(e.clientX); });
    window.addEventListener('mouseup', () => { if (isDragging) onEnd(); });
}

document.getElementById('btn-cancel-reply').addEventListener('click', () => {
    replyingTo = null;
    document.getElementById('reply-bar').classList.add('hidden');
});

// ─── ENVIO DE MENSAGENS ───────────────────────────────────────────────────────
function pushMessage(text, imgBase64 = null) {
    if (!activeChatId || !currentUser) return;
    if (!text.trim() && !imgBase64) return;
    const ref = database.ref(`chats/${activeChatId}/messages`).push();
    const payload = {
        id: ref.key,
        senderId: currentUser.uid,
        text: text,
        status: 'sending',
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    if (imgBase64) payload.image = imgBase64;
    if (replyingTo) {
        payload.replyTo = { id: replyingTo.id, text: replyingTo.text, senderId: replyingTo.senderId };
        replyingTo = null;
        document.getElementById('reply-bar').classList.add('hidden');
    }
    ref.set(payload).then(() => {
        setTimeout(() => ref.update({ status: 'sent' }), 300);
        setTimeout(() => ref.update({ status: 'delivered' }), 800);
        setTimeout(() => ref.update({ status: 'read' }), 1400);
    });
    document.getElementById('message-input').value = '';
}

document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') pushMessage(e.target.value);
});

document.getElementById('btn-send').addEventListener('click', () => {
    const input = document.getElementById('message-input');
    pushMessage(input.value);
});

document.getElementById('btn-attach').addEventListener('click', () => document.getElementById('media-file-input').click());
document.getElementById('media-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => pushMessage("", ev.target.result);
    reader.readAsDataURL(file);
});

// ─── MENU DE CONTEXTO (LONG PRESS) ───────────────────────────────────────────
document.getElementById('ctx-info-msg').addEventListener('click', () => {
    if (!selectedMessageId || !activeChatId) return;
    database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).once('value').then(snap => {
        const data = snap.val();
        if (!data) return;
        const sentDate = new Date(data.timestamp);
        document.getElementById('info-sent-time').innerText = sentDate.toLocaleTimeString();
        const readDate = new Date(data.timestamp + 1200);
        document.getElementById('info-read-time').innerText = data.status === 'read' ? readDate.toLocaleTimeString() : "Não lido";
        document.getElementById('blur-overlay').classList.add('hidden');
        document.getElementById('msg-info-modal').classList.remove('hidden');
    });
});

document.getElementById('btn-close-msg-info').addEventListener('click', () => {
    document.getElementById('msg-info-modal').classList.add('hidden');
});

document.getElementById('ctx-edit-msg').addEventListener('click', () => {
    if (!selectedMessageText) return alert("Apenas textos podem ser editados!");
    const newText = prompt("Editar mensagem:", selectedMessageText);
    if (newText && newText.trim() !== "") {
        database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).update({ text: newText + " (editada)" });
    }
    document.getElementById('blur-overlay').classList.add('hidden');
});

document.getElementById('ctx-delete-single').addEventListener('click', () => {
    if (confirm("Apagar para todos?")) {
        database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).remove();
    }
    document.getElementById('blur-overlay').classList.add('hidden');
});

document.getElementById('ctx-copy-direct').addEventListener('click', () => {
    navigator.clipboard.writeText(selectedMessageText).then(() => {
        document.getElementById('blur-overlay').classList.add('hidden');
    });
});

document.getElementById('ctx-close-menu').addEventListener('click', () => document.getElementById('blur-overlay').classList.add('hidden'));

// ─── LISTA DE CHATS ───────────────────────────────────────────────────────────
function loadChatList() {
    database.ref('users').on('value', snap => {
        const parent = document.getElementById('chats-list');
        parent.innerHTML = '';
        snap.forEach(child => {
            const user = child.val();
            if (!user || !user.uid || user.uid === currentUser.uid) return;
            const row = document.createElement('div');
            row.className = "chat-item-row";
            row.innerHTML = `<img src="${user.avatar}" onerror="this.src='https://via.placeholder.com/150'">
                             <div class="chat-item-info">
                                <div class="chat-item-header"><h4>${getDisplayName(user)}</h4></div>
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

// ─── INFO DO CONTATO ──────────────────────────────────────────────────────────
document.getElementById('btn-open-recipient-info').addEventListener('click', () => {
    database.ref('users/' + activeRecipientId).once('value').then(s => {
        const u = s.val();
        if (!u) return;
        document.getElementById('sheet-contact-nick').innerText = u.nickname;
        document.getElementById('sheet-contact-user').innerText = u.username;
        document.getElementById('sheet-contact-avatar').src = u.avatar;
        document.getElementById('sheet-contact-bio').innerText = u.bio || "Sem biografia.";
        document.getElementById('sheet-contact-wlstwrus').innerText = u.wlstwrus || "Disponível";
        document.getElementById('toggle-silence-user').checked = !!silencedUsers[activeRecipientId];
        document.getElementById('contact-info-sheet').classList.remove('hidden');
    });
});

document.getElementById('toggle-silence-user').addEventListener('change', (e) => {
    silencedUsers[activeRecipientId] = e.target.checked;
});

document.getElementById('btn-close-info-sheet').addEventListener('click', () => document.getElementById('contact-info-sheet').classList.add('hidden'));

document.getElementById('btn-sheet-block').addEventListener('click', () => {
    if (!activeRecipientId) return;
    if (confirm("Bloquear este usuário? Você não receberá mais mensagens dele.")) {
        silencedUsers[activeRecipientId] = true;
        document.getElementById('contact-info-sheet').classList.add('hidden');
        alert("Usuário bloqueado.");
    }
});

// ─── APELIDOS ─────────────────────────────────────────────────────────────────
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
    if (nick) {
        customNicknames[activeRecipientId] = nick;
    } else {
        delete customNicknames[activeRecipientId];
    }
    localStorage.setItem('customNicknames', JSON.stringify(customNicknames));
    document.getElementById('nickname-modal').classList.add('hidden');
    database.ref('users/' + activeRecipientId).once('value').then(s => {
        const u = s.val();
        if (!u) return;
        document.getElementById('active-chat-name').innerText = getDisplayName(u);
        document.getElementById('sheet-contact-nick').innerText = nick || u.nickname;
    });
    loadChatList();
});

// ─── NAVEGAÇÃO ────────────────────────────────────────────────────────────────
document.getElementById('btn-back-to-list').addEventListener('click', () => {
    database.ref(`users/${activeRecipientId}`).off();
    document.getElementById('chat-room-screen').classList.add('hidden');
});
document.getElementById('btn-back-settings').addEventListener('click', () => document.getElementById('settings-screen').classList.add('hidden'));
document.getElementById('btn-logout').addEventListener('click', () => { auth.signOut().then(() => window.location.reload()); });
document.getElementById('btn-to-register').addEventListener('click', () => changeView('register'));
document.getElementById('btn-to-login').addEventListener('click', () => changeView('login'));
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

// ─── SETTINGS ────────────────────────────────────────────────────────────────
document.getElementById('btn-main-settings').addEventListener('click', () => {
    document.getElementById('settings-screen').classList.remove('hidden');
    if (currentUser) {
        database.ref('users/' + currentUser.uid).once('value').then(snap => {
            const u = snap.val();
            if (!u) return;
            document.getElementById('settings-nickname').value = u.nickname || '';
            document.getElementById('settings-username').value = (u.username || '').replace('@', '');
            document.getElementById('settings-bio').value = u.bio || '';
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
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        base64AvatarString = ev.target.result;
        document.getElementById('settings-avatar-preview').src = base64AvatarString;
    };
    reader.readAsDataURL(file);
});

document.getElementById('btn-save-account').addEventListener('click', () => {
    const nick = document.getElementById('settings-nickname').value.trim();
    const userAt = document.getElementById('settings-username').value.trim().replace('@', '');
    const bio = document.getElementById('settings-bio').value.trim() || "Disponível no ChatBuddy";
    if (!nick || !userAt) return alert("Nickname e usuário são obrigatórios!");
    const updates = { nickname: nick, username: '@' + userAt, bio: bio };
    if (base64AvatarString) updates.avatar = base64AvatarString;
    database.ref('users/' + currentUser.uid).update(updates).then(() => {
        alert("Perfil atualizado!");
        base64AvatarString = '';
    });
});

document.getElementById('btn-change-password').addEventListener('click', () => {
    if (!currentUser || !currentUser.email) return alert("Nenhum usuário logado.");
    auth.sendPasswordResetEmail(currentUser.email)
        .then(() => alert("E-mail de redefinição de senha enviado para " + currentUser.email))
        .catch(err => alert("Erro: " + err.message));
});

document.getElementById('btn-active-sessions').addEventListener('click', () => {
    const device = (navigator.userAgent.split(')')[0].split('(')[1] || 'desconhecido');
    alert("Sessão atual:\n\nDispositivo: " + device + "\nLogado como: " + (currentUser ? currentUser.email : "—"));
});
