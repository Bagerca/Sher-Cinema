/* js/ui-controller.js */
import EventBus from './event-bus.js';

export class UIController {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.playlistData = [];
        this.currentIndex = -1;

        this.defaultThumbStr = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='90'><rect width='160' height='90' fill='#111'/><text x='50%' y='50%' font-family='sans-serif' font-size='16' fill='#444' text-anchor='middle' dy='.3em'>NO THUMB</text></svg>");

        this.qualityLabels = {
            'highres': { label: '1440p / 4K', tag: 'HD' },
            'hd1080': { label: '1080p', tag: 'HD' },
            'hd720': { label: '720p', tag: 'HD' },
            'large': { label: '480p', tag: '' },
            'medium': { label: '360p', tag: '' },
            'small': { label: '240p', tag: '' },
            'tiny': { label: '144p', tag: '' },
            'auto': { label: 'Авто', tag: '' },
            'unknown': { label: 'Авто', tag: '' } 
        };

        this.els = {
            container: document.getElementById('playlist-container'),
            count: document.getElementById('playlist-count'),
            searchInput: document.getElementById('search-input'),
            clearSearchBtn: document.getElementById('search-clear'),
            
            currentTitle: document.getElementById('current-title'),
            titleScroller: document.getElementById('title-scroller'),
            channelName: document.getElementById('channel-name'),
            channelAvatar: document.getElementById('channel-avatar'),
            
            btnPlay: document.getElementById('btn-play'),
            btnPrev: document.getElementById('btn-prev'),
            btnNext: document.getElementById('btn-next'),
            btnFullscreen: document.getElementById('btn-fullscreen'),
            
            progressArea: document.getElementById('progress-area'),
            progressFill: document.getElementById('progress-fill'),
            timeDisplay: document.getElementById('time-display'),
            volumeSlider: document.getElementById('volume-slider'),
            btnMute: document.getElementById('btn-mute'),
            
            switchers: document.querySelectorAll('.source-btn'),
            fullscreenWrapper: document.getElementById('fullscreen-wrapper'),
            
            qualityModule: document.getElementById('quality-module'),
            qualityToggleBtn: document.getElementById('btn-quality-toggle'),
            qualityList: document.getElementById('quality-list')
        };

