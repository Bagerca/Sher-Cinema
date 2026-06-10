/* js/player-ui.js */
import EventBus from './event-bus.js';
import { Storage, Formatters, ChapterParser } from './utils.js';

export class PlayerUI {
    constructor() {
        this.els = {
            btnPlay: document.getElementById('btn-play'),
            btnPrev: document.getElementById('btn-prev'),
            btnNext: document.getElementById('btn-next'),
            btnFullscreen: document.getElementById('btn-fullscreen'),
            btnCC: document.getElementById('btn-cc'),
            btnUnlock: document.getElementById('btn-unlock'),
            btnCinema: document.getElementById('btn-cinema'),
            
            progressArea: document.getElementById('progress-area'),
            progressFill: document.getElementById('progress-fill'),
            chapterMarkers: document.getElementById('chapter-markers-container'),
            chapterIndicator: document.getElementById('chapter-indicator'),
            progressHoverTooltip: document.getElementById('progress-hover-tooltip'),
            
            timeDisplay: document.getElementById('time-display'),
            volumeSlider: document.getElementById('volume-slider'),
            btnMute: document.getElementById('btn-mute'),
            
            fullscreenWrapper: document.getElementById('fullscreen-wrapper'),
            videoShield: document.querySelector('.video-shield'),
            
            qualityBadge: document.getElementById('quality-badge'),
            speedModule: document.getElementById('speed-module'),
            speedToggleBtn: document.getElementById('btn-speed-toggle'),
            
            currentTitle: document.getElementById('current-title'),
            titleScroller: document.getElementById('title-scroller'),
            channelName: document.getElementById('channel-name'),
            channelAvatar: document.getElementById('channel-avatar'),
            channelMeta: document.getElementById('channel-meta'), 
            videoStatsRow: document.getElementById('video-stats-row'), 
            channelLink: document.getElementById('channel-link')
        };

        this.currentChapters = [];
        this.chaptersRendered = false;
        this.currentVideoDuration = 0;
        this.isNativeMode = false;
        this.isCinemaMode = false;
        this.qualityLabels = {
            'highres': { label: '4K/1440p', tag: 'HD' }, 'hd1080': { label: '1080p', tag: 'HD' },
            'hd720': { label: '720p', tag: 'HD' }, 'large': { label: '480p', tag: '' },
            'medium': { label: '360p', tag: '' }, 'small': { label: '240p', tag: '' },
            'tiny': { label: '144p', tag: '' }, 'auto': { label: 'Авто', tag: '' }
        };

        this.bindEvents();
        window.addEventListener('resize', () => this.calculateTitleAnimation());
    }

