/* ===========================================================
   calc.js
   ฟังก์ชันวันที่ / การเงิน / สูตรคำนวณสัญญาผ่อน (ตาม spec ข้อ 2-6)
   =========================================================== */

/* ---------- วันที่ ---------- */

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayISO() {
  return toISODate(new Date());
}

// EDATE(date, months) แบบ Excel: บวกเดือน รักษาวันที่ในเดือน ถ้าเกินให้ปรับเป็นวันสุดท้ายของเดือนนั้น
function edate(isoDateStr, monthsToAdd) {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  const day = base.getDate();
  const targetFirst = new Date(base.getFullYear(), base.getMonth() + monthsToAdd, 1);
  const daysInTargetMonth = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
  targetFirst.setDate(Math.min(day, daysInTargetMonth));
  return toISODate(targetFirst);
}

function addDaysISO(isoDateStr, days) {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISODate(dt);
}

function daysBetweenISO(fromISO, toISO) {
  const [y1, m1, d1] = fromISO.split('-').map(Number);
  const [y2, m2, d2] = toISO.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatThaiDate(isoDateStr, opts) {
  if (!isoDateStr) return '-';
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const buddhistYear = y + 543;
  if (opts && opts.short) {
    return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${String(buddhistYear).slice(-2)}`;
  }
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${dd}/${mm}/${buddhistYear}`;
}

/* ---------- ตัวเลข/เงิน ---------- */

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' บาท';
}

function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const AMOUNT_TOLERANCE = 0.01;

/* ---------- ตรวจสอบ IMEI ---------- */

// IMEI มาตรฐาน: ตัวเลข 15 หลัก และหลักสุดท้ายเป็น check digit ตามอัลกอริทึม Luhn
function isValidImei(imei) {
  const digits = String(imei || '').replace(/[\s-]/g, '');
  if (!/^\d{15}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = parseInt(digits[digits.length - 1 - i], 10);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// จำนวนงวดสูงสุดที่อนุญาต ผูกกับราคาขาย: ต่ำกว่าเกณฑ์ผ่อนได้สูงสุด 3 งวด, ถึง/เกินเกณฑ์ผ่อนได้สูงสุด 6 งวด
const INSTALLMENT_PRICE_THRESHOLD = 8400;

function maxInstallmentsForPrice(price) {
  return Number(price) >= INSTALLMENT_PRICE_THRESHOLD ? 6 : 3;
}

// เงินดาวน์ปัดขึ้นเป็นจำนวนเต็มบาทเสมอ ไม่เอาเศษสตางค์
function computeDownPayment(totalPrice, rate) {
  return Math.ceil(Number(totalPrice) * rate);
}

/* ---------- สูตรคำนวณหลัก (ต่อ 1 สัญญา) ---------- */

// สถานะติดตาม (dashboard) เรียงลำดับความสำคัญ ใช้จัดอันดับตาราง
const TRACKING_STATUS_PRIORITY = {
  'ค้างชำระ': 0,
  'ครบกำหนดวันนี้': 1,
  'ใกล้ถึงกำหนด': 2,
  'ชำระยังไม่ครบ': 3,
  'ยังไม่ถึงกำหนด': 4,
  'ยังไม่กำหนดวันชำระ': 5,
  'ผ่อนครบแล้ว': 6,
};

function computeDerived(contract, settings) {
  settings = settings || getSettings();
  const rate = settings.downPaymentRate;
  const interest = settings.interestRatePerInstallment;

  const totalPrice = Number(contract.totalPrice) || 0;
  const installments = Number(contract.installments) || 0;

  const downPayment = computeDownPayment(totalPrice, rate);
  const principal = totalPrice - downPayment;
  const totalInstallmentAmount = round2(principal * (1 + interest * installments));
  const perInstallment = installments > 0 ? round2(totalInstallmentAmount / installments) : 0;

  const dueDates = [];
  for (let i = 0; i < 6; i++) {
    dueDates.push(i < installments && contract.startDate ? edate(contract.startDate, i) : null);
  }

  const today = todayISO();

  let filledCount = 0;      // จำนวนงวดที่กรอกเงิน (ไม่ว่าตรงยอดหรือไม่) - ใช้กับสถานะสัญญา
  let paidStrictCount = 0;  // จำนวนงวดที่ตรงยอด (ใช้กับ dashboard "จ่ายแล้ว")
  let paidAmount = 0;
  const slotStates = []; // { color, amount, dueDate }

  for (let i = 0; i < 6; i++) {
    const raw = contract.payments ? contract.payments[i] : null;
    const filled = raw !== null && raw !== undefined && raw !== '';
    const amt = filled ? Number(raw) : null;

    if (i >= installments) {
      slotStates.push({ color: 'exceed', amount: amt, dueDate: null });
      continue;
    }

    const dueDate = dueDates[i];

    if (filled) {
      filledCount++;
      paidAmount += amt;
      const matches = Math.abs(amt - perInstallment) <= AMOUNT_TOLERANCE;
      if (matches) {
        paidStrictCount++;
        slotStates.push({ color: 'paid', amount: amt, dueDate });
      } else {
        slotStates.push({ color: 'mismatch', amount: amt, dueDate });
      }
    } else {
      if (dueDate && dueDate < today) {
        slotStates.push({ color: 'overdue', amount: null, dueDate });
      } else {
        slotStates.push({ color: 'none', amount: null, dueDate });
      }
    }
  }

  const remainingAmount = round2(totalInstallmentAmount - paidAmount);

  // สถานะสัญญา (ข้อ 4)
  const dueSoFarCount = dueDates.slice(0, installments).filter((d) => d && d <= today).length;
  let status;
  if (filledCount >= installments) {
    status = 'ผ่อนครบแล้ว';
  } else if (filledCount < dueSoFarCount) {
    status = 'ค้างชำระ';
  } else {
    status = 'กำลังผ่อน';
  }

  // สถานะติดตาม (dashboard, ข้อ 6)
  const mismatchPresent = filledCount > paidStrictCount;
  let nextDueDate = null;
  if (!mismatchPresent && paidStrictCount < installments) {
    nextDueDate = dueDates[paidStrictCount];
  }
  let daysUntilDue = null;
  if (nextDueDate) {
    daysUntilDue = daysBetweenISO(today, nextDueDate);
  }

  let trackingStatus;
  if (mismatchPresent) {
    trackingStatus = 'ชำระยังไม่ครบ';
  } else if (paidStrictCount >= installments) {
    trackingStatus = 'ผ่อนครบแล้ว';
  } else if (!nextDueDate) {
    trackingStatus = 'ยังไม่กำหนดวันชำระ';
  } else if (nextDueDate < today) {
    trackingStatus = 'ค้างชำระ';
  } else if (nextDueDate === today) {
    trackingStatus = 'ครบกำหนดวันนี้';
  } else if (daysUntilDue <= 3) {
    trackingStatus = 'ใกล้ถึงกำหนด';
  } else {
    trackingStatus = 'ยังไม่ถึงกำหนด';
  }

  return {
    downPayment,
    totalInstallmentAmount,
    perInstallment,
    dueDates,
    slotStates,
    filledCount,
    paidStrictCount,
    paidAmount,
    remainingAmount,
    status,
    mismatchPresent,
    nextDueDate,
    daysUntilDue,
    trackingStatus,
    trackingPriority: TRACKING_STATUS_PRIORITY[trackingStatus],
    currentInstallmentLabel:
      paidStrictCount >= installments
        ? `ครบ ${installments}/${installments}`
        : `งวด ${paidStrictCount + 1}/${installments}`,
  };
}
