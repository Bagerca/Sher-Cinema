/* js/app.js */
import { DataManager } from './data-manager.js';
import { YouTubePlayerController } from './youtube-player.js';
import { UIController } from './ui-controller.js';

const dataManager = new DataManager();
const ytController = new YouTubePlayerController();

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 [App] Инициализация Sher Cinema...');
    
    const uiController = new UIController(dataManager);
    
    // Загружаем данные по умолчанию (Локальный архив)
    await dataManager.init();

    // 1. СНАЧАЛА объявляем глобальную функцию коллбека
    window.onYouTubeIframeAPIReady = function() {
        console.log('🌐 [App] YouTube API Скрипт загружен и готов');
        ytController.init();
    };

    // 2. ЗАТЕМ динамически загружаем сам скрипт YouTube.
    // Это гарантирует, что гонки не будет, где бы ни хостился проект.
    console.log('📡 [App] Запрос к серверам YouTube...');
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
});