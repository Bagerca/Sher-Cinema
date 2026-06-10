/* js/ui-controller.js */
import EventBus from './event-bus.js';

export class UIController {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.playlistData = [];
        this.currentIndex = -1;
        this.sortMode = 0; 
        this.isNativeMode = false;

        this.defaultThumbStr = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='90'><rect width='160' height='90' fill='#111'/><text x='50%' y='50%' font-family='sans-serif' font-size='16' fill='#444' text-anchor='middle' dy='.3em'>NO THUMB</text></svg>");

        this.qualityLabels = {
            'highres': { label: '4K/1440p', tag: 'HD' },
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
            btnSort: document.getElementById('btn-sort'),
            
            currentTitle: document.getElementById('current-title'),
            titleScroller: document.getElementById('title-scroller'),
            channelName: document.getElementById('channel-name'),
            channelAvatar: document.getElementById('channel-avatar'),
            channelMeta: document.getElementById('channel-meta'), // НОВОЕ
            videoStatsRow: document.getElementById('video-stats-row'), // НОВОЕ
            channelLink: document.getElementById('channel-link'),
            
            btnPlay: document.getElementById('btn-play'),
            btnPrev: document.getElementById('btn-prev'),
            btnNext: document.getElementById('btn-next'),
            btnFullscreen: document.getElementById('btn-fullscreen'),
            btnCC: document.getElementById('btn-cc'),
            btnUnlock: document.getElementById('btn-unlock'),
            
            progressArea: document.getElementById('progress-area'),
            progressFill: document.getElementById('progress-fill'),
            timeDisplay: document.getElementById('time-display'),
            volumeSlider: document.getElementById('volume-slider'),
            btnMute: document.getElementById('btn-mute'),
            
            fullscreenWrapper: document.getElementById('fullscreen-wrapper'),
            videoShield: document.querySelector('.video-shield'),
            
            qualityBadge: document.getElementById('quality-badge'),
            speedModule: document.getElementById('speed-module'),
            speedToggleBtn: document.getElementById('btn-speed-toggle'),
            
            playlistModule: document.getElementById('playlist-selector-module'),
            activePlaylistBtn: document.getElementById('active-playlist-btn'),
            activePlaylistName: document.getElementById('active-playlist-name'),
            headerPlaylistDropdown: document.getElementById('header-playlist-dropdown')
        };

