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
        localStorage.setItem('localLoggedUser', JSON.stringify({email, pass: btoa(unescape(encodeURIComponent(pass)))}));
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
            localStorage.setItem('localLoggedUser', JSON.stringify({email, pass: btoa(unescape(encodeURIComponent(pass)))}));
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

function checkLocalSessionAndLogin() {
    const localUser = localStorage.getItem('localLoggedUser');
    if (localUser) {
        const creds = JSON.parse(localUser);
        if (!navigator.onLine) {
            currentUser = { uid: "offline_user", email: creds.email };
            changeView('chat');
            loadChatList();
            updateHeaderUserInfo();
            triggerSystemPopup("Modo Offline", "Você entrou usando dados salvos localmente.", "https://cdn-icons-png.flaticon.com/512/565/565340.png");
        } else {
            const decodedPass = decodeURIComponent(escape(atob(creds.pass)));
            auth.signInWithEmailAndPassword(creds.email, decodedPass).catch(() => {
                changeView('login');
            });
        }
    } else {
        changeView('login');
    }
}

// Atualização Dinâmica das Informações do Usuário no Header
function updateHeaderUserInfo() {
    if (!currentUser) return;
    const cachedProfile = localStorage.getItem(`profile_${currentUser.uid}`);
    if (cachedProfile) {
        const p = JSON.parse(cachedProfile);
        document.getElementById('current-user-header-avatar').src = p.avatar || "https://via.placeholder.com/150";
        document.getElementById('current-user-header-nick').innerText = p.nickname || "Eu";
    } else if (currentUser.uid !== "offline_user") {
        database.ref('users/' + currentUser.uid).once('value', snap => {
            if (snap.exists()) {
                const p = snap.val();
                document.getElementById('current-user-header-avatar').src = p.avatar || "https://via.placeholder.com/150";
                document.getElementById('current-user-header-nick').innerText = p.nickname || "Eu";
            }
        });
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
    const listenStartTime = Date.now();
    database.ref('chats').on('child_changed', snap => {
        const chat = snap.val();
        if (!chat || !chat.messages) return;
        const msgKeys = Object.keys(chat.messages);
        const lastMsg = chat.messages[msgKeys[msgKeys.length - 1]];
        if (!lastMsg || !lastMsg.senderId) return;
        // Ignora mensagens que já existiam antes do listener ser registrado
        if (lastMsg.timestamp && lastMsg.timestamp < listenStartTime) return;
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
                updateHeaderUserInfo();
                listenToGlobalMessages();
                listenToChatRequests();
            } else {
                changeView('profile');
            }
        }).catch(() => {
            const cachedProfile = localStorage.getItem(`profile_${user.uid}`);
            if (cachedProfile) {
                changeView('chat');
                loadChatList();
                updateHeaderUserInfo();
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
    document.getElementById('active-chat-name').innerText  = getDisplayName(recipientData) || recipientData.nickname || 'Usuário';
    document.getElementById('active-chat-avatar').src      = recipientData.avatar || "https://via.placeholder.com/150";
    document.getElementById('chat-room-screen').classList.remove('hidden');
    
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
            // RENDERIZADOR INSTAGRAM STYLE COM TIMEOUT / CONTROLES MONOCROMÁTICOS E INDICADOR
            const durationFormatted = data.audioDuration ? formatAudioTime(data.audioDuration) : "0:00";
            content += `
                <div class="audio-message-container">
                    <button class="audio-play-btn" onclick="playAudioMessage('${data.audio}', this)">
                        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <div class="audio-progress-bar-wrapper">
                        <div class="audio-progress-bar-fill"></div>
                    </div>
                    <span class="audio-duration-tag">${durationFormatted}</span>
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

function formatAudioTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function playAudioMessage(src, btn) {
    const container = btn.closest('.audio-message-container');
    const fill = container.querySelector('.audio-progress-bar-fill');
    const tag = container.querySelector('.audio-duration-tag');
    
    // Se já estiver tocando este áudio, pausa
    if (window.currentPlayingAudio && window.currentPlayingAudio.src === src && !window.currentPlayingAudio.paused) {
        window.currentPlayingAudio.pause();
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
        return;
    }
    
    // Se tiver outro tocando, reseta ele
    if (window.currentPlayingAudio) {
        window.currentPlayingAudio.pause();
        const oldBtn = window.currentPlayingAudioContainer?.querySelector('.audio-play-btn');
        if (oldBtn) oldBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    }

    const audio = new Audio(src);
    window.currentPlayingAudio = audio;
    window.currentPlayingAudioContainer = container;

    btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    audio.play();

    audio.addEventListener('timeupdate', () => {
        const pct = (audio.currentTime / audio.duration) * 100;
        fill.style.width = `${pct}%`;
        tag.innerText = formatAudioTime(audio.currentTime);
    });

    audio.onended = () => {
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
        fill.style.width = '0%';
        tag.innerText = formatAudioTime(audio.duration || 0);
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

// ─── CORREÇÃO COMPLETA DO CORTE DO MENU DE CONTEXTO (MENSAGEM CENTRALIZADA) ───
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
    focusWrapper.innerHTML = ''; 
    focusWrapper.appendChild(wrapClone);

    const overlay   = document.getElementById('blur-overlay');
    const container = document.getElementById('focused-container');
    overlay.classList.remove('hidden');

    const rect = card.getBoundingClientRect();
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const menuW = 240; 
    
    // Força o container a se alinhar na direita ou na esquerda com base no remetente
    container.classList.toggle('align-right', isSent);
    container.classList.toggle('align-left',  !isSent);

    // X: Alinhado no mesmo lado da mensagem original
    let leftX = isSent ? (rect.right - menuW) : rect.left;
    if (leftX < 10) leftX = 10;
    if (leftX + menuW > vpW - 10) leftX = vpW - menuW - 10;

    // Y: CENTRALIZADO na altura da mensagem para não cortar opções superiores/inferiores
    let centerRefY = rect.top + (rect.height / 2) - 130; 
    if (centerRefY < 20) centerRefY = 20;
    if (centerRefY + 280 > vpH) centerRefY = vpH - 300;

    container.style.left = leftX + 'px';
    container.style.top  = centerRefY + 'px';
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
    if(currentUser.uid === "offline_user") {
        const cachedList = JSON.parse(localStorage.getItem('offline_chat_list') || '{}');
        const cachedChat = cachedList[activeChatId];
        const recipientObj = cachedChat ? cachedChat.recipient : { uid: activeRecipientId, avatar: "https://via.placeholder.com/150", nickname: "Usuário" };
        openChatRoom(activeChatId, recipientObj);
    }
});
document.getElementById('btn-cancel-delete').addEventListener('click', () => document.getElementById('delete-options-modal').classList.add('hidden'));

document.getElementById('ctx-copy-direct').addEventListener('click', () => {
    if(!selectedMessageData || !selectedMessageData.text) return;
    navigator.clipboard.writeText(selectedMessageData.text);
    document.getElementById('blur-overlay').classList.add('hidden');
});

document.getElementById('ctx-close-menu').addEventListener('click', () => {
    document.getElementById('blur-overlay').classList.add('hidden');
});
document.getElementById('blur-overlay').addEventListener('click', (e) => {
    if(e.target.id === 'blur-overlay') document.getElementById('blur-overlay').classList.add('hidden');
});

// ─── SWIPE TO REPLY ─────────────────────────────────────────────────────────
function applySwipeToReply(wrapper, card, arrow, msgData) {
    let startX = 0; let currentX = 0; let isSwiping = false;
    const threshold = 50;

    card.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX; isSwiping = true;
        arrow.classList.remove('bounce', 'visible');
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        currentX = e.touches[0].clientX;
        let diff = currentX - startX;
        
        if (msgData.senderId === currentUser.uid) {
            if (diff < 0) {
                let trans = Math.max(-70, diff);
                card.style.transform = `translateX(${trans}px)`;
                arrow.style.transform = `translateX(${trans + 10}px)`;
                if (trans <= -threshold) arrow.classList.add('visible');
                else arrow.classList.remove('visible');
            }
        } else {
            if (diff > 0) {
                let trans = Math.min(70, diff);
                card.style.transform = `translateX(${trans}px)`;
                arrow.style.transform = `translateX(${trans - 10}px)`;
                if (trans >= threshold) arrow.classList.add('visible');
                else arrow.classList.remove('visible');
            }
        }
    }, { passive: true });

    card.addEventListener('touchend', () => {
        if (!isSwiping) return; isSwiping = false;
        let diff = currentX - startX;
        card.style.transform = '';
        arrow.style.transform = '';

        if (msgData.senderId === currentUser.uid && diff <= -threshold) {
            arrow.classList.add('bounce');
            triggerReplyAction(msgData);
        } else if (msgData.senderId !== currentUser.uid && diff >= threshold) {
            arrow.classList.add('bounce');
            triggerReplyAction(msgData);
        }
        setTimeout(() => arrow.classList.remove('bounce', 'visible'), 300);
    });
}

function triggerReplyAction(msgData) {
    replyingTo = { id: msgData.id, text: msgData.text || '', senderId: msgData.senderId };
    document.getElementById('reply-bar-text').innerText = msgData.text || '📷 Mídia';
    document.getElementById('reply-bar').classList.remove('hidden');
    document.getElementById('message-input').focus();
}

document.getElementById('btn-cancel-reply').addEventListener('click', () => {
    replyingTo = null;
    document.getElementById('reply-bar').classList.add('hidden');
});

// ─── LISTAGEM DE CONVERSAS ATIVAS ───────────────────────────────────────────
function loadChatList() {
    if (currentUser.uid === "offline_user") {
        const localChats = localStorage.getItem('offline_chat_list');
        if(localChats) renderChatListRows(JSON.parse(localChats));
        return;
    }

    database.ref('chats').on('value', snap => {
        const listContainer = document.getElementById('chats-list');
        listContainer.innerHTML = '';
        const rawChats = [];

        snap.forEach(child => {
            const chat = child.val();
            if (!chat || !chat.participants || !chat.participants[currentUser.uid]) return;
            
            const pIds = Object.keys(chat.participants);
            const rId  = pIds.find(id => id !== currentUser.uid);
            if (!rId) return;

            rawChats.push({ chatId: child.key, recipientId: rId, lastTimestamp: chat.lastMessageTimestamp || 0, chatData: chat });
        });

        rawChats.sort((a,b) => b.lastTimestamp - a.lastTimestamp);
        
        const cacheListRows = {};
        if(rawChats.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">Nenhuma conversa ativa.</div>`;
            return;
        }

        rawChats.forEach(item => {
            database.ref(`users/${item.recipientId}`).once('value', uSnap => {
                const uData = uSnap.val();
                if (!uData) return;

                cacheListRows[item.chatId] = { chatId: item.chatId, recipient: uData, lastTimestamp: item.lastTimestamp, chatData: item.chatData };
                localStorage.setItem('offline_chat_list', JSON.stringify(cacheListRows));

                createChatRowElement(item.chatId, uData, item.chatData);
            });
        });
    });
}

