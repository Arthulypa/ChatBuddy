// CONFIGURAÇÕES DO SEU FIREBASE
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

// Variáveis para Gravação de Áudio
let mediaRecorder = null;
let audioChunks = [];
let audioTimerInterval = null;
let audioDurationSeconds = 0;

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

// Conversor de Imagem para Base64
function setupImageLoader(inputId, callback) {
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

setupImageLoader('initial-avatar-file', (b64) => {
    base64AvatarString = b64;
    const imgEl = document.getElementById('initial-avatar-preview');
    imgEl.src = b64;
    imgEl.classList.remove('hidden');
    document.getElementById('initial-avatar-placeholder').classList.add('hidden');
});

setupImageLoader('settings-avatar-file-input', (b64) => {
    document.getElementById('settings-my-avatar').src = b64;
    if(currentUser) {
        database.ref(`users/${currentUser.uid}`).update({ avatar: b64 });
    }
});

// AUTENTICAÇÃO
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email-login').value.trim();
    const pass = document.getElementById('password-login').value;
    if(!email || !pass) return alert("Preencha os campos!");
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
});

document.getElementById('btn-send-code').addEventListener('click', () => {
    const email = document.getElementById('email-reg').value.trim();
    const pass = document.getElementById('password-reg').value;
    if(!email || !pass) return alert("Preencha os campos!");
    document.getElementById('reg-step-1').classList.add('hidden');
    document.getElementById('reg-step-2').classList.remove('hidden');
});

document.getElementById('btn-verify-and-register').addEventListener('click', () => {
    if(document.getElementById('verification-code-input').value.trim() !== "123456") return alert("Código incorreto!");
    const email = document.getElementById('email-reg').value.trim();
    const pass = document.getElementById('password-reg').value;
    auth.createUserWithEmailAndPassword(email, pass).then(() => changeView('profile')).catch(err => alert(err.message));
});