    bindEvents() {
        this.els.btnPlay.addEventListener('click', () => EventBus.emit('CMD_PLAY_PAUSE'));
        this.els.btnNext.addEventListener('click', () => EventBus.emit('UI_PLAY_NEXT'));
        this.els.btnPrev.addEventListener('click', () => EventBus.emit('UI_PLAY_PREV'));
        this.els.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
        
        this.els.progressArea.addEventListener('click', (e) => {
            const rect = this.els.progressArea.getBoundingClientRect();
            const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            EventBus.emit('CMD_SEEK', clickX / rect.width);
        });

        this.els.progressArea.addEventListener('mousemove', (e) => {
            if (!this.currentVideoDuration) return;
            const rect = this.els.progressArea.getBoundingClientRect();
            const posX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            const percent = posX / rect.width;
            const hoverTime = percent * this.currentVideoDuration;

            this.els.progressHoverTooltip.style.left = `${posX}px`;
            
            const activeChapter = this.getActiveChapter(hoverTime);
            if (activeChapter) {
                this.els.progressHoverTooltip.innerHTML = `<span class="ch-time">${Formatters.formatTime(hoverTime)}</span><br>${activeChapter.title}`;
            } else {
                this.els.progressHoverTooltip.innerHTML = `<span class="ch-time">${Formatters.formatTime(hoverTime)}</span>`;
            }
        });

        this.els.volumeSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            this.setVolumeUI(val);
            EventBus.emit('CMD_VOLUME', val);
        });
        this.els.btnMute.addEventListener('click', () => EventBus.emit('CMD_MUTE_TOGGLE'));
        EventBus.on('AUDIO_MUTED', (isMuted) => this.setVolumeUI(isMuted ? 0 : 100));

        this.els.speedToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.els.speedModule.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!this.els.speedModule.contains(e.target)) this.els.speedModule.classList.remove('active');
        });
        document.querySelectorAll('.s-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const speed = e.target.dataset.speed;
                EventBus.emit('CMD_SPEED', speed);
                this.els.speedToggleBtn.textContent = speed + 'x';
                document.querySelectorAll('.s-option').forEach(o => o.classList.remove('active'));
                e.target.classList.add('active');
                this.els.speedModule.classList.remove('active');
            });
        });
        EventBus.on('QUALITY_CHANGED', (code) => {
            const info = this.qualityLabels[code || 'auto'] || { label: (code || 'auto').toUpperCase() };
            this.els.qualityBadge.innerHTML = `${info.label} ${info.tag ? `<span>${info.tag}</span>` : ''}`;
        });

        this.els.btnCC.addEventListener('click', () => EventBus.emit('CMD_TOGGLE_CC'));
        EventBus.on('CC_STATE_CHANGED', (enabled) => {
            this.els.btnCC.style.color = enabled ? 'var(--neon-green)' : '#ccc';
            this.els.btnCC.style.borderColor = enabled ? 'var(--neon-green)' : 'var(--border-color)';
        });

        this.els.btnCinema.addEventListener('click', () => this.toggleCinemaMode());
        EventBus.on('CMD_TOGGLE_CINEMA', () => this.toggleCinemaMode());

        this.els.btnUnlock.addEventListener('click', () => {
            this.isNativeMode = !this.isNativeMode;
            const icon = this.els.btnUnlock.querySelector('i');
            icon.className = this.isNativeMode ? 'fas fa-lock-open' : 'fas fa-lock';
            this.els.btnUnlock.classList.toggle('active-tool', this.isNativeMode);
            this.els.videoShield.style.pointerEvents = this.isNativeMode ? 'none' : 'auto';
            EventBus.emit('CMD_REBUILD_PLAYER', this.isNativeMode);
        });

        EventBus.on('PLAYER_STATE_CHANGED', (isPlaying) => {
            this.els.btnPlay.querySelector('i').className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
            this.els.fullscreenWrapper.classList.toggle('playing', isPlaying);
        });

        EventBus.on('TIME_UPDATE', ({ current, total }) => {
            if (!total) return;
            this.currentVideoDuration = total;
            
            const percent = (current / total) * 100;
            this.els.progressFill.style.width = `${percent}%`;
            
            // НОВОЕ: Исправление угловатого угла, когда видео почти закончилось
            this.els.progressFill.style.borderTopRightRadius = percent >= 99.5 ? '12px' : '0px';

            this.els.timeDisplay.textContent = `${Formatters.formatTime(current)} / ${Formatters.formatTime(total)}`;

            if (this.currentChapters.length > 0 && !this.chaptersRendered) {
                this.renderChapterMarkers(total);
            }

            const activeChapter = this.getActiveChapter(current);
            if (activeChapter) {
                this.els.chapterIndicator.textContent = `▶ ${activeChapter.title}`;
                this.els.chapterIndicator.style.display = 'block';
            } else {
                this.els.chapterIndicator.style.display = 'none';
            }
        });
    }

    toggleCinemaMode() {
        this.isCinemaMode = !this.isCinemaMode;
        document.body.classList.toggle('cinema-mode', this.isCinemaMode);
        const icon = this.els.btnCinema.querySelector('i');
        icon.className = this.isCinemaMode ? 'far fa-lightbulb' : 'fas fa-lightbulb';
        this.els.btnCinema.classList.toggle('active-tool', this.isCinemaMode);
    }

    setVolumeUI(val) {
        this.els.volumeSlider.value = val;
        this.els.volumeSlider.style.setProperty('--volume-fill', `${val}%`);
        
        const icon = this.els.btnMute.querySelector('i');
        this.els.btnMute.classList.remove('is-muted');
        
        if (val == 0) {
            icon.className = 'fas fa-volume-xmark';
            this.els.btnMute.classList.add('is-muted');
        } else if (val <= 33) {
            icon.className = 'fas fa-volume-off';
        } else if (val <= 66) {
            icon.className = 'fas fa-volume-low';
        } else {
            icon.className = 'fas fa-volume-high';
        }
        
        Storage.set('sher_volume', val);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) this.els.fullscreenWrapper.requestFullscreen().catch(console.error);
        else document.exitFullscreen();
    }

    async updateVideoInfo(video) {
        const channelStr = video.channel || "АРХИВНЫЙ ФАЙЛ";
        
        this.els.chapterMarkers.innerHTML = '';
        this.els.chapterIndicator.style.display = 'none';
        this.chaptersRendered = false;
        this.currentVideoDuration = 0;
        this.currentChapters = ChapterParser.extract(video.description);

        this.els.currentTitle.textContent = video.title;
        this.els.currentTitle.href = `https://www.youtube.com/watch?v=${video.id}`;
        this.els.channelName.textContent = channelStr;
        
        let metaHtml = '';
        if (video.channelHandle) metaHtml += `${video.channelHandle} `;
        if (video.channelSubs) metaHtml += `• ${video.channelSubs} subs`;
        this.els.channelMeta.textContent = metaHtml;

        let statsHtml = '';
        if (video.views) statsHtml += `<span class="stat-item"><i class="fas fa-eye"></i> ${video.views}</span>`;
        if (video.likes) statsHtml += `<span class="stat-item"><i class="fas fa-thumbs-up"></i> ${video.likes}</span>`;
        if (video.isLive) statsHtml += `<span class="stat-item live-badge">LIVE</span>`;
        this.els.videoStatsRow.innerHTML = statsHtml;

        this.els.channelAvatar.src = video.channelAvatar || Formatters.generateDynamicAvatar(channelStr);
        video.channelHandle ? this.els.channelLink.href = `https://youtube.com/${video.channelHandle}` : this.els.channelLink.removeAttribute('href');

        this.calculateTitleAnimation();

        const ambilightElement = document.getElementById('ambilight-bg');
        if (ambilightElement) {
            ambilightElement.style.backgroundImage = `url('${video.thumb}')`;
        }
    }

    renderChapterMarkers(totalDuration) {
        this.els.chapterMarkers.innerHTML = '';
        if (this.currentChapters.length >= 3) {
            this.currentChapters.forEach(ch => {
                if (ch.time > 0 && ch.time < totalDuration) {
                    const marker = document.createElement('div');
                    marker.className = 'chapter-marker';
                    marker.style.left = `${(ch.time / totalDuration) * 100}%`;
                    this.els.chapterMarkers.appendChild(marker);
                }
            });
        }
        this.chaptersRendered = true;
    }

    getActiveChapter(currentSec) {
        if (this.currentChapters.length < 3) return null;
        let active = null;
        for (let i = 0; i < this.currentChapters.length; i++) {
            if (currentSec >= this.currentChapters[i].time) active = this.currentChapters[i];
            else break;
        }
        return active;
    }

    calculateTitleAnimation() {
        this.els.titleScroller.classList.remove('is-animating');
        this.els.currentTitle.style.transform = 'none';
        setTimeout(() => {
            const scrollerWidth = this.els.titleScroller.offsetWidth;
            const textWidth = this.els.currentTitle.scrollWidth;
            if (textWidth > scrollerWidth) {
                this.els.currentTitle.style.setProperty('--overflow-dist', `-${textWidth - scrollerWidth + 20}px`);
                this.els.titleScroller.classList.add('is-animating');
            }
        }, 50);
    }
}