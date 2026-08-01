// ─── PERSONALIZAÇÃO: TEMA E COR DE DESTAQUE (aplica antes de tudo pra não piscar) ──
(function applyStoredTheme() {
    const savedTheme     = localStorage.getItem('chatbuddy_theme')     || 'dark';
    const savedAccent    = localStorage.getItem('chatbuddy_accent')    || 'blue';
    const savedFont      = localStorage.getItem('chatbuddy_font')      || 'padrao';
    const savedBubble    = localStorage.getItem('chatbuddy_bubble')    || 'blue';
    const savedAnimation = localStorage.getItem('chatbuddy_animation') || 'padrao';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.documentElement.setAttribute('data-accent', savedAccent);
    document.documentElement.setAttribute('data-font', savedFont);
    document.documentElement.setAttribute('data-bubble', savedBubble);
    document.documentElement.setAttribute('data-animation', savedAnimation);
})();

// ─── AVATAR PADRÃO (estilo WhatsApp) — sempre funciona, mesmo offline ──────
const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs>' +
    '<circle cx="50" cy="50" r="50" fill="#8e8e93"/>' +
    '<g clip-path="url(#c)" fill="#e5e5ea">' +
    '<circle cx="50" cy="40" r="18"/>' +
    '<ellipse cx="50" cy="96" rx="34" ry="30"/>' +
    '</g></svg>'
);

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
const storage  = firebase.storage();

