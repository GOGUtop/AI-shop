/* 通用资金与行情状态栏 - SillyTavern third-party extension */
(function () {
    'use strict';

    const STORAGE = 'st_financial_status_bar_v1';
    const SETTINGS_STORAGE = 'st_financial_status_bar_settings_v1';
    const DEFAULT_SETTINGS = {
        endpoint: '/v1/chat/completions',
        apiKey: '',
        model: '',
        models: [],
        temperature: 0,
        autoExtract: false,
        recentMessages: 12,
    };
    const DEFAULT_STATE = {
        version: 1,
        currency: { code: 'CNY', name: '通用货币', symbol: '¤' },
        location: '未定位',
        funds: { cash: 0, deposit: 0, assets: [] },
        market: { shops: [] },
        meta: { confidence: 'manual', source: '初始状态', updatedAt: '' },
    };

    let settings = loadJson(SETTINGS_STORAGE, DEFAULT_SETTINGS);
    let state = loadChatState();
    let host;
    let modal;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function loadJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value && typeof value === 'object' ? value : clone(fallback);
        } catch (_) {
            return clone(fallback);
        }
    }

    function currentChatKey() {
        const context = typeof window.getContext === 'function' ? window.getContext() : null;
        const id = window.this_chid || window.chat_id || window.chat_metadata?.chat_id || context?.chatId;
        return STORAGE + ':' + (id || 'default');
    }

    function loadChatState() {
        return normalizeState(loadJson(currentChatKey(), DEFAULT_STATE));
    }

    function saveState() {
        localStorage.setItem(currentChatKey(), JSON.stringify(state));
    }

    function normalizeState(input) {
        const s = clone(DEFAULT_STATE);
        if (!input || typeof input !== 'object') return s;
        s.currency = Object.assign(s.currency, input.currency || {});
        if (input.location) s.location = String(input.location);
        const funds = input.funds || input.finance || {};
        for (const key of ['cash', 'deposit']) {
            if (funds[key] !== undefined && funds[key] !== null) s.funds[key] = toNumber(funds[key]);
        }
        if (Array.isArray(funds.assets)) {
            s.funds.assets = funds.assets.map((a) => ({
                name: String(a?.name || a?.title || '未命名资产'),
                value: toNumber(a?.value ?? a?.price ?? a?.amount),
                note: String(a?.note || a?.location || ''),
            }));
        }
        const market = input.market || input.nearbyMarket || {};
        if (Array.isArray(market.shops)) {
            s.market.shops = market.shops.map((shop) => ({
                name: String(shop?.name || shop?.title || '未命名店铺'),
                type: String(shop?.type || ''),
                products: Array.isArray(shop?.products) ? shop.products.map((p) => ({
                    name: String(p?.name || p?.title || '未命名商品'),
                    price: toNumber(p?.price ?? p?.amount),
                    stock: p?.stock === undefined || p?.stock === null ? '' : String(p.stock),
                    unit: String(p?.unit || ''),
                    note: String(p?.note || ''),
                })) : [],
            }));
        }
        s.meta = Object.assign(s.meta, input.meta || {});
        return s;
    }

    function toNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (value === undefined || value === null || value === '') return 0;
        let text = String(value).replace(/[￥¥$€£,，\s]/g, '').trim();
        const match = text.match(/^(-?\d+(?:\.\d+)?)(万|w|千|k|百|m)?$/i);
        if (!match) {
            const n = Number(text.replace(/[^-\d.]/g, ''));
            return Number.isFinite(n) ? n : 0;
        }
        const factor = { '万': 10000, w: 10000, '千': 1000, k: 1000, '百': 100, m: 1000000 }[match[2]] || 1;
        return Number(match[1]) * factor;
    }

    function mergeState(base, patch) {
        const out = normalizeState(base);
        if (!patch || typeof patch !== 'object') return out;
        if (patch.currency) out.currency = Object.assign(out.currency, patch.currency);
        if (patch.location) out.location = String(patch.location);
        if (patch.funds) {
            if (patch.funds.cash !== undefined) out.funds.cash = toNumber(patch.funds.cash);
            if (patch.funds.deposit !== undefined) out.funds.deposit = toNumber(patch.funds.deposit);
            if (Array.isArray(patch.funds.assets)) out.funds.assets = normalizeState({ funds: patch.funds }).funds.assets;
        }
        if (patch.market && Array.isArray(patch.market.shops)) out.market.shops = normalizeState({ market: patch.market }).market.shops;
        if (patch.meta) out.meta = Object.assign(out.meta, patch.meta);
        return out;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function formatMoney(value) {
        const n = Number(value) || 0;
        try {
            return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n) + ' ' + (state.currency.symbol || state.currency.code || '¤');
        } catch (_) {
            return n.toLocaleString() + ' ' + (state.currency.symbol || '¤');
        }
    }

    function render() {
        if (!host) return;
        const assetsTotal = state.funds.assets.reduce((sum, a) => sum + (Number(a.value) || 0), 0);
        const total = state.funds.cash + state.funds.deposit + assetsTotal;
        const shops = state.market.shops.map((shop) => `
            <div class="st-fsb-shop">
                <div class="st-fsb-shop-title"><b>${escapeHtml(shop.name)}</b><span>${escapeHtml(shop.type)}</span></div>
                ${(shop.products || []).map((p) => `<div class="st-fsb-product"><span>${escapeHtml(p.name)}${p.unit ? ` <i>/ ${escapeHtml(p.unit)}</i>` : ''}</span><strong>${formatMoney(p.price)}</strong><small>${p.stock !== '' ? `库存 ${escapeHtml(p.stock)}` : ''}${p.note ? ` · ${escapeHtml(p.note)}` : ''}</small></div>`).join('') || '<div class="st-fsb-empty">暂无商品</div>'}
            </div>`).join('') || '<div class="st-fsb-empty">暂无周围行情。可点击“从正文识别”或编辑状态。</div>';
        host.innerHTML = `
            <div class="st-fsb-head"><div><span class="st-fsb-kicker">RPG LEDGER</span><h3>资金与行情</h3></div><button data-action="minimize" title="折叠">－</button></div>
            <div class="st-fsb-location">⌖ ${escapeHtml(state.location)} <span>${escapeHtml(state.currency.name || state.currency.code || '通用货币')}</span></div>
            <div class="st-fsb-total"><span>总资产</span><b>${formatMoney(total)}</b></div>
            <div class="st-fsb-funds"><div><span>现金</span><b>${formatMoney(state.funds.cash)}</b></div><div><span>存款</span><b>${formatMoney(state.funds.deposit)}</b></div><div><span>不动产/资产</span><b>${formatMoney(assetsTotal)}</b></div></div>
            <details class="st-fsb-details" open><summary>资产明细 <span>${state.funds.assets.length}</span></summary>${state.funds.assets.map((a) => `<div class="st-fsb-asset"><span>${escapeHtml(a.name)}<small>${escapeHtml(a.note)}</small></span><b>${formatMoney(a.value)}</b></div>`).join('') || '<div class="st-fsb-empty">暂无资产</div>'}</details>
            <details class="st-fsb-details" open><summary>周围行情 <span>${state.market.shops.length} 店</span></summary>${shops}</details>
            <div class="st-fsb-actions"><button data-action="extract">从正文识别</button><button data-action="models">拉取模型</button><button data-action="pull">模型解析正文</button><button data-action="edit">编辑状态</button><button data-action="settings">API 设置</button></div>
            <div class="st-fsb-foot"><span class="st-fsb-dot ${state.meta.confidence === 'api' ? 'api' : ''}"></span>${escapeHtml(state.meta.confidence === 'api' ? 'API 已校正' : state.meta.source || '手动状态')} · ${escapeHtml(state.meta.updatedAt || '未更新')}</div>`;
        host.querySelector('[data-action="minimize"]').addEventListener('click', () => host.classList.toggle('st-fsb-mini'));
        host.querySelectorAll('[data-action]').forEach((button) => {
            const action = button.dataset.action;
            if (action === 'minimize') return;
            button.addEventListener('click', () => handleAction(action));
        });
    }

    function handleAction(action) {
        if (action === 'extract') {
            const extracted = extractFromText(getRecentText());
            if (!extracted) return notify('没有找到可确认的资金或行情字段。建议在正文加入 ```json 状态块。', true);
            state = mergeState(state, Object.assign(extracted, { meta: { confidence: 'text', source: '正文识别', updatedAt: now() } }));
            saveState(); render(); notify('已从正文识别明确字段；未出现的字段保持原值。');
        } else if (action === 'models') pullModels();
        else if (action === 'pull') pullFromApi();
        else if (action === 'edit') openEditor();
        else if (action === 'settings') openSettings();
    }

    function now() { return new Date().toLocaleString(); }

    function getRecentText() {
        const chunks = [];
        const chat = Array.isArray(window.chat) ? window.chat : [];
        chat.slice(-Number(settings.recentMessages || 12)).forEach((m) => {
            const text = typeof m === 'string' ? m : (m?.mes || m?.content || m?.text || '');
            if (text) chunks.push(String(text));
        });
        if (!chunks.length) document.querySelectorAll('.mes_text').forEach((el) => chunks.push(el.innerText || el.textContent || ''));
        return chunks.slice(-Number(settings.recentMessages || 12)).join('\n\n');
    }

    function parseJsonCandidate(text) {
        const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidates = fenced ? [fenced[1]] : [];
        const source = String(text);
        const start = source.search(/[\[{]/);
        if (start >= 0) {
            let depth = 0;
            let quote = false;
            let escaped = false;
            for (let i = start; i < source.length; i++) {
                const ch = source[i];
                if (quote) {
                    if (escaped) escaped = false;
                    else if (ch === '\\') escaped = true;
                    else if (ch === '"') quote = false;
                    continue;
                }
                if (ch === '"') { quote = true; continue; }
                if (ch === '{' || ch === '[') depth++;
                if (ch === '}' || ch === ']') {
                    depth--;
                    if (depth === 0) { candidates.push(source.slice(start, i + 1)); break; }
                }
            }
        }
        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate);
                if (parsed && typeof parsed === 'object') return parsed;
            } catch (_) { /* continue */ }
        }
        return null;
    }

    function extractFromText(text) {
        if (!text || !text.trim()) return null;
        const json = parseJsonCandidate(text);
        if (json && (json.funds || json.finance || json.market || json.location)) return json;
        const patch = { funds: {} };
        let found = false;
        const amount = '(-?\\d+(?:[,.]\\d+)?(?:\\s*(?:万|千|百|[kKmMwW]))?)';
        const cash = text.match(new RegExp('(?:现金|手头现金|cash)\\s*(?:为|是|有|[:：=])\\s*' + amount, 'i'));
        const deposit = text.match(new RegExp('(?:存款|银行存款|deposit|savings)\\s*(?:为|是|有|[:：=])\\s*' + amount, 'i'));
        if (cash) { patch.funds.cash = toNumber(cash[1]); found = true; }
        if (deposit) { patch.funds.deposit = toNumber(deposit[1]); found = true; }
        const location = text.match(/(?:当前地点|所在地点|位置|location)\\s*(?:为|是|在|[:：=])\\s*([^\\n，,。]+)/i);
        if (location) { patch.location = location[1].trim(); found = true; }
        const currency = text.match(/(?:货币|currency)\\s*(?:为|是|[:：=])\\s*([^\\n，,。]+)/i);
        if (currency) { patch.currency = { name: currency[1].trim() }; found = true; }
        return found ? patch : null;
    }

    function apiUrl() {
        let endpoint = String(settings.endpoint || '').trim().replace(/\/+$/, '');
        if (!endpoint) endpoint = '/v1/chat/completions';
        if (!/chat\/completions$/i.test(endpoint)) endpoint += '/chat/completions';
        return endpoint;
    }

    function modelsUrl() {
        const endpoint = apiUrl();
        return endpoint.replace(/\/chat\/completions$/i, '/models');
    }

    function authHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (settings.apiKey) headers.Authorization = 'Bearer ' + settings.apiKey;
        return headers;
    }

    async function fetchModels() {
        const response = await fetch(modelsUrl(), { method: 'GET', headers: authHeaders() });
        const raw = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 240)}`);
        let data;
        try { data = JSON.parse(raw); } catch (_) { throw new Error('模型接口返回的不是 JSON'); }
        const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []));
        return list.map((item) => typeof item === 'string' ? item : (item?.id || item?.name || item?.model || '')).filter(Boolean);
    }

    async function pullModels() {
        notify('正在拉取模型列表…');
        try {
            const models = await fetchModels();
            settings.models = [...new Set(models)];
            if (!settings.model && settings.models[0]) settings.model = settings.models[0];
            localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(settings));
            notify(settings.models.length ? `已拉取 ${settings.models.length} 个模型。` : '接口可访问，但没有返回模型。');
            if (modal) openSettings();
        } catch (error) { notify('模型拉取失败：' + error.message, true); }
    }

    async function callApi(messages, maxTokens) {
        const body = { messages, temperature: Number(settings.temperature) || 0, max_tokens: maxTokens || 1200 };
        if (settings.model) body.model = settings.model;
        const response = await fetch(apiUrl(), { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
        const raw = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 240)}`);
        let data;
        try { data = JSON.parse(raw); } catch (_) { throw new Error('API 返回的不是 JSON'); }
        return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.output_text || '';
    }

    async function pullFromApi() {
        const text = getRecentText();
        if (!text.trim()) return notify('当前聊天没有可读取的正文。', true);
        notify('正在请求 API…');
        try {
            const system = `你是 RPG 账本解析器。只返回一个 JSON 对象，不要 Markdown，不要解释。严格遵循：{\"location\":\"\",\"currency\":{\"code\":\"\",\"name\":\"\",\"symbol\":\"\"},\"funds\":{\"cash\":0,\"deposit\":0,\"assets\":[{\"name\":\"\",\"value\":0,\"note\":\"\"}]},\"market\":{\"shops\":[{\"name\":\"\",\"type\":\"\",\"products\":[{\"name\":\"\",\"price\":0,\"stock\":\"\",\"unit\":\"\",\"note\":\"\"}]}]}}。只填写正文中明确出现或能直接换算的字段；不明确的字段保持空字符串、0 或空数组，禁止猜测。`;
            const content = await callApi([{ role: 'system', content: system }, { role: 'user', content: text }]);
            const parsed = parseJsonCandidate(content) || extractFromText(content);
            if (!parsed) throw new Error('API 未返回可识别的状态对象');
            state = mergeState(state, Object.assign(parsed, { meta: { confidence: 'api', source: '模型解析正文', updatedAt: now() } }));
            saveState(); render(); notify('模型解析完成，已合并明确字段。');
        } catch (error) { notify('模型解析失败：' + error.message, true); }
    }

    async function testApi() {
        const status = modal?.querySelector('.st-fsb-api-status');
        if (status) status.textContent = '测试中…';
        try {
            const models = await fetchModels();
            settings.models = [...new Set(models)];
            if (!settings.model && settings.models[0]) settings.model = settings.models[0];
            localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(settings));
            if (status) status.textContent = `连接成功，模型数：${models.length}`;
        } catch (error) {
            try {
                const content = await callApi([{ role: 'user', content: '仅回复 OK' }], 8);
                if (status) status.textContent = '连接成功：' + String(content).slice(0, 40);
            } catch (fallbackError) { if (status) status.textContent = '连接失败：' + fallbackError.message; }
        }
    }

    function openEditor() {
        openModal('编辑当前状态', `<p class="st-fsb-help">可以粘贴完整 JSON。保存后状态独立存储在当前聊天中，不会改写正文。</p><textarea class="st-fsb-json" spellcheck="false">${escapeHtml(JSON.stringify(state, null, 2))}</textarea><div class="st-fsb-modal-actions"><button data-modal="save-state">保存</button><button data-modal="close">取消</button></div>`);
        modal.querySelector('[data-modal="save-state"]').addEventListener('click', () => {
            try { state = normalizeState(JSON.parse(modal.querySelector('textarea').value)); saveState(); render(); closeModal(); notify('状态已保存。'); }
            catch (_) { notify('JSON 格式错误，未保存。', true); }
        });
    }

    function openSettings() {
        const modelOptions = [...new Set([...(settings.models || []), settings.model].filter(Boolean))].map((model) => `<option value="${escapeHtml(model)}"${model === settings.model ? ' selected' : ''}>${escapeHtml(model)}</option>`).join('');
        openModal('独立 API 连接', `<label>API 地址<input data-setting="endpoint" value="${escapeHtml(settings.endpoint)}" placeholder="https://example.com/v1 或完整 chat/completions 地址"></label><label>API Key<input data-setting="apiKey" type="password" value="${escapeHtml(settings.apiKey)}" placeholder="可留空"></label><label>模型<select data-setting="model"><option value="">未选择</option>${modelOptions}</select></label><p class="st-fsb-help">模型列表来自“拉取模型”，请求地址会自动使用同一 API 根地址的 <code>/models</code>。拉取模型只读取模型清单，不会发送聊天正文。</p><label>温度<input data-setting="temperature" type="number" min="0" max="2" step="0.1" value="${Number(settings.temperature) || 0}"></label><label>读取最近消息数<input data-setting="recentMessages" type="number" min="1" max="50" value="${Number(settings.recentMessages) || 12}"></label><div class="st-fsb-api-status"></div><div class="st-fsb-modal-actions"><button data-modal="save-settings">保存设置</button><button data-modal="pull-models">拉取模型</button><button data-modal="test-api">测试连接</button><button data-modal="close">关闭</button></div>`);
        modal.querySelector('[data-modal="save-settings"]').addEventListener('click', () => { saveSettingsFromModal(); notify('API 设置已保存。'); });
        modal.querySelector('[data-modal="test-api"]').addEventListener('click', async () => { saveSettingsFromModal(); await testApi(); });
        modal.querySelector('[data-modal="pull-models"]').addEventListener('click', async () => { saveSettingsFromModal(); await pullModels(); });
    }

    function saveSettingsFromModal() {
        modal.querySelectorAll('[data-setting]').forEach((input) => { settings[input.dataset.setting] = input.type === 'number' ? Number(input.value) : input.value; });
        localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(settings));
    }

    function openModal(title, content) {
        closeModal();
        modal = document.createElement('div');
        modal.className = 'st-fsb-modal-wrap';
        modal.innerHTML = `<div class="st-fsb-modal"><div class="st-fsb-modal-head"><b>${escapeHtml(title)}</b><button data-modal="close">×</button></div><div class="st-fsb-modal-body">${content}</div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('[data-modal="close"]').addEventListener('click', closeModal);
    }

    function closeModal() { if (modal) { modal.remove(); modal = null; } }

    function notify(message, error) {
        const n = document.createElement('div'); n.className = 'st-fsb-toast' + (error ? ' error' : ''); n.textContent = message;
        document.body.appendChild(n); setTimeout(() => n.remove(), 3600);
    }

    function refreshFromChat() {
        const key = currentChatKey();
        const stored = loadJson(key, null);
        if (stored) { state = normalizeState(stored); render(); }
        if (settings.autoExtract) {
            const extracted = extractFromText(getRecentText());
            if (extracted) { state = mergeState(state, Object.assign(extracted, { meta: { confidence: 'text', source: '自动正文识别', updatedAt: now() } })); saveState(); render(); }
        }
    }

    function init() {
        if (document.getElementById('st-financial-status-bar')) return;
        host = document.createElement('aside'); host.id = 'st-financial-status-bar'; host.className = 'st-fsb';
        document.body.appendChild(host); render();
        const events = window.event_types || {};
        const source = window.eventSource;
        ['MESSAGE_RECEIVED', 'MESSAGE_SENT', 'MESSAGE_UPDATED', 'CHAT_CHANGED', 'MESSAGE_SWIPED'].forEach((name) => {
            const eventName = events[name] || name;
            if (source && typeof source.on === 'function') source.on(eventName, refreshFromChat);
        });
        window.addEventListener('st-fsb-refresh', refreshFromChat);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
