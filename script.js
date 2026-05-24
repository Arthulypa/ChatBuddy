// CONFIGURAÇÃO DO FIREBASE (Suas credenciais oficiais)
const firebaseConfig = {
  apiKey: "AIzaSyDwW6loRrGTJqXdYkbhv-0srz7VKKfykh4",
  authDomain: "chatbuddy-96a61.firebaseapp.com",
  databaseURL: "https://chatbuddy-96a61-default-rtdb.firebaseio.com",
  projectId: "chatbuddy-96a61",
  storageBucket: "chatbuddy-96a61.firebasestorage.app",
  messagingSenderId: "1051493485478",
  appId: "1:1051493485478:web:1f6a94ef63e665fa539d67",
  measurementId: "G-7GX1YR6HQL"
};

// Inicializa o Firebase (Formato clássico/compat)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// SELEÇÃO DE ELEMENTOS DA INTERFACE (DOM)
const loginPage = document.getElementById('login-page');
const registerPage = document.getElementById('register-page');
const profilePage = document.getElementById('profile-page');
const chatPage = document.getElementById('chat-page');

const btnToRegister = document.getElementById('btn-to-register');
const btnToLogin = document.getElementById('btn-to-login');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnSendMessage = document.getElementById('btn-send');
const btnLogout = document.getElementById('btn-logout');
const btnOpenNewChat = document.getElementById('btn-new-chat');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnStartChat = document.getElementById('btn-start-chat');

const emailLoginInput = document.getElementById('email-login');
const passwordLoginInput = document.getElementById('password-login');
const emailRegInput = document.getElementById('email-reg');
const passwordRegInput = document.getElementById('password-reg');
const displayNameInput = document.getElementById('display-name');
const usernameInput = document.getElementById('username');
const messageInput = document.getElementById('message-input');
const searchContactInput = document.getElementById('search-contact');

const currentUserNameHTML = document.getElementById('current-user-name');
const currentUserTagHTML = document.getElementById('current-user-tag');
const activeChatNameHTML = document.getElementById('active-chat-name');
const activeChatStatusHTML = document.getElementById('active-chat-status');

const chatsListContainer = document.getElementById('chats-list');
const messagesContainer = document.getElementById('messages-container');
const contactsModal = document.getElementById('contacts-modal');
const contactsListContainer = document.getElementById('contacts-list');

// VARIÁVEIS DE CONTROLE DE ESTADO
let currentUser = null;
let activeChatId = null;
let activeRecipientId = null;

// NAVEGAÇÃO ENTRE TELAS
function showPage(page) {
  if(loginPage) loginPage.classList.add('hidden');
  if(registerPage) registerPage.classList.add('hidden');
  if(profilePage) profilePage.classList.add('hidden');
  if(chatPage) chatPage.classList.add('hidden');
  if(page) page.classList.remove('hidden');
}

if(btnToRegister) btnToRegister.addEventListener('click', () => showPage(registerPage));
if(btnToLogin) btnToLogin.addEventListener('click', () => showPage(loginPage));

// MONITORAMENTO DO ESTADO DO USUÁRIO (LOGIN/LOGOUT)
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    database.ref('users/' + user.uid).once('value').then(snapshot => {
      if (snapshot.exists() && snapshot.val().username) {
        loadChatSystem();
      } else {
        showPage(profilePage);
      }
    });
  } else {
    currentUser = null;
    showPage(loginPage);
  }
});

// FLUXO DE CADASTRO (CRIAR CONTA)
if(btnRegister) {
  btnRegister.addEventListener('click', () => {
    const email = emailRegInput.value.trim();
    const password = passwordRegInput.value.trim();

    if(!email || !password) return alert('Preencha todos os campos!');

    auth.createUserWithEmailAndPassword(email, password)
      .catch(error => alert('Erro ao criar conta: ' + error.message));
  });
}

