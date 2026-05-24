import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, push, onChildAdded, onChildChanged, onValue, update, get, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_ID",
  appId: "SEU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Variáveis de Controle Global
let currentUser = null;
let activeChatId = null;
let activeTargetUid = null;
let selectedMessageId = null;
let pressTimer = null;

// --- ELEMENTOS DE INTERFACE ---
const DOM = {
  authScreen: document.getElementById('auth-screen'),
  appScreen: document.getElementById('app-screen'),
  authForm: document.getElementById('auth-form'),
  authActions: document.getElementById('auth-actions'),
  profileSetup: document.getElementById('profile-setup'),
  conversationsList: document.getElementById('conversations-list'),
  messageFlow: document.getElementById('message-flow'),
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
