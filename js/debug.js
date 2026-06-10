/* js/debug.js */

class ApiDebugger {
    constructor() {
        this.apiKey = null;
        this.config = null;
        this.rawJsonData = null;

        this.els = {
            apiKeyInput: document.getElementById('api-key-input'),
            playlistSelect: document.getElementById('playlist-select'),
            videoIdInput: document.getElementById('video-id-input'),
            channelIdInput: document.getElementById('channel-id-input'),
            log: document.getElementById('status-log'),
            jsonOutput: document.getElementById('json-output'),
            endpointTitle: document.getElementById('endpoint-title'),
            btnCopy: document.getElementById('btn-copy'),
            actionBtns: document.querySelectorAll('.action-btn')
        };

        this.init();
    }

    logMsg(msg, isError = false) {
        const time = new Date().toLocaleTimeString();
        this.els.log.innerHTML = `<span style="color: ${isError ? '#ff2d95' : '#888'}">[${time}]</span> ${msg}`;
    }

    async init() {
        this.logMsg("Чтение config.json...");
        try {
            const res = await fetch('./data/config.json');
            this.config = await res.json();
            this.apiKey = this.config.youtube_api_key;
            
            this.els.apiKeyInput.value = this.apiKey ? this.apiKey.substring(0, 15) + '...' : 'НЕ НАЙДЕН';

            if (this.config.playlists && this.config.playlists.length > 0) {
                this.config.playlists.forEach(pl => {
                    const opt = document.createElement('option');
                    opt.value = this.extractPlaylistId(pl.url);
                    opt.textContent = pl.name;
                    this.els.playlistSelect.appendChild(opt);
                });
            }

            this.bindEvents();
            this.logMsg("Инициализация завершена. Выберите метод.");
        } catch (e) {
            this.logMsg("Ошибка загрузки конфига: " + e.message, true);
        }
    }

    extractPlaylistId(url) {
        if (!url) return "";
        const match = url.match(/[?&]list=([^#\&\?]+)/);
        return (match && match[1]) ? match[1] : url;
    }

    bindEvents() {
        this.els.actionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.target;
                this.executeApiCall(target);
            });
        });

        this.els.btnCopy.addEventListener('click', () => {
            if (this.rawJsonData) {
                navigator.clipboard.writeText(JSON.stringify(this.rawJsonData, null, 2))
                    .then(() => this.logMsg("JSON скопирован в буфер обмена!"))
                    .catch(err => this.logMsg("Ошибка копирования: " + err, true));
            }
        });
    }

    async executeApiCall(target) {
        if (!this.apiKey || this.apiKey === "ВАШ_GOOGLE_API_KEY") {
            this.logMsg("Укажите рабочий API-ключ в config.json!", true);
            return;
        }

        const baseUrl = "https://www.googleapis.com/youtube/v3/";
        let url = "";
        let endpointName = "";

        const plId = this.els.playlistSelect.value;
        const vId = this.els.videoIdInput.value.trim();
        const chId = this.els.channelIdInput.value.trim();

        switch (target) {
            case 'playlistItems':
                if (!plId) return this.logMsg("Выберите плейлист!", true);
                // Запрашиваем ВСЕ возможные parts для глубокого анализа
                url = `${baseUrl}playlistItems?part=snippet,contentDetails,status&maxResults=5&playlistId=${plId}&key=${this.apiKey}`;
                endpointName = `GET /playlistItems (Playlist: ${plId})`;
                break;
            
            case 'playlistInfo':
                if (!plId) return this.logMsg("Выберите плейлист!", true);
                url = `${baseUrl}playlists?part=snippet,contentDetails,status,player&id=${plId}&key=${this.apiKey}`;
                endpointName = `GET /playlists (Playlist: ${plId})`;
                break;

            case 'video':
                if (!vId) return this.logMsg("Введите Video ID!", true);
                url = `${baseUrl}videos?part=snippet,contentDetails,statistics,status,liveStreamingDetails,player,topicDetails&id=${vId}&key=${this.apiKey}`;
                endpointName = `GET /videos (Video: ${vId})`;
                break;

            case 'channel':
                if (!chId) return this.logMsg("Введите Channel ID!", true);
                url = `${baseUrl}channels?part=snippet,contentDetails,statistics,status,brandingSettings,topicDetails&id=${chId}&key=${this.apiKey}`;
                endpointName = `GET /channels (Channel: ${chId})`;
                break;
        }

        this.logMsg(`Выполняю запрос: ${target}...`);
        this.els.endpointTitle.textContent = endpointName;
        this.els.jsonOutput.innerHTML = '<span style="color:#aaa;">Ожидание ответа от серверов YouTube...</span>';

        try {
            const response = await fetch(url);
            const data = await response.json();
            
            this.rawJsonData = data;
            
            if (response.ok) {
                this.logMsg(`Успешно! Получено данных: ${(JSON.stringify(data).length / 1024).toFixed(2)} KB`);
                this.renderJson(data);

                // Автоматическое заполнение полей для удобства тестирования
                this.autoFillHelpers(target, data);
            } else {
                this.logMsg(`API Ошибка: ${data.error?.message || response.statusText}`, true);
                this.renderJson(data);
            }
        } catch (error) {
            this.logMsg(`Сетевая ошибка: ${error.message}`, true);
            this.els.jsonOutput.textContent = error.toString();
        }
    }

    // Парсит ответ и заполняет пустые инпуты, чтобы не копировать ID вручную
    autoFillHelpers(target, data) {
        if (!data.items || data.items.length === 0) return;

        const firstItem = data.items[0];

        if (target === 'playlistItems') {
            if (!this.els.videoIdInput.value) {
                this.els.videoIdInput.value = firstItem.snippet.resourceId.videoId;
                this.logMsg("Video ID автоматически подставлен из ответа.");
            }
            if (!this.els.channelIdInput.value) {
                this.els.channelIdInput.value = firstItem.snippet.videoOwnerChannelId;
            }
        } else if (target === 'video') {
            if (!this.els.channelIdInput.value) {
                this.els.channelIdInput.value = firstItem.snippet.channelId;
                this.logMsg("Channel ID автоматически подставлен из видео.");
            }
        }
    }

    renderJson(obj) {
        const jsonStr = JSON.stringify(obj, null, 2);
        
        // Регулярка для подсветки синтаксиса JSON
        const highlighted = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
                let cls = 'json-number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'json-key';
                    } else {
                        cls = 'json-string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean';
                } else if (/null/.test(match)) {
                    cls = 'json-null';
                }
                return '<span class="' + cls + '">' + match + '</span>';
            });

        this.els.jsonOutput.innerHTML = highlighted;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ApiDebugger();
});