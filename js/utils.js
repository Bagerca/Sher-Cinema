/* js/utils.js */

export const Storage = {
    get: (key, defaultValue) => {
        try { return localStorage.getItem(key) ?? defaultValue; } 
        catch (e) { console.warn(`[Storage] Чтение ${key} заблокировано браузером.`); return defaultValue; }
    },
    set: (key, value) => {
        try { localStorage.setItem(key, value); } 
        catch (e) { console.warn(`[Storage] Запись ${key} заблокирована браузером.`); }
    },
    remove: (key) => {
        try { localStorage.removeItem(key); } 
        catch (e) { console.warn(`[Storage] Удаление ${key} заблокировано.`); }
    }
};

export const Formatters = {
    formatTime: (seconds) => {
        if (!seconds || isNaN(seconds)) return "0:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        const sStr = s < 10 ? '0' + s : s;
        if (h > 0) {
            const mStr = m < 10 ? '0' + m : m;
            return `${h}:${mStr}:${sStr}`;
        }
        return `${m}:${sStr}`;
    },
    
    generateDynamicAvatar: (channelName) => {
        const letter = (channelName && channelName.trim().length > 0) ? channelName.trim().charAt(0).toUpperCase() : 'C';
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><rect width='150' height='150' fill='#1a1a2e'/><text x='50%' y='50%' font-family='sans-serif' font-size='65' fill='#39ff14' font-weight='bold' text-anchor='middle' dy='.35em'>${letter}</text></svg>`;
        return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
    }
};

export const ChapterParser = {
    extract: (text) => {
        if (!text) return [];
        const lines = text.split('\n');
        const chapters = [];
        
        lines.forEach(line => {
            const match = line.match(/(?:^|\s|\[|\()((?:[0-9]+:)?(?:[0-5]?[0-9]):(?:[0-5][0-9]))(?:\]|\)|\s|-|$)/);
            
            if (match && match[1]) {
                const timeParts = match[1].split(':').reverse();
                let seconds = 0;
                seconds += parseInt(timeParts[0] || 0, 10); 
                seconds += parseInt(timeParts[1] || 0, 10) * 60; 
                if (timeParts[2]) seconds += parseInt(timeParts[2], 10) * 3600; 
                
                let title = line.replace(match[0], '').replace(/^[-\s|:\[\]\(\)]+|[-\s|:\[\]\(\)]+$/g, '').trim();
                if (title) chapters.push({ time: seconds, title: title });
            }
        });
        
        if (chapters.length < 2) return [];
        
        return chapters.sort((a, b) => a.time - b.time);
    }
};

export const UIUtils = {
    getDominantColor: (imageSrc) => {
        return new Promise(resolve => {
            const defaultColor = 'rgba(255, 45, 149, 0.4)';
            if (!imageSrc) return resolve(defaultColor);

            const img = new Image();
            img.crossOrigin = "anonymous"; // Запрашиваем CORS-доступ к изображениям YouTube
            img.src = imageSrc;
            
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    canvas.width = 16; 
                    canvas.height = 16; 
                    ctx.drawImage(img, 0, 0, 16, 16);
                    
                    const data = ctx.getImageData(0, 0, 16, 16).data;
                    let r = 0, g = 0, b = 0, count = 0;
                    
                    for (let i = 0; i < data.length; i += 4) { 
                        // Игнорируем пиксели черного фона, чтобы получить более чистый оттенок
                        if (data[i] > 30 || data[i+1] > 30 || data[i+2] > 30) {
                            r += data[i]; g += data[i+1]; b += data[i+2]; count++;
                        }
                    }
                    if (count === 0) return resolve(defaultColor);
                    resolve(`rgba(${Math.floor(r/count)},${Math.floor(g/count)},${Math.floor(b/count)}, 0.45)`);
                } catch(e) { 
                    console.warn("[UIUtils] CORS блокировка canvas. Использован стандартный цвет свечения.");
                    resolve(defaultColor); 
                } 
            };
            img.onerror = () => resolve(defaultColor);
        });
    }
};