// ─── UPLOAD DE MÍDIA PARA O FIREBASE STORAGE ────────────────────────────────
// Substitui o antigo esquema de guardar áudio/imagem/vídeo/documento em
// base64 direto no Realtime Database (pesado, lento e caro). Agora o arquivo
// vai para o Storage e só a URL de download fica salva na mensagem.
function uploadBlobToStorage(blob, folder, fileName) {
    const safeName = (fileName || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${folder}/${currentUser.uid}/${Date.now()}_${safeName}`;
    return storage.ref(path).put(blob).then(snapshot => snapshot.ref.getDownloadURL());
}

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
let activeGroupId      = null;
let activeGroupData    = null;
let groupReplyingTo    = null;
let activeGroupMembersProfiles = {}; // cache { uid: {nickname, avatar, username} } do grupo aberto, usado nas bolinhas de "visto por"
let lastGroupMessagesSnap = null;    // guarda o último snapshot renderizado para re-render quando os perfis chegarem
let groupAvatarString  = "";
let suppressAuthListener = false; // evita que o listener global reaja durante o cadastro (criação temporária de conta + signOut)

// Admins do grupo principal
const MAIN_GROUP_ADMINS = ['@arthurscs', '@arthur', '@julioeeu'];
const MAIN_GROUP_ID_KEY = 'chatbuddy_main_group_id';

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

// ─── PREVENIR SELEÇÃO DE TEXTO NAS MENSAGENS ────────────────────────────────
document.addEventListener('selectstart', (e) => {
    const target = e.target;
    if (target.closest('.messages-container') || 
        target.closest('.chats-list') || 
        target.closest('.chat-item-row') ||
        target.closest('.message') ||
        target.closest('.group-messages-container') ||
        target.closest('.blur-overlay') ||
        target.closest('.iphone-context-menu')) {
        e.preventDefault();
        return false;
    }
});

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
    document.getElementById('popup-avatar').src = customIconUrl || DEFAULT_AVATAR;
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
    if (pass.length < 6) return alert("A senha deve ter pelo menos 6 caracteres.");

    const btn = document.getElementById('btn-send-code');
    btn.disabled = true; btn.innerText = 'Enviando...';

    // Cria a conta temporariamente para enviar o email de verificação
    suppressAuthListener = true; // impede que o onAuthStateChanged global reaja ao login automático + signOut abaixo
    auth.createUserWithEmailAndPassword(email, pass)
        .then(cred => {
            return cred.user.sendEmailVerification().then(() => {
                // Salva as credenciais para usar após verificação
                localStorage.setItem('pendingReg', JSON.stringify({ email, pass: btoa(unescape(encodeURIComponent(pass))) }));
                // Faz logout temporário — usuário só entra após verificar
                return auth.signOut();
            });
        })
        .then(() => {
            suppressAuthListener = false;
            btn.disabled = false; btn.innerText = 'Enviar Código';
            document.getElementById('reg-step-1').classList.add('hidden');
            document.getElementById('reg-step-2').classList.remove('hidden');
            document.getElementById('reg-step-2-info').innerText = `Enviamos um link de verificação para ${email}. Após clicar no link, volte aqui e pressione "Já verifiquei".`;
        })
        .catch(err => {
            // Se a conta chegou a ser criada mas algo falhou depois (ex: envio do e-mail),
            // garante que ninguém fica autenticado "escondido" com uma conta não verificada.
            if (auth.currentUser) auth.signOut();
            suppressAuthListener = false;
            btn.disabled = false; btn.innerText = 'Enviar Código';
            const msgs = {
                'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
                'auth/invalid-email': 'E-mail inválido.',
                'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres).',
                'auth/network-request-failed': 'Sem conexão com a internet.'
            };
            alert(msgs[err.code] || 'Erro: ' + err.message);
        });
});

document.getElementById('btn-verify-and-register').addEventListener('click', () => {
    const pending = localStorage.getItem('pendingReg');
    if (!pending) return alert("Sessão expirada. Tente novamente.");
    const { email, pass } = JSON.parse(pending);
    const decodedPass = decodeURIComponent(escape(atob(pass)));

    const btn = document.getElementById('btn-verify-and-register');
    btn.disabled = true; btn.innerText = 'Verificando...';

    auth.signInWithEmailAndPassword(email, decodedPass)
        .then(cred => {
            if (!cred.user.emailVerified) {
                auth.signOut();
                btn.disabled = false; btn.innerText = 'Já verifiquei';
                alert("E-mail ainda não verificado. Clique no link que enviamos e tente novamente.");
                return;
            }
            localStorage.removeItem('pendingReg');
            localStorage.setItem('localLoggedUser', JSON.stringify({ email, pass }));
            btn.disabled = false; btn.innerText = 'Já verifiquei';
            changeView('profile');
        })
        .catch(err => {
            btn.disabled = false; btn.innerText = 'Já verifiquei';
            alert("Erro ao verificar: " + err.message);
        });
});

// ─── NAVEGAÇÃO LOGIN ↔ REGISTRO ─────────────────────────────────────────────
document.getElementById('btn-to-register').addEventListener('click', () => changeView('register'));
document.getElementById('btn-to-login').addEventListener('click', () => changeView('login'));

document.getElementById('btn-google-login').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => alert(err.message));
});

document.getElementById('btn-save-profile').addEventListener('click', () => {
    const nick   = document.getElementById('display-name').value.trim();
    const userAt = document.getElementById('username').value.trim().replace(/^@/, '');
    const bio    = document.getElementById('user-bio').value.trim() || "Disponível no ChatBuddy";
    if (!nick || !userAt) return alert("Campos obrigatórios vazios!");
    
    const profileData = {
        uid: currentUser.uid, nickname: nick, username: '@' + userAt, bio: bio,
        wlstwrus: "Disponível no ChatBuddy 🚀",
        avatar: base64AvatarString || DEFAULT_AVATAR,
        status: "online", lastSeen: firebase.database.ServerValue.TIMESTAMP
    };
    
    localStorage.setItem(`profile_${currentUser.uid}`, JSON.stringify(profileData));
    const btnSave = document.getElementById('btn-save-profile');
    const originalLabel = btnSave.innerText;
    btnSave.disabled = true; btnSave.innerText = 'Salvando...';
    database.ref('users/' + currentUser.uid).set(profileData)
        .then(() => changeView('chat'))
        .catch(err => {
            btnSave.disabled = false; btnSave.innerText = originalLabel;
            if (err.code === 'PERMISSION_DENIED') {
                alert('Não foi possível salvar o perfil: acesso negado pelo banco de dados. Verifique as Regras (Rules) do Realtime Database no Firebase.');
            } else {
                alert('Erro ao salvar perfil: ' + err.message);
            }
        });
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
        document.getElementById('current-user-header-avatar').src = p.avatar || DEFAULT_AVATAR;
        document.getElementById('current-user-header-nick').innerText = p.nickname || "Eu";
    } else if (currentUser.uid !== "offline_user") {
        database.ref('users/' + currentUser.uid).once('value', snap => {
            if (snap.exists()) {
                const p = snap.val();
                document.getElementById('current-user-header-avatar').src = p.avatar || DEFAULT_AVATAR;
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

// ─── NOTIFICAÇÕES NATIVAS (Web Notifications API + Capacitor) ────────────────
function setupPushNotifications() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

function sendNativeNotification(title, body, iconUrl) {
    // Não dispara se o app estiver em foco e o chat do remetente aberto
    if (document.visibilityState === 'visible' && activeChatId) return;

    const muteToggle = document.getElementById('toggle-mute-all');
    if (muteToggle && muteToggle.checked) return;

    if (Notification.permission !== 'granted') {
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') _fireNotification(title, body, iconUrl);
        });
        return;
    }
    _fireNotification(title, body, iconUrl);
}

function _fireNotification(title, body, iconUrl) {
    try {
        const n = new Notification(title, {
            body: body,
            icon: iconUrl || '',
            badge: iconUrl || '',
            vibrate: [200, 100, 200],
            tag: 'chatbuddy-msg',          // agrupa notificações do mesmo app
            renotify: true,
            silent: false
        });
        n.onclick = () => { window.focus(); n.close(); };
    } catch(e) {
        console.warn('Notification error:', e);
    }
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
        if (lastMsg.timestamp && lastMsg.timestamp < listenStartTime) return;
        if (lastMsg.senderId !== currentUser.uid && lastMsg.status === 'sending') {
            if (blockedUsers[lastMsg.senderId]) return;
            if (silencedUsers[lastMsg.senderId]) return;
            database.ref(`users/${lastMsg.senderId}`).once('value', uSnap => {
                const sender = uSnap.val();
                if (!sender) return;
                const msgText = lastMsg.text || (lastMsg.audio ? '🎵 Áudio' : '📷 Mídia');
                // Popup in-app
                const toggle = document.getElementById('toggle-popup-global');
                if (toggle && toggle.checked) {
                    triggerPremiumPopup(sender, msgText);
                }
                // Notificação nativa do sistema
                sendNativeNotification(sender.nickname || 'Nova mensagem', msgText, sender.avatar || '');
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
    if (suppressAuthListener) return; // cadastro em andamento — a tela é controlada manualmente pelo fluxo de registro
    if (user) {
        // Bloqueia qualquer acesso ao app com e-mail não verificado (cobre login direto, não só o cadastro)
        if (!user.emailVerified) {
            auth.signOut();
            localStorage.removeItem('localLoggedUser');
            changeView('login');
            alert('Seu e-mail ainda não foi verificado. Verifique sua caixa de entrada e clique no link antes de entrar.');
            return;
        }
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
                setupPushNotifications();
                ensureMainGroup();
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
        case 'offline_pending': return `<div class="status-dot-wrapper"><span class="status-dot dot-sending"></span></div>`;
        case 'sending':   return `<div class="status-dot-wrapper"><span class="status-dot dot-sending blink"></span></div>`;
        case 'sent':      return `<div class="status-dot-wrapper"><span class="status-dot dot-sent"></span><span class="status-dot dot-sent"></span></div>`;
        case 'delivered': return `<div class="status-dot-wrapper"><span class="status-dot dot-sent"></span><span class="status-dot dot-sent"></span></div>`;
        case 'read':      return `<div class="status-dot-wrapper"><span class="status-dot dot-read"></span><span class="status-dot dot-read"></span></div>`;
    }
    return '';
}

// ─── VISUALIZAÇÕES DE MENSAGEM EM GRUPO ─────────────────────────────────────
// Monta a fileira de bolinhas com a foto de quem visualizou a mensagem (até 3,
// as mais recentes primeiro, com um "+N" para o restante). Os dois pontinhos
// de status só ficam verdes quando TODOS os membros (menos o remetente) viram.
function buildGroupSeenIndicator(data, groupData) {
    const totalRecipients = groupData && groupData.members
        ? Object.keys(groupData.members).filter(uid => uid !== data.senderId).length
        : 0;

    const seenByObj = data.seenBy || {};
    const entries = Object.keys(seenByObj)
        .filter(uid => uid !== data.senderId)
        .map(uid => ({ uid, ts: seenByObj[uid] || 0 }))
        .sort((a, b) => b.ts - a.ts); // visto mais recente primeiro

    const allSeen  = totalRecipients > 0 && entries.length >= totalRecipients;
    const dotClass = allSeen ? 'dot-read' : (data.status === 'sending' || data.status === 'offline_pending' ? 'dot-sending' : 'dot-sent');

    let avatarsHtml = '';
    if (entries.length > 0) {
        const visible = entries.slice(0, 3);
        const extra   = entries.length - visible.length;
        avatarsHtml += '<div class="seen-avatars-stack">';
        visible.forEach(({ uid }, i) => {
            const prof = activeGroupMembersProfiles[uid];
            const src  = (prof && prof.avatar) ? prof.avatar : DEFAULT_AVATAR;
            avatarsHtml += `<img class="seen-avatar" style="z-index:${10 - i};" src="${src}" alt="">`;
        });
        if (extra > 0) {
            avatarsHtml += `<div class="seen-avatar seen-avatar-more" style="z-index:${10 - visible.length};">+${extra}</div>`;
        }
        avatarsHtml += '</div>';
    }

    return `<div class="group-seen-row">${avatarsHtml}<div class="status-dot-wrapper"><span class="status-dot ${dotClass}"></span><span class="status-dot ${dotClass}"></span></div></div>`;
}

// Busca (e cacheia) os perfis de todos os membros do grupo aberto — usado
// tanto nas bolinhas de "visto por" quanto na tela de Info da Mensagem.
function loadActiveGroupMembersProfiles(groupData) {
    activeGroupMembersProfiles = {};
    if (!groupData || !groupData.members) return;
    const uids = Object.keys(groupData.members);
    let loaded = 0;
    uids.forEach(uid => {
        database.ref(`users/${uid}`).once('value').then(snap => {
            activeGroupMembersProfiles[uid] = snap.val() || { nickname: 'Usuário', avatar: '', username: '' };
        }).catch(() => {
            activeGroupMembersProfiles[uid] = { nickname: 'Usuário', avatar: '', username: '' };
        }).finally(() => {
            loaded++;
            if (loaded === uids.length && lastGroupMessagesSnap) {
                // Re-renderiza para exibir as fotos reais assim que os perfis chegarem
                renderGroupMessages(lastGroupMessagesSnap, groupData);
            }
        });
    });
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

let _statusListenerUid = null; // rastreia o listener de status ativo pra não acumular ao trocar de chat

// ─── CHAT: ABRIR SALA ───────────────────────────────────────────────────────
function openChatRoom(chatId, recipientData) {
    // Se havia um grupo aberto, fecha ele antes de abrir o chat (telas são mutuamente exclusivas)
    if (activeGroupId) closeGroupRoom();

    activeChatId      = chatId;
    activeRecipientId = recipientData.uid;
    replyingTo        = null;
    document.getElementById('reply-bar').classList.add('hidden');
    document.getElementById('active-chat-name').innerText  = getDisplayName(recipientData) || recipientData.nickname || 'Usuário';
    document.getElementById('active-chat-avatar').src      = recipientData.avatar || DEFAULT_AVATAR;
    document.getElementById('chat-room-screen').classList.remove('hidden');
    document.getElementById('group-room-screen').classList.add('hidden');
    
    document.querySelectorAll('.chat-item-row').forEach(el => el.classList.remove('active-desktop-chat'));
    const targetedRow = document.querySelector(`.chat-item-row[data-chat-id="${chatId}"]`);
    if(targetedRow) targetedRow.classList.add('active-desktop-chat');

    const emptyPanel = document.getElementById('empty-chat-panel');
    if (emptyPanel) emptyPanel.classList.add('hidden');

    applyBlockedStateToChat(recipientData.uid, isBlocked(recipientData.uid));

    if (currentUser.uid !== "offline_user") {
        // Desliga o listener de status do destinatário anterior antes de criar um novo
        if (_statusListenerUid) database.ref(`users/${_statusListenerUid}`).off('value');
        _statusListenerUid = recipientData.uid;
        database.ref(`users/${recipientData.uid}`).on('value', rSnap => {
            const rUser = rSnap.val();
            if (!rUser) return;
            const statusEl = document.getElementById('active-chat-status');
            const badgeEl  = document.getElementById('active-chat-online-badge');
            const headerInfo = document.getElementById('chat-header-user-area');
            if (rUser.status === 'online') {
                headerInfo && headerInfo.classList.add('is-online');
                statusEl.innerText = "online";
                badgeEl.classList.remove('hidden');
            } else {
                headerInfo && headerInfo.classList.remove('is-online');
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

    // Coleta todas as mensagens válidas primeiro
    const allMessages = [];
    snap.forEach(child => {
        const data = isRawArray ? child.val() : child.val();
        if (!data) return;
        cachePayload[data.id] = data;
        const dmKey = `${activeChatId}_${data.id}`;
        if (deletedForMe[dmKey]) return;
        allMessages.push(data);
    });

    // Renderiza com agrupamento estilo Instagram
    allMessages.forEach((data, idx) => {
        const isSent  = data.senderId === currentUser.uid;
        const prevMsg = idx > 0 ? allMessages[idx - 1] : null;
        const nextMsg = idx < allMessages.length - 1 ? allMessages[idx + 1] : null;

        const sameAsPrev = prevMsg && prevMsg.senderId === data.senderId && !prevMsg.deletedForAll && !data.deletedForAll;
        const sameAsNext = nextMsg && nextMsg.senderId === data.senderId && !nextMsg.deletedForAll && !data.deletedForAll;

        if (data.deletedForAll) {
            const wrapper = document.createElement('div');
            wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
            const card = document.createElement('div');
            card.className = `message ${isSent ? 'sent' : 'received'} deleted-msg`;
            card.innerHTML = `<p>🚫 Mensagem apagada</p>`;
            wrapper.appendChild(card);
            box.appendChild(wrapper);
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
        // Agrupamento: reduz espaçamento entre mensagens do mesmo remetente
        if (sameAsPrev) wrapper.classList.add('grouped-msg');
        wrapper.dataset.msgId = data.id;

        const arrow = document.createElement('div');
        arrow.className = 'reply-arrow';
        arrow.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;"><path fill="currentColor" d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`;

        const card = document.createElement('div');
        card.className = `message ${isSent ? 'sent' : 'received'}`;

        // Bordas arredondadas estilo Instagram
        if (isSent) {
            if (sameAsPrev && sameAsNext) card.classList.add('bubble-mid-sent');
            else if (sameAsPrev && !sameAsNext) card.classList.add('bubble-last-sent');
            else if (!sameAsPrev && sameAsNext) card.classList.add('bubble-first-sent');
        } else {
            if (sameAsPrev && sameAsNext) card.classList.add('bubble-mid-received');
            else if (sameAsPrev && !sameAsNext) card.classList.add('bubble-last-received');
            else if (!sameAsPrev && sameAsNext) card.classList.add('bubble-first-received');
        }

        if(data.status === 'offline_pending') card.classList.add('is-offline-pending');

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
        } else if (data.document) {
            const sizeKB = data.documentSize ? Math.round(data.documentSize/1024) : '?';
            content += `<a href="${data.document}" download="${data.documentName || 'arquivo'}" class="doc-message-link" onclick="event.stopPropagation()">
                <svg viewBox="0 0 24 24" style="width:20px;height:20px;flex-shrink:0;"><path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                <div><span class="doc-name">${data.documentName || 'Arquivo'}</span><span class="doc-size">${sizeKB} KB</span></div>
            </a>`;
        } else if (data.audio) {
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
        // Ticks só na última mensagem do grupo (ou se for única)
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
    audio.volume = 1.0;
    // Força volume de mídia (não chamada) no Android WebView
    if (typeof audio.mozAudioChannelType !== 'undefined') {
        audio.mozAudioChannelType = 'content';
    }
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
        // Remove listeners antigos para evitar duplicatas
        const newMedia = media.cloneNode(true);
        media.parentNode.replaceChild(newMedia, media);
        
        newMedia.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const src = newMedia.getAttribute('src') || newMedia.src;
            if (!src) return;
            const isVideo = newMedia.tagName === 'VIDEO' || newMedia.classList.contains('message-video');
            const viewer = document.getElementById('media-viewer');
            const container = document.getElementById('media-viewer-container');
            container.innerHTML = '';
            
            let element;
            if(isVideo) {
                element = document.createElement('video');
                element.controls = true;
                element.autoplay = true;
                element.playsInline = true;
            } else {
                element = document.createElement('img');
            }
            element.src = src;
            element.className = "media-viewer-content";
            container.appendChild(element);
            viewer.classList.remove('hidden');

            let currentZoom = 1;
            element.addEventListener('click', (ev) => {
                ev.stopPropagation();
                currentZoom = currentZoom === 1 ? 2 : 1;
                element.style.transform = `scale(${currentZoom})`;
            });
        }, true); // usa capture para pegar antes do blur-overlay
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

    container.classList.toggle('align-right', isSent);
    container.classList.toggle('align-left',  !isSent);

    // Posiciona fora da tela primeiro para medir a altura real do menu
    container.style.visibility = 'hidden';
    container.style.top  = '-9999px';
    container.style.left = '-9999px';

    requestAnimationFrame(() => {
        const rect  = card.getBoundingClientRect();
        const vpW   = window.innerWidth;
        const vpH   = window.innerHeight;
        const menuW = 240;
        const menuH = container.offsetHeight || 320; // altura REAL medida

        // X
        let leftX = isSent ? (rect.right - menuW) : rect.left;
        if (leftX < 10) leftX = 10;
        if (leftX + menuW > vpW - 10) leftX = vpW - menuW - 10;

        // Y: prefere abaixo, senão acima, senão centraliza
        let topY;
        if (vpH - rect.bottom >= menuH + 16) {
            topY = rect.bottom + 6;
        } else if (rect.top >= menuH + 16) {
            topY = rect.top - menuH - 6;
        } else {
            topY = rect.top + (rect.height / 2) - (menuH / 2);
        }

        if (topY < 10) topY = 10;
        if (topY + menuH > vpH - 10) topY = vpH - menuH - 10;

        container.style.left = leftX + 'px';
        container.style.top  = topY + 'px';
        container.style.visibility = 'visible';
    });
}

