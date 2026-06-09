// CONFIGURAÇÃO DO BANCO DO FIREBASE CHATBUDDY
const firebaseConfig = {
  apiKey: "AIzaSyDwW6LoRrGTJqXdYkbhv-0srz7VKKfykh4",
  authDomain: "chatbuddy-96a61.firebaseapp.com",
  databaseURL: "https://chatbuddy-96a61-default-rtdb.firebaseio.com",
  projectId: "chatbuddy-96a61",
  storageBucket: "chatbuddy-96a61.firebasestorage.app",
};

// Inicializa o Firebase apenas se não tiver sido inicializado ainda
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const database = firebase.database();

let currentUser = null;
let activeChatId = null;
let activeRecipientId = null;
let base64AvatarString = "";
let base64OwnSettingsAvatar = "";
let selectedMessageText = "";
let selectedMessageId = "";

const viewPages = {
    login: document.getElementById('login-page'),
    register: document.getElementById('register-page'),
    profile: document.getElementById('profile-page'),
    chat: document.getElementById('chat-page')
};

// Altera as telas de forma segura
function changeView(target) {
    Object.keys(viewPages).forEach(k => {
        if (viewPages[k]) viewPages[k].classList.add('hidden');
    });
    if (viewPages[target]) {
        viewPages[target].classList.remove('hidden');
    }
}

// Função utilitária para registrar eventos prevenindo quebras silenciosas no DOM
function safeAddEvent(id, event, callback) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(event, callback);
    }
}

function bindImageLoader(inputId, callback) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => callback(ev.target.result);
        reader.readAsDataURL(file);
    });
}

// Configuração loaders de fotos de perfil de forma isolada
bindImageLoader('initial-avatar-file', (res) => {
    base64AvatarString = res;
    const imgEl = document.getElementById('initial-avatar-preview');
    if (imgEl) {
        imgEl.src = res;
        imgEl.classList.remove('hidden');
    }
    const placeholder = document.getElementById('initial-avatar-placeholder');
    if (placeholder) placeholder.classList.add('hidden');
});

bindImageLoader('settings-avatar-file', (res) => {
    base64OwnSettingsAvatar = res;
    const imgSet = document.getElementById('settings-avatar-preview');
    if (imgSet) imgSet.src = res;
});

// ESCUTA DE AUTENTICAÇÃO ATIVA (PERSISTÊNCIA DE LOGIN)
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        database.ref('users/' + user.uid).once('value').then(snap => {
            if (snap.exists() && snap.val().username) {
                changeView('chat');
                setupPresenceSystem(user.uid);
                loadChatList();
                loadOwnProfileSettingsData(snap.val());
            } else {
                changeView('profile');
            }
        }).catch(err => {
            console.error("Erro ao buscar dados do nó de usuário:", err);
            changeView('profile');
        });
    } else {
        changeView('login');
    }
});

// SISTEMA DE PRESENÇA EM TEMPO REAL
function setupPresenceSystem(userId) {
    const userStatusRef = database.ref(`users/${userId}`);
    const connectedRef = database.ref(".info/connected");
    connectedRef.on("value", (snap) => {
        if (snap.val() === false) return;
        userStatusRef.onDisconnect().update({ status: "offline", lastSeen: firebase.database.ServerValue.TIMESTAMP })
        .then(() => {
            userStatusRef.update({ status: "online", lastSeen: firebase.database.ServerValue.TIMESTAMP });
        });
    });
}

// CARREGA SEUS PRÓPRIOS DADOS NA TELA DE CONFIGURAÇÃO (ABAS)
function loadOwnProfileSettingsData(data) {
    const preview = document.getElementById('settings-avatar-preview');
    const nick = document.getElementById('settings-nickname');
    const userAt = document.getElementById('settings-username');
    const bio = document.getElementById('settings-bio');

    if (preview) preview.src = data.avatar || "https://via.placeholder.com/150";
    if (nick) nick.value = data.nickname || "";
    if (userAt) userAt.value = (data.username || "").replace('@','');
    if (bio) bio.value = data.bio || "";
    base64OwnSettingsAvatar = data.avatar || "";
}

// MAPEAMENTO SEGURO DE EVENTOS DE BOTÕES DE CLIQUE
safeAddEvent('btn-login', 'click', () => {
    const email = document.getElementById('email-login').value.trim();
    const pass = document.getElementById('password-login').value;
    if(!email || !pass) return alert("Preencha todos os campos!");
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert("Erro: " + err.message));
});

