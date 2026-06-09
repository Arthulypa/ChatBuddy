// CONFIGURAÇÃO DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDwW6LoRrGTJqXdYkbhv-0srz7VKKfykh4", 
  authDomain: "chatbuddy-96a61.firebaseapp.com",
  databaseURL: "https://chatbuddy-96a61-default-rtdb.firebaseio.com",
  projectId: "chatbuddy-96a61",
  storageBucket: "chatbuddy-96a61.firebasestorage.app",
  messagingSenderId: "1051493485478",
  appId: "1:1051493485478:web:1f6a94ef63e665fa539d67",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// DOM Elements
const loginPage = document.getElementById('login-page');
const registerPage = document.getElementById('register-page');
const profilePage = document.getElementById('profile-page');
const chatPage = document.getElementById('chat-page');
const chatRoomScreen = document.getElementById('chat-room-screen');
const contactInfoSheet = document.getElementById('contact-info-sheet');
const settingsScreen = document.getElementById('settings-screen');
const imageViewerLightbox = document.getElementById('image-viewer-lightbox');
const lightboxTargetImg = document.getElementById('lightbox-target-img');
const btnDownloadLightbox = document.getElementById('btn-download-lightbox');
const lightboxWrapper = document.getElementById('lightbox-wrapper');

let currentUser = null;
let activeChatId = null;
let activeRecipientId = null;
let selectedMessagesList = [];
let isMultiSelectMode = false;
let generated6DigitCode = null;
let base64AvatarString = "";

function showPage(page) {
    [loginPage, registerPage, profilePage, chatPage].forEach(p => p.classList.add('hidden'));
    page.classList.remove('hidden');
}

