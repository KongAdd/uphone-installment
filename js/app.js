/* ===========================================================
   app.js — ตัวควบคุมหลัก: เมนู/นำทาง, ตั้งค่า, import/export, toast
   =========================================================== */

const App = (() => {
  let currentView = 'dashboard';
  let currentOpts = {};

  const mainEl = document.getElementById('appMain');

  function navigate(view, opts) {
    currentView = view;
    currentOpts = opts || {};
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    renderView();
    mainEl.scrollTo?.({ top: 0 });
    window.scrollTo(0, 0);
  }

  function refreshCurrentView() {
    renderView();
  }

  function renderView() {
    if (currentView === 'list') ListView.render(mainEl);
    else if (currentView === 'form') FormView.render(mainEl, currentOpts);
    else DashboardView.render(mainEl);
  }

  function toast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function initNav() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.view));
    });
  }

  function initSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const openBtn = document.getElementById('btnSettings');
    const downInput = document.getElementById('settingDownPayment');
    const interestInput = document.getElementById('settingInterest');
    const urlInput = document.getElementById('settingWebAppUrl');
    const testBtn = document.getElementById('btnTestConnection');
    const testResult = document.getElementById('testConnectionResult');

    openBtn.addEventListener('click', () => {
      const s = getSettings();
      downInput.value = (s.downPaymentRate * 100).toString();
      interestInput.value = (s.interestRatePerInstallment * 100).toString();
      urlInput.value = s.webAppUrl || '';
      testResult.textContent = '';
      testResult.className = 'test-result';
      modal.classList.add('open');
    });

    modal.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', () => modal.classList.remove('open'));
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });

    testBtn.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) {
        testResult.textContent = 'กรุณากรอก URL ก่อน';
        testResult.className = 'test-result err';
        return;
      }
      testResult.textContent = 'กำลังทดสอบ...';
      testResult.className = 'test-result';
      try {
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json || !Array.isArray(json.contracts)) throw new Error('รูปแบบข้อมูลไม่ถูกต้อง');
        testResult.textContent = `เชื่อมต่อสำเร็จ (พบ ${json.contracts.length} สัญญาในชีต)`;
        testResult.className = 'test-result ok';
      } catch (err) {
        testResult.textContent = 'เชื่อมต่อไม่สำเร็จ: ' + err.message;
        testResult.className = 'test-result err';
      }
    });

    document.getElementById('btnSaveSettings').addEventListener('click', () => {
      const down = Number(downInput.value);
      const interest = Number(interestInput.value);
      if (Number.isNaN(down) || Number.isNaN(interest) || down < 0 || interest < 0) {
        toast('กรุณากรอกตัวเลขที่ถูกต้อง', true);
        return;
      }
      saveSettings({
        downPaymentRate: down / 100,
        interestRatePerInstallment: interest / 100,
        webAppUrl: urlInput.value.trim(),
      });
      modal.classList.remove('open');
      toast('บันทึกการตั้งค่าแล้ว');
      refreshCurrentView();
      syncNow();
    });
  }

  function initSyncBadge() {
    const badge = document.getElementById('syncBadge');
    const label = badge.querySelector('.label');
    const refreshBtn = document.getElementById('btnRefreshSync');

    const STATE_TEXT = {
      synced: 'ซิงค์แล้ว',
      syncing: 'กำลังซิงค์...',
      offline: 'ออฟไลน์',
      'no-url': 'ยังไม่ตั้งค่า Google Sheets',
    };

    SyncManager.subscribe((s) => {
      badge.className = 'sync-badge ' + s.state;
      let text = STATE_TEXT[s.state] || s.state;
      if (s.state === 'offline' && s.count > 0) {
        text = `ออฟไลน์ — มี ${s.count} รายการรอซิงค์`;
      }
      label.textContent = text;
      refreshBtn.classList.toggle('spinning', s.state === 'syncing');
    });

    refreshBtn.addEventListener('click', async () => {
      if (!getWebAppUrl()) {
        toast('กรุณาตั้งค่า Google Apps Script Web App URL ก่อน', true);
        return;
      }
      await syncNow();
      toast('ซิงค์ข้อมูลล่าสุดแล้ว');
    });
  }

  function initDataMenu() {
    const menuBtn = document.getElementById('btnDataMenu');
    const dropdown = document.getElementById('dataDropdown');

    menuBtn.addEventListener('click', () => dropdown.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!menuBtn.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.remove('open');
    });

    document.getElementById('btnExportJSON').addEventListener('click', () => {
      exportContractsJSON();
      dropdown.classList.remove('open');
      toast('ส่งออกไฟล์ JSON แล้ว');
    });

    document.getElementById('btnExportCSV').addEventListener('click', () => {
      exportContractsCSV();
      dropdown.classList.remove('open');
      toast('ส่งออกไฟล์ CSV แล้ว');
    });

    document.getElementById('importFileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('นำเข้าข้อมูลจะแทนที่ข้อมูลสัญญาปัจจุบันทั้งหมด ดำเนินการต่อหรือไม่?')) {
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const count = importContractsJSON(reader.result);
          toast(`นำเข้าข้อมูลสำเร็จ ${count} สัญญา`);
          refreshCurrentView();
        } catch (err) {
          toast('นำเข้าไฟล์ไม่สำเร็จ: ' + err.message, true);
        }
        e.target.value = '';
        dropdown.classList.remove('open');
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  function init() {
    seedIfEmpty();
    initNav();
    initSettingsModal();
    initDataMenu();
    initSyncBadge();

    // แสดงข้อมูล cache/ตัวอย่างทันที (offline-first) ก่อนรอผลจาก Google Sheets
    navigate('dashboard');

    // เริ่มระบบซิงค์เบื้องหลัง: ส่งคิวที่ค้าง + ดึงข้อมูลล่าสุด แล้ว retry อัตโนมัติเมื่อออนไลน์/เป็นระยะ
    SyncManager.init(syncNow);
    syncNow();
  }

  return { navigate, refreshCurrentView, toast, init };
})();

document.addEventListener('DOMContentLoaded', App.init);
