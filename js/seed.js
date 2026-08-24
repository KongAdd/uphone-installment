/* ===========================================================
   seed.js
   ข้อมูลตัวอย่างสำหรับทดสอบ (สร้างครั้งแรกเมื่อยังไม่มีสัญญาใดๆ)
   ครอบคลุมสถานะ: กำลังผ่อน, ค้างชำระ, ผ่อนครบแล้ว, ใกล้ถึงกำหนด, ชำระยังไม่ครบ
   =========================================================== */

function seedPerInstallment(totalPrice, installments, settings) {
  const downPayment = round2(totalPrice * settings.downPaymentRate);
  const principal = totalPrice - downPayment;
  const totalInstallmentAmount = round2(principal * (1 + settings.interestRatePerInstallment * installments));
  return round2(totalInstallmentAmount / installments);
}

function seedIfEmpty() {
  // ไม่ seed ข้อมูลตัวอย่างถ้าตั้งค่า Google Sheets ไว้แล้ว (ให้รอข้อมูลจริงจาก remote แทน)
  if (getWebAppUrl() || getContracts().length > 0) return;

  const settings = getSettings();
  const today = todayISO();

  // A) UP 201 — ค้างชำระ (ตัวอย่างจากไฟล์ต้นฉบับ วันที่เริ่มชำระ = เมื่อวาน จึงเลยกำหนดงวดแรกแล้ว)
  const aInstallments = 4;
  const aTotalPrice = 12000;
  addContract({
    contractNo: 'UP 201',
    purchaseDate: addDaysISO(today, -5),
    customerName: 'สมชาย ใจดี',
    phone: '081-234-5678',
    model: 'iPhone 13 128GB',
    imei: '356789104521369',
    serialNumber: 'SN-A2633-0011',
    totalPrice: aTotalPrice,
    installments: aInstallments,
    startDate: addDaysISO(today, -1),
    payments: [null, null, null, null, null, null],
  }, { sync: false });

  // B) UP 202 — กำลังผ่อน (จ่าย 2 งวดแรกตรงยอด ที่เหลือยังไม่ถึงกำหนด)
  const bInstallments = 3;
  const bTotalPrice = 9000;
  const bStart = addDaysISO(today, -35);
  const bPer = seedPerInstallment(bTotalPrice, bInstallments, settings);
  addContract({
    contractNo: 'UP 202',
    purchaseDate: addDaysISO(today, -40),
    customerName: 'วิภาพร สุขใจ',
    phone: '089-876-5432',
    model: 'Samsung Galaxy A54',
    imei: '356789104598765',
    serialNumber: 'SN-B7741-0022',
    totalPrice: bTotalPrice,
    installments: bInstallments,
    startDate: bStart,
    payments: [bPer, bPer, null, null, null, null],
  }, { sync: false });

  // C) UP 203 — ผ่อนครบแล้ว (จ่ายครบทุกงวดตรงยอด)
  const cInstallments = 2;
  const cTotalPrice = 6000;
  const cStart = addDaysISO(today, -190);
  const cPer = seedPerInstallment(cTotalPrice, cInstallments, settings);
  addContract({
    contractNo: 'UP 203',
    purchaseDate: addDaysISO(today, -200),
    customerName: 'ประยุทธ มั่นคง',
    phone: '062-111-2233',
    model: 'iPhone SE 2022',
    imei: '356789104512340',
    serialNumber: 'SN-C1029-0033',
    totalPrice: cTotalPrice,
    installments: cInstallments,
    startDate: cStart,
    payments: [cPer, cPer, null, null, null, null],
  }, { sync: false });

  // D) UP 204 — ใกล้ถึงกำหนด (จ่าย 2 งวดแรกตรงยอด งวดที่ 3 ครบกำหนดในอีก 2 วัน)
  const dInstallments = 4;
  const dTotalPrice = 15000;
  const dStart = edate(addDaysISO(today, 2), -2); // ให้ due[index2] = today+2
  const dPer = seedPerInstallment(dTotalPrice, dInstallments, settings);
  addContract({
    contractNo: 'UP 204',
    purchaseDate: addDaysISO(today, -70),
    customerName: 'ณัฐพล เจริญทรัพย์',
    phone: '095-333-4455',
    model: 'Xiaomi Redmi Note 13',
    imei: '356789104587123',
    serialNumber: 'SN-D5502-0044',
    totalPrice: dTotalPrice,
    installments: dInstallments,
    startDate: dStart,
    payments: [dPer, dPer, null, null, null, null],
  }, { sync: false });

  // E) UP 205 — ชำระยังไม่ครบ (กรอกงวดแรกแต่ยอดไม่ตรง เพื่อสาธิตไฮไลต์แดงและสถานะติดตาม)
  const eInstallments = 3;
  const eTotalPrice = 8000;
  const eStart = addDaysISO(today, -75);
  const ePer = seedPerInstallment(eTotalPrice, eInstallments, settings);
  addContract({
    contractNo: 'UP 205',
    purchaseDate: addDaysISO(today, -80),
    customerName: 'กัญญา รุ่งเรือง',
    phone: '086-777-8899',
    model: 'OPPO A78',
    imei: '356789104576543',
    serialNumber: 'SN-E9081-0055',
    totalPrice: eTotalPrice,
    installments: eInstallments,
    startDate: eStart,
    payments: [round2(ePer - 100), null, null, null, null, null],
  }, { sync: false });
}
