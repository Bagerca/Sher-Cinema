/* js/youtube-player.js */
import EventBus from './event-bus.js';

export class YouTubePlayerController {
    constructor() {
        this.player = null;
        this.isReady = false;
        this.currentVideoId = null;
        this.timeTracker = null;
        this.currentQuality = 'auto';
        this.userRequestedQuality = null;

        EventBus.on('CMD_PLAY_PAUSE', () => this.togglePlay());
        EventBus.on('PLAY_VIDEO', (videoId) => this.loadVideo(videoId));
        EventBus.on('CMD_SEEK', (percent) => this.seekToPercent(percent));
        EventBus.on('CMD_VOLUME', (vol) => this.setVolume(vol));
        EventBus.on('CMD_MUTE_TOGGLE', () => this.toggleMute());
        EventBus.on('CMD_CHANGE_QUALITY', (qual) => this.forceQuality(qual));
    }

    init() {
        // ИСПРАВЛЕНИЕ: Жестко формируем правильный origin для GitHub Pages
        const currentOrigin = window.location.protocol + '//' + window.location.hostname;

        this.player = new YT.Player('yt-player', {
            height: '100%', 
            width: '100%',
            playerVars: {
                // ВАЖНО: На боевых серверах автоплей работает стабильнее, если передавать origin
                'autoplay': 1, 
                'controls': 0, 
                'disablekb': 1,
                'fs': 0, 
                'rel': 0, 
                'iv_load_policy': 3,
                'modestbranding': 1, 
                'origin': currentOrigin,
                'enablejsapi': 1,
                'playsinline': 1 // Помогает автоплею на мобильных устройствах
            },
            events: {
                'onReady': () => {
                    this.isReady = true;
                    document.getElementById('player-loader').style.display = 'none';
                    EventBus.emit('PLAYER_READY');
                    
                    if (this.currentVideoId) {
                        this.loadVideo(this.currentVideoId);
                    }
                    this.startTimeTracker();
                },
                'onStateChange': (event) => this.onStateChange(event),
                'onError': (event) => {
                    console.error("⚠️ [Player] Ошибка YouTube плеера, код:", event.data);
                    // Если видео заблокировано владельцем (код 150) или удалено (код 100), пропускаем его
                    if (event.data === 150 || event.data === 101 || event.data === 100) {
                        EventBus.emit('CMD_NEXT');
                    }
                },
                'onPlaybackQualityChange': (event) => {
                    if (!this.userRequestedQuality) {
                        EventBus.emit('QUALITY_CHANGED', event.data);
                    }
                }
            }
        });
    }

    loadVideo(videoId) {
        this.currentVideoId = videoId;
        this.userRequestedQuality = null;
        if (this.isReady) {
            this.player.loadVideoById({ videoId: videoId });
            EventBus.emit('QUALITY_CHANGED', 'auto');
        }
    }

    showReloadGlitch() {
        const loader = document.getElementById('player-loader');
        if(loader) {
            loader.innerHTML = '<i class="fas fa-sync fa-spin"></i> СИНХРОНИЗАЦИЯ ПОТОКА...';
            loader.style.display = 'flex';
            loader.style.background = 'rgba(0,0,0,0.8)';
            setTimeout(() => { loader.style.display = 'none'; }, 800);
        }
    }

    forceQuality(qualityCode) {
        this.currentQuality = qualityCode;
        this.userRequestedQuality = qualityCode;
        if (!this.isReady || !this.currentVideoId) return;

        this.showReloadGlitch();
        
        const currentTime = this.player.getCurrentTime();
        
        if (qualityCode === 'auto') {
            this.player.loadVideoById({
                videoId: this.currentVideoId,
                startSeconds: currentTime
            });
            this.userRequestedQuality = null;
        } else {
            this.player.loadVideoById({
                videoId: this.currentVideoId,
                startSeconds: currentTime,
                suggestedQuality: qualityCode
            });
        }
        
        console.log(`🎥 [Player] Запрос качества: ${qualityCode}`);
        EventBus.emit('QUALITY_CHANGED', qualityCode);
    }

    togglePlay() {
        if (!this.isReady || !this.currentVideoId) return;
        const state = this.player.getPlayerState();
        if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) {
            this.player.pauseVideo();
        } else {
            // Если браузер заблокировал старт, эта кнопка принудительно запустит его
            this.player.playVideo();
        }
    }

    seekToPercent(percent) {
        if (!this.isReady || !this.currentVideoId) return;
        const duration = this.player.getDuration();
        if (duration > 0) {
            const targetTime = duration * percent;
            this.player.seekTo(targetTime, true);
            EventBus.emit('TIME_UPDATE', { current: targetTime, total: duration });
        }
    }

    setVolume(vol) {
        if (!this.isReady) return;
        this.player.setVolume(vol);
        if (vol > 0 && this.player.isMuted()) this.player.unMute();
    }

    toggleMute() {
        if (!this.isReady) return;
        if (this.player.isMuted()) {
            this.player.unMute();
            EventBus.emit('AUDIO_MUTED', false);
        } else {
            this.player.mute();
            EventBus.emit('AUDIO_MUTED', true);
        }
    }

    onStateChange(event) {
        // YT.PlayerState.UNSTARTED = -1
        if (event.data === YT.PlayerState.ENDED) {
            EventBus.emit('PLAYER_STATE_CHANGED', false);
            EventBus.emit('CMD_NEXT');
            return;
        }
        
        const isPlaying = event.data === YT.PlayerState.PLAYING;
        EventBus.emit('PLAYER_STATE_CHANGED', isPlaying);

        if (isPlaying) {
            try {
                const qualities = this.player.getAvailableQualityLevels();
                EventBus.emit('AVAILABLE_QUALITIES_UPDATE', qualities);
                
                if (!this.userRequestedQuality) {
                    const currentQual = this.player.getPlaybackQuality();
                    EventBus.emit('QUALITY_CHANGED', currentQual);
                }
            } catch (e) {
                console.error('Ошибка получения качеств', e);
            }
        }
    }

    startTimeTracker() {
        if (this.timeTracker) clearInterval(this.timeTracker);
        this.timeTracker = setInterval(() => {
            if (this.isReady && this.currentVideoId) {
                const current = this.player.getCurrentTime() || 0;
                const total = this.player.getDuration() || 0;
                if (total > 0) EventBus.emit('TIME_UPDATE', { current, total });
            }
        }, 250);
    }
}