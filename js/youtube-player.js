/* js/youtube-player.js */
import EventBus from './event-bus.js';
import { Storage } from './utils.js';

export class YouTubePlayerController {
    constructor() {
        this.player = null;
        this.isReady = false;
        this.currentVideoId = null;
        this.timeTracker = null;
        this.ccEnabled = false;
        this.nativeControls = false; 
        this.currentSpeed = 1.0; // Локальный трекер текущей скорости

        EventBus.on('CMD_PLAY_PAUSE', () => this.togglePlay());
        EventBus.on('PLAY_VIDEO', (videoId) => this.loadVideo(videoId));
        EventBus.on('CMD_SEEK', (percent) => this.seekToPercent(percent));
        EventBus.on('CMD_SEEK_RELATIVE', (seconds) => this.seekRelative(seconds));
        EventBus.on('CMD_SEEK_TO', (seconds) => this.seekToAbsolute(seconds));
        EventBus.on('CMD_VOLUME', (vol) => this.setVolume(vol));
        EventBus.on('CMD_MUTE_TOGGLE', () => this.toggleMute());
        EventBus.on('CMD_SPEED', (rate) => this.setSpeed(rate));
        EventBus.on('CMD_TOGGLE_CC', () => this.toggleCC());
        EventBus.on('CMD_REBUILD_PLAYER', (showNative) => this.rebuildPlayer(showNative));
    }

    init() {
        const currentOrigin = window.location.origin;

        this.player = new YT.Player('yt-player', {
            height: '100%', 
            width: '100%',
            playerVars: {
                'autoplay': 0, 'controls': this.nativeControls ? 1 : 0, 
                'disablekb': 1, 'fs': 0, 'rel': 0, 'iv_load_policy': 3,
                'modestbranding': 1, 'origin': currentOrigin, 'enablejsapi': 1,
                'playsinline': 1, 'hl': 'ru',
                'cc_load_policy': 0
            },
            events: {
                'onReady': () => {
                    this.isReady = true;
                    document.getElementById('player-loader').style.display = 'none';
                    EventBus.emit('PLAYER_READY');
                    
                    if (this.currentVideoId) this.loadVideo(this.currentVideoId);
                    this.startTimeTracker();
                },
                'onStateChange': (event) => this.onStateChange(event),
                'onError': (event) => {
                    console.error('[YTPlayer] Ошибка воспроизведения:', event.data);
                    if ([150, 101, 100].includes(event.data)) EventBus.emit('CMD_NEXT');
                },
                'onPlaybackQualityChange': (event) => EventBus.emit('QUALITY_CHANGED', event.data)
            }
        });
    }

    rebuildPlayer(showNative) {
        if (!this.player || !this.currentVideoId) return;
        
        const loader = document.getElementById('player-loader');
        loader.innerHTML = '<i class="fas fa-tools fa-spin"></i> ПЕРЕСБОРКА СИСТЕМЫ...';
        loader.style.display = 'flex'; loader.style.background = 'rgba(0,0,0,0.8)';

        const currentTime = this.player.getCurrentTime();
        const currentVideo = this.currentVideoId;
        const wasPlaying = this.player.getPlayerState() === YT.PlayerState.PLAYING;
        const currentVol = this.player.getVolume();
        
        // Фиксируем состояния для восстановления после пересборки iframe
        const activeSpeed = this.currentSpeed;
        const activeCC = this.ccEnabled;

        this.player.destroy();
        this.isReady = false;
        this.nativeControls = showNative;

        this.player = new YT.Player('yt-player', {
            height: '100%', width: '100%',
            playerVars: {
                'autoplay': wasPlaying ? 1 : 0, 'controls': this.nativeControls ? 1 : 0, 
                'disablekb': 1, 'fs': 0, 'rel': 0, 'iv_load_policy': 3,
                'modestbranding': 1, 'origin': window.location.origin, 'enablejsapi': 1, 
                'playsinline': 1, 'hl': 'ru', 'cc_load_policy': activeCC ? 1 : 0
            },
            events: {
                'onReady': () => {
                    this.isReady = true;
                    loader.style.display = 'none';
                    this.player.setVolume(currentVol);
                    this.setSpeed(activeSpeed);
                    
                    if (activeCC) {
                        this.player.loadModule('captions');
                        this.player.setOption('captions', 'track', {'languageCode': 'ru'});
                    }

                    wasPlaying ? this.player.loadVideoById({ videoId: currentVideo, startSeconds: currentTime }) 
                               : this.player.cueVideoById({ videoId: currentVideo, startSeconds: currentTime });
                    this.startTimeTracker();
                },
                'onStateChange': (event) => this.onStateChange(event)
            }
        });
    }

