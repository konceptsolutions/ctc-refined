import React, { useState, useEffect } from 'react';
import { SearchableSelect, SearchableSelectOption } from '@/components/ui/searchable-select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api';

interface ItemDropdownProps {
  onSelect: (partId: string, partNo: string, description?: string) => void;
  selectedItems?: Array<{ partId: string; partNo: string }>;
  disabled?: boolean;
}

export const ItemDropdown: React.FC<ItemDropdownProps> = ({ onSelect, selectedItems = [], disabled }) => {
  const [options, setOptions] = useState<SearchableSelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchParts = async () => {
      if (searchTerm.length < 2) {
        setOptions([]);
        return;
      }
      setLoading(true);
      try {
        const response = await apiClient.getParts({ search: searchTerm, limit: 50 });
        if (response.data && Array.isArray(response.data)) {
          const parts = response.data.map((part: any) => ({
            value: part.id,
            label: `${part.partNo} - ${part.description || 'No description'}`,
          }));
          setOptions(parts);
        }
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchParts, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const handleSelect = (value: string) => {
    const option = options.find(opt => opt.value === value);
    if (option) {
      const partNo = option.label.split(' - ')[0];
      const description = option.label.split(' - ')[1];
      onSelect(value, partNo, description);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Search and select item</Label>
      <SearchableSelect
        options={options}
        onValueChange={(value) => {
          if (value) handleSelect(value);
        }}
        placeholder={loading ? "Loading..." : "Type to search items..."}
        disabled={disabled || loading}
        allowCustom={false}
      />
    </div>
  );
};

interface SupplierDropdownProps {
  onSelect: (supplierId: string, supplierName: string) => void;
  disabled?: boolean;
}

export const SupplierDropdown: React.FC<SupplierDropdownProps> = ({ onSelect, disabled }) => {
  const [options, setOptions] = useState<SearchableSelectOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSuppliers = async () => {
      setLoading(true);
      try {
        const response = await apiClient.getSuppliers({ status: 'active', limit: 100 });
        if (response.data && Array.isArray(response.data)) {
          const suppliers = response.data.map((supplier: any) => ({
            value: supplier.id,
            label: `${supplier.code || ''} - ${supplier.companyName || supplier.name || 'Unknown'}`,
          }));
          setOptions(suppliers);
        }
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };
    fetchSuppliers();
  }, []);

  const handleSelect = (value: string) => {
    const option = options.find(opt => opt.value === value);
    if (option) {
      const name = option.label.split(' - ')[1] || option.label;
      onSelect(value, name);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Select supplier</Label>
      <SearchableSelect
        options={options}
        onValueChange={(value) => {
          if (value) handleSelect(value);
        }}
        placeholder={loading ? "Loading..." : "Select supplier..."}
        disabled={disabled || loading}
      />
    </div>
  );
};

interface StoreDropdownProps {
  onSelect: (storeId: string, storeName: string) => void;
  disabled?: boolean;
}

export const StoreDropdown: React.FC<StoreDropdownProps> = ({ onSelect, disabled }) => {
  const [options, setOptions] = useState<SearchableSelectOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStores = async () => {
      setLoading(true);
      try {
        const response = await apiClient.getStores('active');
        if (response.data && Array.isArray(response.data)) {
          const stores = response.data.map((store: any) => ({
            value: store.id,
            label: `${store.code || ''} - ${store.name}`,
          }));
          setOptions(stores);
        }
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };
    fetchStores();
  }, []);

  const handleSelect = (value: string) => {
    const option = options.find(opt => opt.value === value);
    if (option) {
      const name = option.label.split(' - ')[1] || option.label;
      onSelect(value, name);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Select store</Label>
      <SearchableSelect
        options={options}
        onValueChange={(value) => {
          if (value) handleSelect(value);
        }}
        placeholder={loading ? "Loading..." : "Select store..."}
        disabled={disabled || loading}
      />
    </div>
  );
};

interface RackDropdownProps {
  storeId?: string;
  onSelect: (rackId: string, rackName: string) => void;
  disabled?: boolean;
}

export const RackDropdown: React.FC<RackDropdownProps> = ({ storeId, onSelect, disabled }) => {
  const [options, setOptions] = useState<SearchableSelectOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storeId) {
      setOptions([]);
      return;
    }
    const fetchRacks = async () => {
      setLoading(true);
      try {
        const response = await apiClient.getRacks(storeId, 'Active');
        if (response.data && Array.isArray(response.data)) {
          const racks = response.data.map((rack: any) => ({
            value: rack.id,
            label: `${rack.codeNo} - ${rack.description || 'No description'}`,
          }));
          setOptions(racks);
        }
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };
    fetchRacks();
  }, [storeId]);

  const handleSelect = (value: string) => {
    const option = options.find(opt => opt.value === value);
    if (option) {
      const name = option.label.split(' - ')[0];
      onSelect(value, name);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Select rack</Label>
      <SearchableSelect
        options={options}
        onValueChange={(value) => {
          if (value) handleSelect(value);
        }}
        placeholder={!storeId ? "Select store first" : loading ? "Loading..." : "Select rack..."}
        disabled={disabled || loading || !storeId}
      />
    </div>
  );
};

interface ShelfDropdownProps {
  rackId?: string;
  onSelect: (shelfId: string, shelfName: string) => void;
  disabled?: boolean;
}

export const ShelfDropdown: React.FC<ShelfDropdownProps> = ({ rackId, onSelect, disabled }) => {
  const [options, setOptions] = useState<SearchableSelectOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rackId) {
      setOptions([]);
      return;
    }
    const fetchShelves = async () => {
      setLoading(true);
      try {
        const response = await apiClient.getShelves(rackId, 'Active');
        if (response.data && Array.isArray(response.data)) {
          const shelves = response.data.map((shelf: any) => ({
            value: shelf.id,
            label: `${shelf.shelfNo} - ${shelf.description || 'No description'}`,
          }));
          setOptions(shelves);
        }
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };
    fetchShelves();
  }, [rackId]);

  const handleSelect = (value: string) => {
    const option = options.find(opt => opt.value === value);
    if (option) {
      const name = option.label.split(' - ')[0];
      onSelect(value, name);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Select shelf</Label>
      <SearchableSelect
        options={options}
        onValueChange={(value) => {
          if (value) handleSelect(value);
        }}
        placeholder={!rackId ? "Select rack first" : loading ? "Loading..." : "Select shelf..."}
        disabled={disabled || loading || !rackId}
      />
    </div>
  );
};

interface QuantityInputProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
}

