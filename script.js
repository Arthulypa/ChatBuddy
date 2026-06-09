// CONFIGURAÇÃO DO FIREBASE (COMPAT)
const firebaseConfig = {
  apiKey: "AIzaSyDwW6LoRrGTJqXdYkbhv-0srz7VKKfykh4", 
  authDomain: "chatbuddy-96a61.firebaseapp.com",
  databaseURL: "https://chatbuddy-96a61-default-rtdb.firebaseio.com",
  projectId: "chatbuddy-96a61",
  storageBucket: "chatbuddy-96a61.firebasestorage.app",
  messagingSenderId: "1051493485478",
  appId: "1:1051493485478:web:1f6a94ef63e665fa539d67",
  measurementId: "G-7GX1YR6HQL"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// Mapeamento Dom
const loginPage = document.getElementById('login-page');
const registerPage = document.getElementById('register-page');
const verificationPage = document.getElementById('verification-page');
const profilePage = document.getElementById('profile-page');
const chatPage = document.getElementById('chat-page');

// Telas e Abas
const chatRoomScreen = document.getElementById('chat-room-screen');
const settingsScreen = document.getElementById('settings-screen');
const blurOverlay = document.getElementById('blur-overlay');
const focusedMsgContainer = document.getElementById('focused-message-container');
const multiSelectBar = document.getElementById('multi-select-bar');

const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const mediaFileInput = document.getElementById('media-file-input');
const stickerPanel = document.getElementById('sticker-panel');

// inputs de Configurações Inline
const setNickname = document.getElementById('set-nickname');
const setUsername = document.getElementById('set-username');

let currentUser = null;
let activeChatId = null;
let activeRecipientId = null;
let selectedMessageId = null;
let selectedMessageElement = null;

// Lógica de Seleção Múltipla
let isMultiSelectMode = false;
let selectedMessagesList = [];

// Navegação simplificada
function showPage(page) {
    [loginPage, registerPage, verificationPage, profilePage, chatPage].forEach(p => p.classList.add('hidden'));
    page.classList.remove('hidden');
}

// Handler de Abas do WhatsApp
document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
        e.target.classList.add('active');
        if(e.target.id === 'tab-chats') document.getElementById('content-chats').classList.remove('hidden');
        if(e.target.id === 'tab-status') document.getElementById('content-status').classList.remove('hidden');
        if(e.target.id === 'tab-calls') document.getElementById('content-calls').classList.remove('hidden');
    });
});

// Auth Listener
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        database.ref('users/' + user.uid).once('value').then(snapshot => {
            if (snapshot.exists() && snapshot.val().username) {
                showPage(chatPage);
                loadChatSystem();
            } else {
                showPage(profilePage);
            }
        });
    } else {
        showPage(loginPage);
    }
});

// Entrada de Perfil Inicial
document.getElementById('btn-save-profile').addEventListener('click', () => {
    const nick = document.getElementById('display-name').value.trim();
    const user = document.getElementById('username').value.trim().toLowerCase();
    if(!nick || !user) return alert('Campos obrigatórios!');
    
    database.ref('users/' + currentUser.uid).set({
        uid: currentUser.uid, displayName: nick, username: user, status: 'Online',
        lastNickUpdate: 0, lastUserUpdate: 0, nickCountToday: 0, nickDayTimestamp: 0
    });
    database.ref('usernames/' + user).set(currentUser.uid);
    showPage(chatPage);
});

function loadChatSystem() {
    // Configura os inputs da tela cheia de configurações
    database.ref('users/' + currentUser.uid).on('value', snap => {
        const data = snap.val();
        if(data) {
            setNickname.value = data.displayName || '';
            setUsername.value = data.username || '';
            document.getElementById('settings-avatar-char').innerText = data.displayName ? data.displayName.charAt(0).toUpperCase() : 'B';
        }
    });
    listenToMyChats();
}

// Abrir e fechar configurações estilo Nova Aba do WhatsApp
document.getElementById('btn-main-settings').addEventListener('click', () => settingsScreen.classList.remove('hidden'));
document.getElementById('btn-back-settings').addEventListener('click', () => settingsScreen.classList.add('hidden'));

// --- LOGICA DE CONTROLE DE TEMPO DE USERNAME E NICKNAME ---
document.getElementById('btn-update-nickname').addEventListener('click', () => {
    const novoNick = setNickname.value.trim();
    if(!novoNick) return;
    
    const agora = Date.now();
    database.ref('users/' + currentUser.uid).once('value').then(snap => {
        let u = snap.val();
        let hoje = new Date().setHours(0,0,0,0);
        
        let contagem = u.nickDayTimestamp === hoje ? (u.nickCountToday || 0) : 0;
        if(contagem >= 2) return alert('Limite atingido! Você só pode alterar o apelido 2 vezes por dia.');
        
        database.ref('users/' + currentUser.uid).update({
            displayName: novoNick,
            nickCountToday: contagem + 1,
            nickDayTimestamp: hoje
        });
        alert('Nickname atualizado com sucesso!');
    });
});