document.getElementById('btn-google-login').addEventListener('click', () => {
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err => alert(err.message));
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

// MONITOR DE PRESENÇA E MONITOR DE DIGITANDO
function setupPresenceSystem(userId) {
    const myStatusRef = database.ref(`users/${userId}`);
    database.ref(".info/connected").on("value", (snap) => {
        if (snap.val() === false) return;
        myStatusRef.onDisconnect().update({ status: "offline" }).then(() => {
            myStatusRef.update({ status: "online" });
        });
    });
}

// SISTEMA DETECTAR DIGITAÇÃO EM TEMPO REAL
const msgInput = document.getElementById('message-input');
msgInput.addEventListener('input', () => {
    if (activeChatId && currentUser) {
        const status = msgInput.value.trim().length > 0 ? "digitando..." : "online";
        database.ref(`chats/${activeChatId}/typing/${currentUser.uid}`).set(status);
    }
});
msgInput.addEventListener('blur', () => {
    if (activeChatId && currentUser) {
        database.ref(`chats/${activeChatId}/typing/${currentUser.uid}`).set("online");
    }
});

// MONITOR DE ALTERAÇÃO DE DADOS DE CONFIGURAÇÃO DO USUÁRIO
function loadMyAccountSettingsData(userId) {
    database.ref(`users/${userId}`).on('value', snap => {
        const data = snap.val();
        if(!data) return;
        document.getElementById('settings-my-avatar').src = data.avatar || "https://via.placeholder.com/150";
        document.getElementById('settings-my-username-label').innerText = data.username || "@usuario";
        document.getElementById('settings-my-nickname-input').value = data.nickname || "";
        document.getElementById('settings-my-bio-input').value = data.bio || "";
    });
}

document.getElementById('btn-save-settings-profile').addEventListener('click', () => {
    if(!currentUser) return;
    const newNick = document.getElementById('settings-my-nickname-input').value.trim();
    const newBio = document.getElementById('settings-my-bio-input').value.trim();
    if(!newNick) return alert("O apelido não pode ficar em branco!");
    
    database.ref(`users/${currentUser.uid}`).update({
        nickname: newNick,
        bio: newBio
    }).then(() => alert("Perfil atualizado com sucesso!"));
});

// FUNÇÃO DAS BOLINHAS (TICKS VISUAIS)
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

// ABRIR SALA DE CHAT E MONITORAR DIGITAÇÃO DO OUTRO
function openChatRoom(chatId, recipientData) {
    activeChatId = chatId;
    activeRecipientId = recipientData.uid;
    
    document.getElementById('active-chat-name').innerText = recipientData.nickname;
    document.getElementById('active-chat-avatar').src = recipientData.avatar;
    document.getElementById('chat-room-screen').classList.remove('hidden');

    // Monitora Status e se o Outro está digitando
    database.ref(`chats/${chatId}/typing/${recipientData.uid}`).on('value', tSnap => {
        const currentTypingStatus = tSnap.val();
        const statusTextEl = document.getElementById('active-chat-status');
        
        if (currentTypingStatus === "digitando...") {
            statusTextEl.innerText = "digitando...";
            statusTextEl.style.color = "var(--ios-green)";
        } else {
            database.ref(`users/${recipientData.uid}`).once('value', rSnap => {
                const rUser = rSnap.val();
                if(!rUser) return;
                const badgeEl = document.getElementById('active-chat-online-badge');
                if(rUser.status === 'online') {
                    statusTextEl.innerText = "online";
                    statusTextEl.style.color = "var(--ios-green)";
                    badgeEl.classList.remove('hidden');
                } else {
                    statusTextEl.innerText = "offline";
                    statusTextEl.style.color = "var(--text-muted)";
                    badgeEl.classList.add('hidden');
                }
            });
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
            
            let content = '';
            if (data.image) {
                content += `<img src="${data.image}" class="message-img" onclick="openLightbox('${data.image}')">`;
            }
            if (data.audio) {
                content += `
                <div class="custom-audio-player">
                    <button class="play-audio-btn" onclick="playAudioMessage(this, '${data.audio}')">Ouvir</button>
                    <div class="audio-progress-bar"><div class="audio-progress-fill"></div></div>
                </div>`;
            }
            if (data.text) {
                content += `<p>${data.text}</p>`;
            }
            
            let ticks = data.senderId === currentUser.uid ? `<div class="msg-meta-row">${buildTicks(data.status)}</div>` : '';
            card.innerHTML = content + ticks;
            
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

// ENVIAR QUALQUER MENSAGEM COM EFEITO CASCATA DAS BOLINHAS
function pushMessage(text, imgBase64 = null, audioBase64 = null) {
    if(!text.trim() && !imgBase64 && !audioBase64) return;
    const ref = database.ref(`chats/${activeChatId}/messages`).push();
    
    const payload = {
        id: ref.key,
        senderId: currentUser.uid,
        status: 'sending',
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    if(text.trim()) payload.text = text;
    if(imgBase64) payload.image = imgBase64;
    if(audioBase64) payload.audio = audioBase64;
    
    database.ref(`chats/${activeChatId}/typing/${currentUser.uid}`).set("online");

    ref.set(payload).then(() => {
        setTimeout(() => ref.update({ status: 'sent' }), 350);
        setTimeout(() => ref.update({ status: 'delivered' }), 850);
        setTimeout(() => ref.update({ status: 'read' }), 1500);
    });

    document.getElementById('message-input').value = '';
    triggerMicButtonState();
}

// FUNÇÕES DE ÁUDIO
function startRecordingAudio() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const reader = new FileReader();
            reader.onloadend = () => {
                pushMessage("", null, reader.result);
            };
            reader.readAsDataURL(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        audioDurationSeconds = 0;
        document.getElementById('audio-timer').innerText = "0:00";
        document.getElementById('audio-recording-ui').classList.remove('hidden');

        audioTimerInterval = setInterval(() => {
            audioDurationSeconds++;
            const mins = Math.floor(audioDurationSeconds / 60);
            const secs = audioDurationSeconds % 60;
            document.getElementById('audio-timer').innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }, 1000);
    }).catch(err => alert("Sem permissão para usar o Microfone!"));
}

function stopRecordingAudio() {
    if(mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        clearInterval(audioTimerInterval);
        document.getElementById('audio-recording-ui').classList.add('hidden');
    }
}

// EXECUTAR ÁUDIO NO PLAYER
function playAudioMessage(btn, audioBase64) {
    const audio = new Audio(audioBase64);
    const fill = btn.nextElementSibling.querySelector('.audio-progress-fill');
    
    btn.innerText = "Pausar";
    audio.play();
    
    audio.addEventListener('timeupdate', () => {
        const pct = (audio.currentTime / audio.duration) * 100;
        fill.style.width = pct + "%";
    });
    
    audio.addEventListener('ended', () => {
        btn.innerText = "Ouvir";
        fill.style.width = "0%";
    });
}

// VISUALIZADOR DE FOTOS AMPLIADAS (LIGHTBOX)
function openLightbox(imgSrc) {
    const box = document.getElementById('lightbox-overlay');
    document.getElementById('lightbox-img').src = imgSrc;
    box.classList.remove('hidden');
}

// GERENCIADOR DE ESTADO DO BOTÃO DE ENTRADA
function triggerMicButtonState() {
    const btn = document.getElementById('btn-send');
    const val = document.getElementById('message-input').value.trim();
    if(val.length > 0) {
        btn.innerText = "Enviar";
        btn.className = "icon-btn state-send";
    } else {
        btn.innerText = "Áudio";
        btn.className = "icon-btn state-mic";
    }
}
document.getElementById('message-input').addEventListener('input', triggerMicButtonState);

// EVENTO DO BOTÃO DE ENVIO OU GRAVAÇÃO DE ÁUDIO
document.getElementById('btn-send').addEventListener('click', function() {
    if(this.classList.contains('state-send')) {
        pushMessage(document.getElementById('message-input').value);
    } else {
        if(this.classList.contains('recording-active')) {
            this.classList.remove('recording-active');
            this.style.transform = "scale(1)";
            stopRecordingAudio();
        } else {
            this.classList.add('recording-active');
            this.style.transform = "scale(1.1)";
            startRecordingAudio();
        }
    }
});

// POPUPS FLUTUANTES GLOBAIS
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
                let textDisplay = lastMsg.text || (lastMsg.image ? "Foto recebida" : "Áudio recebido");
                triggerPremiumPopup(sender, textDisplay);
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

// ESTADO INICIAL DA SESSÃO
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        database.ref('users/' + user.uid).once('value').then(snap => {
            if (snap.exists() && snap.val().username) {
                changeView('chat');
                setupPresenceSystem(user.uid);
                loadChatList();
                loadMyAccountSettingsData(user.uid);
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
    const start = () => timer = setTimeout(() => actionCallback(), 600);
    const stop = () => clearTimeout(timer);
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchend', stop, { passive: true });
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', stop);
    element.addEventListener('mouseleave', stop);
}

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

// EVENTOS DE CLIQUES E DEMAIS BOTOES
document.getElementById('message-input').addEventListener('keypress', (e) => { 
    if(e.key === 'Enter') {
        pushMessage(e.target.value);
    }
});

document.getElementById('btn-attach').addEventListener('click', () => document.getElementById('media-file-input').click());
document.getElementById('media-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader(); reader.onload = (ev) => pushMessage("", ev.target.result); reader.readAsDataURL(file);
});

document.getElementById('ctx-copy-direct').addEventListener('click', () => { navigator.clipboard.writeText(selectedMessageText).then(() => document.getElementById('blur-overlay').classList.add('hidden')); });
document.getElementById('ctx-close-menu').addEventListener('click', () => document.getElementById('blur-overlay').classList.add('hidden'));
document.getElementById('ctx-delete-single').addEventListener('click', () => { if(confirm("Apagar mensagem?")) database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).remove(); document.getElementById('blur-overlay').classList.add('hidden'); });

document.getElementById('btn-main-settings').addEventListener('click', () => document.getElementById('settings-screen').classList.remove('hidden'));
document.getElementById('btn-back-settings').addEventListener('click', () => document.getElementById('settings-screen').classList.add('hidden'));
document.getElem
