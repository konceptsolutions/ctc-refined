import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  onCreate?: (value: string) => void;
  createLabel?: string;
}

export const SearchableSelect = ({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  className,
  disabled = false,
  allowCustom = false,
  onCreate,
  createLabel = "item",
  ...props
}: SearchableSelectProps & React.ComponentProps<typeof Input>) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const [dropdownPosition, setDropdownPosition] = React.useState({
    top: 0,
    left: 0,
    width: 0,
  });

  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption
    ? [selectedOption.label, selectedOption.description]
      .filter(Boolean)
      .join(" - ")
    : value || "";

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.description?.toLowerCase().includes(query),
    );
  }, [options, searchQuery]);

  const exactMatch = React.useMemo(() => {
    if (!searchQuery) return true;
    return options.some(
      (opt) => opt.label.toLowerCase() === searchQuery.toLowerCase(),
    );
  }, [options, searchQuery]);

  const partCodeContext = React.useMemo(() => {
    const hints = [
      placeholder,
      createLabel,
      props.name,
      props.id,
      props["aria-label"],
      className,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      hints.includes("part no") ||
      hints.includes("part number") ||
      hints.includes("master part") ||
      hints.includes("master_part") ||
      hints.includes("partno")
    );
  }, [placeholder, createLabel, props.name, props.id, props["aria-label"], className]);

  // Calculate dropdown position
  const updateDropdownPosition = React.useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      const dropdownHeight = 240; // max-h-60 = 240px
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const padding = 8; // Padding from viewport edges
      const gap = 4; // Gap between input and dropdown

      // FORCE opening downward - only open above if there's less than 30px below
      // and significantly more space above (at least 200px more)
      const absoluteMinimumSpace = 30;
      const openAbove =
        spaceBelow < absoluteMinimumSpace && spaceAbove - spaceBelow > 200;

      // Calculate top position (using getBoundingClientRect which is relative to viewport)
      let top: number;
      if (openAbove) {
        // ONLY in extreme cases where we absolutely can't show dropdown below
        top = rect.top - dropdownHeight - gap;
        if (top < padding) {
          top = padding;
        }
      } else {
        // ALWAYS position below the input (default behavior)
        top = rect.bottom + gap;

        // If dropdown extends beyond viewport bottom, clip it but keep it below
        // The dropdown has max-h-60 and overflow-auto so it will scroll
        const maxTop = viewportHeight - padding;
        if (top + dropdownHeight > maxTop) {
          // Still keep it below the input, just ensure it fits in viewport
          // Calculate max height we can show
          const availableHeight = maxTop - top;
          // Even if very small, keep it below - it will scroll
          if (availableHeight < 50) {
            // Last resort: only if less than 50px available, position at bottom
            top = maxTop - Math.min(dropdownHeight, availableHeight + 50);
          }
          // Otherwise, keep top as is (rect.bottom + gap) - dropdown will scroll
        }
      }

      // Convert to absolute position (add scroll offset)
      top = top + scrollY;

      // Ensure dropdown stays within viewport horizontally
      let left = rect.left + scrollX;
      const dropdownWidth = Math.max(rect.width, 200); // Minimum width of 200px

      if (left + dropdownWidth > viewportWidth + scrollX - padding) {
        left = viewportWidth + scrollX - dropdownWidth - padding;
      }
      if (left < scrollX + padding) {
        left = scrollX + padding;
      }

      setDropdownPosition({
        top,
        left,
        width: Math.min(dropdownWidth, viewportWidth - padding * 2), // Ensure it fits in viewport
      });
    }
  }, []);

  // Update position when opening
  React.useEffect(() => {
    if (isOpen) {
      // Use double requestAnimationFrame to ensure DOM is fully updated after layout changes
      // This is especially important when other sections (like expense fields) expand/collapse
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateDropdownPosition();
        });
      });
      // Also update after a small delay to catch any late layout changes
      const timeoutId = setTimeout(() => {
        updateDropdownPosition();
      }, 10);

      // Update position on scroll/resize
      const handleUpdate = () => {
        requestAnimationFrame(() => {
          updateDropdownPosition();
        });
      };
      window.addEventListener("scroll", handleUpdate, true);
      window.addEventListener("resize", handleUpdate);
      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener("scroll", handleUpdate, true);
        window.removeEventListener("resize", handleUpdate);
      };
    }
  }, [isOpen, updateDropdownPosition]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Handle input change: only update search query for filtering options
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);
    
    // Only open dropdown if user is actually typing (not empty)
    if (newValue.trim()) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
    
    // DO NOT call onValueChange here when allowCustom is true
    // This prevents the parent filter from updating while the user is just typing to search
  };

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleCreateNew = (val: string) => {
    if (onCreate) {
      onCreate(val);
    } else {
      onValueChange(val);
    }
    setIsOpen(false);
    setSearchQuery("");
  }

  const handleInputFocus = () => {
    // Don't auto-open on focus - only open when user clicks dropdown button or starts typing
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange("");
    setSearchQuery("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (filteredOptions.length > 0 && searchQuery) {
        // If there are filtered options and user is typing, select the first match
        handleSelect(filteredOptions[0].value);
      } else if ((allowCustom || onCreate) && searchQuery && !exactMatch) {
        // If custom allowed or onCreate provided, and no exact match, create the typed value
        handleCreateNew(searchQuery);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={isOpen ? searchQuery : displayValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          onClick={() => {
            if (!disabled && !isOpen) {
              setIsOpen(true);
              setSearchQuery("");
              // Update position when opening via click
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  updateDropdownPosition();
                });
              });
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("pr-16 h-8 text-xs", partCodeContext && "part-code-font font-mono")}
          {...props}
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 hover:bg-muted"
              onClick={handleClear}
              disabled={disabled}
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 hover:bg-muted"
            onClick={() => {
              if (!disabled) {
                const newOpenState = !isOpen;
                setIsOpen(newOpenState);
                if (newOpenState) {
                  setSearchQuery("");
                  // Update position when opening via button
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      updateDropdownPosition();
                    });
                  });
                }
              }
            }}
            disabled={disabled}
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 text-muted-foreground transition-transform",
                isOpen && "rotate-180",
              )}
            />
          </Button>
        </div>
      </div>

      {isOpen &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto searchable-select-portal"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
              maxWidth: "calc(100vw - 16px)", // Ensure it doesn't exceed viewport
            }}
          >
            {filteredOptions.length === 0 && !exactMatch && (searchQuery && (allowCustom || onCreate)) && (
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreateNew(searchQuery);
                }}
                className="px-3 py-2 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors font-semibold text-primary"
              >
                Add new {createLabel}: "{searchQuery}"
              </div>
            )}

            {filteredOptions.length === 0 && (!searchQuery || (!allowCustom && !onCreate)) && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No options found
              </div>
            )}

            {filteredOptions.length > 0 && (
              <>
                {filteredOptions.map((option) => (
                  <div
                    key={option.value}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelect(option.value);
                    }}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors pointer-events-auto",
                      value === option.value && "bg-primary/10 text-primary",
                    )}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className={cn("font-medium truncate", partCodeContext && "part-code-font font-mono")}>{option.label}</span>
                      {option.description && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {option.description}
                        </span>
                      )}
                    </div>
                    {value === option.value && <Check className="h-3 w-3" />}
                  </div>
                ))}
                {!exactMatch && searchQuery && (allowCustom || onCreate) && (
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCreateNew(searchQuery);
                    }}
                    className="px-3 py-2 text-xs cursor-pointer border-t hover:bg-accent hover:text-accent-foreground transition-colors font-semibold text-primary"
                  >
                    Add new {createLabel}: "{searchQuery}"
                  </div>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};