// ─── AÇÕES DO MENU DE CONTEXTO ───────────────────────────────────────────────
document.getElementById('ctx-reply-msg').addEventListener('click', () => {
    // Este handler é para chats diretos; grupos substituem temporariamente via onclick
    // Se o onclick foi setado pelo grupo, ele já foi chamado. Verificamos aqui se é chat direto.
    if (activeGroupId) return; // grupo usa onclick dinâmico
    if (!selectedMessageData) return;
    replyingTo = { id: selectedMessageData.id, text: selectedMessageData.text || '', senderId: selectedMessageData.senderId };
    document.getElementById('reply-bar-text').innerText = selectedMessageData.text || 'Mídia';
    document.getElementById('reply-bar').classList.remove('hidden');
    document.getElementById('message-input').focus();
    document.getElementById('blur-overlay').classList.add('hidden');
});

document.getElementById('ctx-info-msg').addEventListener('click', () => {
    if(currentUser.uid === "offline_user") return alert("Indisponível no modo offline.");
    document.getElementById('blur-overlay').classList.add('hidden');

    if (activeGroupId) {
        // ── GRUPO: mostra quem viu e a que horas cada um viu ──
        database.ref(`groups/${activeGroupId}/messages/${selectedMessageId}`).once('value').then(snap => {
            const data = snap.val(); if (!data) return;
            document.getElementById('info-sent-time').innerText = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '--:--';

            document.getElementById('info-read-time-row').classList.add('hidden');
            const listEl = document.getElementById('info-group-seen-list');
            listEl.classList.remove('hidden');

            const seenBy = data.seenBy || {};
            const uids = Object.keys(seenBy).filter(uid => uid !== data.senderId);
            uids.sort((a, b) => (seenBy[b] || 0) - (seenBy[a] || 0)); // mais recente primeiro

            if (uids.length === 0) {
                listEl.innerHTML = `<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:8px 0;">Ninguém viu ainda</p>`;
            } else {
                listEl.innerHTML = uids.map(uid => {
                    const prof   = activeGroupMembersProfiles[uid] || {};
                    const name   = prof.nickname || 'Usuário';
                    const avatar = prof.avatar || DEFAULT_AVATAR;
                    const time   = seenBy[uid] ? new Date(seenBy[uid]).toLocaleTimeString() : '--:--';
                    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--glass-border);">
                        <img src="${avatar}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;">
                        <span style="flex:1;font-size:13px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
                        <span style="font-size:12px;color:var(--ios-green);font-weight:600;flex-shrink:0;">${time}</span>
                    </div>`;
                }).join('');
            }
            document.getElementById('msg-info-modal').classList.remove('hidden');
        });
    } else {
        // ── CHAT DIRETO: comportamento original ──
        database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).once('value').then(snap => {
            const data = snap.val(); if (!data) return;
            document.getElementById('info-read-time-row').classList.remove('hidden');
            document.getElementById('info-group-seen-list').classList.add('hidden');
            document.getElementById('info-sent-time').innerText = new Date(data.timestamp).toLocaleTimeString();
            document.getElementById('info-read-time').innerText = data.status === 'read' ? (data.readAt ? new Date(data.readAt).toLocaleTimeString() : 'Sim') : 'Não lido';
            document.getElementById('msg-info-modal').classList.remove('hidden');
        });
    }
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
        const recipientObj = cachedChat ? cachedChat.recipient : { uid: activeRecipientId, avatar: DEFAULT_AVATAR, nickname: "Usuário" };
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

        const listContainer = document.getElementById('chats-list');

        if(rawChats.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">Nenhuma conversa ativa.</div>`;
            return;
        }

        // Busca todos os usuários em paralelo e só renderiza quando TODOS chegaram
        const cacheListRows = {};
        let resolved = 0;
        const results = new Array(rawChats.length).fill(null);

        function checkDone() {
            if (resolved !== rawChats.length) return;
            // Atualiza sem piscar: só limpa e re-renderiza no final
            listContainer.innerHTML = '';
            results.forEach(r => {
                if (!r) return;
                cacheListRows[r.chatId] = { chatId: r.chatId, recipient: r.uData, chatData: r.chatData };
                createChatRowElement(r.chatId, r.uData, r.chatData);
            });
            localStorage.setItem('offline_chat_list', JSON.stringify(cacheListRows));
            if (Object.keys(cacheListRows).length === 0) {
                listContainer.innerHTML = `<div class="empty-state">Nenhuma conversa ativa.</div>`;
            }
        }

        rawChats.forEach((item, idx) => {
            database.ref(`users/${item.recipientId}`).once('value')
                .then(uSnap => {
                    const uData = uSnap.val();
                    if (uData) results[idx] = { chatId: item.chatId, uData, chatData: item.chatData };
                })
                .catch(err => {
                    // Não deixa uma única falha (ex: permissão negada) travar a lista inteira para sempre
                    console.warn('Falha ao carregar usuário do chat:', item.recipientId, err);
                })
                .finally(() => {
                    resolved++;
                    checkDone();
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

    const blockBadge = isBlocked(uData.uid) ? `<span class="header-badge blocked-list-badge">BLOQUEADO</span>` : '';

    row.innerHTML = `
        <img src="${uData.avatar}" alt="">
        <div class="chat-item-info">
            <div class="chat-item-header">
                <h4>${getDisplayName(uData)}</h4>${blockBadge}
            </div>
            <p>${lastMsgText}</p>
        </div>
    `;
    row.addEventListener('click', () => {
        if (activeChatId === chatId && !document.getElementById('chat-room-screen').classList.contains('hidden')) {
            closeChatRoom();
            const emptyPanel = document.getElementById('empty-chat-panel');
            if (emptyPanel) emptyPanel.classList.remove('hidden');
        } else {
            openChatRoom(chatId, uData);
        }
    });
    listContainer.appendChild(row);
}

// ─── BOTÃO ANEXAR — MENU DE MÍDIAS ──────────────────────────────────────────
document.getElementById('btn-attach').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('attach-menu');
    menu.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    const menu = document.getElementById('attach-menu');
    if (!menu.classList.contains('hidden') && !e.target.closest('#attach-menu') && !e.target.closest('#btn-attach')) {
        menu.classList.add('hidden');
    }
});

document.getElementById('attach-image').addEventListener('click', () => {
    document.getElementById('attach-menu').classList.add('hidden');
    const input = document.getElementById('media-file-input');
    input.accept = 'image/*';
    input.click();
});

document.getElementById('attach-video').addEventListener('click', () => {
    document.getElementById('attach-menu').classList.add('hidden');
    const input = document.getElementById('media-file-input');
    input.accept = 'video/*';
    input.click();
});

document.getElementById('attach-doc').addEventListener('click', () => {
    document.getElementById('attach-menu').classList.add('hidden');
    document.getElementById('doc-file-input').click();
});

document.getElementById('media-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !activeChatId) return;
    if (currentUser.uid === "offline_user") { alert("Envio de mídia indisponível no modo offline."); e.target.value = ''; return; }
    const isVideo   = file.type.startsWith('video/');
    const chatIdAtSend = activeChatId;
    const newMsgRef = database.ref(`chats/${chatIdAtSend}/messages`).push();
    triggerSystemPopup(isVideo ? "Enviando vídeo..." : "Enviando imagem...", "Aguarde, isso pode levar alguns segundos.", DEFAULT_AVATAR);
    uploadBlobToStorage(file, 'chat_media', file.name).then(url => {
        const payload = {
            id: newMsgRef.key, senderId: currentUser.uid,
            [isVideo ? 'video' : 'image']: url,
            timestamp: firebase.database.ServerValue.TIMESTAMP, status: 'sending'
        };
        return newMsgRef.set(payload).then(() => {
            database.ref(`chats/${chatIdAtSend}`).update({ lastMessageTimestamp: firebase.database.ServerValue.TIMESTAMP });
            newMsgRef.update({ status: 'sent' });
        });
    }).catch(err => alert('Falha ao enviar mídia: ' + err.message));
    e.target.value = '';
});

document.getElementById('doc-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !activeChatId) return;
    if (currentUser.uid === "offline_user") { alert("Envio de arquivo indisponível no modo offline."); e.target.value = ''; return; }
    const chatIdAtSend = activeChatId;
    const newMsgRef = database.ref(`chats/${chatIdAtSend}/messages`).push();
    triggerSystemPopup("Enviando arquivo...", "Aguarde, isso pode levar alguns segundos.", DEFAULT_AVATAR);
    uploadBlobToStorage(file, 'chat_docs', file.name).then(url => {
        const payload = {
            id: newMsgRef.key, senderId: currentUser.uid,
            document: url,
            documentName: file.name,
            documentSize: file.size,
            timestamp: firebase.database.ServerValue.TIMESTAMP, status: 'sending'
        };
        return newMsgRef.set(payload).then(() => {
            database.ref(`chats/${chatIdAtSend}`).update({ lastMessageTimestamp: firebase.database.ServerValue.TIMESTAMP });
            newMsgRef.update({ status: 'sent' });
        });
    }).catch(err => alert('Falha ao enviar arquivo: ' + err.message));
    e.target.value = '';
});

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
    if (!txt || !activeChatId || isBlocked(activeRecipientId)) return;

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

    if (!activeChatId || currentUser.uid === "offline_user") {
        if (currentUser.uid === "offline_user") alert("Envio de áudio indisponível no modo offline.");
        return;
    }

    const chatIdAtSend = activeChatId;
    const newMsgRef = database.ref(`chats/${chatIdAtSend}/messages`).push();
    uploadBlobToStorage(audioBlob, 'chat_audio', `audio_${Date.now()}.mp3`).then(url => {
        const payload = {
            id: newMsgRef.key, senderId: currentUser.uid, audio: url,
            audioDuration: durationSeconds, timestamp: firebase.database.ServerValue.TIMESTAMP, status: 'sending'
        };
        return newMsgRef.set(payload).then(() => {
            database.ref(`chats/${chatIdAtSend}`).update({ lastMessageTimestamp: firebase.database.ServerValue.TIMESTAMP });
            newMsgRef.update({ status: 'sent' });
        });
    }).catch(err => alert('Falha ao enviar áudio: ' + err.message));
}

// ─── NOVA CONVERSA: FILTRO DE PRIVACIDADE EXCLUSIVO POR ARROBA (@) ───
document.getElementById('btn-new-chat').addEventListener('click', () => {
    document.getElementById('contacts-modal').classList.remove('hidden');
    renderContactsModalList('');
});

document.getElementById('btn-close-modal').addEventListener('click', () => document.getElementById('contacts-modal').classList.add('hidden'));

const searchUsernameInput = document.getElementById('search-by-username-input');
let _searchDebounceTimer = null;

searchUsernameInput.addEventListener('input', () => {
    const raw = searchUsernameInput.value.trim().toLowerCase().replace(/^@/, '');
    const term = raw ? '@' + raw : '';
    clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => renderContactsModalList(term), 300);
});

function renderContactsModalList(filterTerm) {
    const listContainer = document.getElementById('contacts-list-modal');
    listContainer.innerHTML = '';

    if (currentUser.uid === "offline_user") {
        listContainer.innerHTML = `<div class="empty-state">Indisponível offline.</div>`;
        return;
    }

    if (filterTerm.length < 4) {
        listContainer.innerHTML = `<div class="empty-state" style="font-size:12px; padding:20px 10px;">Digite pelo menos 3 letras do nome de usuário<br>(Ex: <b>art</b>) para localizá-la de forma privada.</div>`;
        return;
    }

    // Marca a busca atual para ignorar respostas de buscas antigas
    const searchId = Date.now();
    listContainer._currentSearchId = searchId;

    database.ref('users').orderByChild('username').once('value', snap => {
        // Se chegou uma busca mais nova, ignora esta
        if (listContainer._currentSearchId !== searchId) return;

        listContainer.innerHTML = '';
        const seenUids = new Set();
        let count = 0;

        snap.forEach(child => {
            const u = child.val();
            if (!u || u.uid === currentUser.uid) return;
            if (seenUids.has(u.uid)) return; // evita duplicatas
            seenUids.add(u.uid);

            const uName = (u.username || '').toLowerCase();
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
                // Pede a primeira (e única) mensagem que acompanha o pedido de conversa
                const firstMsg = prompt(`Envie uma mensagem para ${targetUser.nickname || 'este usuário'} junto com seu pedido de conversa (ela só poderá responder depois de aceitar):`);
                if (firstMsg === null || !firstMsg.trim()) return; // cancelou ou deixou vazio
                // Envia solicitação
                const myProfile = JSON.parse(localStorage.getItem(`profile_${currentUser.uid}`) || '{}');
                database.ref(`chatRequests/${targetUser.uid}/${currentUser.uid}`).set({
                    fromUid: currentUser.uid,
                    fromNickname: myProfile.nickname || currentUser.email,
                    fromUsername: myProfile.username || '',
                    fromAvatar: myProfile.avatar || '',
                    message: firstMsg.trim(),
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
function openRecipientInfoSheet() {
    if (!activeRecipientId) return;
    database.ref(`users/${activeRecipientId}`).once('value', snap => {
        const data = snap.val(); if (!data) return;
        document.getElementById('sheet-contact-nick').innerText = getDisplayName(data);
        document.getElementById('sheet-contact-user').innerText = data.username || '@user';
        document.getElementById('sheet-contact-bio').innerText  = data.bio || 'Sem bio disponível.';
        document.getElementById('sheet-contact-status').innerText = data.wlstwrus || 'Disponível';
        document.getElementById('sheet-contact-avatar').src = data.avatar;
        document.getElementById('contact-info-sheet').classList.remove('hidden');
    });
}

// Apenas o nome (h2) abre o perfil — não o header inteiro
document.getElementById('active-chat-name').addEventListener('click', () => {
    openRecipientInfoSheet();
});

// Os 3 pontinhos também abrem
document.getElementById('btn-contact-menu').addEventListener('click', () => {
    openRecipientInfoSheet();
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
        document.getElementById('settings-username').value = (p.username || '').replace(/^@/, '');
        document.getElementById('settings-bio').value      = p.bio || '';
        document.getElementById('settings-avatar-preview').src = p.avatar || DEFAULT_AVATAR;
    }
    document.getElementById('settings-screen').classList.remove('hidden');
});

document.getElementById('btn-back-settings').addEventListener('click', () => document.getElementById('settings-screen').classList.add('hidden'));

// Abas de navegação interna das configurações
// ─── PERSONALIZAÇÃO: TEMA E COR DE DESTAQUE — controles da aba ─────────────
function refreshPersonalizationUI() {
    const theme     = localStorage.getItem('chatbuddy_theme')     || 'dark';
    const accent    = localStorage.getItem('chatbuddy_accent')    || 'blue';
    const font      = localStorage.getItem('chatbuddy_font')      || 'padrao';
    const bubble    = localStorage.getItem('chatbuddy_bubble')    || 'blue';
    const animation = localStorage.getItem('chatbuddy_animation') || 'padrao';
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active-theme', btn.dataset.themeValue === theme);
    });
    document.querySelectorAll('.accent-swatch').forEach(btn => {
        btn.classList.toggle('active-accent', btn.dataset.accentValue === accent);
    });
    document.querySelectorAll('.font-option').forEach(btn => {
        btn.classList.toggle('active-font', btn.dataset.fontValue === font);
    });
    document.querySelectorAll('.bubble-swatch').forEach(btn => {
        btn.classList.toggle('active-bubble', btn.dataset.bubbleValue === bubble);
    });
    document.querySelectorAll('.anim-option').forEach(btn => {
        btn.classList.toggle('active-anim', btn.dataset.animValue === animation);
    });
}

document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
        const theme = btn.dataset.themeValue;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('chatbuddy_theme', theme);
        refreshPersonalizationUI();
    });
});

document.querySelectorAll('.accent-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
        const accent = btn.dataset.accentValue;
        document.documentElement.setAttribute('data-accent', accent);
        localStorage.setItem('chatbuddy_accent', accent);
        refreshPersonalizationUI();
    });
});