    loadVideo(videoId) {
        this.currentVideoId = videoId;
        const savedTime = parseFloat(Storage.get(`sher_time_${videoId}`, 0));
        
        if (this.isReady) {
            this.player.cueVideoById({ videoId: videoId, startSeconds: savedTime });
            EventBus.emit('QUALITY_CHANGED', 'auto');
            this.setSpeed(this.currentSpeed); // Удержание скорости на новых треках
        }
    }

    fadeInVolume() {
        const targetVol = parseInt(Storage.get('sher_volume', 100));
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
        if (duration > 0) this.player.seekTo(duration * percent, true);
    }

    seekRelative(seconds) {
        if (!this.isReady || !this.currentVideoId) return;
        const duration = this.player.getDuration();
        if (duration > 0) {
            let targetTime = Math.max(0, Math.min(this.player.getCurrentTime() + seconds, duration));
            this.player.seekTo(targetTime, true);
        }
    }

    seekToAbsolute(seconds) {
        if (!this.isReady || !this.currentVideoId) return;
        this.player.seekTo(seconds, true);
        if (this.player.getPlayerState() !== YT.PlayerState.PLAYING) {
            this.fadeInVolume();
            this.player.playVideo();
        }
    }

    setVolume(vol) {
        if (!this.isReady) return;
        this.player.setVolume(vol);
        if (vol > 0 && this.player.isMuted()) this.player.unMute();
    }

    toggleMute() {
        if (!this.isReady) return;
        this.player.isMuted() ? (this.player.unMute(), EventBus.emit('AUDIO_MUTED', false)) 
                              : (this.player.mute(), EventBus.emit('AUDIO_MUTED', true));
    }

    setSpeed(rate) { 
        if (this.isReady) {
            this.player.setPlaybackRate(parseFloat(rate)); 
        }
        this.currentSpeed = parseFloat(rate);
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
            Storage.remove(`sher_time_${this.currentVideoId}`);
            EventBus.emit('PLAYER_STATE_CHANGED', false);
            EventBus.emit('CMD_NEXT');
            return;
        }
        const isPlaying = event.data === YT.PlayerState.PLAYING;
        EventBus.emit('PLAYER_STATE_CHANGED', isPlaying);
        
        if (isPlaying) {
            EventBus.emit('QUALITY_CHANGED', this.player.getPlaybackQuality());
            
            // Восстановление установленной скорости и субтитров на старте воспроизведения
            this.player.setPlaybackRate(this.currentSpeed);
            if (!this.ccEnabled) {
                this.player.unloadModule('captions');
            } else {
                this.player.loadModule('captions');
            }
        }
    }

    startTimeTracker() {
        if (this.timeTracker) clearInterval(this.timeTracker);
        this.timeTracker = setInterval(() => {
            if (this.isReady && this.currentVideoId) {
                const current = this.player.getCurrentTime() || 0;
                const total = this.player.getDuration() || 0;
                if (total > 0) {
                    EventBus.emit('TIME_UPDATE', { current, total });
                    if (current > 5 && current < total - 5) {
                        Storage.set(`sher_time_${this.currentVideoId}`, current);
                    }
                }
            }
        }, 250);
    }
}