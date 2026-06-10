/* js/modal-ui.js */
import EventBus from './event-bus.js';

export class ModalUI {
    constructor() {
        this.currentVideo = null;

        this.els = {
            btnInfo: document.getElementById('btn-info'),
            infoOverlay: document.getElementById('info-modal-overlay'),
            infoCloseBtn: document.getElementById('info-modal-close'),
            infoTitle: document.getElementById('info-title'),
            infoDate: document.getElementById('info-date'),
            infoViews: document.getElementById('info-views'),
            infoDescription: document.getElementById('info-description'),
            
            btnHotkeys: document.getElementById('btn-hotkeys'),
            hotkeysOverlay: document.getElementById('hotkeys-modal-overlay'),
            hotkeysCloseBtn: document.getElementById('hotkeys-modal-close')
        };

        EventBus.on('UI_VIDEO_SELECTED', (video) => { this.currentVideo = video; });
        this.bindEvents();
    }

    bindEvents() {
        // ИСПРАВЛЕНО: Теперь клик по кнопке переключает (открывает/закрывает) модалки
        this.els.btnInfo.addEventListener('click', () => this.toggleModal(this.els.infoOverlay, () => this.populateInfo()));
        this.els.infoCloseBtn.addEventListener('click', () => this.closeModal(this.els.infoOverlay));
        this.els.infoOverlay.addEventListener('click', (e) => { if (e.target === this.els.infoOverlay) this.closeModal(this.els.infoOverlay); });

        this.els.btnHotkeys.addEventListener('click', () => this.toggleModal(this.els.hotkeysOverlay));
        this.els.hotkeysCloseBtn.addEventListener('click', () => this.closeModal(this.els.hotkeysOverlay));
        this.els.hotkeysOverlay.addEventListener('click', (e) => { if (e.target === this.els.hotkeysOverlay) this.closeModal(this.els.hotkeysOverlay); });

        // НОВОЕ: Обработка команд от глобальных горячих клавиш
        EventBus.on('CMD_TOGGLE_INFO', () => this.toggleModal(this.els.infoOverlay, () => this.populateInfo()));
        EventBus.on('CMD_TOGGLE_HOTKEYS', () => this.toggleModal(this.els.hotkeysOverlay));

        this.els.infoDescription.addEventListener('click', (e) => {
            const timestampObj = e.target.closest('.timestamp-link');
            if (timestampObj) {
                const seconds = parseInt(timestampObj.dataset.time);
                EventBus.emit('CMD_SEEK_TO', seconds);
                this.closeModal(this.els.infoOverlay);
            }
        });
    }

    // НОВОЕ: Умное переключение (Toggle)
    toggleModal(overlayElement, beforeOpenCallback = null) {
        if (overlayElement.classList.contains('active')) {
            this.closeModal(overlayElement);
        } else {
            if (beforeOpenCallback) beforeOpenCallback();
            overlayElement.classList.add('active');
        }
    }

    closeModal(overlayElement) {
        overlayElement.classList.remove('active');
    }

    closeAll() {
        this.closeModal(this.els.infoOverlay);
        this.closeModal(this.els.hotkeysOverlay);
    }

    populateInfo() {
        if (!this.currentVideo) return;
        const video = this.currentVideo;
        
        this.els.infoTitle.textContent = video.title;
        this.els.infoDate.textContent = video.publishDate || '--';
        this.els.infoViews.textContent = video.viewsRaw ? parseInt(video.viewsRaw).toLocaleString('ru-RU') : '--';
        this.els.infoDescription.innerHTML = this.parseDescriptionTimestamps(video.description);
    }

    parseDescriptionTimestamps(text) {
        if (!text) return 'Описание отсутствует.';
        const div = document.createElement('div');
        div.innerText = text;
        let safeText = div.innerHTML;

        const timeRegex = /\b(?:([0-9]+):)?([0-5]?[0-9]):([0-5][0-9])\b/g;
        return safeText.replace(timeRegex, (match, h, m, s) => {
            let seconds = 0;
            if (h) seconds += parseInt(h, 10) * 3600;
            seconds += parseInt(m, 10) * 60;
            seconds += parseInt(s, 10);
            return `<span class="timestamp-link" data-time="${seconds}" title="Прыгнуть на ${match}"><i class="fas fa-play"></i> ${match}</span>`;
        });
    }
}