function renderChatListRows(cachedObject) {
    const listContainer = document.getElementById('chats-list');
    listContainer.innerHTML = '';
    Object.keys(cachedObject).forEach(k => {
        const row = cachedObject[k];
        createChatRowElement(row.chatId, row.recipient, row.chatData);
    });
}

function createChatRowElement(chatId, uData, chatData) {
    const listContainer = document.getElementById('chats-list');
    const row = document.createElement('div');
    row.className = 'chat-item-row';
    row.dataset.chatId = chatId;
    if(chatId === activeChatId) row.classList.add('active-desktop-chat');

    let msgKeys = chatData.messages ? Object.keys(chatData.messages) : [];
    let lastMsgText = "Nenhuma mensagem";
    if (msgKeys.length > 0) {
        let lastMsg = chatData.messages[msgKeys[msgKeys.length - 1]];
        if (lastMsg.deletedForAll) lastMsgText = "🚫 Mensagem apagada";
        else lastMsgText = lastMsg.text || (lastMsg.audio ? "🎵 Áudio" : "📷 Mídia");
    }

    const blockBadge = isBlocked(uData.uid) ? `<span class="blocked-list-badge">BLOQUEADO</span>` : '';

    row.innerHTML = `
        <img src="${uData.avatar}" alt="">
        <div class="chat-item-info">
            <div class="chat-item-header">
                <h4>${getDisplayName(uData)} ${blockBadge}</h4>
            </div>
            <p>${lastMsgText}</p>
        </div>
    `;
    row.addEventListener('click', () => openChatRoom(chatId, uData));
    listContainer.appendChild(row);
}