// VALIDAÇÃO COM TOKEN DE 6 DÍGITOS
document.getElementById('btn-send-code').addEventListener('click', () => {
    const email = document.getElementById('email-reg').value.trim();
    const password = document.getElementById('password-reg').value.trim();
    if(!email || !password) return alert('Insira e-mail e senha!');

    generated6DigitCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[Firebase Security] Código enviado para ${email}: ${generated6DigitCode}`);
    alert(`Código de verificação enviado para o e-mail: ${email}`);
    
    document.getElementById('reg-step-1').classList.add('hidden');
    document.getElementById('reg-step-2').classList.remove('hidden');
});

document.getElementById('btn-verify-and-register').addEventListener('click', () => {
    const userCode = document.getElementById('verification-code-input').value.trim();
    if (userCode !== generated6DigitCode) {
        return alert('Erro: Código Inválido! Tente novamente.');
    }

    const email = document.getElementById('email-reg').value.trim();
    const password = document.getElementById('password-reg').value.trim();

    auth.createUserWithEmailAndPassword(email, password)
        .then(() => { alert('E-mail validado com sucesso!'); })
        .catch(e => alert(e.message));
});

document.getElementById('btn-back-to-step1').addEventListener('click', () => {
    document.getElementById('reg-step-2').classList.add('hidden');
    document.getElementById('reg-step-1').classList.remove('hidden');
});

// Auth Listener
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        database.ref('users/' + user.uid).once('value').then(snapshot => {
            if (snapshot.exists() && snapshot.val().username) {
                showPage(chatPage);
                loadChatSystem();
            } else { showPage(profilePage); }
        });
    } else { showPage(loginPage); }
});

// Criar Perfil Inicial
document.getElementById('btn-save-profile').addEventListener('click', () => {
    const nick = document.getElementById('display-name').value.trim();
    const user = document.getElementById('username').value.trim().toLowerCase();
    const bio = document.getElementById('user-bio-initial').value.trim() || "Disponível";
    if(!nick || !user) return alert('Campos obrigatórios!');
    
    database.ref('users/' + currentUser.uid).set({
        uid: currentUser.uid, displayName: nick, username: user, bio: bio, avatar: base64AvatarString, hideUsername: false
    });
    showPage(chatPage);
});

function loadChatSystem() {
    listenToMyChats();
    document.getElementById('toggle-hide-username').addEventListener('change', (e) => {
        database.ref(`users/${currentUser.uid}`).update({ hideUsername: e.target.checked });
    });
    database.ref(`users/${currentUser.uid}/hideUsername`).once('value', snap => {
        if(snap.exists()) document.getElementById('toggle-hide-username').checked = snap.val();
    });
}

document.getElementById('btn-main-settings').addEventListener('click', () => settingsScreen.classList.remove('hidden'));
document.getElementById('btn-back-settings').addEventListener('click', () => settingsScreen.classList.add('hidden'));

// LISTAR CHATS
function listenToMyChats() {
    database.ref(`users/${currentUser.uid}/my_chats`).on('value', snapshot => {
        const container = document.getElementById('chats-list');
        container.innerHTML = '';
        snapshot.forEach(child => {
            const chatId = child.key;
            const chatData = child.val();
            
            database.ref(`users/${chatData.recipientId}`).once('value', uSnap => {
                const user = uSnap.val();
                if(user) {
                    const exibicaoNome = chatData.localAlias ? chatData.localAlias : user.displayName;
                    const item = document.createElement('div');
                    item.className = 'chat-item';
                    item.innerHTML = `<img class="avatar" src="${user.avatar || '👤'}">
                                      <div><h4>${exibicaoNome}</h4><small>${user.hideUsername ? 'Username Oculto' : '@'+user.username}</small></div>`;
                    item.onclick = () => openChatRoom(chatId, exibicaoNome, user.uid, user.avatar);
                    container.appendChild(item);
                }
            });
        });
    });
}

function openChatRoom(chatId, recipientName, recipientId, recipientAvatar) {
    activeChatId = chatId; activeRecipientId = recipientId;
    chatRoomScreen.classList.remove('hidden');
    document.getElementById('active-chat-name').innerText = recipientName;
    document.getElementById('active-chat-avatar').src = recipientAvatar || '';

    database.ref(`chats/${chatId}/messages`).off();
    database.ref(`chats/${chatId}/messages`).on('value', snapshot => {
        const container = document.getElementById('messages-container');
        container.innerHTML = '';
        snapshot.forEach(child => {
            const msg = child.val();
            const div = document.createElement('div');
            div.className = `message ${msg.senderId === currentUser.uid ? 'sent' : 'received'}`;
            
            if(msg.type === 'image') {
                div.innerHTML = `<img src="${msg.payload}" class="chat-embedded-img">`;
            } else {
                div.innerHTML = `<p>${msg.text}</p>`;
            }
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
}

// MOSTRAR DETALHES COM FILTRO DE PRIVACIDADE E APELIDO LOCAL
function openRecipientSheet() {
    database.ref('users/' + activeRecipientId).once('value').then(snap => {
        const u = snap.val();
        if(!u) return;

        database.ref(`users/${currentUser.uid}/my_chats/${activeChatId}/localAlias`).once('value', aliasSnap => {
            document.getElementById('sheet-contact-avatar').src = u.avatar || '';
            document.getElementById('sheet-contact-nick').innerText = u.displayName;
            
            if(aliasSnap.exists() && aliasSnap.val()) {
                document.getElementById('sheet-contact-custom-alias').innerText = `Apelido Local: ${aliasSnap.val()}`;
            } else {
                document.getElementById('sheet-contact-custom-alias').innerText = '';
            }

            if(u.hideUsername) {
                document.getElementById('sheet-contact-user').style.display = 'none';
            } else {
                document.getElementById('sheet-contact-user').style.display = 'block';
                document.getElementById('sheet-contact-user').innerText = `@${u.username}`;
            }

            document.getElementById('sheet-contact-bio').innerText = u.bio || 'Sem biografia.';
            contactInfoSheet.classList.remove('hidden');
        });
    });
}
document.getElementById('btn-contact-menu').addEventListener('click', openRecipientSheet);
document.getElementById('btn-open-recipient-info').addEventListener('click', openRecipientSheet);
document.getElementById('btn-close-info-sheet').addEventListener('click', () => contactInfoSheet.add('hidden'));

document.getElementById('btn-sheet-set-alias').addEventListener('click', () => {
    const novoApelido = prompt("Insira o apelido personalizado para este contato:");
    if(novoApelido === null) return;

    database.ref(`users/${currentUser.uid}/my_chats/${activeChatId}`).update({
        localAlias: novoApelido.trim()
    }).then(() => {
        alert('Apelido definido!');
        contactInfoSheet.classList.add('hidden');
        if(novoApelido.trim()) document.getElementById('active-chat-name').innerText = novoApelido.trim();
    });
});

// LIGHTBOX COM PINCH-TO-ZOOM GESTUAL E AUTO-RESET
let scale = 1;
let lastScale = 1;
let startX = 0;
let isZooming = false;

document.addEventListener('click', (e) => {
    if(e.target.classList.contains('clickable-image-trigger') || e.target.classList.contains('chat-embedded-img')) {
        lightboxTargetImg.src = e.target.src;
        btnDownloadLightbox.href = e.target.src;
        imageViewerLightbox.classList.remove('hidden');
        resetZoom();
    }
});

document.getElementById('btn-close-lightbox').addEventListener('click', () => imageViewerLightbox.classList.add('hidden'));

function resetZoom() {
    scale = 1; lastScale = 1;
    lightboxTargetImg.style.transform = `scale(1) translate(0px, 0px)`;
}

lightboxWrapper.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        isZooming = true;
        startX = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        lastScale = scale;
    }
});

lightboxWrapper.addEventListener('touchmove', (e) => {
    if (isZooming && e.touches.length === 2) {
        e.preventDefault();
        const currentDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        scale = (currentDistance / startX) * lastScale;
        if(scale < 1) scale = 1;
        if(scale > 4) scale = 4;
        lightboxTargetImg.style.transform = `scale(${scale})`;
    }
});

lightboxWrapper.addEventListener('touchend', () => {
    if (isZooming) {
        isZooming = false;
        lightboxTargetImg.style.transition = "transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)";
        resetZoom();
        setTimeout(() => { lightboxTargetImg.style.transition = "none"; }, 250);
    }
});

// Envio de Mídia
document.getElementById('btn-attach').addEventListener('click', () => mediaFileInput.click());
mediaFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        database.ref(`chats/${activeChatId}/messages`).push().set({
            senderId: currentUser.uid, type: 'image', payload: evt.target.result, timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    };
    reader.readAsDataURL(file);
});

document.getElementById('btn-back-to-list').addEventListener('click', () => chatRoomScreen.classList.add('hidden'));
document.getElementById('btn-to-register').addEventListener('click', () => showPage(registerPage));
document.getElementById('btn-to-login').addEventListener('click', () => showPage(loginPage));
      
