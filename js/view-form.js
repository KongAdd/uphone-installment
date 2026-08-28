/* ===========================================================
   view-form.js — หน้าเพิ่ม/แก้ไขสัญญา
   =========================================================== */

const FormView = (() => {
  function render(container, opts) {
    opts = opts || {};
    const editId = opts.editId || null;
    const existing = editId ? getContractById(editId) : null;
    const isEdit = !!existing;
    const settings = getSettings();

    const payments = existing ? existing.payments.slice() : [null, null, null, null, null, null];
    const suggestedContractNo = isEdit ? existing.contractNo : generateNextContractNo();

    container.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">${isEdit ? 'แก้ไขสัญญา — ' + escapeHtml(existing.contractNo) : 'เพิ่มสัญญาใหม่'}</div>
          <div class="view-desc">กรอกข้อมูลสัญญาผ่อน ระบบจะคำนวณเงินดาวน์ ยอดผ่อน และค่างวดให้อัตโนมัติ</div>
        </div>
      </div>

      <div class="panel panel-pad">
        <form id="contractForm" novalidate>
          <div class="form-grid">
            <label class="field" data-field="contractNo">
              <span>เลขที่สัญญา * ${isEdit ? '' : '(รันอัตโนมัติ แก้ไขได้ถ้าต้องการ)'}</span>
              <input type="text" id="f_contractNo" placeholder="เช่น UP0206" value="${escapeAttr(suggestedContractNo)}" ${isEdit ? 'disabled title="เลขที่สัญญาแก้ไขไม่ได้หลังสร้าง เพราะใช้อ้างอิงแถวใน Google Sheets"' : ''}>
              <div class="error-msg"></div>
            </label>
            <label class="field" data-field="purchaseDate">
              <span>วันที่ซื้อ</span>
              <input type="date" id="f_purchaseDate" value="${existing?.purchaseDate || ''}">
              <div class="error-msg"></div>
            </label>
            <label class="field" data-field="customerName">
              <span>ชื่อลูกค้า *</span>
              <input type="text" id="f_customerName" value="${escapeAttr(existing?.customerName)}">
              <div class="error-msg"></div>
            </label>

            <label class="field" data-field="phone">
              <span>เบอร์โทร</span>
              <input type="text" id="f_phone" value="${escapeAttr(existing?.phone)}">
              <div class="error-msg"></div>
            </label>
            <label class="field" data-field="model">
              <span>รุ่นเครื่อง</span>
              <input type="text" id="f_model" value="${escapeAttr(existing?.model)}">
              <div class="error-msg"></div>
            </label>
            <label class="field" data-field="imei">
              <span>IMEI</span>
              <input type="text" id="f_imei" value="${escapeAttr(existing?.imei)}">
              <div class="error-msg"></div>
            </label>

            <label class="field" data-field="serialNumber">
              <span>เลขประจำเครื่อง (S/N)</span>
              <input type="text" id="f_serialNumber" value="${escapeAttr(existing?.serialNumber)}">
              <div class="error-msg"></div>
            </label>
            <label class="field" data-field="totalPrice">
              <span>ราคาสินค้ารวม (บาท) *</span>
              <input type="number" id="f_totalPrice" min="0" step="0.01" value="${existing?.totalPrice ?? ''}">
              <div class="error-msg"></div>
            </label>
            <label class="field" data-field="installments">
              <span id="f_installmentsLabel">จำนวนงวด (เดือน) *</span>
              <select id="f_installments">
                ${Array.from({ length: Math.max(maxInstallmentsForPrice(existing?.totalPrice || 0), existing?.installments || 0) }, (_, i) => i + 1)
                  .map((n) => `<option value="${n}" ${existing?.installments === n ? 'selected' : ''}>${n} งวด</option>`)
                  .join('')}
              </select>
              <div class="error-msg"></div>
            </label>

            <label class="field" data-field="startDate">
              <span>วันที่เริ่มชำระ *</span>
              <input type="date" id="f_startDate" value="${existing?.startDate || ''}">
              <div class="error-msg"></div>
            </label>
          </div>

          <div class="calc-summary">
            <div class="calc-item">
              <div class="val" id="calcDownPayment">-</div>
              <div class="lbl">เงินดาวน์ (${(settings.downPaymentRate * 100).toFixed(0)}%)</div>
            </div>
            <div class="calc-item">
              <div class="val" id="calcTotalInstallment">-</div>
              <div class="lbl">ยอดผ่อนทั้งหมด</div>
            </div>
            <div class="calc-item">
              <div class="val" id="calcPerInstallment">-</div>
              <div class="lbl">ผ่อนต่องวด</div>
            </div>
          </div>

          <div class="form-section-title">บันทึกค่างวดที่รับแล้ว (กรอกได้ภายหลังก็ได้)</div>
          <div class="installment-grid" id="installmentGrid"></div>

          <label class="field" style="margin-top:16px;">
            <span>หมายเหตุติดตาม (แสดงในหน้าติดตามค่างวด)</span>
            <textarea id="f_trackingNote" rows="2">${escapeHtml(existing?.trackingNote || '')}</textarea>
          </label>

          <div class="form-actions">
            <button type="button" class="btn btn-ghost" id="btnCancelForm">ยกเลิก</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'บันทึกการแก้ไข' : 'บันทึกสัญญาใหม่'}</button>
          </div>
        </form>
      </div>
    `;

    const $ = (sel) => container.querySelector(sel);
    const totalPriceInput = $('#f_totalPrice');
    const installmentsSelect = $('#f_installments');
    const startDateInput = $('#f_startDate');

    function currentSettings() {
      return getSettings();
    }

    const installmentsLabel = $('#f_installmentsLabel');

    // จำกัดจำนวนงวดสูงสุดตามราคาขาย (ต่ำกว่า 8,400 บาท ผ่อนได้สูงสุด 3 งวด, ตั้งแต่ 8,400 บาทขึ้นไปผ่อนได้สูงสุด 6 งวด)
    function updateInstallmentOptions() {
      const totalPrice = Number(totalPriceInput.value) || 0;
      const max = maxInstallmentsForPrice(totalPrice);
      const current = Number(installmentsSelect.value) || 1;

      installmentsSelect.innerHTML = Array.from({ length: max }, (_, i) => i + 1)
        .map((n) => `<option value="${n}">${n} งวด</option>`)
        .join('');
      installmentsSelect.value = Math.min(current, max);
      installmentsLabel.textContent = `จำนวนงวด (เดือน) * — ผ่อนได้สูงสุด ${max} งวด`;
    }

    function recalc() {
      const s = currentSettings();
      const totalPrice = Number(totalPriceInput.value) || 0;
      const installments = Number(installmentsSelect.value) || 1;
      const startDate = startDateInput.value;

      const downPayment = round2(totalPrice * s.downPaymentRate);
      const principal = totalPrice - downPayment;
      const totalInstallmentAmount = round2(principal * (1 + s.interestRatePerInstallment * installments));
      const perInstallment = round2(totalInstallmentAmount / installments);

      $('#calcDownPayment').textContent = formatMoney(downPayment);
      $('#calcTotalInstallment').textContent = formatMoney(totalInstallmentAmount);
      $('#calcPerInstallment').textContent = formatMoney(perInstallment);

      renderInstallmentGrid(installments, startDate, perInstallment);
    }

    function renderInstallmentGrid(installments, startDate, perInstallment) {
      const grid = $('#installmentGrid');
      let html = '';
      for (let i = 0; i < 6; i++) {
        const active = i < installments;
        const due = active && startDate ? formatThaiDate(edate(startDate, i)) : '-';
        const val = payments[i];
        html += `
          <div class="installment-item ${active ? '' : 'disabled'}">
            <span>งวดที่ ${i + 1}${active ? ' (' + formatMoney(perInstallment) + ')' : ''}</span>
            <input type="number" step="0.01" class="pay-slot" data-idx="${i}" ${active ? '' : 'disabled'}
              value="${val === null || val === undefined ? '' : val}">
            <span class="due">ครบกำหนด: ${due}</span>
          </div>
        `;
      }
      grid.innerHTML = html;
      grid.querySelectorAll('.pay-slot').forEach((el) => {
        el.addEventListener('input', () => {
          const idx = Number(el.dataset.idx);
          payments[idx] = el.value === '' ? null : Number(el.value);
        });
      });
    }

    totalPriceInput.addEventListener('input', () => {
      updateInstallmentOptions();
      recalc();
    });
    installmentsSelect.addEventListener('change', recalc);
    startDateInput.addEventListener('change', recalc);
    installmentsLabel.textContent = `จำนวนงวด (เดือน) * — ผ่อนได้สูงสุด ${maxInstallmentsForPrice(existing?.totalPrice || 0)} งวด`;
    recalc();

    $('#btnCancelForm').addEventListener('click', () => App.navigate('list'));

    $('#contractForm').addEventListener('submit', (e) => {
      e.preventDefault();
      handleSubmit();
    });

    function clearErrors() {
      container.querySelectorAll('.field').forEach((f) => {
        f.classList.remove('has-error');
        const em = f.querySelector('.error-msg');
        if (em) em.textContent = '';
      });
    }

    function setError(field, msg) {
      const el = container.querySelector(`[data-field="${field}"]`);
      if (!el) return;
      el.classList.add('has-error');
      el.querySelector('.error-msg').textContent = msg;
    }

    function handleSubmit() {
      clearErrors();
      let hasError = false;

      const contractNo = $('#f_contractNo').value.trim();
      const customerName = $('#f_customerName').value.trim();
      const totalPrice = Number(totalPriceInput.value);
      const installments = Number(installmentsSelect.value);
      const startDate = startDateInput.value;

      if (!contractNo) { setError('contractNo', 'กรุณากรอกเลขที่สัญญา'); hasError = true; }
      else {
        const dup = findByContractNo(contractNo, editId);
        if (dup) { setError('contractNo', 'เลขที่สัญญานี้มีอยู่แล้วในระบบ'); hasError = true; }
      }

      if (!customerName) { setError('customerName', 'กรุณากรอกชื่อลูกค้า'); hasError = true; }

      if (!totalPrice || totalPrice <= 0) { setError('totalPrice', 'กรุณากรอกราคาสินค้าที่มากกว่า 0'); hasError = true; }

      if (!installments || installments < 1 || installments > 6) {
        setError('installments', 'จำนวนงวดต้องอยู่ระหว่าง 1-6'); hasError = true;
      }

      if (!startDate) { setError('startDate', 'กรุณาเลือกวันที่เริ่มชำระ'); hasError = true; }

      if (hasError) {
        App.toast('กรุณาตรวจสอบข้อมูลในฟอร์มอีกครั้ง', true);
        return;
      }

      const payload = {
        contractNo,
        purchaseDate: $('#f_purchaseDate').value,
        customerName,
        phone: $('#f_phone').value.trim(),
        model: $('#f_model').value.trim(),
        imei: $('#f_imei').value.trim(),
        serialNumber: $('#f_serialNumber').value.trim(),
        totalPrice,
        installments,
        startDate,
        payments: payments.map((p, i) => (i < installments ? p : null)),
        trackingNote: $('#f_trackingNote').value,
      };

      if (isEdit) {
        updateContract(editId, payload);
        App.toast('บันทึกการแก้ไขสัญญาแล้ว');
      } else {
        addContract(payload);
        App.toast('เพิ่มสัญญาใหม่เรียบร้อยแล้ว');
      }
      App.navigate('list');
    }
  }

  function escapeAttr(v) {
    return String(v ?? '').replace(/"/g, '&quot;');
  }
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }

  return { render };
})();