// ─── ALTERAÇÃO INTERATIVA DE BOTÃO AUDIO/ENVIAR E PREVENÇÃO DE SUMIÇO ───
const msgInput = document.getElementById('message-input');
const btnSend  = document.getElementById('btn-send');
const btnMic   = document.getElementById('btn-mic');

msgInput.addEventListener('input', () => {
    toggleFooterButtonsState();
});

function toggleFooterButtonsState() {
    if (msgInput.value.trim().length > 0) {
        btnSend.classList.remove('hidden');
        btnMic.classList.add('hidden');
    } else {
        btnSend.classList.add('hidden');
        btnMic.classList.remove('hidden');
    }
}

// ─── ENVIO DE MENSAGENS COM RETORNO COMPLETO DO BOTÃO DE ÁUDIO ───
btnSend.addEventListener('click', () => {
    const txt = msgInput.value.trim();
    if (!txt || !activeChatId) return;

    const newMsgRef = database.ref(`chats/${activeChatId}/messages`).push();
    const msgId = newMsgRef.key;

    const payload = {
        id: msgId, senderId: currentUser.uid, text: txt,
        timestamp: firebase.database.ServerValue.TIMESTAMP, status: 'sending'
    };
    if (replyingTo) { payload.replyTo = replyingTo; }

    msgInput.value = '';
    
    // RETORNA PERFEITAMENTE O BOTÃO DE MICROFONE SEM DEPENDER DA VELOCIDADE DO FIREBASE
    toggleFooterButtonsState(); 
    
    replyingTo = null;
    document.getElementById('reply-bar').classList.add('hidden');

    if(currentUser.uid === "offline_user") {
        payload.status = 'offline_pending';
        payload.id = "off_" + Date.now();
        payload.timestamp = Date.now();
        offlineMessageQueue.push({chatId: activeChatId, payload});
        localStorage.setItem('offlineMessageQueue', JSON.stringify(offlineMessageQueue));
        openChatRoom(activeChatId, {uid: activeRecipientId});
        return;
    }

    newMsgRef.set(payload).then(() => {
        database.ref(`chats/${activeChatId}`).update({ lastMessageTimestamp: firebase.database.ServerValue.TIMESTAMP });
        newMsgRef.update({ status: 'sent' });
    });
});

