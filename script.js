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

// MOTOR DE AUTENTICAÇÃO CHATBUDDY
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
    auth.signInWithPopup(provider).catch(err => alert(err.message));
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
        wlstwrus: "Disponível no ChatBuddy 🚀",
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
        if(!chat || !chat.messages) return;
        
        const msgKeys = Object.keys(chat.messages);
        const lastMsg = chat.messages[msgKeys[msgKeys.length - 1]];
        
        if(lastMsg.senderId !== currentUser.uid && lastMsg.status === 'sending') {
            if (silencedUsers[lastMsg.senderId]) return;
            if (!document.getElementById('toggle-popup-global').checked) return;

            database.ref(`users/${lastMsg.senderId}`).once('value', uSnap => {
                const sender = uSnap.val();
                triggerPremiumPopup(sender, lastMsg.text || "Enviou uma mídia");
            });
        }
    });
}

function triggerPremiumPopup(sender, text) {
    const popup = document.getElementById('popup-notification');
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
    if(!status) return '';
    switch(status) {
        case 'sending': return `<div class="status-dot-wrapper"><span class="status-dot dot-sending"></span></div>`;
        case 'sent': return `<div class="status-dot-wrapper"><span class="status-dot dot-sent-unreceived"></span></div>`;
        case 'delivered': return `<div class="status-dot-wrapper"><span class="status-dot dot-delivered"></span><span class="status-dot dot-delivered"></span></div>`;
        case 'read': return `<div class="status-dot-wrapper"><span class="status-dot dot-read"></span><span class="status-dot dot-read"></span></div>`;
    }
    return '';
}

function formatLastSeen(timestamp) {
    if(!timestamp) return "offline";
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if(diffMins < 1) return "offline há instantes";
    if(diffMins < 60) return `offline há ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if(diffHours < 24) return `offline há ${diffHours} h`;
    return "offline há algum tempo";
}

function openChatRoom(chatId, recipientData) {
    activeChatId = chatId;
    activeRecipientId = recipientData.uid;
    
    document.getElementById('active-chat-name').innerText = recipientData.nickname;
    document.getElementById('active-chat-avatar').src = recipientData.avatar;
    document.getElementById('chat-room-screen').classList.remove('hidden');

    database.ref(`users/${recipientData.uid}`).on('value', rSnap => {
        const rUser = rSnap.val();
        const statusTextEl = document.getElementById('active-chat-status');
        const badgeEl = document.getElementById('active-chat-online-badge');
        const infoHeader = document.getElementById('btn-open-recipient-info');
        
        if(rUser.status === 'online') {
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
            const card = document.createElement('div');
            card.className = `message ${data.senderId === currentUser.uid ? 'sent' : 'received'}`;
            
            let content = data.image ? `<img src="${data.image}" class="message-img">` : '';
            content += data.text ? `<p>${data.text}</p>` : '';
            
            let ticks = data.senderId === currentUser.uid ? `<div class="msg-meta-row">${buildTicks(data.status)}</div>` : '';
            card.innerHTML = content + ticks;
            
            // EXECUÇÃO DO CLIQUE LONGO COM MANTENÇÃO DO LADO DA MENSAGEM
            applyLongPress(card, () => {
                selectedMessageText = data.text || "";
                selectedMessageId = data.id;
                
                const clone = card.cloneNode(true);
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

document.getElementById('ctx-info-msg').addEventListener('click', () => {
    if(!selectedMessageId || !activeChatId) return;
    database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).once('value').then(snap => {
        const data = snap.val();
        if(!data) return;
        
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
    if(!selectedMessageText) return alert("Apenas textos podem ser editados!");
    const newText = prompt("Editar mensagem:", selectedMessageText);
    if(newText && newText.trim() !== "") {
        database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).update({
            text: newText + " (editada)"
        });
    }
    document.getElementById('blur-overlay').classList.add('hidden');
});

document.getElementById('ctx-delete-single').addEventListener('click', () => {
    if(confirm("Apagar para todos?")) {
        database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).remove();
    }
    document.getElementById('blur-overlay').classList.add('hidden');
});

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
        setTimeout(() => ref.update({ status: 'sent' }), 300);
        setTimeout(() => ref.update({ status: 'delivered' }), 800);
        setTimeout(() => ref.update({ status: 'read' }), 1400);
    });
    document.getElementById('message-input').value = '';
}

document.getElementById('message-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') pushMessage(e.target.value);
});

document.getElementById('btn-attach').addEventListener('click', () => document.getElementById('media-file-input').click());
document.getElementById('media-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => pushMessage("", ev.target.result);
    reader.readAsDataURL(file);
});

document.getElementById('ctx-copy-direct').addEventListener('click', () => {
    navigator.clipboard.writeText(selectedMessageText).then(() => {
        document.getElementById('blur-overlay').classList.add('hidden');
    });
});

function loadChatList() {
    database.ref('users').on('value', snap => {
        const parent = document.getElementById('chats-list');
        parent.innerHTML = '';
        snap.forEach(child => {
            const user = child.val();
            if(user.uid === currentUser.uid) return;
            
            const row = document.createElement('div');
            row.className = "chat-item-row";
            row.innerHTML = `<img src="${user.avatar}" onerror="this.src='https://via.placeholder.com/150'">
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

document.getElementById('btn-open-recipient-info').addEventListener('click', () => {
    database.ref('users/' + activeRecipientId).once('value').then(s => {
        const u = s.val();
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

document.getElementById('ctx-close-menu').addEventListener('click', () => document.getElementById('blur-overlay').classList.add('hidden'));
document.getElementById('btn-close-info-sheet').addEventListener('click', () => document.getElementById('contact-info-sheet').classList.add('hidden'));
document.getElementById('btn-back-to-list').addEventListener('click', () => {
    database.ref(`users/${activeRecipientId}`).off();
    document.getElementById('chat-room-screen').classList.add('hidden');
});
document.getElementById('btn-main-settings').addEventListener('click', () => document.getElementById('settings-screen').classList.remove('hidden'));
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
                                                           
