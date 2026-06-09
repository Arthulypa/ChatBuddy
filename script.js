// CONFIGURAÇÃO DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDwW6LoRrGTJqXdYkbhv-0srz7VKKfyH4", 
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

// Elementos Mapeados
const loginPage = document.getElementById('login-page');
const registerPage = document.getElementById('register-page');
const verificationPage = document.getElementById('verification-page');
const profilePage = document.getElementById('profile-page');
const chatPage = document.getElementById('chat-page');

// Elementos de Verificação/Segurança
const emailCodeInput = document.getElementById('email-code-input');
const pin2Input = document.getElementById('pin2-input');
const btnVerifySubmit = document.getElementById('btn-verify-submit');
const emailVerifyGroup = document.getElementById('email-verify-group');
const pin2VerifyGroup = document.getElementById('pin2-verify-group');
const verificationDesc = document.getElementById('verification-desc');

// Modais e Botões de Ação
const btnOpenSettings = document.getElementById('btn-open-settings');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const toggle2FA = document.getElementById('toggle-2fa');
const pinSetupGroup = document.getElementById('pin-setup-group');
const newPin2 = document.getElementById('new-pin2');
const btnSavePin = document.getElementById('btn-save-pin');
const btnBlockUser = document.getElementById('btn-block-user');
const blockedBadge = document.getElementById('blocked-badge');

// Menu de Contexto
const messageContextMenu = document.getElementById('message-context-menu');
const ctxEdit = document.getElementById('ctx-edit');
const ctxDeleteForMe = document.getElementById('ctx-delete-for-me');
const ctxDeleteForAll = document.getElementById('ctx-delete-for-all');

const btnToRegister = document.getElementById('btn-to-register');
const btnToLogin = document.getElementById('btn-to-login');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnGoogleLogin = document.getElementById('btn-google-login');
const btnGoogleReg = document.getElementById('btn-google-reg');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnSendMessage = document.getElementById('btn-send');
const btnLogout = document.getElementById('btn-logout');
const btnOpenNewChat = document.getElementById('btn-new-chat');
const btnCloseModal = document.getElementById('btn-close-modal');

const emailLoginInput = document.getElementById('email-login');
const passwordLoginInput = document.getElementById('password-login');
const emailRegInput = document.getElementById('email-reg');
const passwordRegInput = document.getElementById('password-reg');
const displayNameInput = document.getElementById('display-name');
const usernameInput = document.getElementById('username');
const messageInput = document.getElementById('message-input');

const currentUserNameHTML = document.getElementById('current-user-name');
const currentUserTagHTML = document.getElementById('current-user-tag');
const activeChatNameHTML = document.getElementById('active-chat-name');
const activeChatStatusHTML = document.getElementById('active-chat-status');

const chatsListContainer = document.getElementById('chats-list');
const messagesContainer = document.getElementById('messages-container');
const contactsModal = document.getElementById('contacts-modal');
const contactsListContainer = document.getElementById('contacts-list');

let currentUser = null;
let activeChatId = null;
let activeRecipientId = null;
let selectedMessageId = null;
let tempVerificationCode = null;
let pendingUserCredentials = null;

// Sistema de Navegação
function showPage(page) {
    const pages = [loginPage, registerPage, verificationPage, profilePage, chatPage];
    pages.forEach(p => { if(p) p.classList.add('hidden'); });
    if(page) page.classList.remove('hidden');
}

if(btnToRegister) btnToRegister.addEventListener('click', () => showPage(registerPage));
if(btnToLogin) btnToLogin.addEventListener('click', () => showPage(loginPage));

// Monitoramento da Sessão do Firebase
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    database.ref('users/' + user.uid).once('value').then(snapshot => {
      if (snapshot.exists() && snapshot.val().username) {
         // Checa se tem 2FA ativo
         if(snapshot.val().pin2Active) {
             solicitarPin2();
         } else {
             loadChatSystem();
         }
      } else {
        showPage(profilePage);
      }
    });
  } else {
    currentUser = null;
    showPage(loginPage);
  }
});

