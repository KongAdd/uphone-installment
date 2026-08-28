/**
 * Uphone — ระบบผ่อนมือถือหน้าร้าน
 * Google Apps Script Web App — backend เชื่อมกับ Google Sheet
 *
 * วิธีติดตั้ง: ดู README.md ในโปรเจกต์ (หัวข้อ "การตั้งค่า Google Sheets Sync")
 *
 * เก็บเฉพาะข้อมูลดิบของสัญญาเท่านั้น (ไม่เก็บฟิลด์คำนวณ เช่น เงินดาวน์/ยอดผ่อนทั้งหมด/สถานะ
 * ฟิลด์เหล่านั้นคำนวณฝั่งเว็บแอปทุกครั้งที่โหลดข้อมูล ตามสูตรใน js/calc.js)
 */

var SHEET_NAME = 'สัญญาผ่อน';

// หัวคอลัมน์ในชีต (ต้องตรงกับ SHEET_FIELD_MAP ในไฟล์ js/store.js ของเว็บแอป)
var HEADERS = [
  'เลขที่สัญญา',
  'วันที่ซื้อ',
  'ชื่อลูกค้า',
  'เบอร์โทร',
  'รุ่นเครื่อง',
  'IMEI',
  'เลขประจำเครื่อง (S/N)',
  'ราคาสินค้ารวม',
  'จำนวนงวด',
  'วันที่เริ่มชำระ',
  'งวดที่ 1',
  'งวดที่ 2',
  'งวดที่ 3',
  'งวดที่ 4',
  'งวดที่ 5',
  'งวดที่ 6',
  'หมายเหตุ', // หมายเหตุติดตาม (ฟิลด์ดิบที่พนักงานพิมพ์เอง ไม่ใช่ฟิลด์คำนวณ)
  'อาชีพ',
  'เงินเดือน',
  'ที่ทำงาน',
  'ลิงก์แผนที่ที่ทำงาน',
  'เบอร์นายจ้าง',
  'ชื่อผู้อ้างอิง 1',
  'เบอร์โทรผู้อ้างอิง 1',
  'ความสัมพันธ์ผู้อ้างอิง 1',
  'ชื่อผู้อ้างอิง 2',
  'เบอร์โทรผู้อ้างอิง 2',
  'ความสัมพันธ์ผู้อ้างอิง 2',
];

/**
 * รีเซ็ตชีต "สัญญาผ่อน": ลบทิ้งทั้งแท็บ (ถ้ามี) แล้วสร้างใหม่พร้อมหัวตารางที่ถูกต้อง
 * ใช้กรณีหัวตารางเพี้ยน/มีข้อมูลทดสอบค้างอยู่ — รันฟังก์ชันนี้ตรงๆ จาก Apps Script Editor
 * (เลือก resetSheet ในดรอปดาวน์ข้างปุ่ม Run แล้วกด Run) ข้อมูลสัญญาเดิมในชีตนี้จะหายไปทั้งหมด
 */
function resetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var old = ss.getSheetByName(SHEET_NAME);
  if (old) ss.deleteSheet(old);
  var sheet = ss.insertSheet(SHEET_NAME);
  sheet.appendRow(HEADERS);
  sheet.setFrozenRows(1);
  Logger.log('รีเซ็ตชีต "' + SHEET_NAME + '" เรียบร้อย หัวตาราง: ' + HEADERS.join(', '));
}

/**
 * คืนชีตเป้าหมาย สร้างใหม่พร้อมหัวตารางถ้ายังไม่มี
 * ถ้าชีตมีอยู่แล้วแต่ขาดคอลัมน์ใหม่ (เช่นเพิ่มฟิลด์ทีหลัง) จะเติมหัวคอลัมน์ที่ขาดต่อท้ายให้อัตโนมัติ
 * โดยไม่แตะแถวข้อมูลเดิมเลย (ดู migrateHeaders_)
 */
function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else {
    migrateHeaders_(sheet);
  }
  return sheet;
}

/** เติมหัวคอลัมน์ที่ยังไม่มีในชีต (เทียบกับ HEADERS) ต่อท้ายคอลัมน์สุดท้าย ไม่ลบ/ไม่ย้ายอะไรที่มีอยู่ */
function migrateHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  var currentHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var missing = HEADERS.filter(function (h) { return currentHeaders.indexOf(h) === -1; });
  if (missing.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
}

