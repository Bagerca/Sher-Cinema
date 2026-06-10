/* js/data-manager.js */
import EventBus from './event-bus.js';

export class DataManager {
    constructor() {
        this.videos = [];
        this.config = null;
        this.playlists = [];
        this.currentPlaylistIndex = 0;
    }

    async init() {
        try {
            const cfgRes = await fetch('./data/config.json');
            this.config = await cfgRes.json();
            this.playlists = this.config.playlists || [];
            
            EventBus.emit('CONFIG_READY', this.playlists);

            if (this.playlists.length > 0) {
                await this.loadPlaylist(0);
            } else {
                throw new Error("В config.json нет ни одного плейлиста");
            }
        } catch (e) {
            console.error("⚠️ [DataManager] Ошибка инициализации:", e);
            EventBus.emit('SHOW_ERROR', "Не удалось загрузить config.json или плейлисты не настроены.");
        }
    }

    extractYouTubePlaylistId(url) {
        if (!url) return null;
        const match = url.match(/[?&]list=([^#\&\?]+)/);
        return (match && match[1]) ? match[1] : url; 
    }

    // НОВОЕ: Парсинг ISO 8601 длительности (PT25M45S -> 25:45)
    parseDuration(isoStr) {
        if (!isoStr) return '';
        const match = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return '';
        const h = match[1] ? parseInt(match[1]) : 0;
        const m = match[2] ? parseInt(match[2]) : 0;
        const s = match[3] ? parseInt(match[3]) : 0;
        
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // НОВОЕ: Форматирование чисел (1352931 -> 1.3M)
    formatNumber(num) {
        if (!num) return '';
        const n = parseInt(num);
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return n.toString();
    }

    // ОБНОВЛЕНО: Загружаем не только аватар, но и хэндл + подписчиков
    async fetchChannelDetails(channelIds, apiKey) {
        const uniqueIds = [...new Set(channelIds)].filter(id => id);
        const map = {};
        if (uniqueIds.length === 0) return map;

        for (let i = 0; i < uniqueIds.length; i += 50) {
            const chunk = uniqueIds.slice(i, i + 50).join(',');
            try {
                const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${chunk}&key=${apiKey}`;
                const res = await fetch(url);
                if (!res.ok) continue; 
                const data = await res.json();
                
                if (data.items) {
                    data.items.forEach(ch => {
                        map[ch.id] = {
                            avatar: ch.snippet.thumbnails.default.url,
                            handle: ch.snippet.customUrl || null,
                            subs: this.formatNumber(ch.statistics.subscriberCount)
                        };
                    });
                }
            } catch (e) {
                console.warn("⚠️ [DataManager] Ошибка загрузки каналов:", e);
            }
        }
        return map;
    }

    // НОВОЕ: Загрузка статистики видео (один батч-запрос)
    async fetchVideoStats(videoIds, apiKey) {
        const uniqueIds = [...new Set(videoIds)].filter(id => id);
        const map = {};
        if (uniqueIds.length === 0) return map;

        for (let i = 0; i < uniqueIds.length; i += 50) {
            const chunk = uniqueIds.slice(i, i + 50).join(',');
            try {
                const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet&id=${chunk}&key=${apiKey}`;
                const res = await fetch(url);
                if (!res.ok) continue;
                const data = await res.json();

                if (data.items) {
                    data.items.forEach(v => {
                        map[v.id] = {
                            durationRaw: v.contentDetails.duration,
                            duration: this.parseDuration(v.contentDetails.duration),
                            views: this.formatNumber(v.statistics.viewCount),
                            likes: this.formatNumber(v.statistics.likeCount),
                            isLive: v.snippet.liveBroadcastContent === 'live'
                        };
                    });
                }
            } catch (e) {
                console.warn("⚠️ [DataManager] Ошибка загрузки статы видео:", e);
            }
        }
        return map;
    }

    async loadPlaylist(index) {
        if (index < 0 || index >= this.playlists.length) return;
        
        this.currentPlaylistIndex = index;
        this.videos = [];
        EventBus.emit('DATA_LOADING');

        const apiKey = this.config?.youtube_api_key;
        const playlistData = this.playlists[index];
        const playlistId = this.extractYouTubePlaylistId(playlistData.url);

        if (!apiKey || apiKey === "ВАШ_GOOGLE_API_KEY" || apiKey.trim() === "") {
            EventBus.emit('SHOW_ERROR', "Укажите рабочий API-ключ в config.json");
            return;
        }

        try {
            console.log(`📡 [DataManager] Загрузка плейлиста: ${playlistData.name}`);
            const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;
            
            const apiRes = await fetch(url);
            const data = await apiRes.json();
            
            if (data.error) throw new Error(data.error.message || "Ошибка YouTube API");
            
            if (data.items) {
                const channelIds = data.items.map(item => item.snippet.videoOwnerChannelId);
                const videoIds = data.items.map(item => item.snippet.resourceId.videoId);

                // ОДНОВРЕМЕННО запрашиваем детали каналов и статистику видео
                const [channelsMap, videosMap] = await Promise.all([
                    this.fetchChannelDetails(channelIds, apiKey),
                    this.fetchVideoStats(videoIds, apiKey)
                ]);

                this.videos = data.items.map(item => {
                    const cId = item.snippet.videoOwnerChannelId;
                    const vId = item.snippet.resourceId.videoId;
                    const cDetails = channelsMap[cId] || {};
                    const vDetails = videosMap[vId] || {};

                    return {
                        id: vId,
                        title: item.snippet.title,
                        thumb: item.snippet.thumbnails.maxres ? item.snippet.thumbnails.maxres.url : item.snippet.thumbnails.high?.url,
                        channel: item.snippet.videoOwnerChannelTitle,
                        channelAvatar: cDetails.avatar || null,
                        channelHandle: cDetails.handle || null,
                        channelSubs: cDetails.subs || null,
                        duration: vDetails.duration || '',
                        views: vDetails.views || null,
                        likes: vDetails.likes || null,
                        isLive: vDetails.isLive || false
                    };
                });
            }
            
            console.log(`📂 [DataManager] Загружено ${this.videos.length} видео со статистикой.`);
            EventBus.emit('DATA_READY', this.videos);
            EventBus.emit('PLAYLIST_CHANGED', index);
            
        } catch (error) {
            console.error(`❌ [DataManager] Ошибка загрузки базы:`, error);
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