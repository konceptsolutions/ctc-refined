import { forwardRef } from "react";
import { openPrintHtml } from "@/utils/printUtils";

interface PrintableDocumentProps {
  type: "quotation" | "inquiry";
  data: {
    documentNo: string;
    date: string;
    validUntil?: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerAddress?: string;
    subject?: string;
    description?: string;
    status: string;
    items?: Array<{
      partNo: string;
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    totalAmount?: number;
    notes?: string;
  };
  companyInfo?: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
}

const defaultCompanyInfo = {
  name: "Auto Parts Trading Co.",
  address: "123 Industrial Zone, Business District, City 12345",
  phone: "+1 (555) 123-4567",
  email: "sales@autoparts.com",
};

export const PrintableDocument = forwardRef<HTMLDivElement, PrintableDocumentProps>(
  ({ type, data, companyInfo = defaultCompanyInfo }, ref) => {
    const isQuotation = type === "quotation";
    const title = isQuotation ? "SALES QUOTATION" : "SALES INQUIRY";

    return (
      <div
        ref={ref}
        className="bg-white text-black p-8 min-h-[297mm] w-[210mm] mx-auto"
        style={{ fontFamily: "Arial, sans-serif" }}
      >
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{companyInfo.name}</h1>
              <p className="text-sm text-gray-600 mt-1">{companyInfo.address}</p>
              <p className="text-sm text-gray-600">
                Phone: {companyInfo.phone} | Email: {companyInfo.email}
              </p>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-primary">{title}</h2>
              <p className="text-sm mt-2">
                <span className="font-semibold">Document #:</span> {data.documentNo}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Date:</span> {data.date}
              </p>
              {isQuotation && data.validUntil && (
                <p className="text-sm">
                  <span className="font-semibold">Valid Until:</span> {data.validUntil}
                </p>
              )}
              <p className="text-sm mt-1">
                <span className="font-semibold">Status:</span>{" "}
                <span className="uppercase">{data.status}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div className="mb-6 p-4 bg-gray-50 rounded border">
          <h3 className="font-semibold text-gray-800 mb-2 text-sm uppercase">Customer Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p>
                <span className="font-medium">Name:</span> {data.customerName}
              </p>
              <p>
                <span className="font-medium">Email:</span> {data.customerEmail}
              </p>
            </div>
            <div>
              <p>
                <span className="font-medium">Phone:</span> {data.customerPhone}
              </p>
              {data.customerAddress && (
                <p>
                  <span className="font-medium">Address:</span> {data.customerAddress}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Inquiry Subject & Description */}
        {!isQuotation && data.subject && (
          <div className="mb-6 p-4 bg-gray-50 rounded border">
            <h3 className="font-semibold text-gray-800 mb-2 text-sm uppercase">Inquiry Details</h3>
            <p className="text-sm">
              <span className="font-medium">Subject:</span> {data.subject}
            </p>
            {data.description && (
              <p className="text-sm mt-2">
                <span className="font-medium">Description:</span> {data.description}
              </p>
            )}
          </div>
        )}

        {/* Items Table (for Quotation) */}
        {isQuotation && data.items && data.items.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-3 text-sm uppercase">Items</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-left">#</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Part No</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Description</th>
                  <th className="border border-gray-300 px-3 py-2 text-center">Qty</th>
                  <th className="border border-gray-300 px-3 py-2 text-right">Unit Price</th>
                  <th className="border border-gray-300 px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 px-3 py-2">{index + 1}</td>
                    <td className="border border-gray-300 px-3 py-2 font-medium">{item.partNo}</td>
                    <td className="border border-gray-300 px-3 py-2">{item.description}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center">{item.quantity}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">
                      Rs {item.unitPrice.toFixed(2)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-medium">
                      Rs {item.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={5} className="border border-gray-300 px-3 py-2 text-right">
                    Grand Total:
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right">
                    Rs {data.totalAmount?.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Notes */}
        {data.notes && (
          <div className="mb-6 p-4 bg-gray-50 rounded border">
            <h3 className="font-semibold text-gray-800 mb-2 text-sm uppercase">Notes</h3>
            <p className="text-sm whitespace-pre-wrap">{data.notes}</p>
          </div>
        )}

        {/* Terms & Conditions (for Quotation) */}
        {isQuotation && (
          <div className="mb-6 p-4 border rounded">
            <h3 className="font-semibold text-gray-800 mb-2 text-sm uppercase">Terms & Conditions</h3>
            <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
              <li>Prices are valid until the date mentioned above.</li>
              <li>Payment terms: Net 30 days from invoice date.</li>
              <li>Delivery: Subject to stock availability.</li>
              <li>Warranty as per manufacturer terms.</li>
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-8 border-t text-center text-xs text-gray-500">
          <p>Thank you for your business!</p>
          <p className="mt-1">
            {companyInfo.name} | {companyInfo.phone} | {companyInfo.email}
          </p>
        </div>

        {/* Signature Area */}
        <div className="mt-8 grid grid-cols-2 gap-16">
          <div className="border-t border-gray-400 pt-2">
            <p className="text-sm text-gray-600">Authorized Signature</p>
          </div>
          <div className="border-t border-gray-400 pt-2">
            <p className="text-sm text-gray-600">Customer Signature</p>
          </div>
        </div>
      </div>
    );
  }
);

PrintableDocument.displayName = "PrintableDocument";

export const printDocument = (printRef: React.RefObject<HTMLDivElement>) => {
  if (!printRef.current) return;

  const printContent = printRef.current.innerHTML;
  const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Document</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page {
              size: A4;
              margin: 10mm;
            }
            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
            .bg-white { background-color: white; }
            .text-black { color: black; }
            .p-8 { padding: 2rem; }
            .min-h-\\[297mm\\] { min-height: 297mm; }
            .w-\\[210mm\\] { width: 210mm; }
            .mx-auto { margin-left: auto; margin-right: auto; }
            .border-b-2 { border-bottom-width: 2px; }
            .border-black { border-color: black; }
            .pb-4 { padding-bottom: 1rem; }
            .mb-6 { margin-bottom: 1.5rem; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .items-start { align-items: flex-start; }
            .text-2xl { font-size: 1.5rem; }
            .text-xl { font-size: 1.25rem; }
            .text-sm { font-size: 0.875rem; }
            .text-xs { font-size: 0.75rem; }
            .font-bold { font-weight: bold; }
            .font-semibold { font-weight: 600; }
            .font-medium { font-weight: 500; }
            .text-gray-800 { color: #1f2937; }
            .text-gray-600 { color: #4b5563; }
            .text-gray-500 { color: #6b7280; }
            .text-primary { color: #2563eb; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .text-left { text-align: left; }
            .mt-1 { margin-top: 0.25rem; }
            .mt-2 { margin-top: 0.5rem; }
            .mt-8 { margin-top: 2rem; }
            .mb-2 { margin-bottom: 0.5rem; }
            .mb-3 { margin-bottom: 0.75rem; }
            .p-4 { padding: 1rem; }
            .bg-gray-50 { background-color: #f9fafb; }
            .bg-gray-100 { background-color: #f3f4f6; }
            .rounded { border-radius: 0.25rem; }
            .border { border: 1px solid #e5e7eb; }
            .border-gray-300 { border-color: #d1d5db; }
            .border-gray-400 { border-color: #9ca3af; }
            .border-t { border-top: 1px solid #e5e7eb; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .gap-4 { gap: 1rem; }
            .gap-16 { gap: 4rem; }
            .pt-2 { padding-top: 0.5rem; }
            .pt-8 { padding-top: 2rem; }
            .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
            .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
            .w-full { width: 100%; }
            .border-collapse { border-collapse: collapse; }
            .uppercase { text-transform: uppercase; }
            .whitespace-pre-wrap { white-space: pre-wrap; }
            .space-y-1 > * + * { margin-top: 0.25rem; }
            .list-disc { list-style-type: disc; }
            .list-inside { list-style-position: inside; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `;

  openPrintHtml(html);
};
