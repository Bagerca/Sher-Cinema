/* js/event-bus.js */
class EventBus {
    constructor() {
        this.listeners = {};
    }
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }
    emit(event, payload = null) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => {
            try { callback(payload); } catch (e) { console.error(`[EventBus] Error:`, e); }
        });
    }
}
export default new EventBus();