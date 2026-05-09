import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import { useRef } from "react";

interface DirectPurchaseOrderItem {
  id: string;
  partNo: string;
  description: string;
  brand: string;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  amount: number;
  rackCode?: string;
  shelfNo?: string;
}

interface DirectPurchaseOrder {
  id: string;
  dpo_no: string;
  date: string;
  store_name: string;
  description?: string;
  status: string;
  total_amount: number;
  items?: DirectPurchaseOrderItem[];
}

interface StoreReceiptProps {
  order: DirectPurchaseOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const StoreReceipt = ({ order, open, onOpenChange }: StoreReceiptProps) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!receiptRef.current) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const printContent = receiptRef.current.innerHTML;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${order.dpo_no}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 20px;
              margin-bottom: 20px;
            }
            .order-info {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f2f2f2;
            }
            .total {
              text-align: right;
              font-size: 18px;
              font-weight: bold;
              margin-top: 20px;
            }
            .footer {
              text-align: center;
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              font-size: 12px;
              color: #666;
            }
            @media print {
              body {
                padding: 0;
              }
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Receipt - {order.dpo_no}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div ref={receiptRef} className="bg-white p-6 rounded-lg">
            {/* Header */}
            <div className="header">
              <h1 className="text-2xl font-bold">Local Purchase Order Receipt</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Order Number: {order.dpo_no}
              </p>
            </div>

            {/* Order Info */}
            <div className="order-info">
              <div>
                <p className="text-sm text-muted-foreground">Order Date</p>
                <p className="font-medium">
                  {format(new Date(order.date), "MMMM dd, yyyy")}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Store</p>
                <p className="font-medium">{order.store_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-medium">{order.status}</p>
              </div>
            </div>

            {order.description && (
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="font-medium">{order.description}</p>
              </div>
            )}

            {/* Items Table */}
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Part No</TableHead>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    <TableHead className="w-[120px]">Brand</TableHead>
                    <TableHead className="text-right w-[100px]">Qty</TableHead>
                    <TableHead className="text-right w-[120px]">Unit Price</TableHead>
                    <TableHead className="text-right w-[120px]">Amount</TableHead>
                    <TableHead className="w-[150px]">Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item) => (
                      <TableRow key={item.id} className="h-12">
                        <TableCell className="font-medium align-middle">{item.partNo}</TableCell>
                        <TableCell className="align-middle">{item.description || "-"}</TableCell>
                        <TableCell className="align-middle">{item.brand}</TableCell>
                        <TableCell className="text-right align-middle">{item.quantity}</TableCell>
                        <TableCell className="text-right align-middle">
                          Rs {item.purchasePrice.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          Rs {item.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="align-middle">
                          {item.rackCode && item.shelfNo
                            ? `${item.rackCode} / ${item.shelfNo}`
                            : "Not Assigned"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No items found in this order
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Total */}
            <div className="total">
              <p>Total Amount: Rs {order.total_amount.toFixed(2)}</p>
            </div>

            {/* Footer */}
            <div className="footer">
              <p>Generated on {format(new Date(), "MMMM dd, yyyy 'at' hh:mm a")}</p>
              <p>Thank you for your business!</p>
            </div>
          </div>

          {/* Print Button */}
          <div className="flex justify-end no-print">
            <Button onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" />
              Print Receipt
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

