import React, { useState, useMemo } from 'react';
import { 
  X, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Calendar,
  CheckCircle2
} from 'lucide-react';
import { Transaction } from '../types/finance';
import { formatCurrency } from '../lib/calculations';

interface DownloadRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  currency?: string;
  onNotification?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const DownloadRecordsModal: React.FC<DownloadRecordsModalProps> = ({
  isOpen,
  onClose,
  transactions,
  currency = 'Rs',
  onNotification,
}) => {
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
  const [period, setPeriod] = useState<'all' | 'current-month' | 'custom-month'>('current-month');

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-11
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const currentYear = now.getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  // Filter transactions based on selection
  const filteredForExport = useMemo(() => {
    if (period === 'all') {
      return transactions;
    }

    if (period === 'current-month') {
      const curY = now.getFullYear();
      const curM = String(now.getMonth() + 1).padStart(2, '0');
      const prefix = `${curY}-${curM}`;
      return transactions.filter((t) => t.date.startsWith(prefix));
    }

    if (period === 'custom-month') {
      const mStr = String(selectedMonth + 1).padStart(2, '0');
      const prefix = `${selectedYear}-${mStr}`;
      return transactions.filter((t) => t.date.startsWith(prefix));
    }

    return transactions;
  }, [transactions, period, selectedMonth, selectedYear]);

  if (!isOpen) return null;

  // Handle Export CSV
  const handleExportCSV = () => {
    if (filteredForExport.length === 0) {
      onNotification?.('No transactions found for the selected period.', 'info');
      return;
    }

    const headers = ['Date', 'Time', 'Type', 'Category', 'Payment Method', 'Amount', 'Notes'];
    const rows = filteredForExport.map((t) => [
      t.date,
      t.time || '',
      t.type,
      `"${(t.category || '').replace(/"/g, '""')}"`,
      t.paymentMethod || 'Cash',
      t.amount,
      `"${(t.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateLabel =
      period === 'all'
        ? 'all_time'
        : period === 'current-month'
        ? `${now.getFullYear()}_${now.getMonth() + 1}`
        : `${selectedYear}_${selectedMonth + 1}`;
    link.setAttribute('download', `SpendDesk_Records_${dateLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onNotification?.(`Downloaded ${filteredForExport.length} transactions as CSV.`, 'success');
    onClose();
  };

  // Handle Export PDF (Printable Financial Statement)
  const handleExportPDF = () => {
    if (filteredForExport.length === 0) {
      onNotification?.('No transactions found for the selected period.', 'info');
      return;
    }

    const titleLabel =
      period === 'all'
        ? 'All Time Records'
        : period === 'current-month'
        ? `${months[now.getMonth()]} ${now.getFullYear()}`
        : `${months[selectedMonth]} ${selectedYear}`;

    let totalExpense = 0;
    let totalIncome = 0;

    filteredForExport.forEach((tx) => {
      if (tx.type === 'cash_added') {
        totalIncome += tx.amount;
      } else {
        totalExpense += tx.amount;
      }
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      onNotification?.('Popup blocked. Please allow popups to view statement.', 'error');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>SpendDesk Financial Statement - ${titleLabel}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 32px; color: #0f172a; margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0e6245; padding-bottom: 16px; margin-bottom: 24px; }
            .title { font-size: 24px; font-weight: 800; color: #0e6245; margin: 0; }
            .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
            .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; }
            .card-label { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; }
            .card-val { font-size: 18px; font-weight: 800; margin-top: 4px; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { text-align: left; padding: 10px 12px; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-weight: 700; color: #334155; }
            td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) { background-color: #fafafa; }
            .amount { font-weight: 700; text-align: right; }
            .inflow { color: #0e6245; }
            .outflow { color: #b91c1c; }
            .footer { margin-top: 32px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">SpendDesk</h1>
              <div class="subtitle">Financial Activity Statement · ${titleLabel}</div>
            </div>
            <div style="text-align: right; font-size: 12px; color: #64748b;">
              Generated: ${new Date().toLocaleDateString()}<br/>
              Total Transactions: ${filteredForExport.length}
            </div>
          </div>

          <div class="summary">
            <div class="card">
              <div class="card-label">Total Inflow (Cash In)</div>
              <div class="card-val inflow">${formatCurrency(totalIncome, currency)}</div>
            </div>
            <div class="card">
              <div class="card-label">Total Outflow (Expenses)</div>
              <div class="card-val outflow">${formatCurrency(totalExpense, currency)}</div>
            </div>
            <div class="card">
              <div class="card-label">Net Balance</div>
              <div class="card-val">${formatCurrency(totalIncome - totalExpense, currency)}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Payment Mode</th>
                <th>Merchant / Notes</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${filteredForExport
                .map((t) => `
                <tr>
                  <td>${t.date}</td>
                  <td>${t.type === 'cash_added' ? 'Cash Top-up' : t.type === 'card_expense' ? 'Card Spend' : 'Cash Expense'}</td>
                  <td><strong>${t.category}</strong></td>
                  <td>${t.paymentMethod || 'Cash'}</td>
                  <td>${t.notes || '-'}</td>
                  <td class="amount ${t.type === 'cash_added' ? 'inflow' : 'outflow'}">
                    ${t.type === 'cash_added' ? '+' : '-'}${formatCurrency(t.amount, currency)}
                  </td>
                </tr>
              `)
                .join('')}
            </tbody>
          </table>

          <div class="footer">
            Exported from SpendDesk Financial Manager
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    onNotification?.('Generated statement. Use print dialog to save as PDF.', 'success');
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                Export Records
              </h2>
              <p className="text-[11px] text-slate-400">
                Download transactions as CSV or PDF
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 text-xs">
          {/* Format Selector */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                  format === 'csv'
                    ? 'border-[#0e6245] bg-emerald-50/70 text-[#0e6245] font-bold shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0 text-[#0e6245]" />
                <div>
                  <span className="block text-xs font-bold leading-tight">CSV Sheet</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Excel &amp; Sheets</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                  format === 'pdf'
                    ? 'border-[#0e6245] bg-emerald-50/70 text-[#0e6245] font-bold shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0 text-[#0e6245]" />
                <div>
                  <span className="block text-xs font-bold leading-tight">PDF Statement</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Printable Report</span>
                </div>
              </button>
            </div>
          </div>

          {/* Timeframe Scope Selector */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              Select Timeframe
            </label>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setPeriod('current-month')}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                  period === 'current-month'
                    ? 'border-[#0e6245] bg-emerald-50/60 text-[#0e6245] font-bold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>Current Month ({months[now.getMonth()]} {now.getFullYear()})</span>
                {period === 'current-month' && <CheckCircle2 className="w-4 h-4 text-[#0e6245]" />}
              </button>

              <button
                type="button"
                onClick={() => setPeriod('custom-month')}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                  period === 'custom-month'
                    ? 'border-[#0e6245] bg-emerald-50/60 text-[#0e6245] font-bold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>Select Specific Month &amp; Year</span>
                {period === 'custom-month' && <CheckCircle2 className="w-4 h-4 text-[#0e6245]" />}
              </button>

              {period === 'custom-month' && (
                <div className="grid grid-cols-2 gap-2 pt-1 pl-1">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="p-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 cursor-pointer focus:outline-hidden"
                  >
                    {months.map((m, idx) => (
                      <option key={m} value={idx}>{m}</option>
                    ))}
                  </select>

                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="p-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 cursor-pointer focus:outline-hidden"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => setPeriod('all')}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                  period === 'all'
                    ? 'border-[#0e6245] bg-emerald-50/60 text-[#0e6245] font-bold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>All Recorded Transactions</span>
                {period === 'all' && <CheckCircle2 className="w-4 h-4 text-[#0e6245]" />}
              </button>
            </div>
          </div>

          {/* Transactions Count Preview */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Transactions to export:</span>
            <span className="font-bold text-slate-900">{filteredForExport.length} records</span>
          </div>

          {/* Action Button */}
          <button
            type="button"
            onClick={format === 'csv' ? handleExportCSV : handleExportPDF}
            className="w-full py-3 px-4 rounded-xl bg-[#0e6245] hover:bg-[#0b4e37] active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
          >
            <Download className="w-4 h-4" />
            <span>
              {format === 'csv' ? 'Download CSV Spreadsheet' : 'Generate PDF Statement'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