function processOfflineQueue() {
    if(offlineMessageQueue.length === 0 || currentUser.uid === "offline_user") return;
    const item = offlineMessageQueue[0];
    database.ref(`chats/${item.chatId}/messages`).push().set({
        ...item.payload,
        status: 'sending',
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        offlineMessageQueue.shift();
        localStorage.setItem('offlineMessageQueue', JSON.stringify(offlineMessageQueue));
        processOfflineQueue();
    }).catch(() => {
        // Mantém o item na fila para tentar novamente depois
        console.warn("Falha ao enviar mensagem offline, será tentado novamente.");
    });
}

// ─── GRAVAÇÃO E CAPTURA DE ÁUDIO REAL DE ALTA QUALIDADE ───────────────────
btnMic.addEventListener('mousedown', startAudioRecording);
btnMic.addEventListener('touchstart', (e) => { startAudioRecording(e); }, {passive:true});

function startAudioRecording(e) {
    if(isRecording || isBlocked(activeRecipientId)) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        isRecording = true;
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        recordStartTime = Date.now();
        
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = saveAndSendAudioPayload;

        mediaRecorder.start();
        btnMic.classList.add('recording');
        triggerAudioOverlayUI(true);
    }).catch(() => alert("Permissão de áudio negada!"));
}

function triggerAudioOverlayUI(show) {
    let overlay = document.getElementById('native-recorder-overlay');
    if(show) {
        if(!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'native-recorder-overlay';
            overlay.className = 'audio-recorder-overlay';
            overlay.innerHTML = `
                <div class="recorder-info"><div class="recorder-blink"></div><span id="audio-timer-lbl">0:00</span></div>
                <span class="recorder-slide-tip">Gravando áudio...</span>
            `;
            document.getElementById('chat-footer-area').appendChild(overlay);
        }
        recordTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
            document.getElementById('audio-timer-lbl').innerText = formatAudioTime(elapsed);
        }, 1000);
    } else {
        if(overlay) overlay.remove();
        clearInterval(recordTimerInterval);
    }
}

