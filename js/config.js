/* ===========================================================
   config.js
   ตั้งค่าคงที่ของระบบ (ปรับได้ผ่านหน้า UI "ตั้งค่า")
   =========================================================== */

const SETTINGS_KEY = 'uphone_settings_v1';

const DEFAULT_SETTINGS = {
  downPaymentRate: 0.50,             // 50% ของราคาสินค้า
  interestRatePerInstallment: 0.08,  // 8% ต่องวด
  webAppUrl: '',                     // URL ของ Google Apps Script Web App (ตั้งค่าเฉพาะเครื่อง)
};

function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getWebAppUrl() {
  return (getSettings().webAppUrl || '').trim();
}

function saveWebAppUrl(url) {
  const s = getSettings();
  s.webAppUrl = (url || '').trim();
  saveSettings(s);
}