document.querySelectorAll('.font-option').forEach(btn => {
    btn.addEventListener('click', () => {
        const font = btn.dataset.fontValue;
        document.documentElement.setAttribute('data-font', font);
        localStorage.setItem('chatbuddy_font', font);
        refreshPersonalizationUI();
    });
});

document.querySelectorAll('.bubble-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
        const bubble = btn.dataset.bubbleValue;
        document.documentElement.setAttribute('data-bubble', bubble);
        localStorage.setItem('chatbuddy_bubble', bubble);
        refreshPersonalizationUI();
    });
});

document.querySelectorAll('.anim-option').forEach(btn => {
    btn.addEventListener('click', () => {
        const animation = btn.dataset.animValue;
        document.documentElement.setAttribute('data-animation', animation);
        localStorage.setItem('chatbuddy_animation', animation);
        refreshPersonalizationUI();
    });
});

refreshPersonalizationUI();

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
document.getElementById('tab-groups').addEventListener('click', () => { switchMainTab('groups'); loadGroupsList(); });
document.getElementById('tab-status').addEventListener('click', () => switchMainTab('status'));
document.getElementById('tab-calls').addEventListener('click', () => switchMainTab('calls'));

function switchMainTab(target) {
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    document.getElementById(`tab-${target}`).classList.add('active');
    document.getElementById(`content-${target}`).classList.remove('hidden');
}

