/* js/playlist-ui.js */
import EventBus from './event-bus.js';
import { Storage } from './utils.js';

export class PlaylistUI {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.playlistData = [];
        this.currentIndex = -1;
        this.currentSortMode = 'default';

        this.els = {
            container: document.getElementById('playlist-container'),
            count: document.getElementById('playlist-count'),
            searchInput: document.getElementById('search-input'),
            clearSearchBtn: document.getElementById('search-clear'),
            playlistModule: document.getElementById('playlist-selector-module'),
            activePlaylistBtn: document.getElementById('active-playlist-btn'),
            activePlaylistName: document.getElementById('active-playlist-name'),
            headerPlaylistDropdown: document.getElementById('header-playlist-dropdown'),
            
            // НОВЫЕ элементы сортировки
            sortModule: document.getElementById('sort-module'),
            btnSort: document.getElementById('btn-sort'),
            currentSortLabel: document.getElementById('current-sort-label'),
            sortDropdownOptions: document.querySelectorAll('#sort-dropdown .s-option')
        };

        this.bindEvents();
    }

    bindEvents() {
        EventBus.on('CONFIG_READY', (playlists) => this.renderPlaylistMenu(playlists));
        EventBus.on('PLAYLIST_CHANGED', (index) => {
            this.els.activePlaylistName.textContent = this.dataManager.playlists[index].name;
            document.querySelectorAll('.pl-item').forEach(item => {
                item.classList.toggle('selected', parseInt(item.dataset.index) === index);
            });
            this.setSortMode('default'); // Сбрасываем сортировку при смене плейлиста
        });

        this.els.activePlaylistBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.els.playlistModule.classList.toggle('active');
        });

        // Открытие/закрытие меню сортировки
        this.els.btnSort.addEventListener('click', (e) => {
            e.stopPropagation();
            this.els.sortModule.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!this.els.playlistModule.contains(e.target)) this.els.playlistModule.classList.remove('active');
            if (!this.els.sortModule.contains(e.target)) this.els.sortModule.classList.remove('active');
        });

        // Выбор метода сортировки
        this.els.sortDropdownOptions.forEach(opt => {
            opt.addEventListener('click', (e) => {
                const mode = e.target.dataset.sort;
                this.setSortMode(mode);
                this.els.sortModule.classList.remove('active');
            });
        });

        EventBus.on('DATA_READY', (videos) => {
            this.playlistData = videos;
            this.renderPlaylist(videos);
            this.els.searchInput.value = '';
            this.els.clearSearchBtn.style.display = 'none';

            if(videos.length > 0) {
                const savedId = Storage.get('sher_last_video_id', null);
                let targetIndex = savedId ? videos.findIndex(v => v.id === savedId) : 0;
                this.playIndex(targetIndex !== -1 ? targetIndex : 0);
            }
        });

        EventBus.on('UI_PLAY_NEXT', () => this.playNext());
        EventBus.on('UI_PLAY_PREV', () => this.playPrev());
        EventBus.on('CMD_NEXT', () => this.playNext());

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
    }

    setSortMode(mode) {
        this.currentSortMode = mode;
        this.els.sortDropdownOptions.forEach(o => o.classList.remove('active'));
        const activeOpt = document.querySelector(`#sort-dropdown .s-option[data-sort="${mode}"]`);
        if (activeOpt) {
            activeOpt.classList.add('active');
            this.els.currentSortLabel.textContent = activeOpt.textContent;
        }
        
        const icon = this.els.btnSort.querySelector('i');
        if (mode === 'default') icon.className = 'fas fa-sort';
        else if (mode === 'az') icon.className = 'fas fa-sort-alpha-down';
        else if (mode === 'za') icon.className = 'fas fa-sort-alpha-up';
        else if (mode.includes('est')) icon.className = 'fas fa-calendar-alt';
        else icon.className = 'fas fa-clock';

        this.renderPlaylist(this.dataManager.search(this.els.searchInput.value), this.els.searchInput.value);
    }

    renderPlaylistMenu(playlists) {
        this.els.headerPlaylistDropdown.innerHTML = '';
        playlists.forEach((pl, index) => {
            const div = document.createElement('nav'); 
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

    playIndex(index) {
        if(index < 0 || index >= this.playlistData.length) return;
        this.currentIndex = index;
        const video = this.playlistData[index];

        document.querySelectorAll('.track-card').forEach(c => c.classList.remove('active'));
        const activeCard = document.querySelector(`.track-card[data-index="${index}"]`);
        if(activeCard) {
            activeCard.classList.add('active');
            activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        Storage.set('sher_last_video_id', video.id);
        EventBus.emit('UI_VIDEO_SELECTED', video);
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
        const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeQuery})`, 'gi');
        return text.replace(regex, `<span class="search-highlight">$1</span>`);
    }

    renderPlaylist(videos, query = '') {
        this.els.count.textContent = videos.length;
        if (videos.length === 0) {
            this.els.container.innerHTML = '<div style="padding: 40px 20px; text-align:center; color:#666; font-family: monospace;">СОВПАДЕНИЙ НЕ НАЙДЕНО</div>';
            return;
        }

        let itemsToRender = [...videos];
        
        // Умная сортировка на основе выбранного режима
        switch(this.currentSortMode) {
            case 'az': itemsToRender.sort((a,b) => a.title.localeCompare(b.title)); break;
            case 'za': itemsToRender.sort((a,b) => b.title.localeCompare(a.title)); break;
            case 'newest': itemsToRender.sort((a,b) => b.publishTimestamp - a.publishTimestamp); break;
            case 'oldest': itemsToRender.sort((a,b) => a.publishTimestamp - b.publishTimestamp); break;
            case 'longest': itemsToRender.sort((a,b) => b.durationSec - a.durationSec); break;
            case 'shortest': itemsToRender.sort((a,b) => a.durationSec - b.durationSec); break;
            case 'default': itemsToRender.sort((a,b) => a.originalIndex - b.originalIndex); break;
        }

        const html = itemsToRender.map((v) => {
            const isActive = v.originalIndex === this.currentIndex ? 'active' : '';
            
            const durationBadge = v.duration ? `<div class="track-duration">${v.duration}</div>` : '';
            const liveBadge = v.isLive ? `<div class="track-duration live-duration">LIVE</div>` : '';
            const savedTime = Storage.get(`sher_time_${v.id}`);
            const progressIndicator = savedTime ? `<div class="track-saved-indicator">ПРОДОЛЖИТЬ</div>` : '';

            return `
            <article class="track-card ${isActive}" data-index="${v.originalIndex}">
                <div class="track-thumb-wrapper">
                    ${progressIndicator}
                    <img src="${v.thumb}" class="track-thumb" alt="thumb" crossorigin="anonymous">
                    ${v.isLive ? liveBadge : durationBadge}
                </div>
                <div class="track-info">
                    <h4 class="track-title" title="${v.title}">${this.highlightText(v.title, query)}</h4>
                    <div class="track-meta">${this.highlightText(v.channel || 'Запись из архива', query)}</div>
                </div>
            </article>`;
        }).join('');

        this.els.container.innerHTML = html;
        this.els.container.querySelectorAll('.track-card').forEach(card => {
            card.addEventListener('click', () => this.playIndex(parseInt(card.dataset.index)));
        });
    }
}