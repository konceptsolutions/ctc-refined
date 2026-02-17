import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Edit2, Trash2, Folder, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TreeNode {
  id: string;
  name: string;
  type: "model" | "make" | "category" | "brand";
  children?: TreeNode[];
  count?: number;
}

const initialData: TreeNode[] = [
  {
    id: "1",
    name: "Toyota",
    type: "make",
    children: [
      {
        id: "1-1",
        name: "Camry",
        type: "model",
        children: [
          { id: "1-1-1", name: "Engine Parts", type: "category", count: 24 },
          { id: "1-1-2", name: "Brake Parts", type: "category", count: 12 },
          { id: "1-1-3", name: "Suspension", type: "category", count: 8 },
        ],
      },
      {
        id: "1-2",
        name: "Corolla",
        type: "model",
        children: [
          { id: "1-2-1", name: "Engine Parts", type: "category", count: 18 },
          { id: "1-2-2", name: "Electrical", type: "category", count: 15 },
        ],
      },
    ],
  },
  {
    id: "2",
    name: "Honda",
    type: "make",
    children: [
      {
        id: "2-1",
        name: "Civic",
        type: "model",
        children: [
          { id: "2-1-1", name: "Filters", type: "category", count: 10 },
          { id: "2-1-2", name: "Brake Parts", type: "category", count: 14 },
        ],
      },
    ],
  },
  {
    id: "3",
    name: "BMW",
    type: "make",
    children: [
      {
        id: "3-1",
        name: "3 Series",
        type: "model",
        children: [
          { id: "3-1-1", name: "Engine Parts", type: "category", count: 32 },
        ],
      },
    ],
  },
];

interface TreeItemProps {
  node: TreeNode;
  level: number;
  onEdit: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
  onAddChild: (parentId: string) => void;
}

const TreeItem = ({ node, level, onEdit, onDelete, onAddChild }: TreeItemProps) => {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;

  const typeColors = {
    make: "text-chart-blue",
    model: "text-chart-orange",
    category: "text-chart-green",
    brand: "text-primary",
  };

  return (
    <div className="animate-fade-in">
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors group cursor-pointer",
          level === 0 && "bg-muted/30"
        )}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 hover:bg-muted rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {hasChildren ? (
          isExpanded ? (
            <FolderOpen className={cn("w-4 h-4", typeColors[node.type])} />
          ) : (
            <Folder className={cn("w-4 h-4", typeColors[node.type])} />
          )
        ) : (
          <div className={cn("w-2 h-2 rounded-full", `bg-${typeColors[node.type].replace("text-", "")}`)} />
        )}

        <span className="text-sm font-medium text-foreground flex-1">{node.name}</span>

        {node.count !== undefined && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {node.count} items
          </span>
        )}

        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          {hasChildren && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(node.id);
              }}
            >
              <Plus className="w-3 h-3 text-muted-foreground" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(node);
            }}
          >
            <Edit2 className="w-3 h-3 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node);
            }}
          >
            <Trash2 className="w-3 h-3 text-destructive" />
          </Button>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ModelMakeCategoryBrand = () => {
  const [data, setData] = useState<TreeNode[]>(initialData);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemType, setNewItemType] = useState<"make" | "model" | "category" | "brand">("make");

  const handleEdit = (node: TreeNode) => {
    // In real app, open edit dialog
  };

  const handleDelete = (node: TreeNode) => {
    // In real app, confirm and delete
  };

  const handleAddChild = (parentId: string) => {
    // In real app, open add child dialog
  };

  const handleAddRoot = () => {
    if (!newItemName.trim()) return;
    const newNode: TreeNode = {
      id: Date.now().toString(),
      name: newItemName,
      type: newItemType,
      children: [],
    };
    setData([...data, newNode]);
    setNewItemName("");
    setShowAddForm(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Model–Make–Category–Brand</h2>
          <p className="text-sm text-muted-foreground">Structured inventory hierarchy management</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAddForm(true)}>
          <Plus className="w-4 h-4" />
          Add Make
        </Button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-card border border-border rounded-lg p-4 animate-fade-in">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <Input
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Enter name"
                className="h-9"
              />
            </div>
            <Button size="sm" onClick={handleAddRoot}>
              Add
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-chart-blue" />
          <span className="text-muted-foreground">Make</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-chart-orange" />
          <span className="text-muted-foreground">Model</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-chart-green" />
          <span className="text-muted-foreground">Category</span>
        </div>
      </div>

      {/* Tree View */}
      <div className="bg-card border border-border rounded-lg p-2">
        {data.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            level={0}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddChild={handleAddChild}
          />
        ))}
        {data.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No hierarchy defined. Add a make to get started.
          </div>
        )}
      </div>
    </div>
  );
};
