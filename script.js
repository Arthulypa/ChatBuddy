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

// Sistema de Resposta Ativa (Swipe target)
let currentReplyTargetData = null;

// Sistema de Gravação de Áudio
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

// AUTENTICAÇÃO ATUALIZADA (CORREÇÃO DO GOOGLE)
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
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithRedirect(provider); // Ajustado para redirecionamento mobile limpo
});

auth.getRedirectResult().then((result) => {
    if (result.user) {
        currentUser = result.user;
        checkUserInDatabase(result.user);
    }
}).catch((error) => console.log(error.message));

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

function setupPresenceSystem(userId) {
    const myStatusRef = database.ref(`users/${userId}`);
    database.ref(".info/connected").on("value", (snap) => {
        if (snap.val() === false) return;
        myStatusRef.onDisconnect().update({ status: "offline" }).then(() => {
            myStatusRef.update({ status: "online" });
        });
    });
}

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
    
    database.ref(`users/${currentUser.uid}`).update({ nickname: newNick, bio: newBio });
});

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

// IMPLEMENTAÇÃO DO DESLIZAR PARA RESPONDER COM ANIMAÇÃO DA SETA SE ABRINDO
function bindSwipeToReply(rowWrapper, messageBubble, messageData) {
    let startX = 0;
    let currentX = 0;
    const indicator = rowWrapper.querySelector('.swipe-reply-indicator');

    messageBubble.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
    }, { passive: true });

    messageBubble.addEventListener('touchmove', (e) => {
        currentX = e.touches[0].clientX;
        let deltaX = currentX - startX;

        // Limita o arrasto apenas para a direita e bota uma resistência física máxima de 75px
        if (deltaX > 0) {
            if (deltaX > 75) deltaX = 75;
            messageBubble.style.transform = `translateX(${deltaX}px)`;
            
            // Lógica matemática para abrir a seta proporcionalmente ao movimento da mão
            let progress = deltaX / 60; // 60px é o ponto perfeito de ativação
            if (progress > 1) progress = 1;
            
            indicator.style.opacity = progress;
            indicator.style.transform = `scale(${progress})`;
        }
    }, { passive: true });

    messageBubble.addEventListener('touchend', () => {
        let deltaX = currentX - startX;
        messageBubble.style.transform = 'translateX(0px)';
        indicator.style.opacity = '0';
        indicator.style.transform = 'scale(0)';

        // Se arrastou o suficiente, engatilha a resposta no input
        if (deltaX > 60) {
            triggerReplyMode(messageData);
        }
        startX = 0; currentX = 0;
    });
}

function triggerReplyMode(msgData) {
    currentReplyTargetData = msgData;
    document.getElementById('reply-preview-user').innerText = msgData.senderId === currentUser.uid ? "Você" : "Mensagem";
    document.getElementById('reply-preview-body').innerText = msgData.text || (msgData.image ? "Foto" : "Áudio");
    document.getElementById('reply-preview-bar').classList.remove('hidden');
    document.getElementById('message-input').focus();
}

document.getElementById('btn-close-reply-preview').addEventListener('click', () => {
    currentReplyTargetData = null;
    document.getElementById('reply-preview-bar').classList.add('hidden');
});