// FLUXO DE LOGIN (ENTRAR)
if(btnLogin) {
  btnLogin.addEventListener('click', () => {
    const email = emailLoginInput.value.trim();
    const password = passwordLoginInput.value.trim();

    if(!email || !password) return alert('Preencha todos os campos!');

    auth.signInWithEmailAndPassword(email, password)
      .catch(error => alert('Erro ao entrar: ' + error.message));
  });
}

// SALVAR PERFIL (DISPLAY NAME E USERNAME)
if(btnSaveProfile) {
  btnSaveProfile.addEventListener('click', () => {
    const displayName = displayNameInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase().replace(/\s+/g, '');

    if(!displayName || !username) return alert('Preencha os dados do perfil!');

    database.ref('usernames/' + username).once('value').then(snapshot => {
      if(snapshot.exists() && snapshot.val() !== currentUser.uid) {
        alert('Este nome de usuário já está em uso!');
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

// LOGOUT (SAIR)
if(btnLogout) {
  btnLogout.addEventListener('click', () => {
    if(currentUser) {
      database.ref('users/' + currentUser.uid).update({ status: 'Offline' });
    }
    auth.signOut();
  });
}

// CARREGAR O SISTEMA PRINCIPAL DE CHAT
function loadChatSystem() {
  showPage(chatPage);
  
  database.ref('users/' + currentUser.uid).on('value', snapshot => {
    const data = snapshot.val();
    if(data) {
      if(currentUserNameHTML) currentUserNameHTML.innerText = data.displayName;
      if(currentUserTagHTML) currentUserTagHTML.innerText = '@' + data.username;
    }
  });

  listenToMyChats();
}

// MODAL DE NOVOS CONTATOS
if(btnOpenNewChat) {
  btnOpenNewChat.addEventListener('click', () => {
    if(contactsModal) contactsModal.classList.remove('hidden');
    loadContactsList();
  });
}
if(btnCloseModal) btnCloseModal.addEventListener('click', () => {
  if(contactsModal) contactsModal.classList.add('hidden');
});

function loadContactsList() {
  database.ref('users').once('value', snapshot => {
    if(!contactsListContainer) return;
    contactsListContainer.innerHTML = '';
    snapshot.forEach(childSnapshot => {
      const user = childSnapshot.val();
      if(user.uid !== currentUser.uid) {
        const item = document.createElement('div');
        item.className = 'contact-item';
        item.innerHTML = `
          <div class="avatar">${user.displayName.charAt(0).toUpperCase()}</div>
          <div class="contact-info">
            <p class="name">${user.displayName}</p>
            <p class="username">@${user.username}</p>
          </div>
        `;
        item.onclick = () => startConversaCom(user.uid, user.displayName);
        contactsListContainer.appendChild(item);
      }
    });
  });
}

// INICIAR OU ABRIR UMA CONVERSA
function startConversaCom(recipientId, recipientName) {
  if(contactsModal) contactsModal.classList.add('hidden');
  
  const chatId = currentUser.uid < recipientId ? 
    `${currentUser.uid}_${recipientId}` : `${recipientId}_${currentUser.uid}`;
    
  activeChatId = chatId;
  activeRecipientId = recipientId;

  database.ref(`users/${currentUser.uid}/my_chats/${chatId}`).set({ recipientId: recipientId });
  database.ref(`users/${recipientId}/my_chats/${chatId}`).set({ recipientId: currentUser.uid });

  openChatRoom(chatId, recipientName, recipientId);
}

// ESCUTAR E ATUALIZAR A LISTA DE CONVERSAS ATIVAS (BARRA LATERAL)
function listenToMyChats() {
  database.ref(`users/${currentUser.uid}/my_chats`).on('value', snapshot => {
    if(!chatsListContainer) return;
    chatsListContainer.innerHTML = '';
    if(!snapshot.exists()) {
      chatsListContainer.innerHTML = '<p class="empty-state">Nenhuma conversa ainda.</p>';
      return;
    }

    snapshot.forEach(childSnapshot => {
      const chatId = childSnapshot.key;
      const chatData = childSnapshot.val();
      
      database.ref(`users/${chatData.recipientId}`).once('value', userSnap => {
        const user = userSnap.val();
        if(user) {
          const chatItem = document.createElement('div');
          chatItem.className = `chat-item ${activeChatId === chatId ? 'active' : ''}`;
          chatItem.innerHTML = `
            <div class="avatar">${user.displayName.charAt(0).toUpperCase()}</div>
            <div class="chat-item-details">
              <p class="name">${user.displayName}</p>
              <p class="preview">Clique para conversar...</p>
            </div>
          `;
          chatItem.onclick = () => openChatRoom(chatId, user.displayName, user.uid);
          chatsListContainer.appendChild(chatItem);
        }
      });
    });
  });
}

// ABRIR UMA SALA DE CHAT E CARREGAR MENSAGENS
function openChatRoom(chatId, recipientName, recipientId) {
  activeChatId = chatId;
  activeRecipientId = recipientId;

  if(activeChatNameHTML) activeChatNameHTML.innerText = recipientName;
  
  database.ref(`users/${recipientId}/status`).on('value', snap => {
    if(activeChatStatusHTML) activeChatStatusHTML.innerText = snap.val() || 'Offline';
  });

  database.ref(`chats/${chatId}/messages`).off();
  database.ref(`chats/${chatId}/messages`).on('value', snapshot => {
    if(!messagesContainer) return;
    messagesContainer.innerHTML = '';
    
    snapshot.forEach(childSnapshot => {
      const msg = childSnapshot.val();
      const msgId = childSnapshot.key;
      
      const msgElement = document.createElement('div');
      msgElement.className = `message ${msg.senderId === currentUser.uid ? 'sent' : 'received'}`;
      
      if(msg.isDeleted) {
        msgElement.innerHTML = `<p class="deleted-text"><em>Mensagem apagada</em></p>`;
      } else {
        msgElement.innerHTML = `
          <p class="text-content">${msg.text}</p>
          <span class="time-stamp">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        `;
        
        if(msg.senderId === currentUser.uid) {
          msgElement.onclick = () => {
            if(confirm('Deseja apagar esta mensagem?')) {
              database.ref(`chats/${chatId}/messages/${msgId}`).update({ isDeleted: true });
            }
          };
        }
      }
      messagesContainer.appendChild(msgElement);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

// ENVIAR MENSAGEM
function sendMessage() {
  if(!messageInput) return;
  const text = messageInput.value.trim();
  if(!text || !activeChatId) return;

  const msgRef = database.ref(`chats/${activeChatId}/messages`).push();
  msgRef.set({
    senderId: currentUser.uid,
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    isDeleted: false
  });

  messageInput.value = '';
}

if(btnSendMessage) btnSendMessage.addEventListener('click', sendMessage);
if(messageInput) {
  messageInput.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') sendMessage();
  });
}
  mainInput: document.getElementById('main-input'),
  btnSend: document.getElementById('btn-send'),
  modalContacts: document.getElementById('modal-contacts'),
  contactsResultList: document.getElementById('contacts-result-list'),
  contextMenu: document.getElementById('context-menu')
};

// --- FLUXO DE SESSÃO / USUÁRIO ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const userSnapshot = await get(ref(db, `users/${user.uid}`));
    
    if (!userSnapshot.exists()) {
      showScreen('setup');
    } else {
      loadApplication(userSnapshot.val());
    }
  } else {
    showScreen('auth');
  }
});

function showScreen(type) {
  DOM.authScreen.classList.add('hidden');
  DOM.appScreen.classList.add('hidden');
  DOM.authForm.classList.add('hidden');
  DOM.profileSetup.classList.add('hidden');
  
  if (type === 'auth') {
    DOM.authScreen.classList.remove('hidden');
    DOM.authActions.classList.remove('hidden');
  } else if (type === 'setup') {
    DOM.authScreen.classList.remove('hidden');
    DOM.authActions.classList.add('hidden');
    DOM.profileSetup.classList.remove('hidden');
  } else if (type === 'app') {
    DOM.appScreen.classList.remove('hidden');
  }
}

// Configuração do fluxo clássico de Login / Registro
document.getElementById('btn-goto-register').addEventListener('click', () => {
  DOM.authActions.classList.add('hidden');
  DOM.authForm.classList.remove('hidden');
  document.getElementById('btn-submit-form').innerText = "Create Account";
});

document.getElementById('btn-goto-login').addEventListener('click', () => {
  DOM.authActions.classList.add('hidden');
  DOM.authForm.classList.remove('hidden');
  document.getElementById('btn-submit-form').innerText = "Sign In";
});

document.getElementById('btn-google-auth').addEventListener('click', () => {
  signInWithPopup(auth, googleProvider);
});

DOM.authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-password').value;
  const isRegister = document.getElementById('btn-submit-form').innerText === "Create Account";
  
  try {
    if (isRegister) {
      await createUserWithEmailAndPassword(auth, email, pass);
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch (err) { alert(err.message); }
});

document.getElementById('btn-save-setup').addEventListener('click', async () => {
  const dName = document.getElementById('setup-displayname').value.trim();
  const uName = document.getElementById('setup-username').value.trim().toLowerCase();
  
  if(!dName || !uName) return;
  
  await set(ref(db, `users/${currentUser.uid}`), {
    displayName: dName,
    username: uName,
    photoURL: currentUser.photoURL || `https://ui-avatars.com/api/?name=${dName}&background=4f46e5&color=fff`
  });
  
  location.reload();
});

// --- ENTRAR NO APLICATIVO ---
function loadApplication(myProfile) {
  showScreen('app');
  document.getElementById('my-name').innerText = myProfile.displayName;
  document.getElementById('my-username').innerText = `@${myProfile.username}`;
  
  const avatar = document.getElementById('my-avatar');
  if(myProfile.photoURL) avatar.style.backgroundImage = `url(${myProfile.photoURL})`;
  
  // Atualiza status online
  set(ref(db, `users/${currentUser.uid}/status`), "online");
  
  listenConversations();
  applyAutomaticPurge(); // Executa varredura de expiração
}

// --- BUSCAR CONTATOS / NOVA CONVERSA ---
document.getElementById('btn-new-chat').addEventListener('click', async () => {
  DOM.modalContacts.classList.remove('hidden');
  const usersSnapshot = await get(ref(db, 'users'));
  DOM.contactsResultList.innerHTML = '';
  
  usersSnapshot.forEach((child) => {
    if(child.key === currentUser.uid) return;
    const u = child.val();
    
    const div = document.createElement('div');
    div.className = "item-chat";
    div.innerHTML = `
      <div class="avatar-circle" style="background-image: url(${u.photoURL})"></div>
      <div class="chat-item-meta">
        <h4>${u.displayName}</h4>
        <p class="preview-msg">@${u.username}</p>
      </div>
    `;
    div.onclick = () => createOrOpenConversation(child.key);
    DOM.contactsResultList.appendChild(div);
  });
});

document.getElementById('close-contacts').onclick = () => DOM.modalContacts.classList.add('hidden');

function createOrOpenConversation(targetUid) {
  DOM.modalContacts.classList.add('hidden');
  // Cria uma chave única previsível combinando os dois UIDs ordenados alfabeticamente
  const comboId = currentUser.uid < targetUid ? `${currentUser.uid}_${targetUid}` : `${targetUid}_${currentUser.uid}`;
  
  update(ref(db, `conversations/${comboId}`), {
    [`participants/${currentUser.uid}`]: true,
    [`participants/${targetUid}`]: true,
    timestamp: Date.now()
  });
  
  openChat(comboId, targetUid);
}

// --- LISTAR CONVERSAS NA BARRA LATERAL ---
function listenConversations() {
  onValue(ref(db, 'conversations'), (snapshot) => {
    DOM.conversationsList.innerHTML = '';
    let count = 0;
    
    snapshot.forEach((child) => {
      const data = child.val();
      if(data.participants && data.participants[currentUser.uid]) {
        count++;
        const targetUid = Object.keys(data.participants).find(uid => uid !== currentUser.uid);
        
        get(ref(db, `users/${targetUid}`)).then((uSnap) => {
          const u = uSnap.val();
          const item = document.createElement('div');
          item.className = `item-chat ${activeChatId === child.key ? 'active' : ''}`;
          item.innerHTML = `
            <div class="avatar-circle ${u.status === 'online' ? 'online' : ''}" style="background-image: url(${u.photoURL})"></div>
            <div class="chat-item-meta">
              <div class="row-top">
                <h4>${u.displayName}</h4>
              </div>
              <p class="preview-msg">${data.lastMessage || 'Inicie uma conversa'}</p>
            </div>
          `;
          item.onclick = () => openChat(child.key, targetUid);
          DOM.conversationsList.appendChild(item);
        });
      }
    });
    document.getElementById('chat-count').innerText = `${count} Chats`;
  });
}

// --- ABRIR CAIXA DE CONVERSA ---
function openChat(chatId, targetUid) {
  activeChatId = chatId;
  activeTargetUid = targetUid;
  
  document.getElementById('chat-empty-state').classList.add('hidden');
  document.getElementById('chat-active-state').classList.remove('hidden');
  
  // Suporte a mobile
  document.getElementById('app-screen').className = "app-container show-chat";
  
  get(ref(db, `users/${targetUid}`)).then((snap) => {
    const u = snap.val();
    document.getElementById('target-name').innerText = u.displayName;
    document.getElementById('target-status').innerText = u.status || 'offline';
    document.getElementById('target-avatar').style.backgroundImage = `url(${u.photoURL})`;
  });

  listenMessages(chatId);
}

document.getElementById('btn-back-sidebar').onclick = () => {
  document.getElementById('app-screen').className = "app-container show-sidebar";
};

// --- PROCESSAMENTO DE MENSAGENS EM TEMPO REAL ---
function listenMessages(chatId) {
  const msgRef = ref(db, `messages/${chatId}`);
  DOM.messageFlow.innerHTML = '';
  
  onChildAdded(msgRef, (snap) => { renderMessage(snap.key, snap.val()); });
  onChildChanged(msgRef, (snap) => {
    const el = document.getElementById(`msg-${snap.key}`);
    if(el) {
      const parent = el.parentElement;
      renderMessage(snap.key, snap.val(), parent);
    }
  });
}

function renderMessage(msgId, data, targetWrapper = null) {
  const isMe = data.senderId === currentUser.uid;
  const wrapper = targetWrapper || document.createElement('div');
  wrapper.className = `bubble-wrapper ${isMe ? 'me' : 'other'}`;
  
  let content = data.text;
  let bubbleClass = "msg-bubble";
  if(data.deleted) {
    content = "🚫 Mensagem apagada";
    bubbleClass += " is-deleted";
  }

  wrapper.innerHTML = `
    <div id="msg-${msgId}" class="${bubbleClass}">
      ${!isMe && !data.deleted ? `<span class="sender-id">@reply</span>` : ''}
      <span class="text-node">${content}</span>
      ${data.reactions ? `<div class="msg-reactions">${Object.values(data.reactions).join('')}</div>` : ''}
    </div>
  `;

  const bubble = wrapper.querySelector('.msg-bubble');
  
  // Vincula Eventos para abrir Menu Flutuante (PC e Mobile)
  if(!data.deleted) {
    bubble.oncontextmenu = (e) => { e.preventDefault(); openContextMenu(e, msgId, isMe, data.text); };
    
    // Toque longo para Celulares e Tablets
    bubble.ontouchstart = (e) => {
      pressTimer = setTimeout(() => { openContextMenu(e.touches[0], msgId, isMe, data.text); }, 600);
    };
    bubble.ontouchend = () => clearTimeout(pressTimer);
  }

  if(!targetWrapper) {
    DOM.messageFlow.appendChild(wrapper);
  }
  DOM.messageFlow.scrollTop = DOM.messageFlow.scrollHeight;
}

// --- EVENTOS DE ENVIO ---
DOM.btnSend.onclick = sendMessage;
DOM.mainInput.onkeypress = (e) => { if(e.key === 'Enter') sendMessage(); };

function sendMessage() {
  const val = DOM.mainInput.value.trim();
  if(!val || !activeChatId) return;
  
  const mRef = ref(db, `messages/${activeChatId}`);
  const newMsgKey = push(mRef).key;
  
  const payload = {
    senderId: currentUser.uid,
    text: val,
    timestamp: Date.now(),
    deleted: false,
    edited: false
  };
  
  set(ref(db, `messages/${activeChatId}/${newMsgKey}`), payload);
  update(ref(db, `conversations/${activeChatId}`), { lastMessage: val, timestamp: Date.now() });
  
  DOM.mainInput.value = '';
}

// --- MECÂNICA DO MENU CONTEXTUAL E REAÇÕES ---
function openContextMenu(e, msgId, isMe, originalText) {
  selectedMessageId = msgId;
  DOM.contextMenu.classList.remove('hidden');
  DOM.contextMenu.style.top = `${e.clientY || e.pageY}px`;
  DOM.contextMenu.style.left = `${e.clientX || e.pageX}px`;
  
  // Regras de exibição baseadas no dono da mensagem
  document.getElementById('ctx-edit').style.display = isMe ? 'block' : 'none';
  document.getElementById('ctx-delete').style.display = isMe ? 'block' : 'none';
  
  // Evento de cópia rápida
  document.getElementById('ctx-copy').onclick = () => { navigator.clipboard.writeText(originalText); closeMenu(); };
  
  // Evento para Editar Mensagem
  document.getElementById('ctx-edit').onclick = () => {
    const edit = prompt("Editar mensagem:", originalText);
    if(edit && edit.trim() !== "") {
      update(ref(db, `messages/${activeChatId}/${selectedMessageId}`), { text: edit.trim(), edited: true });
    }
    closeMenu();
  };

  // Evento para Apagar Mensagem
  document.getElementById('ctx-delete').onclick = () => {
    update(ref(db, `messages/${activeChatId}/${selectedMessageId}`), { deleted: true });
    closeMenu();
  };
}

// Captura reações por emoji
document.querySelectorAll('.react-emoji').forEach(el => {
  el.onclick = () => {
    const emoji = el.getAttribute('data-emoji');
    update(ref(db, `messages/${activeChatId}/${selectedMessageId}/reactions`), { [currentUser.uid]: emoji });
    closeMenu();
  };
});

function closeMenu() { DOM.contextMenu.classList.add('hidden'); }
document.onclick = () => closeMenu();

// --- CRON-JOB AUTOMÁTICO DE EXPIRAÇÃO (30 DIAS) ---
function applyAutomaticPurge() {
  const UM_MES_EM_MS = 30 * 24 * 60 * 60 * 1000;
  const agora = Date.now();
  
  get(ref(db, 'messages')).then((snapshot) => {
    if(!snapshot.exists()) return;
    
    snapshot.forEach((chatNode) => {
      const chatId = chatNode.key;
      chatNode.forEach((msgNode) => {
        const msgId = msgNode.key;
        const msgData = msgNode.val();
        
        // Se a mensagem estourou a data limite de 30 dias, remove o nó completamente
        if (agora - msgData.timestamp > UM_MES_EM_MS) {
          remove(ref(db, `messages/${chatId}/${msgId}`));
        }
      });
    });
  });
}
