:root {
    --bg-dark: #000000;
    --glass-bg: rgba(25, 25, 27, 0.75);
    --glass-border: rgba(255, 255, 255, 0.08);
    --ios-blue: #0a84ff;
    --ios-red: #ff3b30;
    --text-main: #ffffff;
    --text-muted: #8e8e93;
}

* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
body { background: var(--bg-dark); color: var(--text-main); overflow: hidden; width: 100vw; height: 100vh; }

/* O CORRETOR DE CLIQUE CRÍTICO: Isola o mouse de janelas invisíveis */
.hidden { 
    display: none !important; 
    pointer-events: none !important; 
    visibility: hidden !important; 
    opacity: 0 !important;
}

/* Containers das Páginas */
.auth-container { 
    width: 100vw; height: 100dvh; display: flex; justify-content: center; align-items: center; 
    position: fixed; top: 0; left: 0; z-index: 10; background: #000; 
}
.app-container, .settings-screen { 
    width: 100vw; height: 100dvh; position: fixed; top: 0; left: 0; z-index: 5; background: #000; display: flex; flex-direction: column; 
}

/* Design Glassmorphism Premium */
.glass-premium { background: var(--glass-bg); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid var(--glass-border); }
.auth-box { width: 90%; max-width: 360px; padding: 30px; border-radius: 20px; text-align: center; }

/* Logos e Tipografia */
.ios-title { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 4px; }
.ios-subtitle { font-size: 14px; color: var(--text-muted); margin-bottom: 30px; }
.mono-icon-light { width: 24px; height: 24px; color: white; }

/* Inputs Estilo iOS Flutuante */
.input-group-premium { position: relative; margin-bottom: 16px; width: 100%; }
.input-group-premium input { 
    width: 100%; padding: 14px 12px 6px 12px; background: rgba(255,255,255,0.06); border: 1px solid transparent; 
    border-radius: 10px; color: #fff; font-size: 15px; outline: none; transition: 0.2s; 
}
.input-group-premium input:focus { border-color: var(--ios-blue); background: rgba(255,255,255,0.09); }
.input-group-premium label { 
    position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); 
    font-size: 15px; transition: 0.2s; pointer-events: none; 
}
.input-group-premium input:focus ~ label,
.input-group-premium input:not(:placeholder-shown) ~ label { top: 12px; font-size: 11px; color: var(--ios-blue); }

/* Botões */
.ios-btn-primary { 
    width: 100%; padding: 14px; background: var(--ios-blue); border: none; border-radius: 12px; 
    color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; transition: 0.2s; 
}
.ios-btn-primary:active { opacity: 0.8; }
.ios-btn-google { 
    width: 100%; padding: 12px; background: #fff; color: #000; border: none; border-radius: 12px; 
    font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; margin-top: 10px; 
}
.divider-text { margin: 15px 0; font-size: 12px; color: var(--text-muted); text-transform: uppercase; }
.auth-switch { margin-top: 20px; font-size: 13px; color: var(--text-muted); }
.auth-switch span { color: var(--ios-blue); cursor: pointer; font-weight: 500; }

/* Cabeçalhos e Abas do App */
.app-top-bar { padding: 16px; display: flex; justify-content: space-between; align-items: center; }
.app-tabs { display: flex; border-bottom: 1px solid var(--glass-border); }
.tab-item { flex: 1; padding: 12px; text-align: center; color: var(--text-muted); font-size: 14px; cursor: pointer; }
.tab-item.active { color: var(--ios-blue); font-weight: 600; border-bottom: 2px solid var(--ios-blue); }
.tab-content-container { flex: 1; overflow-y: auto; position: relative; }

/* Lista de Chats e Layout de Linhas */
.chat-item-row { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.03); cursor: pointer; }
.chat-item-row img { width: 48px; height: 48px; border-radius: 50%; margin-right: 12px; background: #222; }
.chat-item-info h4 { font-size: 15px; font-weight: 600; }
.chat-item-info p { font-size: 13px; color: var(--text-muted); }

/* Sala de chat ativa e Balões */
.chat-room-screen { position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh; background: #000; z-index: 20; display: flex; flex-direction: column; }
.chat-header { padding: 10px 16px; display: flex; align-items: center; gap: 10px; }
.back-btn, .icon-btn-dots { background: none; border: none; color: var(--ios-blue); cursor: pointer; }
.active-user-info { flex: 1; display: flex; align-items: center; gap: 10px; cursor: pointer; }
.header-avatar { width: 36px; height: 36px; border-radius: 50%; }
.messages-container { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; background: #050505; }
.message { max-width: 75%; padding: 10px 14px; border-radius: 16px; font-size: 15px; line-height: 1.4; word-wrap: break-word; }
.message.sent { background: var(--ios-blue); color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
.message.received { background: #262629; color: white; align-self: flex-start; border-bottom-left-radius: 4px; }

/* Rodapé do Chat */
.chat-footer { padding: 10px 16px; display: flex; align-items: center; gap: 10px; }
.footer-input-row { flex: 1; display: flex; align-items: center; background: rgba(255,255,255,0.08); padding: 8px 12px; border-radius: 20px; }
.footer-input-row input { flex: 1; background: none; border: none; color: white; outline: none; margin-left: 8px; font-size: 15px; }
.btn-send-round { width: 32px; height: 32px; border-radius: 50%; background: var(--ios-blue); border: none; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; }

/* Grid da Galeria de Mídias Compartilhadas */
.popup-media-grid { display: grid; grid-template-columns: repeat(3, 1fr); grid-gap: 6px; margin-top: 8px; }
.popup-media-item { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; background: #222; }

/* Outros Menus e Overlays */
.ios-dropdown-overlay, .blur-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh; background: rgba(0,0,0,0.6); z-index: 100; display: flex; justify-content: center; align-items: center; }
.contact-popup-card { width: 85%; max-width: 320px; padding: 20px; border-radius: 16px; text-align: center; }
.avatar-popup-center { width: 70px; height: 70px; border-radius: 50%; margin-bottom: 10px; }
.popup-internal-tabs { display: flex; margin: 15px 0; border-bottom: 1px solid var(--glass-border); }
.inner-tab { flex: 1; padding: 8px; background: none; border: none; color: var(--text-muted); cursor: pointer; }
.inner-tab.active { color: var(--ios-blue); border-bottom: 2px solid var(--ios-blue); }
.popup-action-row-btn { width: 100%; padding: 12px; background: none; border: none; border-bottom: 1px solid var(--glass-border); text-align: left; color: #fff; font-size: 14px; cursor: pointer; }
.danger-text { color: var(--ios-red) !important; }
.btn-popup-close-primary { margin-top: 15px; width: 100%; padding: 10px; background: rgba(255,255,255,0.08); border: none; border-radius: 8px; color: white; cursor: pointer; }

/* FAB Button */
.btn-fab { position: absolute; bottom: 20px; right: 20px; width: 56px; height: 56px; border-radius: 50%; background: var(--ios-blue); border: none; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(10,132,255,0.3); }
  
