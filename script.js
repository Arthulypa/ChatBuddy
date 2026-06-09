// CONFIGURAÇÃO DO BANCO DO FIREBASE CHATBUDDY
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
let base64OwnSettingsAvatar = "";
let selectedMessageText = "";
let selectedMessageId = "";
let silencedUsers = {};

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

// Configuração loaders de fotos
bindImageLoader('initial-avatar-file', (res) => {
    base64AvatarString = res;
    const imgEl = document.getElementById('initial-avatar-preview');
    imgEl.src = res;
    imgEl.classList.remove('hidden');
    document.getElementById('initial-avatar-placeholder').classList.add('hidden');
});

bindImageLoader('settings-avatar-file', (res) => {
    base64OwnSettingsAvatar = res;
    document.getElementById('settings-avatar-preview').src = res;
});

// AUTENTICAÇÃO
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email-login').value.trim();
    const pass = document.getElementById('password-login').value;
    if(!email || !pass) return alert("Preencha todos os campos!");
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert("Erro: " + err.message));
});

document.getElementById('btn-send-code').addEventListener('click', () => {
    const email = document.getElementById('email-reg').value.trim();
    const pass = document.getElementById('password-reg').value;
    if(!email || !pass) return alert("Insira credenciais válidas.");
    document.getElementById('reg-step-1').classList.add('hidden');
    document.getElementById('reg-step-2').classList.remove('hidden');
});

document.getElementById('btn-verify-and-register').addEventListener('click', () => {
    const code = document.getElementById('verification-code-input').value.trim();
    if(code !== "123456") return alert("Código ChatBuddy inválido!");
    const email = document.getElementById('email-reg').value.trim();
    const pass = document.getElementById('password-reg').value;
    auth.createUserWithEmailAndPassword(email, pass)
        .then(() => changeView('profile'))
        .catch(err => alert("Erro: " + err.message));
});

document.getElementById('btn-google-login').addEventListener('click', () => {
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
                        wlstwrus: "Disponível no ChatBuddy 🚀",
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

document.getElementById('btn-save-profile').addEventListener('click', () => {
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

// PRESENÇA REAL-TIME
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
        });
    } else {
        changeView('login');
    }
});

// CARREGA SEUS PRÓPRIOS DADOS NA TELA DE CONFIGURAÇÃO (ABAS)
function loadOwnProfileSettingsData(data) {
    document.getElementById('settings-avatar-preview').src = data.avatar || "https://via.placeholder.com/150";
    document.getElementById('settings-nickname').value = data.nickname || "";
    document.getElementById('settings-username').value = (data.username || "").replace('@','');
    document.getElementById('settings-bio').value = data.bio || "";
    base64OwnSettingsAvatar = data.avatar || "";
}

document.getElementById('btn-update-own-profile').addEventListener('click', () => {
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

// INTERFACES DAS ABAS DE CONFIGURAÇÃO
document.querySelectorAll('.settings-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const target = btn.getAttribute('data-target');
        document.querySelectorAll('.settings-pane-content').forEach(pane => pane.classList.add('hidden'));
        document.getElementById(target).classList.remove('hidden');
    });
});

// SISTEMA DE ARRASTAR PARA RESPONDER + CLIQUE LONGO
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

// INTERFACE DA SALA DE CONVERSA
function openChatRoom(chatId, recipientData) {
    activeChatId = chatId;
    activeRecipientId = recipientData.uid;
    
    document.getElementById('active-chat-name').innerText = recipientData.nickname;
    document.getElementById('active-chat-avatar').src = recipientData.avatar;
    document.getElementById('chat-room-screen').classList.remove('hidden');

    database.ref(`users/${recipientData.uid}`).on('value', rSnap => {
        const rUser = rSnap.val();
        if(!rUser) return;
        document.getElementById('active-chat-status').innerText = rUser.status === 'online' ? "online" : "offline";
    });
    
    database.ref(`chats/${chatId}/messages`).off();
    database.ref(`chats/${chatId}/messages`).on('value', snap => {
        const box = document.getElementById('messages-container');
        box.innerHTML = '';
        
        snap.forEach(child => {
            const data = child.val();
            const card = document.createElement('div');
            card.className = `message ${data.senderId === currentUser.uid ? 'sent' : 'received'}`;
            
            let content = data.image ? `<img src="${data.image}" class="message-img">` : '';
            content += data.text ? `<p>${data.text}</p>` : '';
            let ticks = data.senderId === currentUser.uid ? `<div class="msg-meta-row">${buildTicks(data.status)}</div>` : '';
            card.innerHTML = content + ticks;
            
            // Elemento indicador do gesto iOS
            const indicator = document.createElement('div');
            indicator.className = 'reply-drag-indicator';
            indicator.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M10 21L3 12l7-9M3 12h18"/></svg>';
            card.appendChild(indicator);

            // Mecanismo Drag to Reply
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
                    inputField.value = `Replying to: "${data.text || 'Mídia'}" ➔ `;
                    inputField.focus();
                }
                currentX = 0;
            });
            
            applyLongPress(card, () => {
                selectedMessageText = data.text || "";
                selectedMessageId = data.id;
                const clone = card.cloneNode(true);
                if(clone.querySelector('.reply-drag-indicator')) clone.querySelector('.reply-drag-indicator').remove();
                const wrapper = document.getElementById('focused-message-wrapper');
                wrapper.innerHTML = '';
                wrapper.appendChild(clone);
                document.getElementById('blur-overlay').classList.remove('hidden');
            });
            box.appendChild(card);
        });
        box.scrollTop = box.scrollHeight;
    });
}

