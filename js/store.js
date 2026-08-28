/* ===========================================================
   store.js
   ชั้นเก็บข้อมูล (data layer) — แหล่งข้อมูลจริงคือ Google Sheets
   (ผ่าน Google Apps Script Web App, ดู remote.js)

   ออกแบบแบบ offline-first:
   - มี cache ใน localStorage ไว้เปิดแอปได้ทันทีแม้เน็ตช้า/หลุด
   - การแก้ไขทุกครั้ง (create/update/delete) อัปเดต cache ทันที (optimistic)
     แล้วค่อยเข้าคิวส่งขึ้น Google Sheets เบื้องหลัง (ดู sync.js)
   - ฟังก์ชันสาธารณะ (getContracts, addContract, updateContract, deleteContract, ...)
     ยังคงเป็น synchronous เหมือนเดิมทุกประการ เพื่อไม่ต้องแก้โค้ดฝั่ง UI
   =========================================================== */

const CONTRACTS_CACHE_KEY = 'uphone_contracts_v1'; // cache ล่าสุดของข้อมูลจาก Google Sheets

/* ---------- แผนผังฟิลด์ระหว่างโครงสร้างภายในแอป <-> หัวคอลัมน์ใน Google Sheet ---------- */

const SHEET_FIELD_MAP = {
  contractNo: 'เลขที่สัญญา',
  purchaseDate: 'วันที่ซื้อ',
  customerName: 'ชื่อลูกค้า',
  phone: 'เบอร์โทร',
  model: 'รุ่นเครื่อง',
  imei: 'IMEI',
  serialNumber: 'เลขประจำเครื่อง (S/N)',
  totalPrice: 'ราคาสินค้ารวม',
  installments: 'จำนวนงวด',
  startDate: 'วันที่เริ่มชำระ',
  trackingNote: 'หมายเหตุ',
};

const PAYMENT_FIELD_NAMES = ['งวดที่ 1', 'งวดที่ 2', 'งวดที่ 3', 'งวดที่ 4', 'งวดที่ 5', 'งวดที่ 6'];

// internal record -> raw object ตามหัวคอลัมน์ชีต (สำหรับส่งขึ้น Google Sheets)
function toRawFields(record) {
  const raw = {};
  Object.keys(SHEET_FIELD_MAP).forEach((k) => {
    raw[SHEET_FIELD_MAP[k]] = record[k] === undefined || record[k] === null ? '' : record[k];
  });
  (record.payments || []).forEach((p, i) => {
    raw[PAYMENT_FIELD_NAMES[i]] = p === null || p === undefined ? '' : p;
  });
  return raw;
}

// แถวดิบจาก Google Sheets -> internal record (index ใช้ทำ createdAt สังเคราะห์ เพื่อรักษาลำดับแถว)
function fromRawFields(raw, index) {
  const record = {};
  Object.keys(SHEET_FIELD_MAP).forEach((k) => {
    record[k] = raw[SHEET_FIELD_MAP[k]] === undefined || raw[SHEET_FIELD_MAP[k]] === null ? '' : raw[SHEET_FIELD_MAP[k]];
  });
  record.contractNo = String(record.contractNo).trim();
  record.id = record.contractNo; // ใช้เลขที่สัญญาเป็น primary key ตรงกับที่ Apps Script ใช้จับคู่แถว
  record.customerName = String(record.customerName || '').trim();
  record.totalPrice = Number(record.totalPrice) || 0;
  record.installments = Number(record.installments) || 1;
  record.payments = PAYMENT_FIELD_NAMES.map((name) => {
    const v = raw[name];
    return v === '' || v === undefined || v === null ? null : Number(v);
  });
  // สังเคราะห์เวลาจากลำดับแถวในชีต (แถวใหม่กว่า = เวลามากกว่า) ให้การเรียง "ล่าสุดก่อน" ยังทำงานถูกต้อง
  const synthTime = new Date(2000, 0, 1, 0, 0, index).toISOString();
  record.createdAt = synthTime;
  record.updatedAt = synthTime;
  return record;
}

function normalizePayments(payments) {
  const out = [null, null, null, null, null, null];
  if (Array.isArray(payments)) {
    for (let i = 0; i < 6; i++) {
      const v = payments[i];
      out[i] = v === '' || v === undefined || v === null ? null : Number(v);
    }
  }
  return out;
}

/* ---------- cache ใน localStorage ---------- */

let _cache = loadCache();