window.addEventListener('mouseup', stopAudioRecording);
window.addEventListener('touchend', stopAudioRecording);

function stopAudioRecording() {
    if(!isRecording) return;
    isRecording = false;
    const recordStopTime = Date.now();
    btnMic.classList.remove('recording');
    triggerAudioOverlayUI(false);
    if(mediaRecorder) {
        mediaRecorder._recordStopTime = recordStopTime;
        mediaRecorder.stop();
    }
}

function saveAndSendAudioPayload() {
    const stopTime = (mediaRecorder && mediaRecorder._recordStopTime) ? mediaRecorder._recordStopTime : Date.now();
    const durationSeconds = Math.max(1, Math.floor((stopTime - recordStartTime) / 1000));
    const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64Audio = e.target.result;
        if (!activeChatId) return;

        const newMsgRef = database.ref(`chats/${activeChatId}/messages`).push();
        const payload = {
            id: newMsgRef.key, senderId: currentUser.uid, audio: base64Audio,
            audioDuration: durationSeconds, timestamp: firebase.database.ServerValue.TIMESTAMP, status: 'sending'
        };

        if(currentUser.uid === "offline_user") return;
        newMsgRef.set(payload).then(() => {
            database.ref(`chats/${activeChatId}`).update({ lastMessageTimestamp: firebase.database.ServerValue.TIMESTAMP });
            newMsgRef.update({ status: 'sent' });
        });
    };
    reader.readAsDataURL(audioBlob);
}

// ─── NOVA CONVERSA: FILTRO DE PRIVACIDADE EXCLUSIVO POR ARROBA (@) ───
document.getElementById('btn-new-chat').addEventListener('click', () => {
    document.getElementById('contacts-modal').classList.remove('hidden');
    renderContactsModalList('');
});

document.getElementById('btn-close-modal').addEventListener('click', () => document.getElementById('contacts-modal').classList.add('hidden'));

const searchUsernameInput = document.getElementById('search-by-username-input');
searchUsernameInput.addEventListener('input', () => {
    const term = searchUsernameInput.value.trim().toLowerCase();
    renderContactsModalList(term);
});

function renderContactsModalList(filterTerm) {
    const listContainer = document.getElementById('contacts-list-modal');
    listContainer.innerHTML = '';

    if (currentUser.uid === "offline_user") {
        listContainer.innerHTML = `<div class="empty-state">Indisponível offline.</div>`;
        return;
    }

    // REGRA DE PRIVACIDADE: Só busca se contiver o caractere "@" e tiver pelo menos 4 caracteres de comprimento (ex: "@art")
    if (!filterTerm.includes('@') || filterTerm.length < 4) {
        listContainer.innerHTML = `<div class="empty-state" style="font-size:12px; padding:20px 10px;">Digite pelo menos o arroba e 3 letras da pessoa<br>(Ex: <b>@art</b>) para localizá-la de forma privada.</div>`;
        return;
    }

    database.ref('users').once('value', snap => {
        let count = 0;
        snap.forEach(child => {
            const u = child.val();
            if (!u || u.uid === currentUser.uid) return;

            const uName = (u.username || '').toLowerCase();
            
            // Só exibe se o termo bater exatamente com o começo do @ digitado
            if (uName.includes(filterTerm)) {
                count++;
                const row = document.createElement('div');
                row.className = 'chat-item-row';
                row.innerHTML = `
                    <img src="${u.avatar}" alt="">
                    <div class="chat-item-info">
                        <h4>${u.nickname}</h4>
                        <p>${u.username}</p>
                    </div>
                `;
                row.addEventListener('click', () => {
                    document.getElementById('contacts-modal').classList.add('hidden');
                    startNewChatRoomWithUser(u);
                });
                listContainer.appendChild(row);
            }
        });

        if (count === 0) {
            listContainer.innerHTML = `<div class="empty-state">Nenhum usuário encontrado com o arroba informado.</div>`;
        }
    });
}

