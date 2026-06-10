/* js/app.js */
import { DataManager } from './data-manager.js';
import { YouTubePlayerController } from './youtube-player.js';
import { UIController } from './ui-controller.js';

const dataManager = new DataManager();
const ytController = new YouTubePlayerController();

// YouTube API требует глобальной функции для инициализации
window.onYouTubeIframeAPIReady = function() {
    console.log('🌐 [App] YouTube API Скрипт загружен');
    ytController.init();
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 [App] Инициализация Sher Cinema...');
    
    const uiController = new UIController(dataManager);
    
    // Загружаем данные по умолчанию (Локальный архив)
    await dataManager.init();
});