/**
 * GET /exec — คืนสัญญาทั้งหมดเป็น JSON: { contracts: [ {...}, ... ] }
 */
function doGet(e) {
  try {
    var sheet = getSheet_();
    var range = sheet.getDataRange();
    var values = range.getValues();
    if (values.length === 0) return jsonResponse_({ contracts: [] });

    var headers = values[0];
    var rows = values.slice(1);
    var contracts = rows
      .filter(function (r) { return r[0] !== '' && r[0] !== null && r[0] !== undefined; })
      .map(function (r) { return rowToObject_(headers, r); });

    return jsonResponse_({ contracts: contracts });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

/**
 * POST /exec — body: { action: 'create'|'update'|'delete', data: {...} }
 * หมายเหตุ: ฝั่งเว็บส่ง Content-Type เป็น text/plain เพื่อเลี่ยง CORS preflight
 * เนื้อหาข้างในยังเป็น JSON string ปกติ ใช้ JSON.parse ได้ตามปกติ
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ ok: false, error: 'ไม่พบข้อมูลที่ส่งมา (postData ว่าง)' });
    }

    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var data = body.data || {};
    var sheet = getSheet_();

    if (action === 'create') {
      appendRow_(sheet, data);
      return jsonResponse_({ ok: true, action: 'create' });
    }

    if (action === 'update') {
      // กันกรณีหาแถวไม่เจอ: ถ้าไม่เจอแถวเดิม ให้เพิ่มแถวใหม่แทน (upsert) เพื่อไม่ให้ข้อมูลหาย
      var found = updateRow_(sheet, data);
      if (!found) appendRow_(sheet, data);
      return jsonResponse_({ ok: true, action: 'update', upserted: !found });
    }

    if (action === 'delete') {
      var contractNo = data['เลขที่สัญญา'];
      var deleted = deleteRow_(sheet, contractNo);
      return jsonResponse_({ ok: true, action: 'delete', found: deleted });
    }

    return jsonResponse_({ ok: false, error: 'ไม่รู้จัก action: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

/** แปลงแถว (array) -> object ตามหัวคอลัมน์ พร้อมแปลงวันที่เป็นข้อความ yyyy-MM-dd */
function rowToObject_(headers, row) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    var v = row[i];
    if (Object.prototype.toString.call(v) === '[object Date]') {
      v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    obj[headers[i]] = v === undefined || v === null ? '' : v;
  }
  return obj;
}

/** หาเลขแถว (1-indexed) จาก "เลขที่สัญญา" — คืน -1 ถ้าไม่เจอ */
function findRowIndexByContractNo_(sheet, contractNo) {
  if (!contractNo) return -1;
  var values = sheet.getDataRange().getValues();
  var target = String(contractNo).trim();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === target) return i + 1;
  }
  return -1;
}

/** เพิ่มแถวใหม่ท้ายชีต โดย map ตามหัวคอลัมน์ปัจจุบันของชีต */
function appendRow_(sheet, data) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) {
    return data[h] !== undefined && data[h] !== null ? data[h] : '';
  });
  sheet.appendRow(row);
}

/** อัปเดตทั้งแถวที่ตรงกับ "เลขที่สัญญา" — คืน true ถ้าเจอและอัปเดตสำเร็จ, false ถ้าไม่เจอ */
function updateRow_(sheet, data) {
  var contractNo = data['เลขที่สัญญา'];
  var rowIndex = findRowIndexByContractNo_(sheet, contractNo);
  if (rowIndex === -1) return false;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) {
    return data[h] !== undefined && data[h] !== null ? data[h] : '';
  });
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  return true;
}

/** ลบแถวที่ตรงกับ "เลขที่สัญญา" — คืน true ถ้าเจอและลบสำเร็จ, false ถ้าไม่เจอ */
function deleteRow_(sheet, contractNo) {
  var rowIndex = findRowIndexByContractNo_(sheet, contractNo);
  if (rowIndex === -1) return false;
  sheet.deleteRow(rowIndex);
  return true;
}

/** ห่อ response เป็น JSON เสมอ */
function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
