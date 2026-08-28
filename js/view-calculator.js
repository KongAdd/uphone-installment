/* ===========================================================
   view-calculator.js — หน้าคำนวณยอดผ่อนคร่าวๆ (ไม่บันทึกข้อมูล)
   ใช้สูตรเดียวกับหน้าเพิ่มสัญญาทุกประการ (ดู calc.js)
   =========================================================== */

const CalculatorView = (() => {
  function render(container) {
    const settings = getSettings();

    container.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">คำนวณยอดผ่อน</div>
          <div class="view-desc">กรอกราคาขายและจำนวนงวด เพื่อคำนวณเงินดาวน์และค่างวดคร่าวๆ ให้ลูกค้าดูก่อนทำสัญญาจริง</div>
        </div>
      </div>

      <div class="panel panel-pad">
        <div class="form-grid">
          <label class="field">
            <span>ราคาขาย (บาท)</span>
            <input type="number" id="calc_price" min="0" step="0.01" placeholder="เช่น 15000">
          </label>
          <label class="field">
            <span>จำนวนงวด (เดือน)</span>
            <select id="calc_installments">
              ${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}">${n} งวด</option>`).join('')}
            </select>
          </label>
        </div>

        <div class="calc-summary">
          <div class="calc-item">
            <div class="val" id="calc_downPayment">-</div>
            <div class="lbl">เงินดาวน์ (${(settings.downPaymentRate * 100).toFixed(0)}%)</div>
          </div>
          <div class="calc-item">
            <div class="val" id="calc_totalInstallment">-</div>
            <div class="lbl">ยอดผ่อนทั้งหมด</div>
          </div>
          <div class="calc-item">
            <div class="val" id="calc_perInstallment">-</div>
            <div class="lbl">ผ่อนต่องวด/เดือน</div>
          </div>
        </div>
      </div>
    `;

    const $ = (sel) => container.querySelector(sel);
    const priceInput = $('#calc_price');
    const installmentsSelect = $('#calc_installments');

    function recalc() {
      const s = getSettings();
      const totalPrice = Number(priceInput.value) || 0;
      const installments = Number(installmentsSelect.value) || 1;

      const downPayment = round2(totalPrice * s.downPaymentRate);
      const principal = totalPrice - downPayment;
      const totalInstallmentAmount = round2(principal * (1 + s.interestRatePerInstallment * installments));
      const perInstallment = round2(totalInstallmentAmount / installments);

      $('#calc_downPayment').textContent = formatMoney(downPayment);
      $('#calc_totalInstallment').textContent = formatMoney(totalInstallmentAmount);
      $('#calc_perInstallment').textContent = formatMoney(perInstallment);
    }

    priceInput.addEventListener('input', recalc);
    installmentsSelect.addEventListener('change', recalc);
    recalc();
  }

  return { render };
})();