export const QuantityInput: React.FC<QuantityInputProps> = ({ 
  label = "Quantity", 
  value, 
  onChange, 
  disabled,
  min = 1 
}) => {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value || ''}
        onChange={(e) => {
          const val = parseInt(e.target.value) || 0;
          if (val >= min) {
            onChange(val);
          }
        }}
        placeholder="Enter quantity"
        disabled={disabled}
        min={min}
        className="h-8 text-xs"
      />
    </div>
  );
};

interface PriceInputsProps {
  priceA: number;
  priceB: number;
  priceM: number;
  onPriceChange: (field: 'priceA' | 'priceB' | 'priceM', value: number) => void;
  disabled?: boolean;
}

export const PriceInputs: React.FC<PriceInputsProps> = ({ priceA, priceB, priceM, onPriceChange, disabled }) => {
  return (
    <div className="space-y-3">
      <Label className="text-xs">Purchase Prices</Label>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Price A</Label>
          <Input
            type="number"
            value={priceA || ''}
            onChange={(e) => onPriceChange('priceA', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            disabled={disabled}
            step="0.01"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Price B</Label>
          <Input
            type="number"
            value={priceB || ''}
            onChange={(e) => onPriceChange('priceB', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            disabled={disabled}
            step="0.01"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Price M</Label>
          <Input
            type="number"
            value={priceM || ''}
            onChange={(e) => onPriceChange('priceM', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            disabled={disabled}
            step="0.01"
            className="h-8 text-xs"
          />
        </div>
      </div>
    </div>
  );
};

interface ExpenseFormProps {
  expenses: Array<{ type: string; amount: number; account: string }>;
  onAdd: () => void;
  onUpdate: (index: number, field: 'type' | 'amount' | 'account', value: string | number) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ expenses, onAdd, onUpdate, onRemove, disabled }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Expenses</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={disabled}
          className="h-6 text-[10px] px-2"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {expenses.map((expense, index) => (
          <div key={index} className="flex gap-2 items-end p-2 bg-muted/50 rounded border">
            <div className="flex-1 space-y-1">
              <Input
                value={expense.type}
                onChange={(e) => onUpdate(index, 'type', e.target.value)}
                placeholder="Expense type"
                disabled={disabled}
                className="h-7 text-xs"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Input
                value={expense.account}
                onChange={(e) => onUpdate(index, 'account', e.target.value)}
                placeholder="Account"
                disabled={disabled}
                className="h-7 text-xs"
              />
            </div>
            <div className="w-24 space-y-1">
              <Input
                type="number"
                value={expense.amount || ''}
                onChange={(e) => onUpdate(index, 'amount', parseFloat(e.target.value) || 0)}
                placeholder="Amount"
                disabled={disabled}
                step="0.01"
                className="h-7 text-xs"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(index)}
              disabled={disabled}
              className="h-7 w-7 p-0"
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ))}
        {expenses.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No expenses added</p>
        )}
      </div>
    </div>
  );
};

interface ConfirmationButtonsProps {
  onSave: () => void;
  onUpdate?: () => void;
  onCancel: () => void;
  saveLabel?: string;
  updateLabel?: string;
  disabled?: boolean;
}

export const ConfirmationButtons: React.FC<ConfirmationButtonsProps> = ({
  onSave,
  onUpdate,
  onCancel,
  saveLabel = "Save",
  updateLabel = "Update",
  disabled,
}) => {
  return (
    <div className="flex gap-2 pt-2">
      <Button
        onClick={onSave}
        disabled={disabled}
        size="sm"
        className="h-7 text-xs flex-1"
      >
        {saveLabel}
      </Button>
      {onUpdate && (
        <Button
          onClick={onUpdate}
          disabled={disabled}
          variant="outline"
          size="sm"
          className="h-7 text-xs"
        >
          {updateLabel}
        </Button>
      )}
      <Button
        onClick={onCancel}
        disabled={disabled}
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
      >
        Cancel
      </Button>
    </div>
  );
};

interface HistoryButtonProps {
  partId: string;
  partNo: string;
  onClick: () => void;
  disabled?: boolean;
}

export const HistoryButton: React.FC<HistoryButtonProps> = ({ partId, partNo, onClick, disabled }) => {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-7 text-xs"
    >
      View History
    </Button>
  );
};