function loadCache() {
  try {
    const raw = localStorage.getItem(CONTRACTS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('อ่าน cache ข้อมูลสัญญาไม่สำเร็จ', e);
    return [];
  }
}

function persistCache() {
  localStorage.setItem(CONTRACTS_CACHE_KEY, JSON.stringify(_cache));
}

/* ---------- API สาธารณะ (synchronous, เหมือนเดิมทุกประการ) ---------- */

function getContracts() {
  return _cache;
}

function getContractById(id) {
  return _cache.find((c) => c.id === id) || null;
}

function findByContractNo(contractNo, excludeId) {
  const norm = (contractNo || '').trim().toLowerCase();
  return _cache.find(
    (c) => c.contractNo.trim().toLowerCase() === norm && c.id !== excludeId
  ) || null;
}

const CONTRACT_NO_PREFIX = 'UP';
const CONTRACT_NO_START = 201; // เลขที่สัญญาแรกเริ่มที่ UP0201 ถ้ายังไม่มีสัญญาใดตรงรูปแบบนี้เลย
const CONTRACT_NO_PATTERN = /^up\s*0*(\d+)$/i;

// รันเลขที่สัญญาถัดไปสดจากข้อมูลปัจจุบันเสมอ (ไม่ใช่ตัวนับที่จำค่าไว้)
// เช่น ถ้าเคยมี UP0201, UP0202 แล้วลบ UP0202 ทิ้ง สร้างใหม่จะได้ UP0202 อีกครั้ง เพราะคำนวณจาก max ที่มีอยู่จริง + 1
function generateNextContractNo() {
  let max = CONTRACT_NO_START - 1;
  _cache.forEach((c) => {
    const m = CONTRACT_NO_PATTERN.exec((c.contractNo || '').trim());
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > max) max = num;
    }
  });
  return CONTRACT_NO_PREFIX + String(max + 1).padStart(4, '0');
}

// opts.sync = false ใช้เฉพาะตอน seed ข้อมูลตัวอย่าง (ไม่ต้องดันขึ้น Google Sheets)
function addContract(contract, opts) {
  const sync = !opts || opts.sync !== false;
  const contractNo = contract.contractNo.trim();
  const now = new Date().toISOString();
  const record = {
    id: contractNo,
    contractNo,
    purchaseDate: contract.purchaseDate || '',
    customerName: contract.customerName.trim(),
    phone: (contract.phone || '').trim(),
    model: (contract.model || '').trim(),
    imei: (contract.imei || '').trim(),
    serialNumber: (contract.serialNumber || '').trim(),
    totalPrice: Number(contract.totalPrice) || 0,
    installments: Number(contract.installments),
    startDate: contract.startDate,
    payments: normalizePayments(contract.payments),
    trackingNote: contract.trackingNote || '',
    createdAt: now,
    updatedAt: now,
  };
  _cache.push(record);
  persistCache();
  if (sync) {
    SyncManager.enqueue({ action: 'create', contractNo: record.contractNo, data: toRawFields(record) });
    syncNow();
  }
  return record;
}

function updateContract(id, updates) {
  const idx = _cache.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const merged = { ..._cache[idx], ...updates };
  if (updates.customerName !== undefined) merged.customerName = updates.customerName.trim();
  if (updates.payments !== undefined) merged.payments = normalizePayments(updates.payments);
  // เลขที่สัญญาเปลี่ยนไม่ได้หลังสร้าง (ผูกกับ primary key ที่ใช้จับคู่แถวใน Google Sheets)
  merged.id = _cache[idx].id;
  merged.contractNo = _cache[idx].contractNo;
  merged.updatedAt = new Date().toISOString();
  _cache[idx] = merged;
  persistCache();
  SyncManager.enqueue({ action: 'update', contractNo: merged.contractNo, data: toRawFields(merged) });
  syncNow();
  return merged;
}

function deleteContract(id) {
  const record = getContractById(id);
  _cache = _cache.filter((c) => c.id !== id);
  persistCache();
  if (record) {
    SyncManager.enqueue({ action: 'delete', contractNo: record.contractNo, data: { 'เลขที่สัญญา': record.contractNo } });
    syncNow();
  }
}

/* ---------- ซิงค์กับ Google Sheets ---------- */

// ดึงข้อมูลล่าสุดจาก Google Sheets แล้ว merge กับรายการที่ยังค้างอยู่ในคิว (กันโดนทับ)
async function syncFromRemote() {
  const remoteRows = await RemoteAPI.fetchAll();
  const remoteRecords = remoteRows.map(fromRawFields);
  const queue = SyncManager.getQueue();
  const pendingContractNos = new Set(queue.map((op) => op.contractNo));
  const localById = new Map(_cache.map((c) => [c.id, c]));

  // สัญญาที่มีรายการรอ sync ค้างอยู่ ให้ใช้เวอร์ชัน local (ใหม่กว่า) แทนของ remote
  const merged = remoteRecords.map((r) =>
    pendingContractNos.has(r.contractNo) && localById.has(r.id) ? localById.get(r.id) : r
  );

  // สัญญาที่สร้างใหม่ตอนออฟไลน์ (ยังไม่ขึ้นชีต) แต่มีอยู่ใน local ให้คงไว้ในผลลัพธ์ด้วย
  _cache.forEach((c) => {
    if (pendingContractNos.has(c.contractNo) && !merged.some((m) => m.id === c.id)) {
      merged.push(c);
    }
  });

  _cache = merged;
  persistCache();
  return _cache;
}