// Fechamento de telas mobile nativas
function closeChatRoom() {
    document.getElementById('chat-room-screen').classList.add('hidden');
    if (activeChatId && currentUser.uid !== "offline_user") database.ref(`chats/${activeChatId}/messages`).off();
    activeChatId = null;
    activeRecipientId = null;
    if (_statusListenerUid) { database.ref(`users/${_statusListenerUid}`).off('value'); _statusListenerUid = null; }
    document.querySelectorAll('.chat-item-row').forEach(el => el.classList.remove('active-desktop-chat'));
}

document.getElementById('btn-back-to-list').addEventListener('click', () => {
    closeChatRoom();
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
                <img src="${req.fromAvatar || DEFAULT_AVATAR}" alt="">
                <div class="request-row-info">
                    <h4>${req.fromNickname || 'Usuário'}</h4>
                    <p>${req.fromUsername || ''}</p>
                    ${req.message ? `<p style="color:#fff;font-style:italic;margin-top:2px;">"${req.message}"</p>` : ''}
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
        // A mensagem enviada junto com o pedido vira a primeira mensagem da conversa
        if (req.message) {
            const firstMsgRef = database.ref(`chats/${newChatId}/messages`).push();
            firstMsgRef.set({
                id: firstMsgRef.key, senderId: fromUid, text: req.message,
                timestamp: firebase.database.ServerValue.TIMESTAMP, status: 'sent'
            });
        }
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
            avatar: req.fromAvatar || DEFAULT_AVATAR
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

// ═══════════════════════════════════════════════════════════════════════════
// ─── SISTEMA DE GRUPOS ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// Verifica se o username é admin do grupo principal
function isMainGroupAdmin(username) {
    return MAIN_GROUP_ADMINS.includes((username || '').toLowerCase());
}

// Verifica se o usuário atual é admin de um grupo específico
function isGroupAdmin(groupData) {
    if (!groupData || !currentUser) return false;
    return groupData.admins && groupData.admins[currentUser.uid];
}

// Verifica se o usuário atual é dono de um grupo
function isGroupOwner(groupData) {
    if (!groupData || !currentUser) return false;
    return groupData.ownerUid === currentUser.uid;
}

// ─── GRUPO PRINCIPAL: Cria se não existir e adiciona o usuário ──────────────
function ensureMainGroup() {
    if (!currentUser || currentUser.uid === 'offline_user') return;
    const cachedProfile = JSON.parse(localStorage.getItem(`profile_${currentUser.uid}`) || '{}');
    const myUsername = (cachedProfile.username || '').toLowerCase();

    // Procura o grupo principal pelo nome
    database.ref('groups').orderByChild('isMainGroup').equalTo(true).once('value', snap => {
        if (snap.exists()) {
            // Grupo principal já existe — adiciona o usuário como membro se não estiver
            snap.forEach(child => {
                const gId = child.key;
                const gData = child.val();
                if (!gData.members || !gData.members[currentUser.uid]) {
                    const memberRole = isMainGroupAdmin(myUsername) ? 'admin' : 'member';
                    const updates = {};
                    updates[`groups/${gId}/members/${currentUser.uid}`] = true;
                    if (memberRole === 'admin') updates[`groups/${gId}/admins/${currentUser.uid}`] = true;
                    database.ref().update(updates);
                }
            });
        } else {
            // Cria o grupo principal
            const ref = database.ref('groups').push();
            const adminUids = {}; // será preenchido quando os admins entrarem
            const payload = {
                id: ref.key,
                name: 'ChatBuddy Official',
                description: 'Grupo oficial do ChatBuddy 🚀',
                avatar: DEFAULT_AVATAR,
                isMainGroup: true,
                onlyAdminsCanSend: true,
                ownerUid: currentUser.uid,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                members: { [currentUser.uid]: true },
                admins: isMainGroupAdmin(myUsername) ? { [currentUser.uid]: true } : {}
            };
            ref.set(payload);
        }
    });
}

// ─── LISTAR GRUPOS ──────────────────────────────────────────────────────────
function loadGroupsList() {
    if (!currentUser || currentUser.uid === 'offline_user') return;
    const container = document.getElementById('groups-list');
    container.innerHTML = '';

    database.ref('groups').on('value', snap => {
        container.innerHTML = '';
        if (!snap.exists()) {
            container.innerHTML = '<div class="empty-state">Nenhum grupo ainda.</div>';
            return;
        }
        let count = 0;
        snap.forEach(child => {
            try {
                const g = child.val();
                if (!g || !g.members || !g.members[currentUser.uid]) return;
                count++;
                const row = document.createElement('div');
                row.className = 'chat-item-row';
                row.dataset.groupId = child.key;
                let lastText = 'Nenhuma mensagem';
                const msgKeys = g.messages ? Object.keys(g.messages) : [];
                if (msgKeys.length > 0) {
                    const last = g.messages[msgKeys[msgKeys.length - 1]];
                    lastText = last.text || (last.audio ? '🎵 Áudio' : '📷 Mídia');
                }
                const badge = g.isMainGroup ? `<span class="header-badge" style="font-size:10px;background:#0a84ff;color:#fff;border-radius:8px;padding:1px 6px;">Official</span>` : '';
                row.innerHTML = `
                    <img src="${g.avatar || DEFAULT_AVATAR}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">
                    <div class="chat-item-info">
                        <div class="chat-item-header"><h4>${g.name}</h4>${badge}</div>
                        <p>${lastText}</p>
                    </div>
                `;
                row.addEventListener('click', () => {
                    if (activeGroupId === child.key && !document.getElementById('group-room-screen').classList.contains('hidden')) {
                        // Já está aberto: clicar de novo fecha e volta pra lista
                        closeGroupRoom();
                        const emptyPanel = document.getElementById('empty-chat-panel');
                        if (emptyPanel) emptyPanel.classList.remove('hidden');
                    } else {
                        openGroupRoom(child.key, g);
                    }
                });
                container.appendChild(row);
            } catch (e) {
                console.warn('Falha ao renderizar grupo, pulando este item:', child.key, e);
            }
        });
        if (count === 0) container.innerHTML = '<div class="empty-state">Você não está em nenhum grupo.</div>';
    });
}

// ─── ABRIR SALA DE GRUPO ────────────────────────────────────────────────────
function openGroupRoom(groupId, groupData) {
    // Se havia um chat direto aberto, fecha ele antes de abrir o grupo (telas são mutuamente exclusivas)
    if (activeChatId) closeChatRoom();

    activeGroupId   = groupId;
    activeGroupData = groupData;
    groupReplyingTo = null;

    document.getElementById('group-reply-bar').classList.add('hidden');
    document.getElementById('active-group-name').innerText = groupData.name || 'Grupo';
    document.getElementById('active-group-avatar').src = groupData.avatar || DEFAULT_AVATAR;

    const membersCount = groupData.members ? Object.keys(groupData.members).length : 0;
    document.getElementById('active-group-members-count').innerText = `${membersCount} membros`;

    // Mostra/esconde footer baseado em permissão
    const footer     = document.getElementById('group-footer-area');
    const banner     = document.getElementById('group-readonly-banner');
    const canSend    = !groupData.onlyAdminsCanSend || isGroupAdmin(groupData) || isGroupOwner(groupData);
    footer.style.display = canSend ? '' : 'none';
    banner.classList.toggle('hidden', canSend);

    // Esconde o chat direto e o painel vazio, mostra o grupo
    document.getElementById('chat-room-screen').classList.add('hidden');
    document.getElementById('group-room-screen').classList.remove('hidden');
    const emptyPanel = document.getElementById('empty-chat-panel');
    if (emptyPanel) emptyPanel.classList.add('hidden');

    // Marca o item ativo na lista de grupos
    document.querySelectorAll('.chat-item-row').forEach(el => el.classList.remove('active-desktop-chat'));
    const rows = document.querySelectorAll(`#groups-list .chat-item-row`);
    rows.forEach(r => {
        if (r.dataset && r.dataset.groupId === groupId) r.classList.add('active-desktop-chat');
    });

    // Carrega os perfis (nome/foto) de todos os membros — usado nas bolinhas de "visto por"
    loadActiveGroupMembersProfiles(groupData);

    // Listener de mensagens
    database.ref(`groups/${groupId}/messages`).off();
    database.ref(`groups/${groupId}/messages`).on('value', snap => {
        lastGroupMessagesSnap = snap;
        renderGroupMessages(snap, groupData);
        // Marca como visto (por mim) cada mensagem de outra pessoa que eu ainda não tinha visto
        if (currentUser.uid !== 'offline_user') {
            snap.forEach(child => {
                const d = child.val();
                if (d && d.senderId !== currentUser.uid && (!d.seenBy || !d.seenBy[currentUser.uid])) {
                    database.ref(`groups/${groupId}/messages/${d.id}/seenBy/${currentUser.uid}`).set(firebase.database.ServerValue.TIMESTAMP);
                }
            });
        }
    });
}

// ─── RENDERIZAR MENSAGENS DO GRUPO ──────────────────────────────────────────
function renderGroupMessages(snap, groupData) {
    const box = document.getElementById('group-messages-container');
    const prevScrollBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
    box.innerHTML = '';

    const allMessages = [];
    snap.forEach(child => { const d = child.val(); if (d) allMessages.push(d); });

    // Cacheia localmente para poder exibir o histórico do grupo mesmo sem internet
    if (activeGroupId && allMessages.length > 0) {
        const cachePayload = {};
        allMessages.forEach(d => { cachePayload[d.id] = d; });
        try { localStorage.setItem(`offline_group_hist_${activeGroupId}`, JSON.stringify(cachePayload)); }
        catch (e) { console.warn('Não foi possível cachear o histórico do grupo (armazenamento cheio?)', e); }
    }

    allMessages.forEach((data, idx) => {
        const isSent  = data.senderId === currentUser.uid;
        const prevMsg = idx > 0 ? allMessages[idx - 1] : null;
        const nextMsg = idx < allMessages.length - 1 ? allMessages[idx + 1] : null;
        const sameAsPrev = prevMsg && prevMsg.senderId === data.senderId;
        const sameAsNext = nextMsg && nextMsg.senderId === data.senderId;

        if (data.deletedForAll) {
            const w = document.createElement('div');
            w.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
            const c = document.createElement('div');
            c.className = `message ${isSent ? 'sent' : 'received'} deleted-msg`;
            c.innerHTML = '<p>🚫 Mensagem apagada</p>';
            w.appendChild(c); box.appendChild(w); return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
        if (sameAsPrev) wrapper.classList.add('grouped-msg');

        const card = document.createElement('div');
        card.className = `message ${isSent ? 'sent' : 'received'}`;
        if (isSent) {
            if (sameAsPrev && sameAsNext) card.classList.add('bubble-mid-sent');
            else if (sameAsPrev) card.classList.add('bubble-last-sent');
            else if (sameAsNext) card.classList.add('bubble-first-sent');
        } else {
            if (sameAsPrev && sameAsNext) card.classList.add('bubble-mid-received');
            else if (sameAsPrev) card.classList.add('bubble-last-received');
            else if (sameAsNext) card.classList.add('bubble-first-received');
        }

        let content = '';

        // Mostra nome do remetente nos grupos (exceto para mensagens próprias ou agrupadas)
        if (!isSent && !sameAsPrev) {
            content += `<span class="group-sender-name">${data.senderNickname || 'Usuário'}</span>`;
        }

        if (data.replyTo) {
            const who = data.replyTo.senderId === currentUser.uid ? 'Você' : data.replyTo.senderNickname || 'Usuário';
            content += `<div class="quoted-msg"><span>${who}</span>${data.replyTo.text || '📷 Mídia'}</div>`;
        }

        if (data.image) content += `<img src="${data.image}" class="message-img media-target">`;
        else if (data.video) content += `<video src="${data.video}" class="message-video media-target" controls></video>`;
        else if (data.audio) {
            const dur = data.audioDuration ? formatAudioTime(data.audioDuration) : '0:00';
            content += `<div class="audio-message-container">
                <button class="audio-play-btn" onclick="playAudioMessage('${data.audio}', this)">
                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <div class="audio-progress-bar-wrapper"><div class="audio-progress-bar-fill"></div></div>
                <span class="audio-duration-tag">${dur}</span>
            </div>`;
        }

        content += data.text ? `<p>${data.text}</p>` : '';
        if (data.edited) content += `<span class="edited-tag">Editada</span>`;
        const ticks = isSent ? buildGroupSeenIndicator(data, groupData) : '';
        card.innerHTML = content + ticks;

        // Long press abre menu de contexto simplificado para grupos
        applyLongPress(card, (e) => {
            card.classList.remove('pressing');
            openGroupContextMenu(data, card, wrapper, e);
        }, () => card.classList.add('pressing'), () => card.classList.remove('pressing'));

        // Swipe para responder no grupo
        const arrow2 = document.createElement('div');
        arrow2.className = 'reply-arrow';
        arrow2.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;"><path fill="currentColor" d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`;
        applyGroupSwipeToReply(wrapper, card, arrow2, data);

        if (isSent) { wrapper.appendChild(card); wrapper.appendChild(arrow2); }
        else        { wrapper.appendChild(arrow2); wrapper.appendChild(card); }
        box.appendChild(wrapper);
    });

    if (prevScrollBottom < 80) box.scrollTop = box.scrollHeight;
    bindMediaViewerEvents();
}

// ─── MENU DE CONTEXTO DO GRUPO ───────────────────────────────────────────────
function openGroupContextMenu(data, card, wrapper, event) {
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

    container.classList.toggle('align-right', isSent);
    container.classList.toggle('align-left',  !isSent);

    // Configura o reply do contexto para usar o grupo
    document.getElementById('ctx-reply-msg').onclick = () => {
        if (!data) return;
        groupReplyingTo = { id: data.id, text: data.text || '', senderId: data.senderId, senderNickname: data.senderNickname || 'Usuário' };
        document.getElementById('group-reply-bar-text').innerText = data.text || '📷 Mídia';
        document.getElementById('group-reply-bar').classList.remove('hidden');
        document.getElementById('group-message-input').focus();
        overlay.classList.add('hidden');
    };

    container.style.visibility = 'hidden';
    container.style.top  = '-9999px';
    container.style.left = '-9999px';

    requestAnimationFrame(() => {
        const rect  = card.getBoundingClientRect();
        const vpW   = window.innerWidth;
        const vpH   = window.innerHeight;
        const menuW = 240;
        const menuH = container.offsetHeight || 320;

        let leftX = isSent ? (rect.right - menuW) : rect.left;
        if (leftX < 10) leftX = 10;
        if (leftX + menuW > vpW - 10) leftX = vpW - menuW - 10;

        let topY;
        if (vpH - rect.bottom >= menuH + 16) topY = rect.bottom + 6;
        else if (rect.top >= menuH + 16) topY = rect.top - menuH - 6;
        else topY = rect.top + (rect.height / 2) - (menuH / 2);

        if (topY < 10) topY = 10;
        if (topY + menuH > vpH - 10) topY = vpH - menuH - 10;

        container.style.left = leftX + 'px';
        container.style.top  = topY + 'px';
        container.style.visibility = 'visible';
    });
}

// ─── SWIPE TO REPLY NO GRUPO ─────────────────────────────────────────────────
function applyGroupSwipeToReply(wrapper, card, arrow, msgData) {
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
            triggerGroupReplyAction(msgData);
        } else if (msgData.senderId !== currentUser.uid && diff >= threshold) {
            arrow.classList.add('bounce');
            triggerGroupReplyAction(msgData);
        }
        setTimeout(() => arrow.classList.remove('bounce', 'visible'), 300);
    });
}