// Registro por Email com Simulação de Envio de Código Segura
if(btnRegister) {
  btnRegister.addEventListener('click', () => {
    const email = emailRegInput.value.trim();
    const password = passwordRegInput.value.trim();
    if(!email || !password) return alert('Preencha os campos!');
    
    // Gerar código de 6 dígitos aleatório
    tempVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    pendingUserCredentials = { email, password, action: 'register' };
    
    alert(`[Simulação SMS/Email] Código de verificação enviado para ${email}: ${tempVerificationCode}`);
    
    verificationDesc.innerText = `Enviamos uma chave de acesso para o endereço ${email}.`;
    emailVerifyGroup.classList.remove('hidden');
    pin2VerifyGroup.classList.add('hidden');
    showPage(verificationPage);
  });
}

// Login por Email
if(btnLogin) {
  btnLogin.addEventListener('click', () => {
    const email = emailLoginInput.value.trim();
    const password = passwordLoginInput.value.trim();
    if(!email || !password) return alert('Preencha os campos!');
    
    pendingUserCredentials = { email, password, action: 'login' };
    auth.signInWithEmailAndPassword(email, password)
      .catch(error => alert('Erro: ' + error.message));
  });
}

// Submissão do código de verificação
if(btnVerifySubmit) {
    btnVerifySubmit.addEventListener('click', () => {
        // Modo Verificação de E-mail Cadastro
        if(pendingUserCredentials && pendingUserCredentials.action === 'register') {
            if(emailCodeInput.value.trim() === tempVerificationCode) {
                auth.createUserWithEmailAndPassword(pendingUserCredentials.email, pendingUserCredentials.password)
                    .catch(error => alert(error.message));
            } else {
                alert('Código incorreto!');
            }
        } 
        // Modo login PIN 2 Etapas
        else {
            database.ref('users/' + currentUser.uid + '/pin2').once('value').then(snap => {
                if(snap.val() === pin2Input.value.trim()) {
                    loadChatSystem();
                } else {
                    alert('Código PIN Inválido!');
                }
            });
        }
    });
}

function solicitarPin2() {
    verificationDesc.innerText = "Sua conta possui verificação de duas etapas ativada.";
    emailVerifyGroup.classList.add('hidden');
    pin2VerifyGroup.classList.remove('hidden');
    showPage(verificationPage);
}

// Login com Google
function loginComGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(e => alert(e.message));
}
if(btnGoogleLogin) btnGoogleLogin.addEventListener('click', loginComGoogle);
if(btnGoogleReg) btnGoogleReg.addEventListener('click', loginComGoogle);

// Salvar Perfil
if(btnSaveProfile) {
  btnSaveProfile.addEventListener('click', () => {
    const displayName = displayNameInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase().replace(/\s+/g, '');
    if(!displayName || !username) return alert('Preencha os dados!');
    
    database.ref('usernames/' + username).once('value').then(snapshot => {
      if(snapshot.exists() && snapshot.val() !== currentUser.uid) {
        alert('Nome de usuário em uso!');
      } else {
        database.ref('users/' + currentUser.uid).update({
          uid: currentUser.uid,
          displayName: displayName,
          username: username,
          status: 'Online'
        });
        database.ref('usernames/' + username).set(currentUser.uid);
        loadChatSystem();
      }
    });
  });
}

if(btnLogout) {
  btnLogout.addEventListener('click', () => {
    if(currentUser) database.ref('users/' + currentUser.uid).update({ status: 'Offline' });
    auth.signOut();
  });
}

function loadChatSystem() {
  showPage(chatPage);
  database.ref('users/' + currentUser.uid).update({ status: 'Online' });
  listenToMyChats();
}

// Configurações e 2FA
if(btnOpenSettings) btnOpenSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
if(btnCloseSettings) btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));

if(toggle2FA) {
    toggle2FA.addEventListener('change', (e) => {
        if(e.target.checked) {
            pinSetupGroup.classList.remove('hidden');
        } else {
            database.ref('users/' + currentUser.uid).update({ pin2Active: false, pin2: null });
            pinSetupGroup.classList.add('hidden');
            alert('Verificação em duas etapas desligada.');
        }
    });
}

if(btnSavePin) {
    btnSavePin.addEventListener('click', () => {
        const pin = newPin2.value.trim();
        if(pin.length < 6) return alert('O PIN precisa ter 6 números!');
        database.ref('users/' + currentUser.uid).update({
            pin2Active: true,
            pin2: pin
        });
        alert('PIN de verificação configurado com sucesso!');
        pinSetupGroup.classList.add('hidden');
    });
}