// ABRIR SESSÃO DO CHAT
function openChatRoom(chatId, recipientData) {
    activeChatId = chatId;
    activeRecipientId = recipientData.uid;
    
    document.getElementById('active-chat-name').innerText = recipientData.nickname;
    document.getElementById('active-chat-avatar').src = recipientData.avatar;
    document.getElementById('chat-room-screen').classList.remove('hidden');

    // Escuta requisições de chamadas recebidas para este usuário
    listenForIncomingCalls();

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
            
            const rowWrapper = document.createElement('div');
            rowWrapper.className = "message-row-wrapper";
            
            // Injeta a seta monocromática invisível que se expande
            rowWrapper.innerHTML = `<div class="swipe-reply-indicator"><div class="swipe-arrow-icon"></div></div>`;
            
            const card = document.createElement('div');
            card.className = `message ${data.senderId === currentUser.uid ? 'sent' : 'received'}`;
            
            let content = '';
            
            // Se a mensagem contiver uma resposta acoplada
            if (data.replyTo) {
                content += `<div class="reply-embedded-card"><strong>${data.replyTo.user}:</strong> ${data.replyTo.body}</div>`;
            }
            if (data.image) content += `<img src="${data.image}" class="message-img" onclick="openLightbox('${data.image}')">`;
            if (data.audio) {
                content += `
                <div class="custom-audio-player">
                    <button class="play-audio-btn" onclick="playAudioMessage(this, '${data.audio}')">Ouvir</button>
                    <div class="audio-progress-bar"><div class="audio-progress-fill"></div></div>
                </div>`;
            }
            if (data.text) content += `<p>${data.text}</p>`;
            
            let ticks = data.senderId === currentUser.uid ? `<div class="msg-meta-row">${buildTicks(data.status)}</div>` : '';
            card.innerHTML = content + ticks;
            
            // Vincula o gesto de arrasto (Swipe)
            bindSwipeToReply(rowWrapper, card, data);
            
            applyLongPress(card, () => {
                selectedMessageText = data.text || "";
                selectedMessageId = data.id;
                const clone = card.cloneNode(true);
                const wrapper = document.getElementById('focused-message-wrapper');
                wrapper.innerHTML = '';
                wrapper.appendChild(clone);
                document.getElementById('blur-overlay').classList.remove('hidden');
            });
            
            rowWrapper.appendChild(card);
            box.appendChild(rowWrapper);
        });
        box.scrollTop = box.scrollHeight;
    });
}

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
    
    // Se estiver respondendo a alguém no momento do push
    if (currentReplyTargetData) {
        payload.replyTo = {
            user: currentReplyTargetData.senderId === currentUser.uid ? "Você" : "Mensagem",
            body: currentReplyTargetData.text || (currentReplyTargetData.image ? "Foto" : "Áudio")
        };
        // Reseta o banner de resposta
        currentReplyTargetData = null;
        document.getElementById('reply-preview-bar').classList.add('hidden');
    }
    
    database.ref(`chats/${activeChatId}/typing/${currentUser.uid}`).set("online");

    ref.set(payload).then(() => {
        setTimeout(() => ref.update({ status: 'sent' }), 350);
        setTimeout(() => ref.update({ status: 'delivered' }), 850);
        setTimeout(() => ref.update({ status: 'read' }), 1500);
    });

    document.getElementById('message-input').value = '';
    triggerMicButtonState();
}

// SISTEMA COMPLETO DE LIGAÇÕES (SINALIZAÇÃO VIA FIREBASE)
function listenForIncomingCalls() {
    database.ref(`users/${currentUser.uid}/incomingCall`).on('value', snap => {
        const callData = snap.val();
        if (callData && callData.status === "chamando") {
            // Abre overlay de chamada recebida
            document.getElementById('call-user-name').innerText = callData.callerName;
            document.getElementById('call-status-label').innerText = "Chamada de Voz Recebida...";
            document.getElementById('call-overlay-screen').classList.remove('hidden');
            
            // Modifica ação do botão para aceitar
            const btnMute = document.getElementById('btn-toggle-mute-mic');
            btnMute.innerText = "Atender";
            btnMute.onclick = () => {
                database.ref(`users/${currentUser.uid}/incomingCall`).update({ status: "atendida" });
                document.getElementById('call-status-label').innerText = "Em Linha";
                btnMute.innerText = "Mudo";
            };
        }
    });
}

document.getElementById('btn-start-call').addEventListener('click', () => {
    if (!activeRecipientId) return;
    document.getElementById('call-status-label').innerText = "Chamando...";
    document.getElementById('call-overlay-screen').classList.remove('hidden');
    
    // Injeta a chamada no nó do destinatário via Realtime Database
    database.ref(`users/${activeRecipientId}/incomingCall`).set({
        callerId: currentUser.uid,
        callerName: "Alguém",
        status: "chamando"
    });

    // Monitora se ele atendeu ou desligou
    database.ref(`users/${activeRecipientId}/incomingCall/status`).on('value', s => {
        if (s.val() === "atendida") {
            document.getElementById('call-status-label').innerText = "Em Linha";
        }
    });
});

document.getElementById('btn-hangup-call').addEventListener('click', () => {
    document.getElementById('call-overlay-screen').classList.add('hidden');
    if (activeRecipientId) {
        database.ref(`users/${activeRecipientId}/incomingCall`).remove();
    }
    database.ref(`users/${currentUser.uid}/incomingCall`).remove();
});

// FUNÇÕES DE ÁUDIO REUTILIZADAS
function startRecordingAudio() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const reader = new FileReader();
            reader.onloadend = () => pushMessage("", null, reader.result);
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
    }).catch(() => alert("Sem permissão para usar o Microfone!"));
}

function stopRecordingAudio() {
    if(mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        clearInterval(audioTimerInterval);
        document.getElementById('audio-recording-ui').classList.add('hidden');
    }
}

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

function openLightbox(imgSrc) {
    const box = document.getElementById('lightbox-overlay');
    document.getElementById('lightbox-img').src = imgSrc;
    box.classList.remove('hidden');
}

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

document.getElementById('btn-send').addEventListener('click', function() {
    if(this.classList.contains('state-send')) {
        pushMessage(document.getElementById('message-input').value);
    } else {
        if(this.classList.contains('recording-
