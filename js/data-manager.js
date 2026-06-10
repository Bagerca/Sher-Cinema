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
            console.error("⚠️ [DataManager] Ошибка инициализации конфига:", e);
            await this.loadLocalArchiveAsFallback("Ошибка загрузки плейлистов. Подключен резервный архив.");
        }
    }

    extractYouTubePlaylistId(url) {
        if (!url) return null;
        const match = url.match(/[?&]list=([^#\&\?]+)/);
        return (match && match[1]) ? match[1] : url; 
    }

    extractVideoId(url) {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    // ОБНОВЛЕНО: Возвращает и отформатированную строку, и общее число секунд
    parseDuration(isoStr) {
        if (!isoStr) return { formatted: '', seconds: 0 };
        const match = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return { formatted: '', seconds: 0 };
        const h = match[1] ? parseInt(match[1]) : 0;
        const m = match[2] ? parseInt(match[2]) : 0;
        const s = match[3] ? parseInt(match[3]) : 0;
        
        const totalSeconds = (h * 3600) + (m * 60) + s;
        let formatted = '';
        if (h > 0) formatted = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        else formatted = `${m}:${s.toString().padStart(2, '0')}`;
        
        return { formatted, seconds: totalSeconds };
    }

    formatNumber(num) {
        if (!num) return '';
        const n = parseInt(num);
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return n.toString();
    }

    formatDate(isoDate) {
        if (!isoDate) return 'Дата неизвестна';
        const date = new Date(isoDate);
        const months = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'];
        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }

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
                        const thumbs = ch.snippet.thumbnails;
                        const hqAvatar = thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url;
                        map[ch.id] = {
                            avatar: hqAvatar,
                            handle: ch.snippet.customUrl || null,
                            subs: this.formatNumber(ch.statistics.subscriberCount)
                        };
                    });
                }
            } catch (e) { console.warn("⚠️ Ошибка загрузки каналов:", e); }
        }
        return map;
    }

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
                        const durData = this.parseDuration(v.contentDetails.duration);
                        map[v.id] = {
                            duration: durData.formatted,
                            durationSec: durData.seconds, // Для сортировки
                            viewsRaw: v.statistics.viewCount,
                            views: this.formatNumber(v.statistics.viewCount),
                            likes: this.formatNumber(v.statistics.likeCount),
                            isLive: v.snippet.liveBroadcastContent === 'live',
                            description: v.snippet.description || 'Описание отсутствует.',
                            publishDate: this.formatDate(v.snippet.publishedAt),
                            publishTimestamp: new Date(v.snippet.publishedAt).getTime() // Для сортировки
                        };
                    });
                }
            } catch (e) { console.warn("⚠️ Ошибка загрузки статы видео:", e); }
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
            await this.loadLocalArchiveAsFallback("Демо-режим: API-ключ не настроен.");
            return;
        }

        try {
            const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;
            const apiRes = await fetch(url);
            if (!apiRes.ok) throw new Error(`HTTP ошибка! Статус: ${apiRes.status}`);
            const data = await apiRes.json();
            
            if (data.error) throw new Error(data.error.message || "Ошибка YouTube API");
            
            if (data.items) {
                const channelIds = data.items.map(item => item.snippet.videoOwnerChannelId);
                const videoIds = data.items.map(item => item.snippet.resourceId.videoId);

                const [channelsMap, videosMap] = await Promise.all([
                    this.fetchChannelDetails(channelIds, apiKey),
                    this.fetchVideoStats(videoIds, apiKey)
                ]);

                this.videos = data.items.map((item, i) => {
                    const cId = item.snippet.videoOwnerChannelId;
                    const vId = item.snippet.resourceId.videoId;
                    const cDetails = channelsMap[cId] || {};
                    const vDetails = videosMap[vId] || {};

                    return {
                        id: vId,
                        originalIndex: i, // Сохраняем изначальный порядок YouTube
                        title: item.snippet.title,
                        thumb: item.snippet.thumbnails.maxres ? item.snippet.thumbnails.maxres.url : item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
                        channel: item.snippet.videoOwnerChannelTitle,
                        channelAvatar: cDetails.avatar || null,
                        channelHandle: cDetails.handle || null,
                        channelSubs: cDetails.subs || null,
                        duration: vDetails.duration || '',
                        durationSec: vDetails.durationSec || 0,
                        views: vDetails.views || null,
                        viewsRaw: vDetails.viewsRaw || null, 
                        likes: vDetails.likes || null,
                        isLive: vDetails.isLive || false,
                        description: vDetails.description || 'Описание не загружено', 
                        publishDate: vDetails.publishDate || 'Неизвестно',
                        publishTimestamp: vDetails.publishTimestamp || 0
                    };
                });
            }
            EventBus.emit('DATA_READY', this.videos);
            EventBus.emit('PLAYLIST_CHANGED', index);
            
        } catch (error) {
            await this.loadLocalArchiveAsFallback(`Ошибка подключения. Загружен архив.`);
        }
    }

    async loadLocalArchiveAsFallback(warningMsg) {
        try {
            const res = await fetch('./archive.json');
            if (!res.ok) throw new Error("Не удалось загрузить archive.json");
            const urls = await res.json();

            this.videos = urls.map((url, i) => {
                const id = this.extractVideoId(url);
                return {
                    id: id || "dQw4w9WgXcQ", originalIndex: i,
                    title: `Архивное видео #${i + 1}`,
                    thumb: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "",
                    channel: "ЛОКАЛЬНЫЙ АРХИВ", channelAvatar: null, channelHandle: null, channelSubs: null,
                    duration: "", durationSec: 0, views: "Local", viewsRaw: "0", likes: null, isLive: false,
                    description: `Ссылка: ${url}`, publishDate: this.formatDate(new Date().toISOString()), publishTimestamp: Date.now()
                };
            });

            this.playlists = [{ name: "РЕЗЕРВНЫЙ АРХИВ", url: "" }];
            EventBus.emit('CONFIG_READY', this.playlists);
            EventBus.emit('DATA_READY', this.videos);
            EventBus.emit('PLAYLIST_CHANGED', 0);
            EventBus.emit('SHOW_ERROR', warningMsg);
        } catch (e) { EventBus.emit('DATA_READY', []); }
    }

    search(query) {
        if (!query.trim()) return this.videos;
        const q = query.toLowerCase();
        return this.videos.filter(v => 
            v.title.toLowerCase().includes(q) || 
            (v.channel && v.channel.toLowerCase().includes(q))
        );
    }
}