function triggerGroupReplyAction(msgData) {
    groupReplyingTo = { id: msgData.id, text: msgData.text || '', senderId: msgData.senderId, senderNickname: msgData.senderNickname || 'Usuário' };
    document.getElementById('group-reply-bar-text').innerText = msgData.text || '📷 Mídia';
    document.getElementById('group-reply-bar').classList.remove('hidden');
    document.getElementById('group-message-input').focus();
}

// ─── ENVIAR MENSAGEM NO GRUPO ───────────────────────────────────────────────
const groupMsgInput = document.getElementById('group-message-input');
const btnGroupSend  = document.getElementById('btn-group-send');
const btnGroupMic   = document.getElementById('btn-group-mic');

groupMsgInput.addEventListener('input', () => {
    if (groupMsgInput.value.trim().length > 0) {
        btnGroupSend.classList.remove('hidden');
        btnGroupMic.classList.add('hidden');
    } else {
        btnGroupSend.classList.add('hidden');
        btnGroupMic.classList.remove('hidden');
    }
});

btnGroupSend.addEventListener('click', () => {
    const txt = groupMsgInput.value.trim();
    if (!txt || !activeGroupId) return;

    const cachedProfile = JSON.parse(localStorage.getItem(`profile_${currentUser.uid}`) || '{}');
    const ref = database.ref(`groups/${activeGroupId}/messages`).push();
    const payload = {
        id: ref.key, senderId: currentUser.uid,
        senderNickname: cachedProfile.nickname || 'Usuário',
        senderAvatar: cachedProfile.avatar || '',
        text: txt, timestamp: firebase.database.ServerValue.TIMESTAMP, status: 'sent'
    };
    if (groupReplyingTo) { payload.replyTo = groupReplyingTo; }

    groupMsgInput.value = '';
    btnGroupSend.classList.add('hidden');
    btnGroupMic.classList.remove('hidden');
    groupReplyingTo = null;
    document.getElementById('group-reply-bar').classList.add('hidden');

    ref.set(payload).then(() => {
        database.ref(`groups/${activeGroupId}`).update({ lastMessageTimestamp: firebase.database.ServerValue.TIMESTAMP });
    });
});

document.getElementById('btn-cancel-group-reply').addEventListener('click', () => {
    groupReplyingTo = null;
    document.getElementById('group-reply-bar').classList.add('hidden');
});

// Anexo no grupo — menu completo (Foto / Vídeo / Arquivo), igual ao chat individual
document.getElementById('btn-group-attach').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('group-attach-menu');
    menu.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    const menu = document.getElementById('group-attach-menu');
    if (!menu.classList.contains('hidden') && !e.target.closest('#group-attach-menu') && !e.target.closest('#btn-group-attach')) {
        menu.classList.add('hidden');
    }
});

document.getElementById('group-attach-image').addEventListener('click', () => {
    document.getElementById('group-attach-menu').classList.add('hidden');
    const input = document.getElementById('group-media-input');
    input.accept = 'image/*';
    input.click();
});

document.getElementById('group-attach-video').addEventListener('click', () => {
    document.getElementById('group-attach-menu').classList.add('hidden');
    const input = document.getElementById('group-media-input');
    input.accept = 'video/*';
    input.click();
});

document.getElementById('group-attach-doc').addEventListener('click', () => {
    document.getElementById('group-attach-menu').classList.add('hidden');
    document.getElementById('group-doc-input').click();
});

