/* ===========================================================
   sync.js — คิวรอ sync + สถานะการเชื่อมต่อ
   ไฟล์นี้ไม่รู้จักโครงสร้างข้อมูลสัญญาโดยตรง รับแค่ {action, contractNo, data}
   แล้วส่งต่อให้ RemoteAPI — ตรรกะ merge/แปลงข้อมูลอยู่ที่ store.js
   =========================================================== */

const SyncManager = (() => {
  const QUEUE_KEY = 'uphone_sync_queue_v1';

  let isSyncing = false;
  let listeners = [];
  let triggerFn = null;

  function getQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveQueue(list) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
    notify();
  }

  // op: { action: 'create'|'update'|'delete', contractNo, data }
  function enqueue(op) {
    const q = getQueue();
    q.push({
      ...op,
      id: 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      ts: new Date().toISOString(),
    });
    saveQueue(q);
  }

  function removeItem(queueItemId) {
    saveQueue(getQueue().filter((x) => x.id !== queueItemId));
  }

  // ส่งรายการในคิวขึ้น Google Sheets ทีละรายการ เรียงตามเวลา
  // หยุดที่รายการแรกที่ล้มเหลว (ออฟไลน์/เน็ตหลุด) แล้วเก็บคิวที่เหลือไว้ลองใหม่ภายหลัง
  async function processQueue() {
    if (isSyncing) return;
    if (!getWebAppUrl()) return;
    if (getQueue().length === 0) { notify(); return; }

    isSyncing = true;
    notify();
    try {
      // ประมวลผลทีละรายการ อ่านคิวใหม่ทุกรอบเผื่อมีการเพิ่มระหว่างทาง
      while (true) {
        const q = getQueue();
        if (q.length === 0) break;
        const item = q[0];
        try {
          await RemoteAPI.send(item.action, item.data);
          removeItem(item.id);
        } catch (err) {
          console.warn('sync: ส่งรายการไม่สำเร็จ จะลองใหม่ภายหลัง', err);
          break;
        }
      }
    } finally {
      isSyncing = false;
      notify();
    }
  }

  function status() {
    const q = getQueue();
    if (!getWebAppUrl()) return { state: 'no-url', count: 0 };
    if (isSyncing) return { state: 'syncing', count: q.length };
    if (q.length > 0) return { state: 'offline', count: q.length };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { state: 'offline', count: 0 };
    return { state: 'synced', count: 0 };
  }

  function notify() {
    const s = status();
    listeners.forEach((fn) => fn(s));
  }

  function subscribe(fn) {
    listeners.push(fn);
    fn(status());
    return () => { listeners = listeners.filter((f) => f !== fn); };
  }

  // triggerFn: ฟังก์ชันจาก store.js ที่ทำทั้ง processQueue + ดึงข้อมูลล่าสุดจาก remote
  function init(fn) {
    triggerFn = fn;
    window.addEventListener('online', () => triggerFn && triggerFn());
    window.addEventListener('offline', notify);
    setInterval(() => {
      if (navigator.onLine && getQueue().length > 0 && triggerFn) triggerFn();
    }, 20000);
    notify();
  }

  return { getQueue, enqueue, processQueue, subscribe, init, status };
})();
