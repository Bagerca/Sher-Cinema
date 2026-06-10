/* js/ui-controller.js */
import EventBus from './event-bus.js';
import { PlayerUI } from './player-ui.js';
import { PlaylistUI } from './playlist-ui.js';
import { ModalUI } from './modal-ui.js';

export class UIController {
    constructor(dataManager) {
        console.log("🎨 [UIController] Инициализация модулей интерфейса");
        
        this.playerUI = new PlayerUI();
        this.playlistUI = new PlaylistUI(dataManager);
        this.modalUI = new ModalUI();

        this.bindGlobalShortcuts();
        this.initLayoutSwap(); // НОВОЕ: Инициализация свапа макета

        EventBus.on('UI_VIDEO_SELECTED', (video) => {
            this.playerUI.updateVideoInfo(video);
        });

        EventBus.on('PLAYER_READY', () => {
            const initVol = parseInt(localStorage.getItem('sher_volume')) || 100;
            this.playerUI.setVolumeUI(initVol);
            EventBus.emit('CMD_VOLUME', initVol);
        });

        EventBus.on('SHOW_ERROR', (msg) => {
            console.warn(`[System Warning] ${msg}`);
        });
    }

    // НОВОЕ: Логика кнопки смены расположения
    initLayoutSwap() {
        const swapBtn = document.getElementById('btn-layout-swap');
        const layoutContainer = document.querySelector('.cinema-layout');
        
        if (swapBtn && layoutContainer) {
            // Загружаем сохраненное состояние
            if (localStorage.getItem('sher_layout_reversed') === 'true') {
                layoutContainer.classList.add('layout-reversed');
            }

            swapBtn.addEventListener('click', () => {
                layoutContainer.classList.toggle('layout-reversed');
                const isReversed = layoutContainer.classList.contains('layout-reversed');
                localStorage.setItem('sher_layout_reversed', isReversed);
            });
        }
    }

    bindGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.modalUI.closeAll();
                if (document.fullscreenElement) document.exitFullscreen();
                return;
            }
            
            if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') return;
            
            const currentVol = parseInt(document.getElementById('volume-slider').value);
            
            switch (e.code) {
                case 'Space': 
                case 'KeyK': 
                    e.preventDefault(); 
                    EventBus.emit('CMD_PLAY_PAUSE'); 
                    break;
                case 'ArrowRight': 
                    e.preventDefault(); 
                    EventBus.emit('CMD_SEEK_RELATIVE', 5); 
                    break;
                case 'ArrowLeft': 
                    e.preventDefault(); 
                    EventBus.emit('CMD_SEEK_RELATIVE', -5); 
                    break;
                case 'KeyL': 
                    e.preventDefault();
                    EventBus.emit('CMD_SEEK_RELATIVE', 10); 
                    break;
                case 'KeyJ': 
                    e.preventDefault();
                    EventBus.emit('CMD_SEEK_RELATIVE', -10); 
                    break;
                case 'ArrowUp': 
                    e.preventDefault(); 
                    EventBus.emit('CMD_VOLUME', Math.min(100, currentVol + 5)); 
                    break;
                case 'ArrowDown': 
                    e.preventDefault(); 
                    EventBus.emit('CMD_VOLUME', Math.max(0, currentVol - 5)); 
                    break;
                case 'KeyM': 
                    e.preventDefault();
                    EventBus.emit('CMD_MUTE_TOGGLE'); 
                    break;
                case 'KeyF': 
                    e.preventDefault();
                    this.playerUI.toggleFullscreen(); 
                    break;
                case 'KeyN': 
                    if (e.shiftKey) {
                        e.preventDefault();
                        EventBus.emit('UI_PLAY_NEXT'); 
                    }
                    break;
                case 'KeyP': 
                    if (e.shiftKey) {
                        e.preventDefault();
                        EventBus.emit('UI_PLAY_PREV'); 
                    }
                    break;
                case 'KeyC': 
                    e.preventDefault();
                    EventBus.emit('CMD_TOGGLE_CC'); 
                    break;
                case 'KeyI':
                    e.preventDefault();
                    EventBus.emit('CMD_TOGGLE_INFO');
                    break;
                case 'KeyH':
                    e.preventDefault();
                    EventBus.emit('CMD_TOGGLE_HOTKEYS');
                    break;
                case 'KeyT':
                    e.preventDefault();
                    EventBus.emit('CMD_TOGGLE_CINEMA');
                    break;
            }
        });
    }
}