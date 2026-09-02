import React, { useState, useEffect } from 'react';
import { formatUiDate } from '@/utils/dateUtils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import apiClient from '@/lib/api';

interface HistoryPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partId: string;
  partNo: string;
}

interface PriceHistoryEntry {
  id: string;
  date: string; 
  priceA?: number;
  priceB?: number;
  priceM?: number;
  cost?: number;
  updatedBy?: string;
}

interface PurchaseOrderHistoryEntry {
  id: string;
  poNumber: string;
  date: string;
  supplier?: string;
  quantity: number;
  unitCost: number;
  receivedQty: number;
  status: string;
}

export const HistoryPopup: React.FC<HistoryPopupProps> = ({ open, onOpenChange, partId, partNo }) => {
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [poHistory, setPoHistory] = useState<PurchaseOrderHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && partId) {
      fetchHistory();
    }
  }, [open, partId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // Fetch price history - try with partId if API supports it, otherwise filter client-side
      try {
        const priceResponse = await apiClient.getPriceHistory({ limit: 100, partId } as any);
        if (priceResponse.data && Array.isArray(priceResponse.data)) {
          // Filter by partId if the API returns all parts
          const filtered = priceResponse.data.filter((entry: any) => 
            entry.partId === partId || entry.part?.id === partId
          );
          setPriceHistory(filtered.map((entry: any) => ({
            id: entry.id,
            date: entry.date || entry.createdAt || entry.updatedAt,
            priceA: entry.priceA,
            priceB: entry.priceB,
            priceM: entry.priceM,
            cost: entry.cost,
            updatedBy: entry.updatedBy,
          })));
        }
      } catch (err) {
        // If partId parameter not supported, try without it and filter client-side
        const priceResponse = await apiClient.getPriceHistory({ limit: 100 });
        if (priceResponse.data && Array.isArray(priceResponse.data)) {
          const filtered = priceResponse.data.filter((entry: any) => 
            entry.partId === partId || entry.part?.id === partId
          );
          setPriceHistory(filtered.map((entry: any) => ({
            id: entry.id,
            date: entry.date || entry.createdAt || entry.updatedAt,
            priceA: entry.priceA,
            priceB: entry.priceB,
            priceM: entry.priceM,
            cost: entry.cost,
            updatedBy: entry.updatedBy,
          })));
        }
      }

      // Fetch purchase order history
      const poResponse = await apiClient.getPurchaseOrdersByPart(partId, { limit: 50 });
      if (poResponse.data && Array.isArray(poResponse.data)) {
        // Handle both direct array and nested data structure
        const poData = Array.isArray(poResponse.data) ? poResponse.data : (poResponse.data.items || []);
        setPoHistory(poData.map((po: any) => {
          // Handle different response structures
          const item = po.items?.[0] || po;
          return {
            id: po.id || item.id,
            poNumber: po.poNumber || po.poNo || item.poNumber,
            date: po.date || po.createdAt || item.date,
            supplier: po.supplier || po.supplierName || item.supplier,
            quantity: item.quantity || po.quantity || 0,
            unitCost: item.unitCost || item.purchasePrice || po.unitCost || 0,
            receivedQty: item.receivedQty || po.receivedQty || 0,
            status: po.status || item.status || 'Draft',
          };
        }));
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => formatUiDate(dateString) || dateString;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History for {partNo}</DialogTitle>
          <DialogDescription>
            Purchase order and price history for this item
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="po" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="po">Purchase Orders</TabsTrigger>
            <TabsTrigger value="price">Price History</TabsTrigger>
          </TabsList>

          <TabsContent value="po" className="space-y-4">
            {loading ? (
              <div className="text-center py-8 text-sm text-muted-foreground">Loading...</div>
            ) : poHistory.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No purchase order history found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">PO Number</th>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Supplier</th>
                      <th className="text-right p-2">Quantity</th>
                      <th className="text-right p-2">Unit Cost</th>
                      <th className="text-right p-2">Received</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poHistory.map((entry) => (
                      <tr key={entry.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-medium">{entry.poNumber}</td>
                        <td className="p-2">{formatDate(entry.date)}</td>
                        <td className="p-2">{entry.supplier || '-'}</td>
                        <td className="p-2 text-right">{entry.quantity}</td>
                        <td className="p-2 text-right">{entry.unitCost.toFixed(2)}</td>
                        <td className="p-2 text-right">{entry.receivedQty}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            entry.status === 'Received' ? 'bg-green-100 text-green-800' :
                            entry.status === 'Draft' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="price" className="space-y-4">
            {loading ? (
              <div className="text-center py-8 text-sm text-muted-foreground">Loading...</div>
            ) : priceHistory.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No price history found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Date</th>
                      <th className="text-right p-2">Cost</th>
                      <th className="text-right p-2">Price A</th>
                      <th className="text-right p-2">Price B</th>
                      <th className="text-right p-2">Price M</th>
                      <th className="text-left p-2">Updated By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.map((entry) => (
                      <tr key={entry.id} className="border-b hover:bg-muted/50">
                        <td className="p-2">{formatDate(entry.date)}</td>
                        <td className="p-2 text-right">{entry.cost?.toFixed(2) || '-'}</td>
                        <td className="p-2 text-right">{entry.priceA?.toFixed(2) || '-'}</td>
                        <td className="p-2 text-right">{entry.priceB?.toFixed(2) || '-'}</td>
                        <td className="p-2 text-right">{entry.priceM?.toFixed(2) || '-'}</td>
                        <td className="p-2">{entry.updatedBy || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

