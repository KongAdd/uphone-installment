/* ===========================================================
   view-list.js — หน้ารายการสัญญาทั้งหมด (แทนชีต "สัญญาผ่อน")
   =========================================================== */

const ListView = (() => {
  let state = { search: '', status: 'all' };

  function statusBadgeClass(status) {
    if (status === 'ค้างชำระ') return 'badge-overdue';
    if (status === 'ผ่อนครบแล้ว') return 'badge-done';
    return 'badge-ongoing';
  }

  function slotClass(color) {
    switch (color) {
      case 'exceed': return 'slot-exceed';
      case 'mismatch': return 'slot-mismatch';
      case 'paid': return 'slot-paid';
      case 'overdue': return 'slot-overdue';
      default: return 'slot-none';
    }
  }

  function matchesFilter(contract, derived) {
    const q = state.search.trim().toLowerCase();
    if (q) {
      const hay = `${contract.contractNo} ${contract.customerName} ${contract.phone}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (state.status !== 'all' && derived.status !== state.status) return false;
    return true;
  }

  function render(container) {
    const settings = getSettings();
    const contracts = getContracts()
      .slice()
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    container.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">รายการสัญญาผ่อนทั้งหมด</div>
          <div class="view-desc">คลิกที่เลขที่สัญญาเพื่อดูรายละเอียด หรือคลิกที่ช่องงวดเพื่อกรอก/แก้ไขจำนวนเงินที่รับได้ทันที</div>
        </div>
        <button class="btn btn-accent" data-goto="form">+ เพิ่มสัญญาใหม่</button>
      </div>

      <div class="filter-bar">
        <input type="text" id="listSearch" placeholder="ค้นหาเลขที่สัญญา / ชื่อลูกค้า / เบอร์โทร" value="${escapeHtml(state.search)}">
        <select id="listStatusFilter">
          <option value="all">ทุกสถานะ</option>
          <option value="กำลังผ่อน">กำลังผ่อน</option>
          <option value="ค้างชำระ">ค้างชำระ</option>
          <option value="ผ่อนครบแล้ว">ผ่อนครบแล้ว</option>
        </select>
      </div>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>เลขที่สัญญา</th>
              <th>ชื่อลูกค้า</th>
              <th>เบอร์โทร</th>
              <th>รุ่นเครื่อง</th>
              <th>ราคาสินค้า</th>
              <th>เงินดาวน์</th>
              <th>ยอดผ่อนทั้งหมด</th>
              <th>ผ่อน/งวด</th>
              <th>เริ่มชำระ</th>
              <th>งวด 1</th><th>งวด 2</th><th>งวด 3</th><th>งวด 4</th><th>งวด 5</th><th>งวด 6</th>
              <th>ชำระแล้ว</th>
              <th>คงเหลือ</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="listTbody"></tbody>
        </table>
      </div>
    `;

    container.querySelector('#listSearch').value = state.search;
    container.querySelector('#listStatusFilter').value = state.status;

    container.querySelector('#listSearch').addEventListener('input', (e) => {
      state.search = e.target.value;
      renderRows();
    });
    container.querySelector('#listStatusFilter').addEventListener('change', (e) => {
      state.status = e.target.value;
      renderRows();
    });
    container.querySelector('[data-goto="form"]').addEventListener('click', () => App.navigate('form'));

    function renderRows() {
      const tbody = container.querySelector('#listTbody');
      const rows = contracts
        .map((c) => ({ c, d: computeDerived(c, settings) }))
        .filter(({ c, d }) => matchesFilter(c, d));

      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="19"><div class="empty-state">ไม่พบสัญญาที่ตรงกับเงื่อนไข</div></td></tr>`;
        return;
      }

      tbody.innerHTML = rows
        .map(({ c, d }) => {
          const slots = c.payments
            .map((amt, i) => {
              const st = d.slotStates[i];
              const cls = slotClass(st.color);
              const label = amt === null || amt === undefined || amt === '' ? '—' : formatNumber(amt);
              return `<td><div class="slot-cell ${cls}" data-slot="${i}" data-id="${c.id}" title="${st.dueDate ? 'ครบกำหนด ' + formatThaiDate(st.dueDate) : ''}">${label}</div></td>`;
            })
            .join('');

          return `
            <tr>
              <td class="cell-strong"><a href="#" class="contract-link" data-details="${c.id}">${escapeHtml(c.contractNo)}</a></td>
              <td>${escapeHtml(c.customerName)}</td>
              <td class="cell-mute">${escapeHtml(c.phone || '-')}</td>
              <td>${escapeHtml(c.model || '-')}</td>
              <td>${formatMoney(c.totalPrice)}</td>
              <td class="cell-mute">${formatMoney(d.downPayment)}</td>
              <td>${formatMoney(d.totalInstallmentAmount)}</td>
              <td class="cell-strong">${formatMoney(d.perInstallment)}</td>
              <td class="cell-mute">${formatThaiDate(c.startDate)}</td>
              ${slots}
              <td>${formatMoney(d.paidAmount)}</td>
              <td class="cell-strong">${formatMoney(d.remainingAmount)}</td>
              <td><span class="badge ${statusBadgeClass(d.status)}">${d.status}</span></td>
              <td>
                <button class="btn btn-ghost btn-sm" data-edit="${c.id}">แก้ไข</button>
                <button class="btn btn-danger btn-sm" data-del="${c.id}">ลบ</button>
              </td>
            </tr>
          `;
        })
        .join('');

      tbody.querySelectorAll('.slot-cell').forEach((el) => {
        if (el.classList.contains('slot-exceed')) return;
        el.addEventListener('click', () => startSlotEdit(el));
      });
      tbody.querySelectorAll('[data-edit]').forEach((el) => {
        el.addEventListener('click', () => App.navigate('form', { editId: el.dataset.edit }));
      });
      tbody.querySelectorAll('[data-details]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const contract = getContractById(el.dataset.details);
          if (contract) showDetailsModal(contract, computeDerived(contract, settings));
        });
      });
      tbody.querySelectorAll('[data-del]').forEach((el) => {
        el.addEventListener('click', () => handleDelete(el.dataset.del));
      });
    }

    function startSlotEdit(cell) {
      const id = cell.dataset.id;
      const idx = Number(cell.dataset.slot);
      const contract = getContractById(id);
      if (!contract) return;
      const current = contract.payments[idx];
      const wrap = document.createElement('input');
      wrap.type = 'number';
      wrap.step = '0.01';
      wrap.className = 'slot-input';
      wrap.value = current === null || current === undefined ? '' : current;
      cell.replaceWith(wrap);
      wrap.focus();
      wrap.select();

      const commit = () => {
        const val = wrap.value === '' ? null : Number(wrap.value);
        const payments = contract.payments.slice();
        payments[idx] = val;
        updateContract(id, { payments });
        App.refreshCurrentView();
        App.toast('บันทึกยอดงวดที่ ' + (idx + 1) + ' แล้ว');
      };
      wrap.addEventListener('blur', commit);
      wrap.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') wrap.blur();
        if (e.key === 'Escape') { wrap.value = current === null || current === undefined ? '' : current; wrap.blur(); }
      });
    }

    function handleDelete(id) {
      const contract = getContractById(id);
      if (!contract) return;
      if (!confirm(`ยืนยันลบสัญญา "${contract.contractNo}" ของ ${contract.customerName}? การลบไม่สามารถย้อนกลับได้`)) return;
      deleteContract(id);
      App.refreshCurrentView();
      App.toast('ลบสัญญาแล้ว');
    }

    renderRows();
  }

  function detailItem(label, value, opts) {
    opts = opts || {};
    if (value === '' || value === null || value === undefined) value = '-';
    return `<div class="detail-item"><span class="detail-label">${label}</span><span class="detail-value">${opts.raw ? value : escapeHtml(value)}</span></div>`;
  }

  function showDetailsModal(c, d) {
    const existingModal = document.querySelector('.details-modal-overlay');
    if (existingModal) existingModal.remove();

    const refItems = [1, 2]
      .map((n) => {
        const name = c[`ref${n}Name`];
        const phone = c[`ref${n}Phone`];
        const relation = c[`ref${n}Relation`];
        if (!name && !phone && !relation) return '';
        return `
          <div class="detail-grid">
            ${detailItem(`ชื่อผู้อ้างอิง ${n}`, name)}
            ${detailItem(`เบอร์โทร`, phone)}
            ${detailItem(`ความสัมพันธ์`, relation)}
          </div>
        `;
      })
      .join('');

    const installmentRows = c.payments
      .map((amt, i) => {
        if (i >= c.installments) return '';
        const st = d.slotStates[i];
        const cls = slotClass(st.color);
        const amtLabel = amt === null || amt === undefined || amt === '' ? '— ยังไม่จ่าย' : formatMoney(amt);
        return `
          <div class="installment-detail-row">
            <span>งวดที่ ${i + 1}</span>
            <span>${st.dueDate ? formatThaiDate(st.dueDate) : '-'}</span>
            <span class="slot-cell ${cls}" style="cursor:default;">${amtLabel}</span>
          </div>
        `;
      })
      .join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay details-modal-overlay open';
    overlay.innerHTML = `
      <div class="modal modal-large">
        <div class="modal-header">
          <h3>รายละเอียดสัญญา — ${escapeHtml(c.contractNo)}</h3>
          <button class="modal-close" data-close-details>✕</button>
        </div>
        <div class="modal-body modal-body-scroll">

          <div class="detail-section-title">ข้อมูลลูกค้าและเครื่อง</div>
          <div class="detail-grid">
            ${detailItem('ชื่อลูกค้า', c.customerName)}
            ${detailItem('เบอร์โทร', c.phone)}
            ${detailItem('วันที่ซื้อ', c.purchaseDate ? formatThaiDate(c.purchaseDate) : '-')}
            ${detailItem('รุ่นเครื่อง', c.model)}
            ${detailItem('IMEI', c.imei)}
            ${detailItem('เลขประจำเครื่อง (S/N)', c.serialNumber)}
          </div>

          <div class="detail-section-title">ที่อยู่ปัจจุบัน</div>
          <div class="detail-grid">
            ${detailItem('ที่อยู่ปัจจุบัน', c.currentAddress)}
            ${c.currentAddressMapUrl
              ? detailItem('ลิงก์แผนที่ที่อยู่ปัจจุบัน', `<a href="${escapeHtml(c.currentAddressMapUrl)}" target="_blank" rel="noopener">เปิดแผนที่</a>`, { raw: true })
              : detailItem('ลิงก์แผนที่ที่อยู่ปัจจุบัน', '-')}
          </div>

          <div class="detail-section-title">ข้อมูลการเงิน</div>
          <div class="detail-grid">
            ${detailItem('ราคาสินค้ารวม', formatMoney(c.totalPrice))}
            ${detailItem('เงินดาวน์', formatMoney(d.downPayment))}
            ${detailItem('ยอดผ่อนทั้งหมด', formatMoney(d.totalInstallmentAmount))}
            ${detailItem('ผ่อนต่องวด', formatMoney(d.perInstallment))}
            ${detailItem('วันที่เริ่มชำระ', formatThaiDate(c.startDate))}
            ${detailItem('สถานะ', d.status)}
            ${detailItem('ยอดที่ชำระแล้ว', formatMoney(d.paidAmount))}
            ${detailItem('ยอดคงเหลือ', formatMoney(d.remainingAmount))}
          </div>

          <div class="detail-section-title">งวดการชำระ (${c.installments} งวด)</div>
          <div class="installment-detail-list">${installmentRows}</div>

          <div class="detail-section-title">ข้อมูลอาชีพและที่ทำงาน</div>
          <div class="detail-grid">
            ${detailItem('อาชีพ', c.occupation)}
            ${detailItem('เงินเดือน', c.salary === '' || c.salary === undefined || c.salary === null ? '-' : formatMoney(c.salary))}
            ${detailItem('เบอร์นายจ้าง', c.employerPhone)}
            ${detailItem('ที่ทำงาน', c.workplace)}
            ${c.workplaceMapUrl
              ? detailItem('ลิงก์แผนที่ที่ทำงาน', `<a href="${escapeHtml(c.workplaceMapUrl)}" target="_blank" rel="noopener">เปิดแผนที่</a>`, { raw: true })
              : detailItem('ลิงก์แผนที่ที่ทำงาน', '-')}
          </div>

          <div class="detail-section-title">บุคคลอ้างอิง</div>
          ${refItems || '<p class="modal-hint">ไม่มีข้อมูลผู้อ้างอิง</p>'}

          <div class="detail-section-title">รูปบัตรประชาชนลูกค้า</div>
          ${c.idCardPhotoUrl
            ? `<div class="photo-preview"><img src="${escapeHtml(c.idCardPhotoUrl)}" alt="รูปบัตรประชาชน"><a href="${escapeHtml(c.idCardPhotoUrl)}" target="_blank" rel="noopener" class="photo-status">เปิดรูปเต็ม</a></div>`
            : '<p class="modal-hint">ไม่มีรูปบัตรประชาชน</p>'}

          <div class="detail-section-title">หมายเหตุติดตาม</div>
          <p class="modal-hint">${c.trackingNote ? escapeHtml(c.trackingNote) : 'ไม่มีหมายเหตุ'}</p>

        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" data-close-details>ปิด</button>
          <button class="btn btn-primary" data-edit-from-details="${c.id}">แก้ไขสัญญา</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close-details]').forEach((el) => el.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-edit-from-details]').addEventListener('click', () => {
      close();
      App.navigate('form', { editId: c.id });
    });
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }

  return { render };
})();