safeAddEvent('btn-send-code', 'click', () => {
    const email = document.getElementById('email-reg').value.trim();
    const pass = document.getElementById('password-reg').value;
    if(!email || !pass) return alert("Insira credenciais válidas.");
    
    const step1 = document.getElementById('reg-step-1');
    const step2 = document.getElementById('reg-step-2');
    if(step1) step1.classList.add('hidden');
    if(step2) step2.classList.remove('hidden');
});

safeAddEvent('btn-verify-and-register', 'click', () => {
    const code = document.getElementById('verification-code-input').value.trim();
    if(code !== "123456") return alert("Código ChatBuddy inválido!");
    const email = document.getElementById('email-reg').value.trim();
    const pass = document.getElementById('password-reg').value;
    auth.createUserWithEmailAndPassword(email, pass)
        .then(() => changeView('profile'))
        .catch(err => alert("Erro: " + err.message));
});

safeAddEvent('btn-google-login', 'click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            const user = result.user;
            database.ref('users/' + user.uid).once('value').then(snap => {
                if (!snap.exists()) {
                    database.ref('users/' + user.uid).set({
                        uid: user.uid,
                        nickname: user.displayName || "Usuário Google",
                        username: '@' + (user.email.split('@')[0]),
                        bio: "Disponível no ChatBuddy",
                        avatar: user.photoURL || "https://via.placeholder.com/150",
                        status: "online",
                        lastSeen: firebase.database.ServerValue.TIMESTAMP
                    }).then(() => changeView('chat'));
                } else {
                    changeView('chat');
                }
            });
        })
        .catch(err => alert("Erro no Login Google: " + err.message));
});

safeAddEvent('btn-save-profile', 'click', () => {
    const nick = document.getElementById('display-name').value.trim();
    const userAt = document.getElementById('username').value.trim().replace('@','');
    const bio = document.getElementById('user-bio').value.trim() || "Disponível no ChatBuddy";
    if(!nick || !userAt) return alert("Campos obrigatórios vazios!");

    database.ref('users/' + currentUser.uid).set({
        uid: currentUser.uid,
        nickname: nick,
        username: '@' + userAt,
        bio: bio,
        avatar: base64AvatarString || "https://via.placeholder.com/150",
        status: "online",
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    }).then(() => changeView('chat'));
});

safeAddEvent('btn-update-own-profile', 'click', () => {
    const newNick = document.getElementById('settings-nickname').value.trim();
    const newUsr = document.getElementById('settings-username').value.trim().replace('@','');
    const newBio = document.getElementById('settings-bio').value.trim();
    
    if(!newNick || !newUsr) return alert("Nome e Nickname não podem ficar vazios!");
    
    database.ref(`users/${currentUser.uid}`).update({
        nickname: newNick,
        username: '@' + newUsr,
        bio: newBio,
        avatar: base64OwnSettingsAvatar
    }).then(() => alert("Perfil atualizado com sucesso!"));
});

// INTERFACES DAS ABAS DE CONFIGURAÇÃO INTERNA
document.querySelectorAll('.settings-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const target = btn.getAttribute('data-target');
        document.querySelectorAll('.settings-pane-content').forEach(pane => pane.classList.add('hidden'));
        const paneTarget = document.getElementById(target);
        if (paneTarget) paneTarget.classList.remove('hidden');
    });
});

// SISTEMA DE EVENTOS LONG PRESS E BALÕES
function applyLongPress(element, actionCallback) {
    let timer;
    const start = () => timer = setTimeout(() => actionCallback(), 600);
    const stop = () => clearTimeout(timer);
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchend', stop, { passive: true });
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', stop);
}

function buildTicks(status) {
    if(!status) return '';
    switch(status) {
        case 'sending': return `<div class="status-dot-wrapper"><span class="status-dot dot-sending"></span></div>`;
        case 'sent': return `<div class="status-dot-wrapper"><span class="status-dot dot-sent-unreceived"></span></div>`;
        case 'delivered': return `<div class="status-dot-wrapper"><span class="status-dot dot-delivered"></span><span class="status-dot dot-delivered"></span></div>`;
        case 'read': return `<div class="status-dot-wrapper"><span class="status-dot dot-read"></span><span class="status-dot dot-read"></span></div>`;
    }
    return '';
}