function startNewChatRoomWithUser(targetUser) {
    database.ref('chats').once('value', snap => {
        let existingChatId = null;
        snap.forEach(child => {
            const chat = child.val();
            if (chat.participants && chat.participants[currentUser.uid] && chat.participants[targetUser.uid]) {
                existingChatId = child.key;
            }
        });

        if (existingChatId) {
            openChatRoom(existingChatId, targetUser);
        } else {
            // Verifica se já existe solicitação pendente enviada por mim
            database.ref(`chatRequests/${targetUser.uid}/${currentUser.uid}`).once('value', reqSnap => {
                if (reqSnap.exists()) {
                    alert("Você já enviou uma solicitação para este usuário. Aguarde a resposta.");
                    return;
                }
                // Envia solicitação
                const myProfile = JSON.parse(localStorage.getItem(`profile_${currentUser.uid}`) || '{}');
                database.ref(`chatRequests/${targetUser.uid}/${currentUser.uid}`).set({
                    fromUid: currentUser.uid,
                    fromNickname: myProfile.nickname || currentUser.email,
                    fromUsername: myProfile.username || '',
                    fromAvatar: myProfile.avatar || '',
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    status: 'pending'
                }).then(() => {
                    triggerSystemPopup("Solicitação enviada", `Aguardando ${targetUser.nickname} aceitar.`, targetUser.avatar || '');
                });
            });
        }
    });
}

// ─── ACESSO AO PERFIL DO CONTATO DIRECT ──────────────────────────────────────
document.getElementById('btn-open-recipient-info').addEventListener('click', () => {
    if (!activeRecipientId) return;
    database.ref(`users/${activeRecipientId}`).once('value', snap => {
        const data = snap.val(); if (!data) return;
        document.getElementById('sheet-contact-nick').innerText = getDisplayName(data);
        document.getElementById('sheet-contact-user').innerText = data.username || '@user';
        document.getElementById('sheet-contact-bio').innerText  = data.bio || 'Sem bio disponível.';
        document.getElementById('sheet-contact-wlstwrus').innerText = data.wlstwrus || 'Disponível';
        document.getElementById('sheet-contact-avatar').src = data.avatar;
        document.getElementById('contact-info-sheet').classList.remove('hidden');
    });
});
document.getElementById('btn-close-info-sheet').addEventListener('click', () => document.getElementById('contact-info-sheet').classList.add('hidden'));

// Nicknames Customizados Locais
document.getElementById('btn-set-nickname').addEventListener('click', () => {
    document.getElementById('nickname-input').value = customNicknames[activeRecipientId] || '';
    document.getElementById('nickname-modal').classList.remove('hidden');
});
document.getElementById('btn-cancel-nickname').addEventListener('click', () => document.getElementById('nickname-modal').classList.add('hidden'));
document.getElementById('btn-save-nickname').addEventListener('click', () => {
    const val = document.getElementById('nickname-input').value.trim();
    if(val) customNicknames[activeRecipientId] = val;
    else delete customNicknames[activeRecipientId];
    localStorage.setItem('customNicknames', JSON.stringify(customNicknames));
    document.getElementById('nickname-modal').classList.add('hidden');
    document.getElementById('contact-info-sheet').classList.add('hidden');
    loadChatList();
    if(activeChatId) database.ref(`users/${activeRecipientId}`).once('value', s=>openChatRoom(activeChatId, s.val()));
});