// จุดเดียวที่ trigger การ sync ทั้งหมด: ส่งคิวที่ค้างอยู่ก่อน แล้วถ้าคิวหมดค่อยดึงข้อมูลล่าสุดมา reconcile
async function syncNow() {
  if (!getWebAppUrl()) return;
  try {
    await SyncManager.processQueue();
    if (SyncManager.getQueue().length === 0) {
      await syncFromRemote();
    }
  } catch (err) {
    console.error('sync ล้มเหลว', err);
  } finally {
    if (window.App) App.refreshCurrentView();
  }
}

/* ---------- Export / Import (manual backup เพิ่มเติมจาก Google Sheets) ---------- */

function triggerDownload(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportContractsJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    contracts: getContracts(),
  };
  triggerDownload(
    `uphone-contracts-${todayISO()}.json`,
    JSON.stringify(data, null, 2),
    'application/json'
  );
}

function csvEscape(val) {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportContractsCSV() {
  const settings = getSettings();
  const headers = [
    'เลขที่สัญญา', 'วันที่ซื้อ', 'ชื่อลูกค้า', 'เบอร์โทร', 'รุ่นเครื่อง', 'IMEI', 'เลขประจำเครื่อง',
    'ราคาสินค้ารวม', 'เงินดาวน์', 'จำนวนงวด', 'ยอดผ่อนทั้งหมด', 'ผ่อนต่องวด', 'วันที่เริ่มชำระ',
    'งวดที่ 1', 'งวดที่ 2', 'งวดที่ 3', 'งวดที่ 4', 'งวดที่ 5', 'งวดที่ 6',
    'จำนวนงวดที่จ่ายแล้ว', 'ยอดที่ชำระแล้ว', 'ยอดคงเหลือ', 'สถานะ', 'หมายเหตุ',
  ];
  const rows = getContracts().map((c) => {
    const d = computeDerived(c, settings);
    return [
      c.contractNo, c.purchaseDate, c.customerName, c.phone, c.model, c.imei, c.serialNumber,
      c.totalPrice, d.downPayment, c.installments, d.totalInstallmentAmount, d.perInstallment, c.startDate,
      ...c.payments.map((p) => (p === null ? '' : p)),
      d.filledCount, d.paidAmount, d.remainingAmount, d.status, c.trackingNote || '',
    ];
  });
  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
  triggerDownload(`uphone-contracts-${todayISO()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}

// นำเข้าไฟล์ JSON กลับเข้าระบบ: แทนที่ cache ทั้งหมด แล้วเข้าคิว "update" (upsert) ทุกสัญญา
// เพื่อดันขึ้น Google Sheets ด้วย (ถ้าตั้งค่า Web App URL ไว้แล้ว)
function importContractsJSON(fileText) {
  const parsed = JSON.parse(fileText);
  const contracts = Array.isArray(parsed) ? parsed : parsed.contracts;
  if (!Array.isArray(contracts)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง: ไม่พบรายการสัญญา');

  const now = new Date().toISOString();
  const cleaned = contracts.map((c) => {
    const contractNo = String(c.contractNo || '').trim();
    return {
      id: contractNo,
      contractNo,
      purchaseDate: c.purchaseDate || '',
      customerName: String(c.customerName || '').trim(),
      phone: c.phone || '',
      model: c.model || '',
      imei: c.imei || '',
      serialNumber: c.serialNumber || '',
      totalPrice: Number(c.totalPrice) || 0,
      installments: Number(c.installments) || 1,
      startDate: c.startDate || '',
      payments: normalizePayments(c.payments),
      trackingNote: c.trackingNote || '',
      createdAt: c.createdAt || now,
      updatedAt: now,
    };
  });

  _cache = cleaned;
  persistCache();
  if (parsed && parsed.settings) {
    const merged = { ...getSettings(), ...parsed.settings };
    saveSettings(merged);
  }

  if (getWebAppUrl()) {
    cleaned.forEach((record) => {
      SyncManager.enqueue({ action: 'update', contractNo: record.contractNo, data: toRawFields(record) });
    });
    syncNow();
  }

  return cleaned.length;
}