// ABERTURA DE SALA DE CHAT E MONITORAÇÃO REATIVA
function openChatRoom(chatId, recipientData) {
    activeChatId = chatId;
    activeRecipientId = recipientData.uid;
    
    const nameEl = document.getElementById('active-chat-name');
    const avatarEl = document.getElementById('active-chat-avatar');
    const roomEl = document.getElementById('chat-room-screen');

    if(nameEl) nameEl.innerText = recipientData.nickname;
    if(avatarEl) avatarEl.src = recipientData.avatar;
    if(roomEl) roomEl.classList.remove('hidden');

    database.ref(`users/${recipientData.uid}`).on('value', rSnap => {
        const rUser = rSnap.val();
        const statusEl = document.getElementById('active-chat-status');
        if(!rUser || !statusEl) return;
        statusEl.innerText = rUser.status === 'online' ? "online" : "offline";
    });
    
    database.ref(`chats/${chatId}/messages`).off();
    database.ref(`chats/${chatId}/messages`).on('value', snap => {
        const box = document.getElementById('messages-container');
        if(!box) return;
        box.innerHTML = '';
        
        snap.forEach(child => {
            const data = child.val();
            const card = document.createElement('div');
            card.className = `message ${data.senderId === currentUser.uid ? 'sent' : 'received'}`;
            
            let content = data.image ? `<img src="${data.image}" class="message-img">` : '';
            content += data.text ? `<p>${data.text}</p>` : '';
            let ticks = data.senderId === currentUser.uid ? `<div class="msg-meta-row">${buildTicks(data.status)}</div>` : '';
            card.innerHTML = content + ticks;
            
            const indicator = document.createElement('div');
            indicator.className = 'reply-drag-indicator';
            indicator.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M10 21L3 12l7-9M3 12h18"/></svg>';
            card.appendChild(indicator);

            let startX = 0, currentX = 0, isDragging = false;
            card.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; isDragging = true; }, { passive: true });
            card.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                currentX = e.touches[0].clientX - startX;
                if (currentX < 0) {
                    let dragOffset = Math.max(currentX, -60);
                    card.style.transform = `translateX(${dragOffset}px)`;
                    card.classList.add('dragged');
                }
            }, { passive: true });

            card.addEventListener('touchend', () => {
                isDragging = false;
                card.style.transform = '';
                card.classList.remove('dragged');
                if (currentX < -45) {
                    const inputField = document.getElementById('message-input');
                    if (inputField) {
                        inputField.value = `Replying to: "${data.text || 'Mídia'}" ➔ `;
                        inputField.focus();
                    }
                }
                currentX = 0;
            });
            
            applyLongPress(card, () => {
                selectedMessageText = data.text || "";
                selectedMessageId = data.id;
                const clone = card.cloneNode(true);
                if(clone.querySelector('.reply-drag-indicator')) clone.querySelector('.reply-drag-indicator').remove();
                const wrapper = document.getElementById('focused-message-wrapper');
                if (wrapper) {
                    wrapper.innerHTML = '';
                    wrapper.appendChild(clone);
                }
                const blurEl = document.getElementById('blur-overlay');
                if(blurEl) blurEl.classList.remove('hidden');
            });
            box.appendChild(card);
        });
        box.scrollTop = box.scrollHeight;
    });
}

// POPUP DE INFORMAÇÕES DO CONTATO (DETALHES E GALERIA DE MÍDIAS)
safeAddEvent('btn-open-recipient-info', 'click', () => {
    if (!activeRecipientId) return;
    database.ref('users/' + activeRecipientId).once('value').then(s => {
        const u = s.val();
        if(!u) return;
        const nick = document.getElementById('sheet-contact-nick');
        const user = document.getElementById('sheet-contact-user');
        const avatar = document.getElementById('sheet-contact-avatar');
        const bio = document.getElementById('sheet-contact-bio');

        if(nick) nick.innerText = u.nickname;
        if(user) user.innerText = u.username;
        if(avatar) avatar.src = u.avatar;
        if(bio) bio.innerText = u.bio || "Sem biografia definida.";
        
        switchPopupPanel('details');
        const sheet = document.getElementById('contact-info-sheet');
        if(sheet) sheet.classList.remove('hidden');
    });
});

