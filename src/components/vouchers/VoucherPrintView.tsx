import { Voucher } from "./VoucherManagement";
import { ACCOUNTING_COLORS } from "@/utils/accountingColors";

interface VoucherPrintViewProps {
  voucher: Voucher;
}

export const VoucherPrintView = ({ voucher }: VoucherPrintViewProps) => {
  const getVoucherTypeName = (type: Voucher["type"]) => {
    const names = {
      receipt: "Receipt Voucher",
      payment: "Payment Voucher",
      journal: "Journal Voucher",
      contra: "Contra Voucher",
    };
    return names[type];
  };

  return (
    <div className="p-8 bg-white text-black min-h-[297mm] font-sans" id="voucher-print-content">
      {/* Header */}
      <div className="border-b-2 border-black pb-4 mb-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Your Company Name</h1>
          <p className="text-sm">123 Business Street, City, Country</p>
          <p className="text-sm">Phone: +92-XXX-XXXXXXX | Email: info@company.com</p>
        </div>
      </div>

      {/* Voucher Title */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold border-2 border-black inline-block px-8 py-2">
          {getVoucherTypeName(voucher.type).toUpperCase()}
        </h2>
      </div>

      {/* Voucher Info */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="space-y-2">
          <p><span className="font-semibold">Voucher No:</span> {voucher.voucherNumber}</p>
          <p><span className="font-semibold">Account:</span> {voucher.cashBankAccount}</p>
          {voucher.chequeNumber && (
            <p><span className="font-semibold">Cheque No:</span> {voucher.chequeNumber}</p>
          )}
        </div>
        <div className="space-y-2 text-right">
          <p><span className="font-semibold">Date:</span> {new Date(voucher.date).toLocaleDateString('en-US')}</p>
          <p><span className="font-semibold">Status:</span> {voucher.status.charAt(0).toUpperCase() + voucher.status.slice(1)}</p>
          {voucher.chequeDate && (
            <p><span className="font-semibold">Cheque Date:</span> {new Date(voucher.chequeDate).toLocaleDateString('en-US')}</p>
          )}
        </div>
      </div>

      {/* Narration */}
      {voucher.narration && (
        <div className="mb-6 p-3 bg-gray-50 border border-gray-200">
          <p><span className="font-semibold">Narration:</span> {voucher.narration}</p>
        </div>
      )}

      {/* Entries Table */}
      <table className="w-full border-collapse border border-black mb-6">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-2 text-left">S.No</th>
            <th className="border border-black p-2 text-left">Account</th>
            <th className="border border-black p-2 text-left">Description</th>
            <th className="border border-black p-2 text-right" style={{ color: ACCOUNTING_COLORS.dr.css }}>Debit (Rs)</th>
            <th className="border border-black p-2 text-right" style={{ color: ACCOUNTING_COLORS.cr.css }}>Credit (Rs)</th>
          </tr>
        </thead>
        <tbody>
          {voucher.entries.map((entry, index) => (
            <tr key={entry.id}>
              <td className="border border-black p-2">{index + 1}</td>
              <td className="border border-black p-2">{entry.account}</td>
              <td className="border border-black p-2">{entry.description || "-"}</td>
              <td className="border border-black p-2 text-right" style={{ color: ACCOUNTING_COLORS.dr.css }}>
                {entry.debit > 0 ? entry.debit.toLocaleString("en-PK", { minimumFractionDigits: 2 }) : "-"}
              </td>
              <td className="border border-black p-2 text-right" style={{ color: ACCOUNTING_COLORS.cr.css }}>
                {entry.credit > 0 ? entry.credit.toLocaleString("en-PK", { minimumFractionDigits: 2 }) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-100 font-bold">
            <td colSpan={3} className="border border-black p-2 text-right">Total:</td>
            <td className="border border-black p-2 text-right" style={{ color: ACCOUNTING_COLORS.dr.css }}>
              {voucher.totalDebit.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
            </td>
            <td className="border border-black p-2 text-right" style={{ color: ACCOUNTING_COLORS.cr.css }}>
              {voucher.totalCredit.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Amount in Words */}
      <div className="mb-8 p-3 border border-black">
        <p className="font-semibold" style={{ color: ACCOUNTING_COLORS.amount.css }}>Amount in Words:</p>
        <p className="italic">{numberToWords(voucher.totalDebit)} Rupees Only</p>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-8 mt-16 pt-4">
        <div className="text-center">
          <div className="border-t border-black pt-2">
            <p className="font-semibold">Prepared By</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-black pt-2">
            <p className="font-semibold">Checked By</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-black pt-2">
            <p className="font-semibold">Approved By</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center text-xs text-gray-500">
        <p>This is a computer generated document. Printed on {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
};

// Helper function to convert number to words
function numberToWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  
  if (num === 0) return "Zero";
  
  const convertLessThanThousand = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + convertLessThanThousand(n % 100) : "");
  };

  const wholePart = Math.floor(num);
  
  if (wholePart >= 10000000) {
    const crore = Math.floor(wholePart / 10000000);
    const remainder = wholePart % 10000000;
    return convertLessThanThousand(crore) + " Crore" + (remainder > 0 ? " " + numberToWords(remainder) : "");
  }
  if (wholePart >= 100000) {
    const lakh = Math.floor(wholePart / 100000);
    const remainder = wholePart % 100000;
    return convertLessThanThousand(lakh) + " Lakh" + (remainder > 0 ? " " + numberToWords(remainder) : "");
  }
  if (wholePart >= 1000) {
    const thousand = Math.floor(wholePart / 1000);
    const remainder = wholePart % 1000;
    return convertLessThanThousand(thousand) + " Thousand" + (remainder > 0 ? " " + convertLessThanThousand(remainder) : "");
  }
  
  return convertLessThanThousand(wholePart);
}
