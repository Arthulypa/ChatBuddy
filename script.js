// CONFIGURAÇÃO DO BANCO DO FIREBASE CHATBUDDY
const firebaseConfig = {
  apiKey: "AIzaSyDwW6LoRrGTJqXdYkbhv-0srz7VKKfykh4",
  authDomain: "chatbuddy-96a61.firebaseapp.com",
  databaseURL: "https://chatbuddy-96a61-default-rtdb.firebaseio.com",
  projectId: "chatbuddy-96a61",
  storageBucket: "chatbuddy-96a61.firebasestorage.app",
};

// Inicializa o Firebase apenas se não tiver sido carregado ainda
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

// Altera as telas removendo e inserindo a classe hidden com segurança
function changeView(target) {
    Object.keys(viewPages).forEach(k => {
        if (viewPages[k]) viewPages[k].classList.add('hidden');
    });
    if (viewPages[target]) {
        viewPages[target].classList.remove('hidden');
    }
}

// Função utilitária obrigatória para blindar eventos de elementos ausentes no DOM
function safeAddEvent(id, event, callback) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(event, callback);
    }
}

// ESCUTA DE AUTENTICAÇÃO ATIVA (MANTER LOGADO)
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
            console.error("Erro no nó de usuário:", err);
            changeView('profile');
        });
    } else {
        changeView('login');
    }
});

// SISTEMA DE PRESENÇA
function setupPresenceSystem(userId) {
    const userStatusRef = database.ref(`users/${userId}`);
    database.ref(".info/connected").on("value", (snap) => {
        if (snap.val() === false) return;
        userStatusRef.onDisconnect().update({ status: "offline", lastSeen: firebase.database.ServerValue.TIMESTAMP })
        .then(() => {
            userStatusRef.update({ status: "online", lastSeen: firebase.database.ServerValue.TIMESTAMP });
        });
    });
}

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
    
    document.getElementById('reg-step-1').classList.add('hidden');
    document.getElementById('reg-step-2').classList.remove('hidden');
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
    auth.signInWithPopup(provider).then((result) => {
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
    }).catch(err => alert("Erro no Login Google: " + err.message));
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

// ABERTURA DE SALA DE CHAT E MONITORAÇÃO REATIVA
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
        if(!box) return;
        box.innerHTML = '';
        
        snap.forEach(child => {
            const data = child.val();
            const card = document.createElement('div');
            card.className = `message ${data.senderId === currentUser.uid ? 'sent' : 'received'}`;
            card.innerHTML = data.image ? `<img src="${data.image}" style="max-width:100%; border-radius:10px;"><p>${data.text}</p>` : `<p>${data.text}</p>`;
            box.appendChild(card);
        });
        box.scrollTop = box.scrollHeight;
    });
}

// RENDERIZADOR DA LISTA DE CONVERSAS PRINCIPAL
function loadChatList() {
    database.ref('users').on('value', snap => {
        const parent = document.getElementById('chats-list');
        if(!parent) return;
        parent.innerHTML = '';
        snap.forEach(child => {
            const user = child.val();
            if(user.uid === currentUser.uid) return;
            const row = document.createElement('div');
            row.className = "chat-item-row";
            row.innerHTML = `<img src="${user.avatar || 'https://via.placeholder.com/150'}">
                             <div class="chat-item-info">
                                <h4>${user.nickname}</h4>
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

// ENVIO DE MENSAGENS
function pushMessage() {
    const input = document.getElementById('message-input');
    if(!input || !input.value.trim()) return;
    
    database.ref(`chats/${activeChatId}/messages`).push({
        senderId: currentUser.uid,
        text: input.value.trim(),
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    input.value = '';
}

safeAddEvent('btn-send', 'click', pushMessage);
safeAddEvent('message-input', 'keypress', (e) => { if(e.key === 'Enter') pushMessage(); });

// COMPORTAMENTOS GERAIS DE BOTÕES E NAVEGAÇÃO
safeAddEvent('btn-to-register', 'click', () => changeView('register'));
safeAddEvent('btn-to-login', 'click', () => changeView('login'));
safeAddEvent('btn-main-settings', 'click', () => document.getElementById('settings-screen').classList.remove('hidden'));
safeAddEvent('btn-back-settings', 'click', () => document.getElementById('settings-screen').classList.add('hidden'));
safeAddEvent('btn-back-to-list', 'click', () => document.getElementById('chat-room-screen').classList.add('hidden'));
safeAddEvent('btn-logout', 'click', () => { auth.signOut().then(() => window.location.reload()); });
                        
