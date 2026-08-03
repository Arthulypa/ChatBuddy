// ─── MATRIX SERVICE — substitui firebase.auth() / firebase.database() / firebase.storage() ──
// O SDK é carregado sob demanda (só quando for realmente preciso criar o client),
// não na primeira linha do arquivo — assim, se o CDN falhar, o resto do app
// (botões, tela de login, etc.) continua funcionando normalmente.
const SDK_CDN_URLS = [
    "https://esm.run/matrix-js-sdk@34.9.0",
    "https://cdn.jsdelivr.net/npm/matrix-js-sdk@34.9.0/+esm",
    "https://esm.sh/matrix-js-sdk@34.9.0"
];
let _sdkModule = null;
async function loadSdk() {
    if (_sdkModule) return _sdkModule;
    let lastErr = null;
    for (const url of SDK_CDN_URLS) {
        try {
            _sdkModule = await import(/* @vite-ignore */ url);
            return _sdkModule;
        } catch (err) {
            lastErr = err;
        }
    }
    throw new Error('Não consegui carregar o matrix-js-sdk de nenhum CDN. Último erro: ' + lastErr?.message);
}

// Se um dia vocês subirem o próprio Synapse, é só trocar essa URL.
const HOMESERVER_URL = "https://matrix.org";
const MAS_ISSUER = "https://account.matrix.org/";