document.getElementById('group-media-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !activeGroupId) return;
    const isVideo    = file.type.startsWith('video/');
    const groupIdAtSend = activeGroupId;
    const cachedProfile = JSON.parse(localStorage.getItem(`profile_${currentUser.uid}`) || '{}');
    const ref = database.ref(`groups/${groupIdAtSend}/messages`).push();
    triggerSystemPopup(isVideo ? "Enviando vídeo..." : "Enviando imagem...", "Aguarde, isso pode levar alguns segundos.", DEFAULT_AVATAR);
    uploadBlobToStorage(file, 'group_media', file.name).then(url => {
        const payload = {
            id: ref.key, senderId: currentUser.uid,
            senderNickname: cachedProfile.nickname || 'Usuário',
            [isVideo ? 'video' : 'image']: url,
            timestamp: firebase.database.ServerValue.TIMESTAMP, status: 'sent'
        };
        return ref.set(payload).then(() => {
            database.ref(`groups/${groupIdAtSend}`).update({ lastMessageTimestamp: firebase.database.ServerValue.TIMESTAMP });
        });
    }).catch(err => alert('Falha ao enviar mídia: ' + err.message));
    e.target.value = '';
});

document.getElementById('group-doc-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !activeGroupId) return;
    const groupIdAtSend = activeGroupId;
    const cachedProfile = JSON.parse(localStorage.getItem(`profile_${currentUser.uid}`) || '{}');
    const ref = database.ref(`groups/${groupIdAtSend}/messages`).push();
    triggerSystemPopup("Enviando arquivo...", "Aguarde, isso pode levar alguns segundos.", DEFAULT_AVATAR);
    uploadBlobToStorage(file, 'group_docs', file.name).then(url => {
        const payload = {
            id: ref.key, senderId: currentUser.uid,
            senderNickname: cachedProfile.nickname || 'Usuário',
            document: url,
            documentName: file.name,
            documentSize: file.size,
            timestamp: firebase.database.ServerValue.TIMESTAMP, status: 'sent'
        };
        return ref.set(payload).then(() => {
            database.ref(`groups/${groupIdAtSend}`).update({ lastMessageTimestamp: firebase.database.ServerValue.TIMESTAMP });
        });
    }).catch(err => alert('Falha ao enviar arquivo: ' + err.message));
    e.target.value = '';
});

// ─── VOLTAR DO GRUPO ────────────────────────────────────────────────────────
function closeGroupRoom() {
    document.getElementById('group-room-screen').classList.add('hidden');
    if (activeGroupId) database.ref(`groups/${activeGroupId}/messages`).off();
    activeGroupId   = null;
    activeGroupData = null;
    activeGroupMembersProfiles = {};
    lastGroupMessagesSnap = null;
    document.querySelectorAll('.chat-item-row').forEach(el => el.classList.remove('active-desktop-chat'));
}

document.getElementById('btn-back-group').addEventListener('click', () => {
    closeGroupRoom();
    const emptyPanel = document.getElementById('empty-chat-panel');
    if (emptyPanel) emptyPanel.classList.remove('hidden');
});

// ─── INFO DO GRUPO ──────────────────────────────────────────────────────────
document.getElementById('btn-open-group-info').addEventListener('click', () => openGroupInfoSheet());
document.getElementById('btn-close-group-info').addEventListener('click', () => {
    document.getElementById('group-info-sheet').classList.add('hidden');
});

function openGroupInfoSheet() {
    if (!activeGroupId || !activeGroupData) return;
    const g = activeGroupData;
    document.getElementById('sheet-group-name').innerText = g.name || 'Grupo';
    document.getElementById('sheet-group-desc').innerText = g.description || '';
    document.getElementById('sheet-group-avatar').src = g.avatar || DEFAULT_AVATAR;

    const adminActions = document.getElementById('group-admin-actions');
    const canManage = isGroupAdmin(g) || isGroupOwner(g);
    adminActions.classList.toggle('hidden', !canManage);
    adminActions.style.display = canManage ? 'flex' : 'none';

    // Renderiza lista de membros
    const list = document.getElementById('sheet-group-members-list');
    list.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:12px;">Carregando membros...</div>';

    if (!g.members) { list.innerHTML = ''; return; }

    const memberUids = Object.keys(g.members);
    list.innerHTML = '';
    let loaded = 0;
    const memberEls = new Array(memberUids.length);

    memberUids.forEach((uid, idx) => {
        database.ref(`users/${uid}`).once('value', snap => {
            const u = snap.val() || { nickname: 'Usuário', avatar: '', username: '' };
            const isOwner = g.ownerUid === uid;
            const isAdmin = g.admins && g.admins[uid];
            const tag = isOwner ? `<span class="member-role-tag owner-tag header-badge">Dono</span>`
                      : isAdmin ? `<span class="member-role-tag admin-tag header-badge">Admin</span>`
                      : '';

            const row = document.createElement('div');
            row.className = 'chat-item-row';
            row.style.padding = '8px 4px';
            row.style.cursor = 'pointer';
            row.innerHTML = `
                <img src="${u.avatar || DEFAULT_AVATAR}" alt="" style="width:38px;height:38px;border-radius:50%;object-fit:cover;">
                <div class="chat-item-info">
                    <div class="chat-item-header"><h4>${u.nickname || 'Usuário'}</h4>${tag}</div>
                    <p>${u.username || ''}</p>
                </div>
                ${canManage && !isOwner && uid !== currentUser.uid ? `
                <div style="display:flex;flex-direction:column;gap:4px;margin-left:auto;">
                    <button onclick="event.stopPropagation();toggleGroupAdmin('${uid}','${isAdmin}')" style="font-size:10px;padding:3px 7px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;">
                        ${isAdmin ? 'Remover Admin' : 'Tornar Admin'}
                    </button>
                    <button onclick="event.stopPropagation();removeGroupMember('${uid}')" style="font-size:10px;padding:3px 7px;border-radius:8px;border:none;background:rgba(255,59,48,0.2);color:#ff3b30;cursor:pointer;">Remover</button>
                </div>` : ''}
            `;
            // Clicar no membro abre o perfil dele
            row.addEventListener('click', () => showGroupMemberProfile(uid, u));
            memberEls[idx] = row;
            loaded++;
            if (loaded === memberUids.length) {
                memberEls.forEach(el => { if (el) list.appendChild(el); });
            }
        });
    });

    document.getElementById('group-info-sheet').classList.remove('hidden');
}

// ─── VER PERFIL DE MEMBRO DO GRUPO ──────────────────────────────────────────
function showGroupMemberProfile(uid, cachedData) {
    // Reutiliza o sheet de contato, mas fecha o grupo-info primeiro
    document.getElementById('group-info-sheet').classList.add('hidden');
    
    const showProfile = (data) => {
        document.getElementById('sheet-contact-nick').innerText = data.nickname || 'Usuário';
        document.getElementById('sheet-contact-user').innerText = data.username || '@user';
        document.getElementById('sheet-contact-bio').innerText  = data.bio || 'Sem bio disponível.';
        document.getElementById('sheet-contact-status').innerText = data.wlstwrus || 'Disponível';
        document.getElementById('sheet-contact-avatar').src = data.avatar || DEFAULT_AVATAR;
        
        const sheetBadge = document.getElementById('sheet-blocked-badge');
        const btnBlock   = document.getElementById('btn-sheet-block');
        const btnUnblock = document.getElementById('btn-sheet-unblock');
        
        if (uid === currentUser.uid) {
            // próprio usuário — esconde bloquear/desbloquear
            sheetBadge && sheetBadge.classList.add('hidden');
            btnBlock   && btnBlock.classList.add('hidden');
            btnUnblock && btnUnblock.classList.add('hidden');
        } else {
            if (isBlocked(uid)) {
                sheetBadge && sheetBadge.classList.remove('hidden');
                btnBlock   && btnBlock.classList.add('hidden');
                btnUnblock && btnUnblock.classList.remove('hidden');
            } else {
                sheetBadge && sheetBadge.classList.add('hidden');
                btnBlock   && btnBlock.classList.remove('hidden');
                btnUnblock && btnUnblock.classList.add('hidden');
            }
        }
        
        // Salva o uid como "activeRecipientId temporário" para bloquear/desbloquear funcionar
        activeRecipientId = uid;
        document.getElementById('contact-info-sheet').classList.remove('hidden');
    };
    
    if (cachedData && cachedData.nickname) {
        showProfile(cachedData);
    } else {
        database.ref(`users/${uid}`).once('value', snap => {
            const data = snap.val();
            if (data) showProfile(data);
        });
    }
}

function toggleGroupAdmin(uid, currentlyAdmin) {
    if (!activeGroupId) return;
    const ref = database.ref(`groups/${activeGroupId}/admins/${uid}`);
    if (currentlyAdmin === 'true' || currentlyAdmin === true) {
        ref.remove();
    } else {
        ref.set(true);
    }
    // Recarrega info
    database.ref(`groups/${activeGroupId}`).once('value', s => {
        activeGroupData = s.val();
        openGroupInfoSheet();
    });
}

function removeGroupMember(uid) {
    if (!activeGroupId) return;
    if (!confirm('Remover este membro do grupo?')) return;
    const updates = {};
    updates[`groups/${activeGroupId}/members/${uid}`] = null;
    updates[`groups/${activeGroupId}/admins/${uid}`]  = null;
    database.ref().update(updates).then(() => {
        database.ref(`groups/${activeGroupId}`).once('value', s => {
            activeGroupData = s.val();
            openGroupInfoSheet();
        });
    });
}

// ─── SAIR DO GRUPO ──────────────────────────────────────────────────────────
document.getElementById('btn-leave-group').addEventListener('click', () => {
    if (!activeGroupId) return;
    if (activeGroupData && activeGroupData.isMainGroup) {
        alert('Você não pode sair do grupo oficial do ChatBuddy.');
        return;
    }
    if (!confirm('Sair deste grupo?')) return;
    const updates = {};
    updates[`groups/${activeGroupId}/members/${currentUser.uid}`] = null;
    updates[`groups/${activeGroupId}/admins/${currentUser.uid}`]  = null;
    database.ref().update(updates).then(() => {
        document.getElementById('group-info-sheet').classList.add('hidden');
        document.getElementById('group-room-screen').classList.add('hidden');
        activeGroupId = null; activeGroupData = null;
        loadGroupsList();
    });
});

