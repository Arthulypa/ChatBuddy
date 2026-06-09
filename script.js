// CONFIGURAÇÃO DO SEU FIREBASE CONECTADO
const firebaseConfig = {
  apiKey: "AIzaSyDwW6LoRrGTJqXdYkbhv-0srz7VKKfyH4",
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

// NAVEGADOR DE PÁGINAS ESTÁVEL
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

// CONVERSOR DE ARQUIVOS EM BASE64 (AVATAR E PROTOCOLO DE IMAGENS)
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

// CONTROLE DE AUTENTICAÇÃO REAL (FIREBASE AUTH)
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email-login').value.trim();
    const pass = document.getElementById('password-login').value;
    if(!email || !pass) return alert("Preencha os dados!");
    
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert("Erro: " + err.message));
});

// REGISTRO DE CONTA COM SISTEMA DE CÓDIGO INTERNO DE 6 DÍGITOS
document.getElementById('btn-send-code').addEventListener('click', () => {
    const email = document.getElementById('email-reg').value.trim();
    const pass = document.getElementById('password-reg').value;
    if(!email || !pass) return alert("Insira e-mail e senha válidos.");
    
    // Transiciona para verificação de segurança requisitada
    document.getElementById('reg-step-1').classList.add('hidden');
    document.getElementById('reg-step-2').classList.remove('hidden');
});

document.getElementById('btn-verify-and-register').addEventListener('click', () => {
    const code = document.getElementById('verification-code-input').value.trim();
    if(code !== "123456") return alert("Código de ativação inválido!");
    
    const email = document.getElementById('email-reg').value.trim();
    const pass = document.getElementById('password-reg').value;
    
    auth.createUserWithEmailAndPassword(email, pass)
        .then(() => changeView('profile'))
        .catch(err => alert("Erro ao registrar: " + err.message));
});

// CAPTURA DO GOOGLE AUTH
document.getElementById('btn-google-login').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => alert(err.message));
});

// SALVAMENTO DE CADASTRO DO PERFIL DO USUÁRIO
document.getElementById('btn-save-profile').addEventListener('click', () => {
    const nick = document.getElementById('display-name').value.trim();
    const userAt = document.getElementById('username').value.trim().replace('@','');
    if(!nick || !userAt) return alert("Campos obrigatórios!");

    database.ref('users/' + currentUser.uid).set({
        uid: currentUser.uid,
        nickname: nick,
        username: '@' + userAt,
        avatar: base64AvatarString || "https://via.placeholder.com/150"
    }).then(() => changeView('chat'));
});

// ESCUTADOR CENTRAL DO USUÁRIO LOGADO
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        database.ref('users/' + user.uid).once('value').then(snap => {
            if (snap.exists() && snap.val().username) {
                changeView('chat');
                loadChatList();
            } else {
                changeView('profile');
            }
        });
    } else {
        changeView('login');
    }
});

// SISTEMA REAL DE SELEÇÃO DE MENSAGEM (CLIQUE LONGO CORRIGIDO)
function applyLongPress(element, actionCallback) {
    let timer;
    const start = (e) => {
        timer = setTimeout(() => actionCallback(e), 550);
    };
    const stop = () => clearTimeout(timer);
    
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchend', stop, { passive: true });
    element.addEventListener('touchmove', stop, { passive: true });
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', stop);
    element.addEventListener('mouseleave', stop);
}

// DISPARADOR DOS PONTINHOS DE STATUS PREMIUM
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

// CARREGAR E RENDERIZAR MENSAGENS EM TEMPO REAL
function openChatRoom(chatId, recipientData) {
    activeChatId = chatId;
    activeRecipientId = recipientData.uid;
    
    document.getElementById('active-chat-name').innerText = recipientData.nickname;
    document.getElementById('active-chat-avatar').src = recipientData.avatar;
    document.getElementById('chat-room-screen').classList.remove('hidden');
    
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
            
            applyLongPress(card, (e) => {
                if(data.text) {
                    selectedMessageText = data.text;
                    selectedMessageId = data.id;
                    document.getElementById('focused-message-container').innerHTML = card.innerHTML;
                    document.getElementById('blur-overlay').classList.remove('hidden');
                }
            });
            
            box.appendChild(card);
        });
        box.scrollTop = box.scrollHeight;
    });
}

// ENVIO DE MENSAGEM DINÂMICA
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
        setTimeout(() => ref.update({ status: 'sent' }), 500);
        setTimeout(() => ref.update({ status: 'delivered' }), 1200);
        setTimeout(() => ref.update({ status: 'read' }), 2000);
    });
    document.getElementById('message-input').value = '';
}

document.getElementById('message-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') pushMessage(e.target.value);
});

// DISPARO DE MÍDIA INTEGRADO NO CLIPE DE PAPEL
document.getElementById('btn-attach').addEventListener('click', () => document.getElementById('media-file-input').click());
document.getElementById('media-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => pushMessage("", ev.target.result);
    reader.readAsDataURL(file);
});

// COPIAR TEXTO VIA BOTÃO SEM RECURSOS INTERNOS BUGADOS
document.getElementById('ctx-copy-direct').addEventListener('click', () => {
    navigator.clipboard.writeText(selectedMessageText).then(() => {
        alert("Copiado com sucesso!");
        document.getElementById('blur-overlay').classList.add('hidden');
    });
});

// ABASTECIMENTO DAS LISTAS DE CONVERSAS E CRIAÇÃO DE NOVOS CHATS
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
                const combinedId = currentUser.uid < user.uid ? currentUser.uid + "_" + user.uid : user.uid + "_" + currentUser.uid;
                openChatRoom(combinedId, user);
            });
            parent.appendChild(row);
        });
    });
}

// INTERRUPÇÕES DE COMPONENTE E BOTÕES DE FECHAMENTO (VOLTAR)
document.getElementById('ctx-close-menu').addEventListener('click', () => document.getElementById('blur-overlay').classList.add('hidden'));
document.getElementById('btn-back-to-list').addEventListener('click', () => document.getElementById('chat-room-screen').classList.add('hidden'));
document.getElementById('btn-contact-menu').addEventListener('click', () => {
    database.ref('users/' + activeRecipientId).once('value').then(s => {
        const u = s.val();
        document.getElementById('sheet-contact-nick').innerText = u.nickname;
        document.getElementById('sheet-contact-user').innerText = u.username;
        document.getElementById('sheet-contact-avatar').src = u.avatar;
        document.getElementById('contact-info-sheet').classList.remove('hidden');
    });
});
document.getElementById('btn-close-info-sheet').addEventListener('click', () => document.getElementById('contact-info-sheet').classList.add('hidden'));
document.getElementById('btn-new-chat').addEventListener('click', () => {
    database.ref('users').once('value').then(snap => {
        const list = document.getElementById('contacts-list-modal');
        list.innerHTML = '';
        snap.forEach(c => {
            const u = c.val();
            if(u.uid === currentUser.uid) return;
            const item = document.createElement('div');
            item.className = "chat-item-row";
            item.innerHTML = `<img src="${u.avatar}"><div><h4>${u.nickname}</h4></div>`;
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
document.getElementById('btn-main-settings').addEventListener('click', () => document.getElementById('settings-screen').classList.remove('hidden'));
document.getElementById('btn-back-settings').addEventListener('click', () => document.getElementById('settings-screen').classList.add('hidden'));
document.getElementById('btn-logout').addEventListener('click', () => { auth.signOut().then(() => window.location.reload()); });
document.getElementById('btn-to-register').addEventListener('click', () => changeView('register'));
document.getElementById('btn-to-login').addEventListener('click', () => changeView('login'));
      