        this.bindEvents();
        window.addEventListener('resize', () => this.calculateTitleAnimation());
    }

    safeSetStorage(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
    safeGetStorage(key, defaultVal) { try { return localStorage.getItem(key) ?? defaultVal; } catch (e) { return defaultVal; } }

    generateDynamicAvatar(channelName) {
        const letter = (channelName && channelName.trim().length > 0) ? channelName.trim().charAt(0).toUpperCase() : 'C';
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><rect width='150' height='150' fill='#1a1a2e'/><text x='50%' y='50%' font-family='sans-serif' font-size='65' fill='#39ff14' font-weight='bold' text-anchor='middle' dy='.35em'>${letter}</text></svg>`;
        return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
    }

    getDominantColor(imageSrc) {
        return new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = imageSrc;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 100; canvas.height = 100; 
                ctx.drawImage(img, 0, 0, 100, 100);
                try {
                    const data = ctx.getImageData(0,0, 100, 100).data;
                    let r=0,g=0,b=0, count=0;
                    for(let i=0; i<data.length; i+=16) { 
                        r += data[i]; g += data[i+1]; b += data[i+2]; count++;
                    }
                    resolve(`rgb(${Math.floor(r/count)},${Math.floor(g/count)},${Math.floor(b/count)})`);
                } catch(e) { resolve('rgba(255, 45, 149, 0.5)'); } 
            };
            img.onerror = () => resolve('rgba(255, 45, 149, 0.5)');
        });
    }

    calculateTitleAnimation() {
        this.els.titleScroller.classList.remove('is-animating');
        this.els.currentTitle.style.transform = 'none';
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

    setVolumeUI(val) {
        this.els.volumeSlider.value = val;
        this.els.volumeSlider.style.setProperty('--volume-fill', `${val}%`);
        this.els.btnMute.querySelector('i').className = val == 0 ? 'fas fa-volume-mute' : 'fas fa-volume-up';
        this.safeSetStorage('sher_volume', val);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) this.els.fullscreenWrapper.requestFullscreen().catch(e=>console.error(e));
        else document.exitFullscreen();
    }

    bindEvents() {
        EventBus.on('CONFIG_READY', (playlists) => this.renderPlaylistMenu(playlists));
        EventBus.on('PLAYLIST_CHANGED', (index) => {
            const playlist = this.dataManager.playlists[index];
            this.els.activePlaylistName.textContent = playlist.name;
            document.querySelectorAll('.pl-item').forEach(item => {
                item.classList.toggle('selected', parseInt(item.dataset.index) === index);
            });
            this.sortMode = 0; 
            this.updateSortIcon();
        });

        this.els.activePlaylistBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.els.playlistModule.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!this.els.playlistModule.contains(e.target)) this.els.playlistModule.classList.remove('active');
            if (!this.els.speedModule.contains(e.target)) this.els.speedModule.classList.remove('active');
        });

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
            }
        });

        EventBus.on('PLAYER_READY', () => {
            const initVol = parseInt(this.safeGetStorage('sher_volume', 100));
            this.setVolumeUI(initVol);
            EventBus.emit('CMD_VOLUME', initVol);
        });

        EventBus.on('PLAYER_STATE_CHANGED', (isPlaying) => {
            const icon = this.els.btnPlay.querySelector('i');
            icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
            if (isPlaying) this.els.fullscreenWrapper.classList.add('playing');
            else this.els.fullscreenWrapper.classList.remove('playing');
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

        this.els.volumeSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            this.setVolumeUI(val);
            EventBus.emit('CMD_VOLUME', val);
        });

        this.els.btnMute.addEventListener('click', () => EventBus.emit('CMD_MUTE_TOGGLE'));
        EventBus.on('AUDIO_MUTED', (isMuted) => this.setVolumeUI(isMuted ? 0 : 100));

        this.els.btnPlay.addEventListener('click', () => EventBus.emit('CMD_PLAY_PAUSE'));
        this.els.btnNext.addEventListener('click', () => this.playNext());
        this.els.btnPrev.addEventListener('click', () => this.playPrev());
        EventBus.on('CMD_NEXT', () => this.playNext());
        this.els.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());

        this.els.btnUnlock.addEventListener('click', () => {
            this.isNativeMode = !this.isNativeMode;
            const icon = this.els.btnUnlock.querySelector('i');
            if (this.isNativeMode) {
                icon.className = 'fas fa-lock-open';
                this.els.btnUnlock.style.color = 'var(--neon-green)';
                this.els.btnUnlock.style.borderColor = 'var(--neon-green)';
                this.els.btnUnlock.style.boxShadow = '0 0 15px rgba(57,255,20,0.3)';
                this.els.videoShield.style.pointerEvents = 'none';
            } else {
                icon.className = 'fas fa-lock';
                this.els.btnUnlock.style.color = '#ccc';
                this.els.btnUnlock.style.borderColor = 'var(--border-color)';
                this.els.btnUnlock.style.boxShadow = 'none';
                this.els.videoShield.style.pointerEvents = 'auto';
            }
            EventBus.emit('CMD_REBUILD_PLAYER', this.isNativeMode);
        });

        this.els.speedToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.els.speedModule.classList.toggle('active');
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

        this.els.btnCC.addEventListener('click', () => EventBus.emit('CMD_TOGGLE_CC'));
        EventBus.on('CC_STATE_CHANGED', (enabled) => {
            this.els.btnCC.style.color = enabled ? 'var(--neon-green)' : '#ccc';
            this.els.btnCC.style.borderColor = enabled ? 'var(--neon-green)' : 'var(--border-color)';
        });

        EventBus.on('QUALITY_CHANGED', (qualityCode) => {
            const safeCode = qualityCode || 'auto';
            const info = this.qualityLabels[safeCode] || { label: safeCode.toUpperCase() };
            this.els.qualityBadge.innerHTML = `${info.label} ${info.tag ? `<span>${info.tag}</span>` : ''}`;
        });

        this.els.btnSort.addEventListener('click', () => {
            this.sortMode = (this.sortMode + 1) % 3;
            this.updateSortIcon();
            this.renderPlaylist(this.playlistData, this.els.searchInput.value);
        });

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

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') return;
            const currentVol = parseInt(this.els.volumeSlider.value);
            switch (e.code) {
                case 'Space': 
                case 'KeyK': e.preventDefault(); EventBus.emit('CMD_PLAY_PAUSE'); break;
                case 'ArrowRight': e.preventDefault(); EventBus.emit('CMD_SEEK_RELATIVE', 5); break;
                case 'ArrowLeft': e.preventDefault(); EventBus.emit('CMD_SEEK_RELATIVE', -5); break;
                case 'KeyL': EventBus.emit('CMD_SEEK_RELATIVE', 10); break;
                case 'KeyJ': EventBus.emit('CMD_SEEK_RELATIVE', -10); break;
                case 'ArrowUp': e.preventDefault(); const upVol = Math.min(100, currentVol + 5); this.setVolumeUI(upVol); EventBus.emit('CMD_VOLUME', upVol); break;
                case 'ArrowDown': e.preventDefault(); const downVol = Math.max(0, currentVol - 5); this.setVolumeUI(downVol); EventBus.emit('CMD_VOLUME', downVol); break;
                case 'KeyM': EventBus.emit('CMD_MUTE_TOGGLE'); break;
                case 'KeyF': this.toggleFullscreen(); break;
                case 'KeyN': if (e.shiftKey) this.playNext(); break;
                case 'KeyP': if (e.shiftKey) this.playPrev(); break;
                case 'KeyC': EventBus.emit('CMD_TOGGLE_CC'); break; 
            }
        });
    }

    updateSortIcon() {
        const icon = this.els.btnSort.querySelector('i');
        if (this.sortMode === 0) icon.className = 'fas fa-sort';
        else if (this.sortMode === 1) icon.className = 'fas fa-sort-alpha-down';
        else icon.className = 'fas fa-sort-alpha-up';
    }

    renderPlaylistMenu(playlists) {
        this.els.headerPlaylistDropdown.innerHTML = '';
        playlists.forEach((pl, index) => {
            const div = document.createElement('div');
            div.className = 'pl-item';
            div.dataset.index = index;
            div.innerHTML = `<i class="fas fa-play"></i> ${pl.name}`;
            div.addEventListener('click', () => {
                this.els.playlistModule.classList.remove('active');
                if (this.dataManager.currentPlaylistIndex !== index) this.dataManager.loadPlaylist(index);
            });
            this.els.headerPlaylistDropdown.appendChild(div);
        });
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    async playIndex(index) {
        if(index < 0 || index >= this.playlistData.length) return;
        this.currentIndex = index;
        const video = this.playlistData[index];
        const channelStr = video.channel || "АРХИВНЫЙ ФАЙЛ";
        
        // Обновляем базовые данные
        this.els.currentTitle.textContent = video.title;
        this.els.currentTitle.href = `https://www.youtube.com/watch?v=${video.id}`;
        this.els.channelName.textContent = channelStr;
        
        // НОВОЕ: Отрисовка Хэндла и Подписчиков
        let metaHtml = '';
        if (video.channelHandle) metaHtml += `${video.channelHandle} `;
        if (video.channelSubs) metaHtml += `• ${video.channelSubs} subs`;
        this.els.channelMeta.textContent = metaHtml;

        // НОВОЕ: Отрисовка Статистики видео
        let statsHtml = '';
        if (video.views) statsHtml += `<span class="stat-item"><i class="fas fa-eye"></i> ${video.views}</span>`;
        if (video.likes) statsHtml += `<span class="stat-item"><i class="fas fa-thumbs-up"></i> ${video.likes}</span>`;
        if (video.isLive) statsHtml += `<span class="stat-item live-badge">LIVE</span>`;
        this.els.videoStatsRow.innerHTML = statsHtml;

        // Обновляем аватарку
        const avatarUrl = video.channelAvatar || this.generateDynamicAvatar(channelStr);
        this.els.channelAvatar.src = avatarUrl;
        if (video.channelHandle) {
            this.els.channelLink.href = `https://youtube.com/${video.channelHandle}`;
        } else {
            this.els.channelLink.removeAttribute('href');
        }

        this.calculateTitleAnimation();

        const dominantColor = await this.getDominantColor(video.thumb || this.defaultThumbStr);
        this.els.fullscreenWrapper.style.setProperty('--ambilight-color', dominantColor);

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

        let itemsToRender = [...videos];
        if (this.sortMode === 1) itemsToRender.sort((a,b) => a.title.localeCompare(b.title));
        if (this.sortMode === 2) itemsToRender.sort((a,b) => b.title.localeCompare(a.title));

        const html = itemsToRender.map((v) => {
            const originalIndex = this.playlistData.findIndex(item => item.id === v.id);
            const isActive = originalIndex === this.currentIndex ? 'active' : '';
            
            // НОВОЕ: Плашка длительности
            const durationBadge = v.duration ? `<div class="track-duration">${v.duration}</div>` : '';
            const liveBadge = v.isLive ? `<div class="track-duration live-duration">LIVE</div>` : '';

            return `
            <div class="track-card ${isActive}" data-index="${originalIndex}">
                <div class="track-thumb-wrapper">
                    <img src="${v.thumb || this.defaultThumbStr}" class="track-thumb" alt="thumb" crossorigin="anonymous">
                    ${v.isLive ? liveBadge : durationBadge}
                </div>
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