function switchPopupPanel(type) {
    const tabDetails = document.getElementById('popup-tab-details');
    const tabGallery = document.getElementById('popup-tab-gallery');
    const panelDetails = document.getElementById('popup-panel-details');
    const panelGallery = document.getElementById('popup-panel-gallery');

    if(type === 'details') {
        if(tabDetails) tabDetails.classList.add('active');
        if(tabGallery) tabGallery.classList.remove('active');
        if(panelDetails) panelDetails.classList.remove('hidden');
        if(panelGallery) panelGallery.classList.add('hidden');
    } else {
        if(tabDetails) tabDetails.classList.remove('active');
        if(tabGallery) tabGallery.classList.add('active');
        if(panelDetails) panelDetails.classList.add('hidden');
        if(panelGallery) panelGallery.classList.remove('hidden');
        
        const grid = document.getElementById('popup-media-grid');
        if(!grid) return;
        grid.innerHTML = '';
        
        database.ref(`chats/${activeChatId}/messages`).once('value', snap => {
            let foundMedia = false;
            snap.forEach(c => {
                const msg = c.val();
                if(msg.image) {
                    foundMedia = true;
                    const img = document.createElement('img');
                    img.src = msg.image;
                    img.className = 'popup-media-item';
                    grid.appendChild(img);
                }
            });
            if(!foundMedia) grid.innerHTML = '<p style="color:var(--text-muted); font-size:13px; grid-column:span 3; text-align:center; padding:20px 0;">Nenhuma mídia compartilhada.</p>';
        });
    }
}

safeAddEvent('popup-tab-details', 'click', () => switchPopupPanel('details'));
safeAddEvent('popup-tab-gallery', 'click', () => switchPopupPanel('gallery'));

safeAddEvent('btn-customize-nickname', 'click', () => {
    const newName = prompt("Defina um apelido local para este contato:");
    if(newName && newName.trim() !== "") {
        const nick = document.getElementById('sheet-contact-nick');
        const actName = document.getElementById('active-chat-name');
        if(nick) nick.innerText = newName;
        if(actName) actName.innerText = newName;
    }
});

safeAddEvent('btn-sheet-block', 'click', () => {
    alert("Usuário bloqueado com sucesso!");
    const sheet = document.getElementById('contact-info-sheet');
    const room = document.getElementById('chat-room-screen');
    if(sheet) sheet.classList.add('hidden');
    if(room) room.classList.add('hidden');
});

safeAddEvent('btn-sheet-report', 'click', () => {
    alert("Perfil denunciado à central de moderação!");
    const sheet = document.getElementById('contact-info-sheet');
    if(sheet) sheet.classList.add('hidden');
});

// SISTEMA DE ENVIO DE TEXTOS E IMAGENS
function pushMessage(text, imgBase64 = null) {
    if(!text.trim() && !imgBase64) return;
    const ref = database.ref(`chats/${activeChatId}/messages`).push();
    const payload = {
        id: ref.key,
        senderId: currentUser.uid,
        text: text,
        status: 'sending',
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    if(imgBase64) payload.image = imgBase64;
    ref.set(payload).then(() => {
        setTimeout(() => ref.update({ status: 'sent' }), 200);
        setTimeout(() => ref.update({ status: 'delivered' }), 500);
        setTimeout(() => ref.update({ status: 'read' }), 1000);
    });
    const inputField = document.getElementById('message-input');
    if(inputField) inputField.value = '';
}

const msgInput = document.getElementById('message-input');
if(msgInput) {
    msgInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') pushMessage(e.target.value); });
}

safeAddEvent('btn-attach', 'click', () => {
    const mediaInput = document.getElementById('media-file-input');
    if(mediaInput) mediaInput.click();
});

const mediaFileInput = document.getElementById('media-file-input');
if(mediaFileInput) {
    mediaFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => pushMessage("", ev.target.result);
        reader.readAsDataURL(file);
    });
}

// MENU DE CONTEXTO DAS MENSAGENS (REATIVO)
safeAddEvent('ctx-info-msg', 'click', () => {
    database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).once('value').then(snap => {
        const data = snap.val();
        if(!data) return;
        const sentTime = document.getElementById('info-sent-time');
        const readTime = document.getElementById('info-read-time');
        const blurEl = document.getElementById('blur-overlay');
        const infoMod = document.getElementById('msg-info-modal');

        if(sentTime) sentTime.innerText = new Date(data.timestamp).toLocaleTimeString();
        if(readTime) readTime.innerText = data.status === 'read' ? new Date(data.timestamp + 1000).toLocaleTimeString() : "Pendente";
        if(blurEl) blurEl.classList.add('hidden');
        if(infoMod) infoMod.classList.remove('hidden');
    });
