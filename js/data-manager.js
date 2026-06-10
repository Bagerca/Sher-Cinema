/* js/data-manager.js */
import EventBus from './event-bus.js';

export class DataManager {
    constructor() {
        this.currentMode = 'archive'; 
        this.videos = [];
        this.config = null;
    }

    async init() {
        try {
            const cfgRes = await fetch('./data/config.json');
            this.config = await cfgRes.json();
            await this.loadSource(this.currentMode);
        } catch (e) {
            console.warn("⚠️ [DataManager] config.json не найден или пуст, используем настройки по умолчанию.");
            await this.loadSource(this.currentMode);
        }
    }

    // Извлечение ID видео из любых ссылок
    extractYouTubeId(url) {
        const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([^"&?\/\s]{11})/);
        return (match && match[1]) ? match[1] : url; 
    }

    // НОВОЕ: Извлечение ID плейлиста из полной ссылки
    extractYouTubePlaylistId(url) {
        const match = url.match(/[?&]list=([^#\&\?]+)/);
        return (match && match[1]) ? match[1] : url; // Если это не ссылка, а уже чистый ID - вернем как есть
    }

    // Резервный метод для Архива, если нет API-ключа или он не работает
    async fetchVideoMetadata(videoId) {
        try {
            const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            if (!res.ok) return null;
            const data = await res.json();
            return {
                id: videoId,
                title: data.title,
                thumb: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                channel: data.author_name,
                channelAvatar: null // oEmbed не отдает аватары
            };
        } catch (e) {
            return null;
        }
    }

    // Пакетная загрузка аватарок
    async fetchChannelAvatars(channelIds, apiKey) {
        const uniqueIds = [...new Set(channelIds)].filter(id => id);
        const avatarsMap = {};
        
        if (uniqueIds.length === 0) return avatarsMap;

        for (let i = 0; i < uniqueIds.length; i += 50) {
            const chunk = uniqueIds.slice(i, i + 50).join(',');
            try {
                const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${chunk}&key=${apiKey}`;
                const res = await fetch(url);
                if (!res.ok) continue; // Игнорируем ошибки при загрузке аватарок
                const data = await res.json();
                
                if (data.items) {
                    data.items.forEach(channel => {
                        avatarsMap[channel.id] = channel.snippet.thumbnails.default.url;
                    });
                }
            } catch (e) {
                console.warn("⚠️ [DataManager] Ошибка загрузки аватаров:", e);
            }
        }
        return avatarsMap;
    }

    async loadSource(mode) {
        this.currentMode = mode;
        this.videos = [];
        EventBus.emit('DATA_LOADING');

        const apiKey = this.config?.youtube_api_key;
        // Проверяем, что ключ вообще есть и это не дефолтная заглушка
        const hasValidApiKey = apiKey && apiKey !== "ВАШ_GOOGLE_API_KEY" && apiKey.trim() !== "";

        try {
            if (mode === 'archive') {
                const res = await fetch('./data/archive.json');
                const rawData = await res.json();
                
                const videoIds = [];
                const customItems = [];
                
                rawData.forEach(item => {
                    if (typeof item === 'string') videoIds.push(this.extractYouTubeId(item));
                    else customItems.push(item);
                });

                let processedVideos = [];
                let apiSuccess = false;

                // Пытаемся использовать быстрый API метод, если ключ выглядит рабочим
                if (hasValidApiKey && videoIds.length > 0) {
                    try {
                        for (let i = 0; i < videoIds.length; i += 50) {
                            const chunk = videoIds.slice(i, i + 50).join(',');
                            const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${chunk}&key=${apiKey}`);
                            
                            if (!vRes.ok) throw new Error(`API вернул статус ${vRes.status}`);
                            
                            const vData = await vRes.json();
                            
                            if (vData.items) {
                                const channelIds = vData.items.map(item => item.snippet.channelId);
                                const avatarsMap = await this.fetchChannelAvatars(channelIds, apiKey);

                                vData.items.forEach(item => {
                                    processedVideos.push({
                                        id: item.id,
                                        title: item.snippet.title,
                                        thumb: item.snippet.thumbnails.maxres ? item.snippet.thumbnails.maxres.url : (item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url),
                                        channel: item.snippet.channelTitle,
                                        channelAvatar: avatarsMap[item.snippet.channelId] || null
                                    });
                                });
                            }
                        }
                        apiSuccess = true;
                    } catch (apiError) {
                        console.warn("⚠️ [DataManager] Ошибка API, переключаемся на безопасный oEmbed:", apiError.message);
                        apiSuccess = false;
                    }
                }

                if (!apiSuccess && videoIds.length > 0) {
                    console.log("♻️ [DataManager] Загрузка архива через резервный метод (oEmbed)...");
                    const fetchPromises = videoIds.map(async (id) => {
                        const meta = await this.fetchVideoMetadata(id);
                        return meta ? meta : { id, title: "Неизвестное видео", thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, channel: "YouTube" };
                    });
                    processedVideos = await Promise.all(fetchPromises);
                }
                
                this.videos = [...processedVideos, ...customItems];

            } else if (mode === 'youtube') {
                if (!hasValidApiKey) {
                    throw new Error("Чтобы открыть этот раздел, впишите настоящий API-ключ в config.json");
                }
                if (!this.config.youtube_playlists || this.config.youtube_playlists.length === 0) {
                    throw new Error("Не настроен плейлист в config.json");
                }
                
                // ИСПРАВЛЕНИЕ: Теперь система автоматически вырежет ID из полной ссылки
                const rawPlaylistInput = this.config.youtube_playlists[0];
                const playlistId = this.extractYouTubePlaylistId(rawPlaylistInput);
                
                const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;
                
                const apiRes = await fetch(url);
                const data = await apiRes.json();
                
                if (data.error) throw new Error(data.error.message || "Ошибка YouTube API");
                
                if (data.items) {
                    const channelIds = data.items.map(item => item.snippet.videoOwnerChannelId);
                    const avatarsMap = await this.fetchChannelAvatars(channelIds, apiKey);

                    this.videos = data.items.map(item => ({
                        id: item.snippet.resourceId.videoId,
                        title: item.snippet.title,
                        thumb: item.snippet.thumbnails.maxres ? item.snippet.thumbnails.maxres.url : item.snippet.thumbnails.high?.url,
                        channel: item.snippet.videoOwnerChannelTitle,
                        channelAvatar: avatarsMap[item.snippet.videoOwnerChannelId] || null
                    }));
                }
            }
            
            console.log(`📂 [DataManager] Загружено ${this.videos.length} видео. Режим: ${mode}`);
            EventBus.emit('DATA_READY', this.videos);
            
        } catch (error) {
            console.error(`❌ [DataManager] Ошибка загрузки базы ${mode}:`, error);
            EventBus.emit('DATA_READY', []);
            EventBus.emit('SHOW_ERROR', error.message);
        }
    }

    search(query) {
        if (!query.trim()) return this.videos;
        const q = query.toLowerCase();
        return this.videos.filter(v => v.title.toLowerCase().includes(q));
    }
}