// ─── EDITAR GRUPO (nome, descrição, foto) — apenas admin/dono ──────────────
let editGroupAvatarBase64 = '';
document.getElementById('btn-edit-group').addEventListener('click', () => {
    if (!activeGroupData || !(isGroupAdmin(activeGroupData) || isGroupOwner(activeGroupData))) return;
    editGroupAvatarBase64 = '';
    document.getElementById('edit-group-name-input').value = activeGroupData.name || '';
    document.getElementById('edit-group-desc-input').value = activeGroupData.description || '';
    document.getElementById('edit-group-avatar-preview').src = activeGroupData.avatar || DEFAULT_AVATAR;
    document.getElementById('edit-group-modal').classList.remove('hidden');
});

document.getElementById('btn-close-edit-group').addEventListener('click', () => {
    document.getElementById('edit-group-modal').classList.add('hidden');
});

document.getElementById('edit-group-avatar-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        editGroupAvatarBase64 = ev.target.result;
        document.getElementById('edit-group-avatar-preview').src = editGroupAvatarBase64;
    };
    reader.readAsDataURL(file);
});

document.getElementById('btn-save-edit-group').addEventListener('click', () => {
    const name = document.getElementById('edit-group-name-input').value.trim();
    const desc = document.getElementById('edit-group-desc-input').value.trim();
    if (!name) return alert('O grupo precisa de um nome.');
    if (!activeGroupId) return;

    const btn = document.getElementById('btn-save-edit-group');
    btn.disabled = true; btn.innerText = 'Salvando...';

    const updates = { name, description: desc };
    if (editGroupAvatarBase64) updates.avatar = editGroupAvatarBase64;

    database.ref(`groups/${activeGroupId}`).update(updates)
        .then(() => {
            activeGroupData = { ...activeGroupData, ...updates };
            document.getElementById('edit-group-modal').classList.add('hidden');
            btn.disabled = false; btn.innerText = 'Salvar Alterações';
            openGroupInfoSheet();
        })
        .catch(err => {
            btn.disabled = false; btn.innerText = 'Salvar Alterações';
            alert('Erro ao salvar: ' + err.message);
        });
});

// ─── ADICIONAR MEMBRO AO GRUPO ──────────────────────────────────────────────
document.getElementById('btn-add-group-member').addEventListener('click', () => {
    document.getElementById('add-member-modal').classList.remove('hidden');
    document.getElementById('add-member-search').value = '';
    document.getElementById('add-member-results').innerHTML = '';
});

document.getElementById('btn-close-add-member').addEventListener('click', () => {
    document.getElementById('add-member-modal').classList.add('hidden');
});

let _addMemberDebounce = null;
document.getElementById('add-member-search').addEventListener('input', () => {
    clearTimeout(_addMemberDebounce);
    _addMemberDebounce = setTimeout(() => {
        const raw = document.getElementById('add-member-search').value.trim().toLowerCase().replace(/^@/, '');
        const term = raw ? '@' + raw : '';
        const results = document.getElementById('add-member-results');
        results.innerHTML = '';
        if (term.length < 4) {
            results.innerHTML = '<div class="empty-state" style="font-size:12px;padding:10px;">Digite pelo menos 3 letras</div>';
            return;
        }
        database.ref('users').once('value', snap => {
            let count = 0;
            snap.forEach(child => {
                const u = child.val();
                if (!u || u.uid === currentUser.uid) return;
                if (activeGroupData && activeGroupData.members && activeGroupData.members[u.uid]) return;
                if ((u.username || '').toLowerCase().includes(term)) {
                    count++;
                    const row = document.createElement('div');
                    row.className = 'chat-item-row';
                    row.innerHTML = `
                        <img src="${u.avatar || ''}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                        <div class="chat-item-info"><h4>${u.nickname}</h4><p>${u.username}</p></div>
                        <button style="margin-left:auto;font-size:12px;padding:5px 10px;border-radius:10px;border:none;background:#0a84ff;color:#fff;cursor:pointer;">Adicionar</button>
                    `;
                    row.querySelector('button').addEventListener('click', () => {
                        database.ref(`groups/${activeGroupId}/members/${u.uid}`).set(true).then(() => {
                            document.getElementById('add-member-modal').classList.add('hidden');
                            database.ref(`groups/${activeGroupId}`).once('value', s => {
                                activeGroupData = s.val();
                                const mc = activeGroupData.members ? Object.keys(activeGroupData.members).length : 0;
                                document.getElementById('active-group-members-count').innerText = `${mc} membros`;
                                openGroupInfoSheet();
                            });
                        });
                    });
                    results.appendChild(row);
                }
            });
            if (count === 0) results.innerHTML = '<div class="empty-state" style="font-size:12px;padding:10px;">Nenhum usuário encontrado.</div>';
        });
    }, 300);
});

// ─── CRIAR GRUPO ────────────────────────────────────────────────────────────
const selectedGroupMembers = new Map(); // uid -> userData
let groupAvatarBase64 = '';

document.getElementById('btn-new-group').addEventListener('click', () => {
    selectedGroupMembers.clear();
    groupAvatarBase64 = '';
    document.getElementById('group-name-input').value = '';
    document.getElementById('group-desc-input').value = '';
    document.getElementById('group-member-search').value = '';
    document.getElementById('group-member-results').innerHTML = '';
    document.getElementById('group-selected-members').innerHTML = '';
    document.getElementById('group-avatar-preview').classList.add('hidden');
    document.getElementById('group-avatar-placeholder').style.display = 'flex';
    document.getElementById('create-group-modal').classList.remove('hidden');
});

document.getElementById('btn-close-create-group').addEventListener('click', () => {
    document.getElementById('create-group-modal').classList.add('hidden');
});

document.getElementById('group-avatar-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        groupAvatarBase64 = ev.target.result;
        const img = document.getElementById('group-avatar-preview');
        img.src = groupAvatarBase64;
        img.classList.remove('hidden');
        document.getElementById('group-avatar-placeholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
});

let _groupMemberSearchDebounce = null;
document.getElementById('group-member-search').addEventListener('input', () => {
    clearTimeout(_groupMemberSearchDebounce);
    _groupMemberSearchDebounce = setTimeout(() => {
        const raw = document.getElementById('group-member-search').value.trim().toLowerCase().replace(/^@/, '');
        const term = raw ? '@' + raw : '';
        const results = document.getElementById('group-member-results');
        results.innerHTML = '';
        if (term.length < 4) return;

        database.ref('users').once('value', snap => {
            const seen = new Set();
            snap.forEach(child => {
                const u = child.val();
                if (!u || u.uid === currentUser.uid || seen.has(u.uid)) return;
                if (selectedGroupMembers.has(u.uid)) return;
                seen.add(u.uid);
                if ((u.username || '').toLowerCase().includes(term)) {
                    const row = document.createElement('div');
                    row.className = 'chat-item-row';
                    row.innerHTML = `
                        <img src="${u.avatar || ''}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                        <div class="chat-item-info"><h4>${u.nickname}</h4><p>${u.username}</p></div>
                        <button style="margin-left:auto;font-size:12px;padding:5px 10px;border-radius:10px;border:none;background:#0a84ff;color:#fff;cursor:pointer;">+</button>
                    `;
                    row.querySelector('button').addEventListener('click', () => {
                        selectedGroupMembers.set(u.uid, u);
                        updateSelectedMembersDisplay();
                        results.innerHTML = '';
                        document.getElementById('group-member-search').value = '';
                    });
                    results.appendChild(row);
                }
            });
        });
    }, 300);
});

function updateSelectedMembersDisplay() {
    const container = document.getElementById('group-selected-members');
    container.innerHTML = '';
    selectedGroupMembers.forEach((u, uid) => {
        const chip = document.createElement('div');
        chip.style.cssText = 'display:flex;align-items:center;gap:4px;background:rgba(10,132,255,0.2);border:1px solid rgba(10,132,255,0.4);border-radius:16px;padding:3px 8px 3px 4px;font-size:12px;';
        chip.innerHTML = `
            <img src="${u.avatar || ''}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">
            <span>${u.nickname}</span>
            <span data-uid="${uid}" style="cursor:pointer;opacity:0.6;margin-left:2px;">✕</span>
        `;
        chip.querySelector('span[data-uid]').addEventListener('click', () => {
            selectedGroupMembers.delete(uid);
            updateSelectedMembersDisplay();
        });
        container.appendChild(chip);
    });
}

document.getElementById('btn-confirm-create-group').addEventListener('click', () => {
    const name = document.getElementById('group-name-input').value.trim();
    if (!name) return alert('Digite o nome do grupo.');

    const cachedProfile = JSON.parse(localStorage.getItem(`profile_${currentUser.uid}`) || '{}');
    const members = { [currentUser.uid]: true };
    selectedGroupMembers.forEach((u, uid) => { members[uid] = true; });

    const ref = database.ref('groups').push();
    const payload = {
        id: ref.key,
        name: name,
        description: document.getElementById('group-desc-input').value.trim(),
        avatar: groupAvatarBase64 || DEFAULT_AVATAR,
        isMainGroup: false,
        onlyAdminsCanSend: false,
        ownerUid: currentUser.uid,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        members: members,
        admins: { [currentUser.uid]: true }
    };

    ref.set(payload).then(() => {
        document.getElementById('create-group-modal').classList.add('hidden');
        switchMainTab('groups');
        loadGroupsList();
        triggerSystemPopup('Grupo criado!', `"${name}" foi criado com sucesso.`, payload.avatar);
    });
});