// POPUP DE INFORMAÇÕES DO CONTATO (DETALHES E MÍDIAS COLETADAS)
document.getElementById('btn-open-recipient-info').addEventListener('click', () => {
    database.ref('users/' + activeRecipientId).once('value').then(s => {
        const u = s.val();
        document.getElementById('sheet-contact-nick').innerText = u.nickname;
        document.getElementById('sheet-contact-user').innerText = u.username;
        document.getElementById('sheet-contact-avatar').src = u.avatar;
        document.getElementById('sheet-contact-bio').innerText = u.bio || "Sem biografia definida.";
        
        // Ativa painel default
        switchPopupPanel('details');
        document.getElementById('contact-info-sheet').classList.remove('hidden');
    });
});

// Gerenciador de sub-abas do Popup de contato
function switchPopupPanel(type) {
    if(type === 'details') {
        document.getElementById('popup-tab-details').classList.add('active');
        document.getElementById('popup-tab-gallery').classList.remove('active');
        document.getElementById('popup-panel-details').classList.remove('hidden');
        document.getElementById('popup-panel-gallery').classList.add('hidden');
    } else {
        document.getElementById('popup-tab-details').classList.remove('active');
        document.getElementById('popup-tab-gallery').classList.add('active');
        document.getElementById('popup-panel-details').classList.add('hidden');
        document.getElementById('popup-panel-gallery').classList.remove('hidden');
        
        // Coleta e injeta mídias trocadas dinamicamente
        const grid = document.getElementById('popup-media-grid');
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

document.getElementById('popup-tab-details').addEventListener('click', () => switchPopupPanel('details'));
document.getElementById('popup-tab-gallery').addEventListener('click', () => switchPopupPanel('gallery'));

// Botões de Ação do Contato
document.getElementById('btn-customize-nickname').addEventListener('click', () => {
    const newName = prompt("Defina um apelido local para este contato:");
    if(newName && newName.trim() !== "") {
        document.getElementById('sheet-contact-nick').innerText = newName;
        document.getElementById('active-chat-name').innerText = newName;
    }
});

document.getElementById('btn-sheet-block').addEventListener('click', () => {
    alert("Usuário bloqueado com sucesso nas diretrizes do dispositivo!");
    document.getElementById('contact-info-sheet').classList.add('hidden');
    document.getElementById('chat-room-screen').classList.add('hidden');
});

document.getElementById('btn-sheet-report').addEventListener('click', () => {
    alert("Perfil denunciado à central de moderação do ChatBuddy!");
    document.getElementById('contact-info-sheet').classList.add('hidden');
});

// ENVIO DE MENSAGENS E ARQUIVOS
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
    document.getElementById('message-input').value = '';
}

document.getElementById('message-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') pushMessage(e.target.value); });
document.getElementById('btn-attach').addEventListener('click', () => document.getElementById('media-file-input').click());
document.getElementById('media-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => pushMessage("", ev.target.result);
    reader.readAsDataURL(file);
});

// FUNÇÕES DE MENU DE CONTEXTO DAS BALÕES
document.getElementById('ctx-info-msg').addEventListener('click', () => {
    database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).once('value').then(snap => {
        const data = snap.val();
        if(!data) return;
        document.getElementById('info-sent-time').innerText = new Date(data.timestamp).toLocaleTimeString();
        document.getElementById('info-read-time').innerText = data.status === 'read' ? new Date(data.timestamp + 1000).toLocaleTimeString() : "Pendente";
        document.getElementById('blur-overlay').classList.add('hidden');
        document.getElementById('msg-info-modal').classList.remove('hidden');
    });
});
document.getElementById('btn-close-msg-info').addEventListener('click', () => document.getElementById('msg-info-modal').classList.add('hidden'));
document.getElementById('ctx-edit-msg').addEventListener('click', () => {
    const n = prompt("Editar:", selectedMessageText);
    if(n) database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).update({ text: n + " (editada)" });
    document.getElementById('blur-overlay').classList.add('hidden');
});
document.getElementById('ctx-delete-single').addEventListener('click', () => {
    if(confirm("Deletar mensagem?")) database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).remove();
    document.getElementById('blur-overlay').classList.add('hidden');
});
document.getElementById('ctx-copy-direct').addEventListener('click', () => {
    navigator.clipboard.writeText(selectedMessageText);
    document.getElementById('blur-overlay').classList.add('hidden');
});

// CARREGADOR DE LISTA PRINCIPAL
function loadChatList() {
    database.ref('users').on('value', snap => {
        const parent = document.getElementById('chats-list');
        parent.innerHTML = '';
        snap.forEach(child => {
            const user = child.val();
            if(user.uid === currentUser.uid) return;
            const row = document.createElement('div');
            row.className = "chat-item-row";
            row.innerHTML = `<img src="${user.avatar}">
                             <div class="chat-item-info">
                                <div class="chat-item-header"><h4>${user.nickname}</h4></div>
                                <p>${user.username}</p>
                             </div>`;
            row.addEventListener('click', () => {
                const combinedId = currentUser.uid < user.uid ?