export const MatrixService = {
    client: null,

    // ── LOGIN VIA OIDC (account.matrix.org) — cobre login E criação de conta ──
    // mode: 'login' (só quem já tem conta) ou 'create' (mostra também a opção de criar)
    async startOidcFlow(mode = 'login') {
        const meta = await this._getOidcMetadata();
        const clientId = await this._getOrRegisterClient(meta);
        const deviceId = this._randomString(10);
        const codeVerifier = this._randomString(64);
        const codeChallenge = await this._pkceChallenge(codeVerifier);
        const state = this._randomString(16);
        const redirectUri = this._redirectUri();

        sessionStorage.setItem('mx_oidc_verifier', codeVerifier);
        sessionStorage.setItem('mx_oidc_state', state);
        sessionStorage.setItem('mx_oidc_device', deviceId);
        sessionStorage.setItem('mx_oidc_client_id', clientId);

        const scope = [
            'openid',
            'urn:matrix:org.matrix.msc2967.client:api:*',
            `urn:matrix:org.matrix.msc2967.client:device:${deviceId}`
        ].join(' ');

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope,
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });
        if (mode === 'create') params.set('prompt', 'create');

        window.location.href = `${meta.authorization_endpoint}?${params.toString()}`;
    },

    // ── Chamar no boot do app: verifica se acabamos de voltar do account.matrix.org ──
    async handleOidcRedirect() {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code) return null;

        const savedState = sessionStorage.getItem('mx_oidc_state');
        if (!savedState || state !== savedState) return null; // não é nosso redirect / CSRF

        const codeVerifier = sessionStorage.getItem('mx_oidc_verifier');
        const clientId = sessionStorage.getItem('mx_oidc_client_id');
        const deviceId = sessionStorage.getItem('mx_oidc_device');
        const meta = await this._getOidcMetadata();

        const tokenRes = await fetch(meta.token_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: this._redirectUri(),
                client_id: clientId,
                code_verifier: codeVerifier
            })
        });
        if (!tokenRes.ok) throw new Error('Falha ao trocar o código de autorização por um token.');
        const tokens = await tokenRes.json();

        // limpa a URL (tira ?code=...&state=...) e os dados temporários
        window.history.replaceState({}, '', this._redirectUri());
        ['mx_oidc_verifier', 'mx_oidc_state'].forEach(k => sessionStorage.removeItem(k));

        this._saveOidcSession(tokens, deviceId);
        return this._initClient(tokens.access_token, null, deviceId);
    },

    _saveOidcSession(tokens, deviceId) {
        localStorage.setItem('mx_access_token', tokens.access_token);
        localStorage.setItem('mx_refresh_token', tokens.refresh_token || '');
        localStorage.setItem('mx_device_id', deviceId);
    },

    async _getOidcMetadata() {
        if (this._oidcMeta) return this._oidcMeta;
        const res = await fetch(`${MAS_ISSUER}.well-known/openid-configuration`);
        this._oidcMeta = await res.json();
        return this._oidcMeta;
    },

    // Registra o app como cliente OAuth automaticamente (sem precisar pedir client_id a ninguém)
    // e guarda o client_id localmente pra não registrar de novo toda hora.
    async _getOrRegisterClient(meta) {
        const cacheKey = 'mx_oidc_client_id_' + this._redirectUri();
        const cached = localStorage.getItem(cacheKey);
        if (cached) return cached;

        const res = await fetch(meta.registration_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_name: 'ChatBuddy',
                redirect_uris: [this._redirectUri()],
                response_types: ['code'],
                grant_types: ['authorization_code', 'refresh_token'],
                token_endpoint_auth_method: 'none',
                application_type: 'web'
            })
        });
        if (!res.ok) throw new Error('Falha ao registrar o app no matrix.org.');
        const data = await res.json();
        localStorage.setItem(cacheKey, data.client_id);
        return data.client_id;
    },

    _redirectUri() {
        return window.location.origin + window.location.pathname;
    },

    _randomString(len) {
        const bytes = crypto.getRandomValues(new Uint8Array(len));
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, len);
    },

    async _pkceChallenge(verifier) {
        const data = new TextEncoder().encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },

    // ── LOGIN CLÁSSICO (só funciona se o homeserver ainda aceitar m.login.password —
    // útil se algum dia vocês subirem o próprio Synapse sem OIDC) ──
    async login(userOrMxid, password) {
        // Aceita tanto "fulano" quanto "@fulano:matrix.org"
        const user = userOrMxid.startsWith('@') ? userOrMxid : userOrMxid;
        const sdk = await loadSdk();
        const tempClient = sdk.createClient({ baseUrl: HOMESERVER_URL });
        const res = await tempClient.login('m.login.password', {
            identifier: { type: 'm.id.user', user },
            password,
            initial_device_display_name: 'ChatBuddy Web'
        });
        this._saveSession(res);
        return this._initClient(res.access_token, res.user_id, res.device_id);
    },

    // ── Tenta restaurar sessão salva (equivalente ao auth.onAuthStateChanged) ──
    async restoreSession() {
        const accessToken = localStorage.getItem('mx_access_token');
        const userId = localStorage.getItem('mx_user_id');
        const deviceId = localStorage.getItem('mx_device_id');
        if (!accessToken || !userId) return null;
        try {
            return await this._initClient(accessToken, userId, deviceId);
        } catch (e) {
            this.logout();
            return null;
        }
    },

    _saveSession(res) {
        localStorage.setItem('mx_access_token', res.access_token);
        localStorage.setItem('mx_user_id', res.user_id);
        localStorage.setItem('mx_device_id', res.device_id || '');
    },

    async _initClient(accessToken, userId, deviceId) {
        // No fluxo OIDC não recebemos o user_id direto — perguntamos ao servidor.
        if (!userId) {
            const who = await fetch(`${HOMESERVER_URL}/_matrix/client/v3/account/whoami`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            }).then(r => r.json());
            if (!who.user_id) throw new Error('Não foi possível identificar a conta.');
            userId = who.user_id;
            localStorage.setItem('mx_user_id', userId);
        }
        const sdk = await loadSdk();
        this.client = sdk.createClient({
            baseUrl: HOMESERVER_URL,
            accessToken,
            userId,
            deviceId: deviceId || undefined
        });
        await this.client.startClient({ initialSyncLimit: 30 });
        await new Promise((resolve, reject) => {
            const onSync = (state) => {
                if (state === 'PREPARED') { this.client.removeListener('sync', onSync); resolve(); }
                if (state === 'ERROR') { this.client.removeListener('sync', onSync); reject(new Error('Falha ao sincronizar com o Matrix')); }
            };
            this.client.on('sync', onSync);
        });
        return this.client;
    },

    logout() {
        if (this.client) { this.client.stopClient(); this.client.logout().catch(() => {}); }
        localStorage.removeItem('mx_access_token');
        localStorage.removeItem('mx_refresh_token');
        localStorage.removeItem('mx_user_id');
        localStorage.removeItem('mx_device_id');
        this.client = null;
    },

    getMyId() { return this.client?.getUserId() || null; },

    // ── PERFIL (equivalente a users/{uid} no Realtime Database) ──
    async setProfile(displayName, avatarFile) {
        if (displayName) await this.client.setDisplayName(displayName);
        if (avatarFile) {
            const uploadRes = await this.client.uploadContent(avatarFile, { type: avatarFile.type });
            await this.client.setAvatarUrl(uploadRes.content_uri);
        }
    },

    async getMyProfile() {
        const id = this.getMyId();
        const info = await this.client.getProfileInfo(id);
        return {
            uid: id,
            username: id.split(':')[0].replace('@', ''),
            nickname: info.displayname || id,
            avatar: this.avatarHttpUrl(info.avatar_url) || ''
        };
    },

    // Converte uma mxc:// url em uma URL http normal pra usar em <img src="">
    avatarHttpUrl(mxcUrl, size = 96) {
        if (!mxcUrl) return null;
        return this.client.mxcUrlToHttp(mxcUrl, size, size, 'crop');
    },

    // ── BUSCA DE USUÁRIO (equivalente a procurar por "username" no database) ──
    async searchUsers(term) {
        const res = await this.client.searchUserDirectory({ term, limit: 10 });
        return res.results.map(u => ({
            uid: u.user_id,
            nickname: u.display_name || u.user_id,
            avatar: this.avatarHttpUrl(u.avatar_url) || ''
        }));
    },

    // ── CONVERSAS PRIVADAS (equivalente a chats/{chatId}) ──
    async startDirectChat(userId) {
        const existing = this._findExistingDM(userId);
        if (existing) return existing;
        const room = await this.client.createRoom({
            invite: [userId],
            is_direct: true,
            preset: 'trusted_private_chat'
        });
        // marca como DM nos account data, do jeito que o Matrix espera
        const dmContent = this.client.getAccountData('m.direct')?.getContent() || {};
        dmContent[userId] = [...(dmContent[userId] || []), room.room_id];
        await this.client.setAccountData('m.direct', dmContent);
        return room.room_id;
    },

    _findExistingDM(userId) {
        const dmContent = this.client.getAccountData('m.direct')?.getContent() || {};
        const roomIds = dmContent[userId] || [];
        return roomIds.find(id => this.client.getRoom(id)) || null;
    },

    // Lista todas as salas (DMs + grupos + convites pendentes)
    listRooms() {
        return this.client.getRooms().map(r => this._roomSummary(r));
    },

    _roomSummary(room) {
        const dmContent = this.client.getAccountData('m.direct')?.getContent() || {};
        const isDM = Object.values(dmContent).some(ids => ids.includes(room.roomId));
        const lastEvent = room.timeline.filter(e => e.getType() === 'm.room.message').slice(-1)[0];
        let otherUserId = null;
        if (isDM) {
            const members = room.getJoinedMembers().concat(room.getMembersWithMembership('invite'));
            const other = members.find(m => m.userId !== this.getMyId());
            otherUserId = other ? other.userId : null;
        }
        return {
            roomId: room.roomId,
            isDM,
            otherUserId,
            name: room.name,
            avatar: this.avatarHttpUrl(room.getAvatarUrl(HOMESERVER_URL, 96, 96, 'crop', false)) || '',
            myMembership: room.getMyMembership(), // 'join' | 'invite' | 'leave'
            lastMessage: lastEvent ? lastEvent.getContent().body : '',
            lastTimestamp: lastEvent ? lastEvent.getTs() : (room.getLastActiveTimestamp?.() || 0),
            unreadCount: room.getUnreadNotificationCount() || 0
        };
    },

    async acceptInvite(roomId) { return this.client.joinRoom(roomId); },
    async rejectInvite(roomId) { return this.client.leave(roomId); },
    async leaveRoom(roomId) { return this.client.leave(roomId); },

    // ── GRUPOS (equivalente a groups/{groupId}) — no Matrix é só uma sala não-DM ──
    async createGroup(name, description, avatarFile, memberIds = []) {
        const room = await this.client.createRoom({
            name,
            topic: description || '',
            invite: memberIds,
            preset: 'private_chat'
        });
        if (avatarFile) {
            const uploadRes = await this.client.uploadContent(avatarFile, { type: avatarFile.type });
            await this.client.sendStateEvent(room.room_id, 'm.room.avatar', { url: uploadRes.content_uri });
        }
        return room.room_id;
    },

    async updateGroup(roomId, { name, description, avatarFile }) {
        if (name) await this.client.setRoomName(roomId, name);
        if (description !== undefined) await this.client.setRoomTopic(roomId, description);
        if (avatarFile) {
            const uploadRes = await this.client.uploadContent(avatarFile, { type: avatarFile.type });
            await this.client.sendStateEvent(roomId, 'm.room.avatar', { url: uploadRes.content_uri });
        }
    },

    async inviteToRoom(roomId, userId) { return this.client.invite(roomId, userId); },

    getRoomMembers(roomId) {
        const room = this.client.getRoom(roomId);
        if (!room) return [];
        return room.getJoinedMembers().map(m => ({
            uid: m.userId,
            nickname: m.name,
            avatar: this.avatarHttpUrl(m.getAvatarUrl(HOMESERVER_URL, 64, 64, 'crop', false, false)) || '',
            powerLevel: room.getMember(m.userId)?.powerLevel || 0
        }));
    },

    isRoomAdmin(roomId, userId) {
        const room = this.client.getRoom(roomId);
        if (!room) return false;
        const pl = room.currentState.getStateEvents('m.room.power_levels', '')?.getContent();
        const userLevel = pl?.users?.[userId] ?? pl?.users_default ?? 0;
        return userLevel >= 50; // 50+ = moderador/admin no padrão Matrix
    },

    // ── MENSAGENS (equivalente a chats/{id}/messages e groups/{id}/messages) ──
    getRoomMessages(roomId) {
        const room = this.client.getRoom(roomId);
        if (!room) return [];
        return room.timeline
            .filter(ev => ev.getType() === 'm.room.message')
            .map(ev => this._eventToMessage(ev));
    },

    _eventToMessage(ev) {
        const content = ev.getContent();
        const relatesTo = content['m.relates_to']?.['m.in_reply_to']?.event_id || null;
        return {
            id: ev.getId(),
            senderId: ev.getSender(),
            msgtype: content.msgtype,
            body: content.body,
            url: content.url ? this.avatarHttpUrl(content.url, 800) : null,
            timestamp: ev.getTs(),
            replyToId: relatesTo,
            isMine: ev.getSender() === this.getMyId()
        };
    },

    async sendText(roomId, text, replyToEventId = null) {
        const content = { msgtype: 'm.text', body: text };
        if (replyToEventId) {
            content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyToEventId } };
        }
        return this.client.sendEvent(roomId, 'm.room.message', content);
    },

    async sendImage(roomId, file) {
        const uploadRes = await this.client.uploadContent(file, { type: file.type });
        return this.client.sendEvent(roomId, 'm.room.message', {
            msgtype: 'm.image',
            body: file.name,
            url: uploadRes.content_uri,
            info: { mimetype: file.type }
        });
    },

    async sendFile(roomId, file) {
        const uploadRes = await this.client.uploadContent(file, { type: file.type });
        return this.client.sendEvent(roomId, 'm.room.message', {
            msgtype: 'm.file',
            body: file.name,
            url: uploadRes.content_uri,
            info: { mimetype: file.type, size: file.size }
        });
    },

    async deleteMessage(roomId, eventId) { return this.client.redactEvent(roomId, eventId); },

    async sendReadReceipt(roomId) {
        const room = this.client.getRoom(roomId);
        const lastEvent = room?.timeline.slice(-1)[0];
        if (lastEvent) this.client.sendReadReceipt(lastEvent).catch(() => {});
    },

    // ── BLOQUEAR (equivalente ao blockedUsers salvo local) ──
    async blockUser(userId) {
        const ignored = this.client.getIgnoredUsers();
        if (!ignored.includes(userId)) await this.client.setIgnoredUsers([...ignored, userId]);
    },
    async unblockUser(userId) {
        const ignored = this.client.getIgnoredUsers();
        await this.client.setIgnoredUsers(ignored.filter(id => id !== userId));
    },
    isBlocked(userId) { return this.client.getIgnoredUsers().includes(userId); },

    // ── EVENTOS EM TEMPO REAL (equivalente aos .on('value') do Realtime Database) ──
    onNewMessage(callback) {
        this.client.on('Room.timeline', (event, room, toStartOfTimeline) => {
            if (toStartOfTimeline) return;
            if (event.getType() !== 'm.room.message') return;
            callback(room.roomId, this._eventToMessage(event));
        });
    },

    onRoomListChange(callback) {
        // qualquer um desses eventos pode mudar a ordem/conteúdo da lista de conversas
        ['Room.timeline', 'Room.name', 'Room.myMembership', 'RoomState.events', 'sync'].forEach(evt => {
            this.client.on(evt, () => callback());
        });
    },

    onInvite(callback) {
        this.client.on('Room.myMembership', (room, membership) => {
            if (membership === 'invite') callback(this._roomSummary(room));
        });
    }
};