document.getElementById('btn-update-username').addEventListener('click', () => {
    const novoUser = setUsername.value.trim().toLowerCase().replace(/\s+/g, '');
    if(!novoUser) return;
    
    const agora = Date.now();
    database.ref('users/' + currentUser.uid).once('value').then(snap => {
        let u = snap.val();
        const seteDias = 7 * 24 * 60 * 60 * 1000;
        
        if(agora - (u.lastUserUpdate || 0) < seteDias) {
            const restante = Math.ceil((seteDias - (agora - u.lastUserUpdate)) / (1000 * 60 * 60 * 24));
            return alert(`Você precisa esperar mais ${restante} dias para mudar o username novamente.`);
        }
        
        database.ref('usernames/' + novoUser).once('value').then(userSnap => {
            if(userSnap.exists()) return alert('Este username já está sendo usado!');
            
            database.ref('usernames/' + u.username).remove();
            database.ref('usernames/' + novoUser).set(currentUser.uid);
            database.ref('users/' + currentUser.uid).update({
                username: novoUser,
                lastUserUpdate: agora
            });
            alert('Username atualizado!');
        });
    });
});

// Escuta de conversas existentes
function listenToMyChats() {
    database.ref(`users/${currentUser.uid}/my_chats`).on('value', snapshot => {
        const container = document.getElementById('chats-list');
        container.innerHTML = '';
        snapshot.forEach(child => {
            const chatId = child.key;
            database.ref(`users/${child.val().recipientId}`).once('value', uSnap => {
                const user = uSnap.val();
                if(user) {
                    const item = document.createElement('div');
                    item.className = 'chat-item';
                    item.innerHTML = `<div class="avatar">${user.displayName.charAt(0)}</div><div><h4>${user.displayName}</h4><small>@${user.username}</small></div>`;
                    item.onclick = () => openChatRoom(chatId, user.displayName, user.uid);
                    container.appendChild(item);
                }
            });
        });
    });
}