// ─── SEÇÃO DE CONFIGURAÇÕES NATIVAS PREMIUM ──────────────────────────────────
document.getElementById('btn-main-settings').addEventListener('click', () => {
    const cachedProfile = localStorage.getItem(`profile_${currentUser.uid}`);
    if(cachedProfile) {
        const p = JSON.parse(cachedProfile);
        document.getElementById('settings-nickname').value = p.nickname || '';
        document.getElementById('settings-username').value = p.username || '';
        document.getElementById('settings-bio').value      = p.bio || '';
        document.getElementById('settings-avatar-preview').src = p.avatar || "https://via.placeholder.com/150";
    }
    document.getElementById('settings-screen').classList.remove('hidden');
});

document.getElementById('btn-back-settings').addEventListener('click', () => document.getElementById('settings-screen').classList.add('hidden'));

// Abas de navegação interna das configurações
document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.add('hidden'));
        tab.classList.add('active');
        document.getElementById(`stab-${tab.dataset.tab}`).classList.remove('hidden');
    });
});

document.getElementById('btn-save-account').addEventListener('click', () => {
    const nick = document.getElementById('settings-nickname').value.trim();
    const user = document.getElementById('settings-username').value.trim();
    const bio  = document.getElementById('settings-bio').value.trim();
    if(!nick || !user) return alert("Nickname e @ não podem ficar vazios.");

    const payload = {
        uid: currentUser.uid, nickname: nick, username: user.startsWith('@') ? user : '@'+user, bio: bio,
        avatar: base64AvatarString || document.getElementById('settings-avatar-preview').src,
        status: "online", lastSeen: firebase.database.ServerValue.TIMESTAMP
    };

    localStorage.setItem(`profile_${currentUser.uid}`, JSON.stringify(payload));
    updateHeaderUserInfo();

    if(currentUser.uid !== "offline_user") {
        database.ref(`users/${currentUser.uid}`).update(payload).then(() => {
            alert("Perfil salvo com sucesso!");
        });
    } else {
        alert("Perfil salvo localmente (Modo Offline)!");
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    if(confirm("Deseja realmente desconectar da sua conta?")) {
        localStorage.removeItem('localLoggedUser');
        auth.signOut().then(() => window.location.reload());
    }
});

// Navegação de abas nativa principal
document.getElementById('tab-chats').addEventListener('click', () => switchMainTab('chats'));
document.getElementById('tab-status').addEventListener('click', () => switchMainTab('status'));
document.getElementById('tab-calls').addEventListener('click', () => switchMainTab('calls'));

function switchMainTab(target) {
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    document.getElementById(`tab-${target}`).classList.add('active');
    document.getElementById(`content-${target}`).classList.remove('hidden');
}

// Fechamento de telas mobile nativas
document.getElementById('btn-back-to-list').addEventListener('click', () => {
    document.getElementById('chat-room-screen').classList.add('hidden');
    activeChatId = null;
    document.querySelectorAll('.chat-item-row').forEach(el => el.classList.remove('active-desktop-chat'));
    const emptyPanel = document.getElementById('empty-chat-panel');
    if (emptyPanel) emptyPanel.classList.remove('hidden');
});

// ─── SISTEMA DE SOLICITAÇÕES DE CONVERSA ────────────────────────────────────
function listenToChatRequests() {
    if (!currentUser || currentUser.uid === "offline_user") return;
    database.ref(`chatRequests/${currentUser.uid}`).on('value', snap => {
        const badge   = document.getElementById('requests-badge');
        const banner  = document.getElementById('requests-banner');
        const bannerText = document.getElementById('requests-banner-text');
        if (!snap.exists()) {
            badge  && badge.classList.add('hidden');
            banner && banner.classList.add('hidden');
            return;
        }
        let count = 0;
        snap.forEach(child => { if (child.val().status === 'pending') count++; });
        if (count > 0) {
            badge.innerText = count;
            badge.classList.remove('hidden');
            bannerText.innerText = count === 1 ? '1 solicitação de conversa pendente' : `${count} solicitações de conversa pendentes`;
            banner.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
            banner.classList.add('hidden');
        }
    });
}

function renderRequestsList() {
    if (!currentUser || currentUser.uid === "offline_user") return;
    const list = document.getElementById('requests-list');
    list.innerHTML = '<div class="empty-state" style="padding:20px;">Carregando...</div>';

    database.ref(`chatRequests/${currentUser.uid}`).once('value', snap => {
        list.innerHTML = '';
        if (!snap.exists()) {
            list.innerHTML = '<div class="empty-state" style="padding:20px;">Nenhuma solicitação pendente.</div>';
            return;
        }
        let hasAny = false;
        snap.forEach(child => {
            const req = child.val();
            if (req.status !== 'pending') return;
            hasAny = true;
            const row = document.createElement('div');
            row.className = 'request-row';
            row.innerHTML = `
                <img src="${req.fromAvatar || 'https://via.placeholder.com/150'}" alt="">
                <div class="request-row-info">
                    <h4>${req.fromNickname || 'Usuário'}</h4>
                    <p>${req.fromUsername || ''}</p>
                </div>
                <div class="request-row-actions">
                    <button class="btn-req-accept">Aceitar</button>
                    <button class="btn-req-decline">Recusar</button>
                </div>
            `;
            row.querySelector('.btn-req-accept').addEventListener('click', () => acceptChatRequest(req, child.key, row));
            row.querySelector('.btn-req-decline').addEventListener('click', () => declineChatRequest(child.key, row));
            list.appendChild(row);
        });
        if (!hasAny) {
            list.innerHTML = '<div class="empty-state" style="padding:20px;">Nenhuma solicitação pendente.</div>';
        }
    });
}

function acceptChatRequest(req, fromUid, rowEl) {
    const newChatRef = database.ref('chats').push();
    const newChatId  = newChatRef.key;
    const chatPayload = {
        id: newChatId,
        lastMessageTimestamp: firebase.database.ServerValue.TIMESTAMP,
        participants: { [currentUser.uid]: true, [fromUid]: true }
    };
    newChatRef.set(chatPayload).then(() => {
        database.ref(`chatRequests/${currentUser.uid}/${fromUid}`).update({ status: 'accepted' });
        rowEl.remove();
        const list = document.getElementById('requests-list');
        if (!list.querySelector('.request-row')) {
            list.innerHTML = '<div class="empty-state" style="padding:20px;">Nenhuma solicitação pendente.</div>';
        }
        document.getElementById('requests-modal').classList.add('hidden');
        // Abre o chat com o usuário aceito
        const recipientObj = {
            uid: fromUid,
            nickname: req.fromNickname || 'Usuário',
            username: req.fromUsername || '',
            avatar: req.fromAvatar || 'https://via.placeholder.com/150'
        };
        openChatRoom(newChatId, recipientObj);
    });
}

function declineChatRequest(fromUid, rowEl) {
    database.ref(`chatRequests/${currentUser.uid}/${fromUid}`).update({ status: 'declined' });
    rowEl.remove();
    const list = document.getElementById('requests-list');
    if (!list.querySelector('.request-row')) {
        list.innerHTML = '<div class="empty-state" style="padding:20px;">Nenhuma solicitação pendente.</div>';
    }
}

document.getElementById('btn-close-requests-modal').addEventListener('click', () => {
    document.getElementById('requests-modal').classList.add('hidden');
});
document.getElementById('requests-modal').addEventListener('click', (e) => {
    if (e.target.id === 'requests-modal') document.getElementById('requests-modal').classList.add('hidden');
});
// Abre a lista ao clicar no banner (já tem onclick inline, mas também via JS para o modal)
document.getElementById('requests-modal').addEventListener('show', renderRequestsList);
// Abrir modal via banner renderiza a lista
document.getElementById('requests-banner').addEventListener('click', () => {
    renderRequestsList();
    document.getElementById('requests-modal').classList.remove('hidden');
});