// Sistema de Bloqueio de Usuários
if(btnBlockUser) {
    btnBlockUser.addEventListener('click', () => {
        if(!activeRecipientId) return;
        const ref = database.ref(`users/${currentUser.uid}/blocked/${activeRecipientId}`);
        ref.once('value').then(snap => {
            if(snap.exists()) {
                ref.remove();
                btnBlockUser.innerText = "Bloquear Usuário";
                btnBlockUser.classList.remove('blocked-active');
                blockedBadge.classList.add('hidden');
            } else {
                ref.set(true);
                btnBlockUser.innerText = "Desbloquear";
                btnBlockUser.classList.add('blocked-active');
                blockedBadge.classList.remove('hidden');
            }
        });
    });
}

function verificarStatusBloqueio(recipientId) {
    database.ref(`users/${currentUser.uid}/blocked/${recipientId}`).on('value', snap => {
        if(snap.exists()) {
            blockedBadge.classList.remove('hidden');
            btnBlockUser.innerText = "Desbloquear";
            btnBlockUser.classList.add('blocked-active');
        } else {
            blockedBadge.classList.add('hidden');
            btnBlockUser.innerText = "Bloquear Usuário";
            btnBlockUser.classList.remove('blocked-active');
        }
    });
}

if(btnOpenNewChat) btnOpenNewChat.addEventListener('click', () => { contactsModal.classList.remove('hidden'); loadContactsList(); });
if(btnCloseModal) btnCloseModal.addEventListener('click', () => contactsModal.classList.add('hidden'));

function loadContactsList() {
  database.ref('users').once('value', snapshot => {
    if(!contactsListContainer) return;
    contactsListContainer.innerHTML = '';
    snapshot.forEach(childSnapshot => {
      const user = childSnapshot.val();
      if(user.uid !== currentUser.uid) {
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.innerHTML = `
          <div class="avatar">${user.displayName ? user.displayName.charAt(0).toUpperCase() : '?'}</div>
          <div class="chat-item-details"><p class="name">${user.displayName}</p><p class="preview">@${user.username}</p></div>
        `;
        item.onclick = () => startConversaCom(user.uid, user.displayName);
        contactsListContainer.appendChild(item);
      }
    });
  });
}

function startConversaCom(recipientId, recipientName) {
  contactsModal.classList.add('hidden');
  const chatId = currentUser.uid < recipientId ? `${currentUser.uid}_${recipientId}` : `${recipientId}_${currentUser.uid}`;
  database.ref(`users/${currentUser.uid}/my_chats/${chatId}`).set({ recipientId: recipientId });
  database.ref(`users/${recipientId}/my_chats/${chatId}`).set({ recipientId: currentUser.uid });
  openChatRoom(chatId, recipientName, recipientId);
}

function listenToMyChats() {
  database.ref(`users/${currentUser.uid}/my_chats`).on('value', snapshot => {
    if(!chatsListContainer) return;
    chatsListContainer.innerHTML = '';
    snapshot.forEach(childSnapshot => {
      const chatId = childSnapshot.key;
      const chatData = childSnapshot.val();
      database.ref(`users/${chatData.recipientId}`).once('value', userSnap => {
        const user = userSnap.val();
        if(user) {
          const chatItem = document.createElement('div');
          chatItem.className = `chat-item ${activeChatId === chatId ? 'active' : ''}`;
          chatItem.innerHTML = `
            <div class="avatar">${user.displayName ? user.displayName.charAt(0).toUpperCase() : '?'}</div>
            <div class="chat-item-details"><p class="name">${user.displayName}</p><p class="preview">Canal pronto...</p></div>
          `;
          chatItem.onclick = () => openChatRoom(chatId, user.displayName, user.uid);
          chatsListContainer.appendChild(chatItem);
        }
      });
    });
  });
}