function openChatRoom(chatId, recipientName, recipientId) {
    activeChatId = chatId; activeRecipientId = recipientId;
    chatRoomScreen.classList.remove('hidden');
    document.getElementById('active-chat-name').innerText = recipientName;
    
    database.ref(`chats/${chatId}/messages`).off();
    database.ref(`chats/${chatId}/messages`).on('value', snapshot => {
        messagesContainer.innerHTML = '';
        snapshot.forEach(child => {
            const msg = child.val();
            const msgId = child.key;
            if(msg.deletedFor && msg.deletedFor[currentUser.uid]) return;

            const div = document.createElement('div');
            div.className = `message ${msg.senderId === currentUser.uid ? 'sent' : 'received'}`;
            div.dataset.msgid = msgId;
            div.dataset.sender = msg.senderId;

            if(msg.isDeleted) {
                div.innerHTML = `<small style="color:var(--text-muted)">🗑️ Mensagem apagada</small>`;
            } else if (msg.type === 'file') {
                div.innerHTML = `<a href="${msg.fileUrl}" target="_blank" class="file-attachment">📄 ${msg.fileName || 'Arquivo'}</a>`;
            } else if (msg.type === 'img') {
                div.innerHTML = `<img src="${msg.fileUrl}" class="media-preview">`;
            } else {
                div.innerHTML = `<p>${msg.text}</p>`;
            }
            
            // Eventos de clique e clique longo para seleção e blur do iPhone
            div.addEventListener('contextmenu', (e) => { e.preventDefault(); handleLongPress(div, msgId, msg.senderId); });
            div.addEventListener('click', () => handleMessageClick(div, msgId));

            messagesContainer.appendChild(div);
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

// Fechar Sala de Chat
document.getElementById('btn-back-to-list').addEventListener('click', () => chatRoomScreen.classList.add('hidden'));

// --- BLUR DO IPHONE E CONTEXT MENU ---
function handleLongPress(element, msgId, senderId) {
    if(isMultiSelectMode) return;
    selectedMessageId = msgId;
    selectedMessageElement = element;

    focusedMsgContainer.innerHTML = element.innerHTML;
    focusedMsgContainer.className = element.className;
    
    if(senderId === currentUser.uid) document.getElementById('ctx-delete-for-all').classList.remove('hidden');
    else document.getElementById('ctx-delete-for-all').classList.add('hidden');

    blurOverlay.classList.remove('hidden');
}

blurOverlay.addEventListener('click', (e) => {
    if(e.target === blurOverlay) blurOverlay.classList.add('hidden');
});

// Ativar Seleção Múltipla via menu iPhone
document.getElementById('ctx-select-multiple').addEventListener('click', () => {
    blurOverlay.classList.add('hidden');
    isMultiSelectMode = true;
    multiSelectBar.classList.remove('hidden');
    toggleSelectMessage(selectedMessageElement, selectedMessageId);
});

function handleMessageClick(element, msgId) {
    if(!isMultiSelectMode) return;
    toggleSelectMessage(element, msgId);
}

function toggleSelectMessage(element, msgId) {
    if(selectedMessagesList.includes(msgId)) {
        selectedMessagesList = selectedMessagesList.filter(id => id !== msgId);
        element.classList.remove('selected');
    } else {
        selectedMessagesList.push(msgId);
        element.classList.add('selected');
    }
    document.getElementById('select-count').innerText = `${selectedMessagesList.length} selecionada(s)`;
}

// Cancelar seleção
document.getElementById('btn-cancel-select').addEventListener('click', () => {
    isMultiSelectMode = false;
    selectedMessagesList = [];
    multiSelectBar.classList.add('hidden');
    document.querySelectorAll('.message').forEach(m => m.classList.remove('selected'));
});

// Ação de Apagar Múltiplos para Mim
document.getElementById('btn-multi-delete-me').addEventListener('click', () => {
    selectedMessagesList.forEach(id => {
        database.ref(`chats/${activeChatId}/messages/${id}/deletedFor/${currentUser.uid}`).set(true);
    });
    document.getElementById('btn-cancel-select').click();
});

// Envio de Mensagem de Texto Comum
function emitirMensagem(conteudo, tipo = 'text', extras = {}) {
    const ref = database.ref(`chats/${activeChatId}/messages`).push();
    ref.set({
        senderId: currentUser.uid,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        type: tipo,
        isDeleted: false,
        ...conteudo,
        ...extras
    });
}

document.getElementById('btn-send').addEventListener('click', () => {
    const t = messageInput.value.trim();
    if(!t) return;
    emitirMensagem({ text: t });
    messageInput.value = '';
});

// --- SISTEMA DE ARQUIVOS (MÍDIA ATÉ 500MB) ---
document.getElementById('btn-attach').addEventListener('click', () => mediaFileInput.click());
mediaFileInput.addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    if(!arquivo) return;
    
    const limiteMaximo = 500 * 1024 * 1024; // 500 MB em Bytes
    if(arquivo.size > limiteMaximo) return alert('Arquivo muito pesado! Limite máximo permitido de 500MB.');

    // Banco de dados simulado em formato de String base64 ou URL fictícia de Blob seguro local
    const leitor = new FileReader();
    leitor.onload = function(evt) {
        const tipoMsg = arquivo.type.startsWith('image/') ? 'img' : 'file';
        emitirMensagem({ fileUrl: evt.target.result, fileName: arquivo.name }, tipoMsg);
    };
    leitor.readAsDataURL(arquivo);
});

// Painel de Figurinhas
document.getElementById('btn-sticker').addEventListener('click', () => stickerPanel.classList.remove('hidden'));
document.getElementById('btn-close-stickers').addEventListener('click', () => stickerPanel.classList.add('hidden'));
document.querySelectorAll('.sticker-item').forEach(stk => {
    stk.addEventListener('click', (e) => {
        emitirMensagem({ text: e.target.innerText }, 'sticker');
        stickerPanel.classList.add('hidden');
    });
});

// Botão Novo Chat (+)
document.getElementById('btn-new-chat').addEventListener('click', () => {
    const modal = document.getElementById('contacts-modal');
    modal.classList.remove('hidden');
    const list = document.getElementById('contacts-list');
    list.innerHTML = '';
    database.ref('users').once('value', snap => {
        snap.forEach(c => {
            let u = c.val();
            if(u.uid !== currentUser.uid) {
                const item = document.createElement('div');
                item.className = 'chat-item';
                item.innerHTML = `<h4>${u.displayName}</h4>`;
                item.onclick = () => {
                    modal.classList.add('hidden');
                    const cId = currentUser.uid < u.uid ? `${currentUser.uid}_${u.uid}` : `${u.uid}_${currentUser.uid}`;
                    database.ref(`users/${currentUser.uid}/my_chats/${cId}`).set({ recipientId: u.uid });
                    openChatRoom(cId, u.displayName, u.uid);
                };
                list.appendChild(item);
            }
        });
    });
});
document.getElementById('btn-close-modal').addEventListener('click', () => document.getElementById('contacts-modal').classList.add('hidden'));

// Registro inicial mock
document.getElementById('btn-to-register').addEventListener('click', () => showPage(registerPage));
document.getElementById('btn-to-login').addEventListener('click', () => showPage(loginPage));
document.getElementById('btn-login').addEventListener('click', () => {
    auth.signInWithEmailAndPassword(document.getElementById('email-login').value, document.getElementById('password-login').value)
        .catch(e => alert(e.message));
});
document.getElementById('btn-register').addEventListener('click', () => {
    auth.createUserWithEmailAndPassword(document.getElementById('email-reg').value, document.getElementById('password-reg').value)
        .catch(e => alert(e.message));
});
  