        this.bindEvents();
        // Пересчет анимации при изменении размера окна
        window.addEventListener('resize', () => this.calculateTitleAnimation());
    }

    safeSetStorage(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
    safeGetStorage(key, defaultVal) { try { return localStorage.getItem(key) ?? defaultVal; } catch (e) { return defaultVal; } }

    // ГЕНЕРАТОР АВАТАРА: Берет первую букву канала и делает неоновый SVG
    generateDynamicAvatar(channelName) {
        const letter = (channelName && channelName.trim().length > 0) ? channelName.trim().charAt(0).toUpperCase() : 'C';
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><rect width='150' height='150' fill='#1a1a2e'/><text x='50%' y='50%' font-family='sans-serif' font-size='65' fill='#39ff14' font-weight='bold' text-anchor='middle' dy='.35em'>${letter}</text></svg>`;
        return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
    }

    // РАСЧЕТ УМНОЙ АНИМАЦИИ НАЗВАНИЯ
    calculateTitleAnimation() {
        this.els.titleScroller.classList.remove('is-animating');
        this.els.currentTitle.style.transform = 'none';
        
        // Даем браузеру долю секунды на отрисовку шрифтов перед замером
        setTimeout(() => {
            const scrollerWidth = this.els.titleScroller.offsetWidth;
            const textWidth = this.els.currentTitle.scrollWidth;
            
            if (textWidth > scrollerWidth) {
                const overflow = textWidth - scrollerWidth;
                this.els.currentTitle.style.setProperty('--overflow-dist', `-${overflow + 20}px`);
                this.els.titleScroller.classList.add('is-animating');
            }
        }, 50);
    }

    bindEvents() {
        EventBus.on('DATA_READY', (videos) => {
            this.playlistData = videos;
            this.renderPlaylist(videos);
            this.els.searchInput.value = '';
            this.els.clearSearchBtn.style.display = 'none';

            if(videos.length > 0) {
                const savedId = this.safeGetStorage('sher_last_video_id', null);
                let targetIndex = 0;
                if (savedId) {
                    const found = videos.findIndex(v => v.id === savedId);
                    if (found !== -1) targetIndex = found;
                }
                this.playIndex(targetIndex);
            } else {
                this.els.currentTitle.textContent = "СИСТЕМА ПУСТА";
                this.els.currentTitle.href = "#";
                this.els.channelName.textContent = "SYSTEM";
                this.els.channelAvatar.src = this.generateDynamicAvatar("SYSTEM");
            }
        });

        EventBus.on('SHOW_ERROR', (msg) => {
            this.els.container.innerHTML = `<div style="padding: 40px 20px; text-align:center; color:var(--neon-pink); font-family: monospace; font-size: 0.9rem;">ОШИБКА СИСТЕМЫ:<br><br>${msg}</div>`;
        });

        EventBus.on('PLAYER_READY', () => {
            const initVol = parseInt(this.safeGetStorage('sher_volume', 100));
            this.els.volumeSlider.value = initVol;
            this.els.volumeSlider.style.setProperty('--volume-fill', `${initVol}%`);
            EventBus.emit('CMD_VOLUME', initVol);
        });

        EventBus.on('PLAYER_STATE_CHANGED', (isPlaying) => {
            const icon = this.els.btnPlay.querySelector('i');
            icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
        });

        EventBus.on('TIME_UPDATE', ({ current, total }) => {
            if (!total) return;
            const percent = (current / total) * 100;
            this.els.progressFill.style.width = `${percent}%`;
            this.els.timeDisplay.textContent = `${this.formatTime(current)} / ${this.formatTime(total)}`;
        });

        this.els.progressArea.addEventListener('click', (e) => {
            const rect = this.els.progressArea.getBoundingClientRect();
            const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            EventBus.emit('CMD_SEEK', clickX / rect.width);
        });

        const updateVolumeUI = (val) => {
            this.els.volumeSlider.value = val;
            this.els.volumeSlider.style.setProperty('--volume-fill', `${val}%`);
            this.els.btnMute.querySelector('i').className = val == 0 ? 'fas fa-volume-mute' : 'fas fa-volume-up';
            this.safeSetStorage('sher_volume', val);
        };

        this.els.volumeSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            updateVolumeUI(val);
            EventBus.emit('CMD_VOLUME', val);
        });

        this.els.btnMute.addEventListener('click', () => EventBus.emit('CMD_MUTE_TOGGLE'));
        EventBus.on('AUDIO_MUTED', (isMuted) => updateVolumeUI(isMuted ? 0 : 100));

        this.els.searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            this.els.clearSearchBtn.style.display = query.length > 0 ? 'block' : 'none';
            this.renderPlaylist(this.dataManager.search(query), query);
        });

        this.els.clearSearchBtn.addEventListener('click', () => {
            this.els.searchInput.value = '';
            this.els.clearSearchBtn.style.display = 'none';
            this.renderPlaylist(this.playlistData);
        });

        this.els.btnPlay.addEventListener('click', () => EventBus.emit('CMD_PLAY_PAUSE'));
        this.els.btnNext.addEventListener('click', () => this.playNext());
        this.els.btnPrev.addEventListener('click', () => this.playPrev());
        EventBus.on('CMD_NEXT', () => this.playNext());

        this.els.btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) this.els.fullscreenWrapper.requestFullscreen().catch(e => console.error(e));
            else document.exitFullscreen();
        });

        this.els.qualityToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.els.qualityModule.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!this.els.qualityModule.contains(e.target)) {
                this.els.qualityModule.classList.remove('active');
            }
        });

        EventBus.on('AVAILABLE_QUALITIES_UPDATE', (qualities) => {
            if (!qualities || qualities.length === 0) qualities = ['auto'];
            if (!qualities.includes('auto')) qualities.push('auto');
            this.renderQualityMenu(qualities);
        });

        EventBus.on('QUALITY_CHANGED', (qualityCode) => {
            const safeCode = qualityCode || 'auto';
            const info = this.qualityLabels[safeCode] || { label: safeCode, tag: '' };
            this.els.qualityToggleBtn.innerHTML = info.label;
            
            document.querySelectorAll('.q-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.qual === safeCode || (safeCode === 'unknown' && opt.dataset.qual === 'auto'));
            });
        });

        this.els.switchers.forEach(btn => {
            btn.addEventListener('click', () => {
                if(btn.classList.contains('active')) return;
                this.els.switchers.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.dataManager.loadSource(btn.dataset.source);
            });
        });
    }

    renderQualityMenu(qualities) {
        this.els.qualityList.innerHTML = '';
        qualities.forEach(q => {
            if(q === 'unknown') return; 

            const info = this.qualityLabels[q] || { label: q, tag: '' };
            const div = document.createElement('div');
            div.className = 'q-option';
            div.dataset.qual = q;
            div.innerHTML = `${info.label} ${info.tag ? `<span>${info.tag}</span>` : ''}`;
            
            div.addEventListener('click', () => {
                EventBus.emit('CMD_CHANGE_QUALITY', q);
                this.els.qualityModule.classList.remove('active');
            });
            this.els.qualityList.appendChild(div);
        });
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    playIndex(index) {
        if(index < 0 || index >= this.playlistData.length) return;
        this.currentIndex = index;
        const video = this.playlistData[index];
        const channelStr = video.channel || "АРХИВНЫЙ ФАЙЛ";
        
        // Установка данных в UI
        this.els.currentTitle.textContent = video.title;
        this.els.currentTitle.href = `https://www.youtube.com/watch?v=${video.id}`;
        this.els.channelName.textContent = channelStr;
        
        // Используем динамический аватар, если нет реального
        this.els.channelAvatar.src = video.channelAvatar || this.generateDynamicAvatar(channelStr);

        // Расчет анимации текста
        this.calculateTitleAnimation();

        // Обновление активной карточки
        document.querySelectorAll('.track-card').forEach(c => c.classList.remove('active'));
        const activeCard = document.querySelector(`.track-card[data-index="${index}"]`);
        if(activeCard) {
            activeCard.classList.add('active');
            activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        this.safeSetStorage('sher_last_video_id', video.id);
        EventBus.emit('PLAY_VIDEO', video.id);
    }

    playNext() {
        if(this.playlistData.length === 0) return;
        let next = this.currentIndex + 1;
        if(next >= this.playlistData.length) next = 0;
        this.playIndex(next);
    }

    playPrev() {
        if(this.playlistData.length === 0) return;
        let prev = this.currentIndex - 1;
        if(prev < 0) prev = this.playlistData.length - 1;
        this.playIndex(prev);
    }

    highlightText(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, `<span class="search-highlight">$1</span>`);
    }

    renderPlaylist(videos, query = '') {
        this.els.count.textContent = videos.length;
        if (videos.length === 0) {
            this.els.container.innerHTML = '<div style="padding: 40px 20px; text-align:center; color:#666; font-family: monospace;">СОВПАДЕНИЙ НЕ НАЙДЕНО</div>';
            return;
        }

        const html = videos.map((v) => {
            const originalIndex = this.playlistData.findIndex(item => item.id === v.id);
            const isActive = originalIndex === this.currentIndex ? 'active' : '';
            return `
            <div class="track-card ${isActive}" data-index="${originalIndex}">
                <img src="${v.thumb || this.defaultThumbStr}" class="track-thumb" alt="thumb">
                <div class="track-info">
                    <div class="track-title" title="${v.title}">${this.highlightText(v.title, query)}</div>
                    <div class="track-meta">${v.channel || 'Запись из архива'}</div>
                </div>
            </div>`;
        }).join('');

        this.els.container.innerHTML = html;
        this.els.container.querySelectorAll('.track-card').forEach(card => {
            card.addEventListener('click', () => this.playIndex(parseInt(card.dataset.index)));
        });
    }
}