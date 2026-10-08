import { Transaction } from '../types/finance';
import { formatCurrency } from './calculations';
import { UserProfile } from './storage';

export const generateBankStatementPdf = (
  transactions: Transaction[],
  userProfile: UserProfile,
  currency: string = 'Rs'
) => {
  const sortedTxs = [...transactions].sort((a, b) => {
    const dateA = a.date + (a.time || '00:00');
    const dateB = b.date + (b.time || '00:00');
    return dateA.localeCompare(dateB); // Oldest first for running balance statement
  });

  let runningBalance = 0;
  let totalCredits = 0;
  let totalDebits = 0;

  const statementRows = sortedTxs.map((tx) => {
    const isCredit = tx.type === 'cash_added';
    const amount = tx.amount || 0;

    if (isCredit) {
      runningBalance += amount;
      totalCredits += amount;
    } else {
      runningBalance -= amount;
      totalDebits += amount;
    }

    return {
      id: tx.id,
      date: tx.date,
      time: tx.time || '00:00',
      category: tx.category,
      notes: tx.notes || tx.category,
      method: tx.paymentMethod || 'Cash',
      credit: isCredit ? amount : 0,
      debit: !isCredit ? amount : 0,
      balance: runningBalance,
    };
  });

  const nowStr = new Date().toLocaleString();
  const startDate = sortedTxs.length > 0 ? sortedTxs[0].date : 'N/A';
  const endDate = sortedTxs.length > 0 ? sortedTxs[sortedTxs.length - 1].date : 'N/A';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Account Statement - ${userProfile.name}</title>
        <style>
          @media print {
            body { margin: 0; padding: 15px; -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 30px;
            font-size: 12px;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .brand {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: -0.5px;
            color: #059669;
          }
          .subtitle {
            font-size: 11px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 700;
          }
          .meta-box {
            text-align: right;
            font-size: 11px;
            color: #475569;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 25px;
          }
          .summary-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px 12px;
          }
          .summary-title {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .summary-val {
            font-size: 14px;
            font-weight: 800;
            color: #0f172a;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
          }
          .summary-val.credit { color: #059669; }
          .summary-val.debit { color: #e11d48; }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            table-layout: auto;
          }
          th {
            background: #0f172a;
            color: #ffffff;
            font-weight: 700;
            text-align: left;
            padding: 8px 10px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          td {
            padding: 8px 10px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 11px;
          }
          tr:nth-child(even) td {
            background: #f8fafc;
          }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .price-col {
            white-space: nowrap !important;
            word-break: keep-all !important;
            overflow-wrap: normal !important;
            font-variant-numeric: tabular-nums;
            letter-spacing: -0.2px;
          }
          th.price-col, td.price-col {
            white-space: nowrap !important;
            word-break: keep-all !important;
          }
          .nowrap-amt {
            display: inline-block;
            white-space: nowrap !important;
            word-break: keep-all !important;
          }
          .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 700;
            background: #e2e8f0;
            color: #334155;
          }
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
          }
          .btn-print {
            background: #059669;
            color: white;
            border: none;
            padding: 10px 20px;
            font-weight: bold;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div className="no-print">
          <button onclick="window.print()" class="btn-print">🖨️ Print / Save as PDF Statement</button>
        </div>

        <div class="header">
          <div>
            <div class="brand">SpendDesk</div>
            <div class="subtitle">Official Cash & Card Account Statement</div>
          </div>
          <div class="meta-box">
            <div><strong>Account Holder:</strong> ${userProfile.name}</div>
            <div><strong>Email:</strong> ${userProfile.email || 'Local User'}</div>
            <div><strong>Statement Period:</strong> ${startDate} to ${endDate}</div>
            <div><strong>Generated On:</strong> ${nowStr}</div>
          </div>
        </div>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-title">Total Records</div>
            <div class="summary-val">${sortedTxs.length}</div>
          </div>
          <div class="summary-card">
            <div class="summary-title">Total Cash In (Credit)</div>
            <div class="summary-val credit price-col"><span class="nowrap-amt">+${currency}&nbsp;${totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
          </div>
          <div class="summary-card">
            <div class="summary-title">Total Outflow (Debit)</div>
            <div class="summary-val debit price-col"><span class="nowrap-amt">-${currency}&nbsp;${totalDebits.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
          </div>
          <div class="summary-card">
            <div class="summary-title">Net Closing Balance</div>
            <div class="summary-val price-col"><span class="nowrap-amt">${currency}&nbsp;${runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 17%; white-space: nowrap;">Date & Time</th>
              <th>Description / Notes</th>
              <th style="width: 13%; white-space: nowrap;">Payment Method</th>
              <th class="text-right price-col" style="width: 16%;">Debit (-)</th>
              <th class="text-right price-col" style="width: 16%;">Credit (+)</th>
              <th class="text-right price-col" style="width: 17%;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${statementRows.map(row => `
              <tr>
                <td><strong>${row.date}</strong> ${row.time !== '00:00' ? `<span style="color:#64748b; font-size:10px;">${row.time}</span>` : ''}</td>
                <td>${row.notes}</td>
                <td><span class="badge">${row.method}</span></td>
                <td class="text-right price-col" style="color:${row.debit > 0 ? '#e11d48' : '#cbd5e1'}; font-weight:${row.debit > 0 ? 'bold' : 'normal'};">
                  ${row.debit > 0 ? `<span class="nowrap-amt">-${currency}&nbsp;${row.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>` : '—'}
                </td>
                <td class="text-right price-col" style="color:${row.credit > 0 ? '#059669' : '#cbd5e1'}; font-weight:${row.credit > 0 ? 'bold' : 'normal'};">
                  ${row.credit > 0 ? `<span class="nowrap-amt">+${currency}&nbsp;${row.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>` : '—'}
                </td>
                <td class="text-right price-col" style="font-weight:bold;">
                  <span class="nowrap-amt">${currency}&nbsp;${row.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          SpendDesk Financial Tracker &bull; This statement is computer generated and verified by SpendDesk Local Engine.
        </div>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
};
