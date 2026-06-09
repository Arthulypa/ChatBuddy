// ATENÇÃO: Verifique se esses dados batem EXATAMENTE com o seu Firebase Console!
// Corrigido com as letras maiúsculas exatas do seu Console (W e H)
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

// Mapeamento de Elementos
const loginPage = document.getElementById('login-page');
const registerPage = document.getElementById('register-page');
const profilePage = document.getElementById('profile-page');
const chatPage = document.getElementById('chat-page');

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

// Função de troca de página com reset de animação CSS
function showPage(page) {
  const pages = [loginPage, registerPage, profilePage, chatPage];
  pages.forEach(p => {
    if(p) p.classList.add('hidden');
  });
  if(page) {
    page.classList.remove('hidden');
    // Força a reinicialização da animação do box interno
    const box = page.querySelector('.page-transition');
    if(box) {
        box.style.animation = 'none';
        box.offsetHeight; // Truque do navegador para resetar reflow
        box.style.animation = null;
    }
  }
}

if(btnToRegister) btnToRegister.addEventListener('click', () => showPage(registerPage));
if(btnToLogin) btnToLogin.addEventListener('click', () => showPage(loginPage));

// Monitor de Sessão
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

// Registro por Email
if(btnRegister) {
  btnRegister.addEventListener('click', () => {
    const email = emailRegInput.value.trim();
    const password = passwordRegInput.value.trim();
    if(!email || !password) return alert('Preencha todos os campos!');
    auth.createUserWithEmailAndPassword(email, password)
      .catch(error => alert('Erro: ' + error.message));
  });
}

// Login por Email
if(btnLogin) {
  btnLogin.addEventListener('click', () => {
    const email = emailLoginInput.value.trim();
    const password = passwordLoginInput.value.trim();
    if(!email || !password) return alert('Preencha todos os campos!');
    auth.signInWithEmailAndPassword(email, password)
      .catch(error => alert('Erro: ' + error.message));
  });
}

// FUNÇÃO ATUALIZADA: Login / Cadastro com Google
function loginComGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
      .then((result) => {
          // O fluxo do onAuthStateChanged cuidará de checar se o perfil existe
      })
      .catch((error) => {
          alert('Erro na autenticação Google: ' + error.message);
      });
}

if(btnGoogleLogin) btnGoogleLogin.addEventListener('click', loginComGoogle);
if(btnGoogleReg) btnGoogleReg.addEventListener('click', loginComGoogle);

// Salvar Perfil Inicial
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

// Sair do Sistema
if(btnLogout) {
  btnLogout.addEventListener('click', () => {
    if(currentUser) database.ref('users/' + currentUser.uid).update({ status: 'Offline' });
    auth.signOut();
  });
}

function loadChatSystem() {
  showPage(chatPage);
  database.ref('users/' + currentUser.uid).on('value', snapshot => {
    const data = snapshot.val();
    if(data) {
      if(currentUserNameHTML) currentUserNameHTML.innerText = data.displayName;
      if(currentUserTagHTML) currentUserTagHTML.innerText = '@' + data.username;
    }
  });
  database.ref('users/' + currentUser.uid).update({ status: 'Online' });
  listenToMyChats();
}

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
        item.className = 'chat-item'; // Aproveita o estilo da lista
        item.innerHTML = `
          <div class="avatar">${user.displayName ? user.displayName.charAt(0).toUpperCase() : '?'}</div>
          <div class="chat-item-details">
            <p class="name">${user.displayName}</p>
            <p class="preview">@${user.username}</p>
          </div>
        `;
        item.onclick = () => startConversaCom(user.uid, user.displayName);
        contactsListContainer.appendChild(item);
      }
    });
  });
}

function startConversaCom(recipientId, recipientName) {
  if(contactsModal) contactsModal.classList.add('hidden');
  const chatId = currentUser.uid < recipientId ? `${currentUser.uid}_${recipientId}` : `${recipientId}_${currentUser.uid}`;
  activeChatId = chatId;
  activeRecipientId = recipientId;
  database.ref(`users/${currentUser.uid}/my_chats/${chatId}`).set({ recipientId: recipientId });
  database.ref(`users/${recipientId}/my_chats/${chatId}`).set({ recipientId: currentUser.uid });
  openChatRoom(chatId, recipientName, recipientId);
}

function listenToMyChats() {
  database.ref(`users/${currentUser.uid}/my_chats`).on('value', snapshot => {
    if(!chatsListContainer) return;
    chatsListContainer.innerHTML = '';
    if(!snapshot.exists()) {
      chatsListContainer.innerHTML = '<p class="chat-placeholder">Nenhum canal ativo.</p>';
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
            <div class="avatar">${user.displayName ? user.displayName.charAt(0).toUpperCase() : '?'}</div>
            <div class="chat-item-details">
              <p class="name">${user.displayName}</p>
              <p class="preview">Conexão segura estabelecida...</p>
            </div>
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
        msgElement.innerHTML = `<p class="deleted-text"><em>[MENSAGEM DELETADA]</em></p>`;
      } else {
        msgElement.innerHTML = `
          <p class="text-content">${msg.text}</p>
          <span class="time-stamp">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        `;
        if(msg.senderId === currentUser.uid) {
          msgElement.onclick = () => {
            if(confirm('Apagar registro da mensagem?')) {
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
  ush();
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
      
