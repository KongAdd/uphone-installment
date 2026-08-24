/* ===========================================================
   view-dashboard.js — หน้าแดชบอร์ดติดตามค่างวด (แทนชีต "ติดตามค่างวด")
   =========================================================== */

const DashboardView = (() => {
  function rowClass(trackingStatus) {
    switch (trackingStatus) {
      case 'ค้างชำระ': return 'track-overdue';
      case 'ครบกำหนดวันนี้': return 'track-today';
      case 'ใกล้ถึงกำหนด': return 'track-soon';
      case 'ชำระยังไม่ครบ': return 'track-incomplete';
      case 'ผ่อนครบแล้ว': return 'track-done';
      default: return '';
    }
  }

  function render(container) {
    const settings = getSettings();
    const contracts = getContracts();
    const items = contracts.map((c) => ({ c, d: computeDerived(c, settings) }));

    const counts = {
      overdue: items.filter((x) => x.d.trackingStatus === 'ค้างชำระ').length,
      today: items.filter((x) => x.d.trackingStatus === 'ครบกำหนดวันนี้').length,
      soon: items.filter((x) => x.d.trackingStatus === 'ใกล้ถึงกำหนด').length,
      incomplete: items.filter((x) => x.d.trackingStatus === 'ชำระยังไม่ครบ').length,
    };

    items.sort((a, b) => {
      if (a.d.trackingPriority !== b.d.trackingPriority) return a.d.trackingPriority - b.d.trackingPriority;
      const da = a.d.daysUntilDue === null ? Infinity : a.d.daysUntilDue;
      const db = b.d.daysUntilDue === null ? Infinity : b.d.daysUntilDue;
      return da - db;
    });

    container.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">แดชบอร์ดติดตามค่างวด</div>
          <div class="view-desc">เรียงลำดับสัญญาที่ต้องติดตามก่อนไว้บนสุด</div>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card overdue">
          <div class="num">${counts.overdue}</div>
          <div class="label">ค้างชำระ</div>
        </div>
        <div class="summary-card today">
          <div class="num">${counts.today}</div>
          <div class="label">ครบกำหนดวันนี้</div>
        </div>
        <div class="summary-card soon">
          <div class="num">${counts.soon}</div>
          <div class="label">ใกล้ถึงกำหนด</div>
        </div>
        <div class="summary-card incomplete">
          <div class="num">${counts.incomplete}</div>
          <div class="label">ชำระยังไม่ครบ</div>
        </div>
      </div>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>เลขที่สัญญา</th>
              <th>ชื่อลูกค้า</th>
              <th>เบอร์โทร</th>
              <th>รุ่นเครื่อง</th>
              <th>ค่างวด</th>
              <th>จ่ายแล้ว</th>
              <th>งวดปัจจุบัน</th>
              <th>วันครบกำหนด</th>
              <th>เหลืออีกกี่วัน</th>
              <th>ยอดคงเหลือ</th>
              <th>สถานะติดตาม</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody id="dashTbody"></tbody>
        </table>
      </div>
    `;

    const tbody = container.querySelector('#dashTbody');

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state">ยังไม่มีสัญญาในระบบ</div></td></tr>`;
      return;
    }

    tbody.innerHTML = items
      .map(({ c, d }) => {
        const daysLabel = d.daysUntilDue === null ? '' : (d.daysUntilDue < 0 ? `เกิน ${Math.abs(d.daysUntilDue)} วัน` : `${d.daysUntilDue} วัน`);
        return `
          <tr class="${rowClass(d.trackingStatus)}" data-id="${c.id}">
            <td class="cell-strong">${escapeHtml(c.contractNo)}</td>
            <td>${escapeHtml(c.customerName)}</td>
            <td>${escapeHtml(c.phone || '-')}</td>
            <td>${escapeHtml(c.model || '-')}</td>
            <td>${formatMoney(d.perInstallment)}</td>
            <td>${d.paidStrictCount} / ${c.installments}</td>
            <td>${d.currentInstallmentLabel}</td>
            <td>${d.nextDueDate ? formatThaiDate(d.nextDueDate) : '-'}</td>
            <td>${daysLabel || '-'}</td>
            <td class="cell-strong">${formatMoney(d.remainingAmount)}</td>
            <td>${d.trackingStatus}</td>
            <td><input type="text" class="note-input" data-note="${c.id}" value="${escapeAttr(c.trackingNote)}" placeholder="พิมพ์หมายเหตุ..."></td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('[data-note]').forEach((el) => {
      el.addEventListener('blur', () => {
        updateContract(el.dataset.note, { trackingNote: el.value });
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') el.blur();
      });
    });
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }
  function escapeAttr(v) {
    return String(v ?? '').replace(/"/g, '&quot;');
  }

  return { render };
})();
