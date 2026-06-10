/* js/youtube-player.js */
import EventBus from './event-bus.js';

export class YouTubePlayerController {
    constructor() {
        this.player = null;
        this.isReady = false;
        this.currentVideoId = null;
        this.timeTracker = null;
        this.ccEnabled = false;
        this.nativeControls = false; // Флаг: включен ли родной интерфейс YouTube

        EventBus.on('CMD_PLAY_PAUSE', () => this.togglePlay());
        EventBus.on('PLAY_VIDEO', (videoId) => this.loadVideo(videoId));
        EventBus.on('CMD_SEEK', (percent) => this.seekToPercent(percent));
        EventBus.on('CMD_SEEK_RELATIVE', (seconds) => this.seekRelative(seconds));
        EventBus.on('CMD_VOLUME', (vol) => this.setVolume(vol));
        EventBus.on('CMD_MUTE_TOGGLE', () => this.toggleMute());
        EventBus.on('CMD_SPEED', (rate) => this.setSpeed(rate));
        EventBus.on('CMD_TOGGLE_CC', () => this.toggleCC());
        
        // НОВОЕ: Команда на пересборку плеера
        EventBus.on('CMD_REBUILD_PLAYER', (showNative) => this.rebuildPlayer(showNative));
    }

    init() {
        const currentOrigin = window.location.origin;

        this.player = new YT.Player('yt-player', {
            height: '100%', 
            width: '100%',
            playerVars: {
                'autoplay': 0, 
                // Если включен System Override, показываем родные контролы
                'controls': this.nativeControls ? 1 : 0, 
                'disablekb': 1,
                'fs': 0, 
                'rel': 0, 
                'iv_load_policy': 3,
                'modestbranding': 1, 
                'origin': currentOrigin,
                'enablejsapi': 1,
                'playsinline': 1,
                'hl': 'ru' 
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
                    if (event.data === 150 || event.data === 101 || event.data === 100) {
                        EventBus.emit('CMD_NEXT');
                    }
                },
                'onPlaybackQualityChange': (event) => {
                    EventBus.emit('QUALITY_CHANGED', event.data);
                }
            }
        });
    }

    // НОВОЕ: Пересборка плеера на лету
    rebuildPlayer(showNative) {
        if (!this.player || !this.currentVideoId) return;
        
        const loader = document.getElementById('player-loader');
        loader.innerHTML = '<i class="fas fa-tools fa-spin"></i> ПЕРЕСБОРКА СИСТЕМЫ...';
        loader.style.display = 'flex';
        loader.style.background = 'rgba(0,0,0,0.8)';

        const currentTime = this.player.getCurrentTime();
        const currentVideo = this.currentVideoId;
        const wasPlaying = this.player.getPlayerState() === YT.PlayerState.PLAYING;
        const currentVol = this.player.getVolume();

        // Убиваем старый плеер
        this.player.destroy();
        this.isReady = false;
        this.nativeControls = showNative;

        // Создаем новый
        const currentOrigin = window.location.origin;
        this.player = new YT.Player('yt-player', {
            height: '100%', width: '100%',
            playerVars: {
                'autoplay': wasPlaying ? 1 : 0, 
                'controls': this.nativeControls ? 1 : 0, 
                'disablekb': 1, 'fs': 0, 'rel': 0, 'iv_load_policy': 3,
                'modestbranding': 1, 'origin': currentOrigin, 'enablejsapi': 1, 'playsinline': 1, 'hl': 'ru'
            },
            events: {
                'onReady': () => {
                    this.isReady = true;
                    loader.style.display = 'none';
                    this.player.setVolume(currentVol);
                    
                    if (wasPlaying) {
                        this.player.loadVideoById({ videoId: currentVideo, startSeconds: currentTime });
                    } else {
                        this.player.cueVideoById({ videoId: currentVideo, startSeconds: currentTime });
                    }
                    this.startTimeTracker();
                },
                'onStateChange': (event) => this.onStateChange(event)
            }
        });
    }

    loadVideo(videoId) {
        this.currentVideoId = videoId;
        if (this.isReady) {
            this.player.cueVideoById({ videoId: videoId });
            EventBus.emit('QUALITY_CHANGED', 'auto');
        }
    }

    fadeInVolume() {
        const targetVol = parseInt(localStorage.getItem('sher_volume')) || 100;
        this.player.setVolume(0);
        let currentFade = 0;
        const step = targetVol / 10; 
        const fadeInt = setInterval(() => {
            currentFade += step;
            if (currentFade >= targetVol) { currentFade = targetVol; clearInterval(fadeInt); }
            this.player.setVolume(currentFade);
        }, 50); 
    }

    togglePlay() {
        if (!this.isReady || !this.currentVideoId) return;
        const state = this.player.getPlayerState();
        if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) {
            this.player.pauseVideo();
        } else {
            this.fadeInVolume();
            this.player.playVideo();
        }
    }

    seekToPercent(percent) {
        if (!this.isReady || !this.currentVideoId) return;
        const duration = this.player.getDuration();
        if (duration > 0) {
            const targetTime = duration * percent;
            this.player.seekTo(targetTime, true);
        }
    }

    seekRelative(seconds) {
        if (!this.isReady || !this.currentVideoId) return;
        const current = this.player.getCurrentTime();
        const duration = this.player.getDuration();
        if (duration > 0) {
            let targetTime = current + seconds;
            if (targetTime < 0) targetTime = 0;
            if (targetTime > duration) targetTime = duration;
            this.player.seekTo(targetTime, true);
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

    setSpeed(rate) {
        if (!this.isReady) return;
        this.player.setPlaybackRate(parseFloat(rate));
    }

    toggleCC() {
        if (!this.isReady) return;
        this.ccEnabled = !this.ccEnabled;
        if (this.ccEnabled) {
            this.player.loadModule('captions');
            this.player.setOption('captions', 'track', {'languageCode': 'ru'});
        } else {
            this.player.unloadModule('captions');
        }
        EventBus.emit('CC_STATE_CHANGED', this.ccEnabled);
    }

    onStateChange(event) {
        if (event.data === YT.PlayerState.ENDED) {
            EventBus.emit('PLAYER_STATE_CHANGED', false);
            EventBus.emit('CMD_NEXT');
            return;
        }
        const isPlaying = event.data === YT.PlayerState.PLAYING;
        EventBus.emit('PLAYER_STATE_CHANGED', isPlaying);
        if (isPlaying) {
            const currentQual = this.player.getPlaybackQuality();
            EventBus.emit('QUALITY_CHANGED', currentQual);
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