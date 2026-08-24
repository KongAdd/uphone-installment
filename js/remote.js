/* ===========================================================
   remote.js — ตัวเชื่อมต่อ Google Apps Script Web App
   (ตัว data layer จริงอยู่ที่ store.js ไฟล์นี้ทำหน้าที่แค่ fetch)
   =========================================================== */

const RemoteAPI = (() => {
  // ดึงสัญญาทั้งหมดจาก Google Sheet (ดิบ, ยังไม่คำนวณอะไร)
  async function fetchAll() {
    const url = getWebAppUrl();
    if (!url) throw new Error('ยังไม่ได้ตั้งค่า Web App URL ในหน้าตั้งค่า');

    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error('เชื่อมต่อ Google Sheets ไม่สำเร็จ (HTTP ' + res.status + ')');

    const json = await res.json();
    if (!json || !Array.isArray(json.contracts)) {
      throw new Error('รูปแบบข้อมูลที่ได้จาก Google Sheets ไม่ถูกต้อง');
    }
    return json.contracts;
  }

  // ส่งคำสั่ง create / update / delete ไปยัง Apps Script
  // หมายเหตุ CORS: ใช้ Content-Type: text/plain เพื่อเลี่ยง preflight OPTIONS
  // ที่ Apps Script Web App ไม่รองรับ (เนื้อหาข้างในยังเป็น JSON string ตามปกติ)
  async function send(action, data) {
    const url = getWebAppUrl();
    if (!url) throw new Error('ยังไม่ได้ตั้งค่า Web App URL ในหน้าตั้งค่า');

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data }),
    });
    if (!res.ok) throw new Error('ส่งข้อมูลไม่สำเร็จ (HTTP ' + res.status + ')');

    const json = await res.json();
    if (json && json.ok === false) throw new Error(json.error || 'เกิดข้อผิดพลาดที่ฝั่ง Google Sheets');
    return json;
  }

  return { fetchAll, send };
})();