function openChatRoom(chatId, recipientName, recipientId) {
  activeChatId = chatId;
  activeRecipientId = recipientId;
  btnBlockUser.classList.remove('hidden');
  if(activeChatNameHTML) activeChatNameHTML.innerText = recipientName;
  
  verificarStatusBloqueio(recipientId);

  database.ref(`chats/${chatId}/messages`).off();
  database.ref(`chats/${chatId}/messages`).on('value', snapshot => {
    if(!messagesContainer) return;
    messagesContainer.innerHTML = '';
    snapshot.forEach(childSnapshot => {
      const msg = childSnapshot.val();
      const msgId = childSnapshot.key;
      
      // Lógica de Apagar para Mim local
      if(msg.deletedFor && msg.deletedFor[currentUser.uid]) return;

      const msgElement = document.createElement('div');
      msgElement.className = `message ${msg.senderId === currentUser.uid ? 'sent' : 'received'}`;
      
      if(msg.isDeleted) {
        msgElement.innerHTML = `<p class="deleted-text"><em>🗑️ Esta mensagem foi apagada</em></p>`;
      } else {
        let reactionContent = '';
        if(msg.reactions) {
            const emojis = Object.values(msg.reactions).join('');
            if(emojis.length > 0) reactionContent = `<div class="reactions-badge">${emojis}</div>`;
        }

        msgElement.innerHTML = `
          <p class="text-content">${msg.text}</p>
          <span class="time-stamp">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          ${reactionContent}
        `;
        
        // EVENTO LONG PRESS (SEGURAR TOUCH / CLIQUES LONGO)
        let pressTimer;
        const startPress = (e) => {
            pressTimer = setTimeout(() => openContextMenu(e, msgId, msg.senderId), 600);
        };
        const endPress = () => clearTimeout(pressTimer);

        msgElement.addEventListener('mousedown', startPress);
        msgElement.addEventListener('mouseup', endPress);
        msgElement.addEventListener('touchstart', startPress, {passive: true});
        msgElement.addEventListener('touchend', endPress);
        // Suporte para clique direito convencional no PC
        msgElement.addEventListener('contextmenu', (e) => { e.preventDefault(); openContextMenu(e, msgId, msg.senderId); });
      }
      messagesContainer.appendChild(msgElement);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

// Menu de Contexto Dinâmico (Estilo WhatsApp)
function openContextMenu(e) {
    // Interromper se o clique disparou via toque ou coordenadas de mouse
    let posX = e.clientX || (e.touches && e.touches[0].clientX);
    let posY = e.clientY || (e.touches && e.touches[0].clientY);
    
    selectedMessageId = arguments[1];
    const senderId = arguments[2];

    messageContextMenu.style.top = `${posY}px`;
    messageContextMenu.style.left = `${posX}px`;
    messageContextMenu.classList.remove('hidden');

    // Regra WhatsApp solicitada: se for minha, mostra apagar para todos
    if(senderId === currentUser.uid) {
        ctxDeleteForAll.classList.remove('hidden');
        ctxEdit.classList.remove('hidden');
    } else {
        ctxDeleteForAll.classList.add('hidden');
        ctxEdit.classList.add('hidden');
    }
}

// Fechar menus ao clicar fora
document.addEventListener('click', (e) => {
    if(!messageContextMenu.contains(e.target)) messageContextMenu.classList.add('hidden');
});

// Ações do Menu de Contexto
ctxDeleteForMe.addEventListener('click', () => {
    if(!activeChatId || !selectedMessageId) return;
    database.ref(`chats/${activeChatId}/messages/${selectedMessageId}/deletedFor/${currentUser.uid}`).set(true);
});

ctxDeleteForAll.addEventListener('click', () => {
    if(!activeChatId || !selectedMessageId) return;
    database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).update({ isDeleted: true });
});

ctxEdit.addEventListener('click', () => {
    const novoTexto = prompt("Edite sua mensagem:");
    if(!novoTexto || !activeChatId || !selectedMessageId) return;
    database.ref(`chats/${activeChatId}/messages/${selectedMessageId}`).update({ text: novoTexto + " (editada)" });
});

// Sistema de Reações do Menu
document.querySelectorAll('.react-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const emoji = e.target.innerText;
        if(!activeChatId || !selectedMessageId) return;
        database.ref(`chats/${activeChatId}/messages/${selectedMessageId}/reactions/${currentUser.uid}`).set(emoji);
    });
});

function sendMessage() {
  if(!messageInput || !activeChatId) return;
  
  // Impede envio se estiver bloqueado
  database.ref(`users/${currentUser.uid}/blocked/${activeRecipientId}`).once('value').then(snap => {
      if(snap.exists()) return alert('Você bloqueou este contato. Desbloqueie para transmitir dados.');
      
      const text = messageInput.value.trim();
      if(!text) return;
      const msgRef = database.ref(`chats/${activeChatId}/messages`).push();
      msgRef.set({
        senderId: currentUser.uid,
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        isDeleted: false
      });
      messageInput.value = '';
  });
}

if(btnSendMessage) btnSendMessage.addEventListener('click', sendMessage);
if(messageInput) messageInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });

showPage(loginPage);
                                              
