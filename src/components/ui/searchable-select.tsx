import * as React from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  /** Extra text shown in the dropdown list only (e.g. brand), not in the selected field */
  listOnlyDescription?: string;
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
  /** When true, the closed input shows only the label (not description). */
  selectedDisplayLabelOnly?: boolean;
  /** Fired when the user types in the search field (remote / async option loading). */
  onSearchChange?: (query: string) => void;
  /** Open the dropdown and focus the input when mounted or when set to true. */
  autoOpen?: boolean;
  /** Called after auto-open has been applied (use to clear parent trigger state). */
  onAutoOpenHandled?: () => void;
  /**
   * Max options rendered in the open list. Large catalogs should be searched,
   * not fully mounted in the DOM.
   */
  maxDisplayedOptions?: number;
  /**
   * When there is no search text and options exceed this count, require typing
   * instead of dumping the full catalog into the dropdown.
   */
  requireSearchAbove?: number;
}

const DEFAULT_MAX_DISPLAYED_OPTIONS = 80;
const DEFAULT_REQUIRE_SEARCH_ABOVE = 120;

export const SearchableSelect = React.memo(function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  className,
  disabled = false,
  allowCustom = false,
  onCreate,
  createLabel = "item",
  selectedDisplayLabelOnly = false,
  onSearchChange,
  autoOpen = false,
  onAutoOpenHandled,
  maxDisplayedOptions = DEFAULT_MAX_DISPLAYED_OPTIONS,
  requireSearchAbove = DEFAULT_REQUIRE_SEARCH_ABOVE,
  ...props
}: SearchableSelectProps & React.ComponentProps<typeof Input>) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isFocused, setIsFocused] = React.useState(false);
  const searchQueryRef = React.useRef(searchQuery);
  /** Keyboard highlight row index within filteredOptions */
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const highlightIndexRef = React.useRef(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const suppressFocusCloseRef = React.useRef(false);

  const [dropdownPosition, setDropdownPosition] = React.useState({
    top: 0,
    left: 0,
    width: 0,
  });

  React.useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  const selectedOption = value
    ? options.find((opt) => opt.value === value)
    : undefined;
  const displayValue = selectedOption
    ? selectedDisplayLabelOnly
      ? selectedOption.label
      : [selectedOption.label, selectedOption.description]
          .filter(Boolean)
          .join(" - ")
    : value || "";

  // While focused, always show what the user is typing (even when empty).
  const inputValue = isFocused || isOpen ? searchQuery : displayValue;

  const filteredOptions = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query && options.length > requireSearchAbove) {
      return [] as SearchableSelectOption[];
    }

    let matched = options;
    if (query) {
      matched = options.filter(
        (opt) =>
          opt.label.toLowerCase().includes(query) ||
          opt.description?.toLowerCase().includes(query) ||
          opt.listOnlyDescription?.toLowerCase().includes(query),
      );
    }

    return matched.slice(0, Math.max(1, maxDisplayedOptions));
  }, [options, searchQuery, maxDisplayedOptions, requireSearchAbove]);

  const requireSearchHint =
    !searchQuery.trim() && options.length > requireSearchAbove;
  const showingCappedResults =
    Boolean(searchQuery.trim()) &&
    filteredOptions.length >= maxDisplayedOptions;

  React.useEffect(() => {
    highlightIndexRef.current = highlightIndex;
  }, [highlightIndex]);

  React.useEffect(() => {
    setHighlightIndex(0);
  }, [searchQuery, isOpen]);

  React.useEffect(() => {
    const len = filteredOptions.length;
    setHighlightIndex((hi) =>
      len === 0 ? 0 : Math.min(Math.max(hi, 0), len - 1),
    );
  }, [filteredOptions.length]);

  React.useLayoutEffect(() => {
    if (!isOpen || filteredOptions.length === 0) return;
    const root = dropdownRef.current;
    if (!root) return;
    const safeIdx = Math.min(
      Math.max(highlightIndex, 0),
      filteredOptions.length - 1,
    );
    const el = root.querySelector<HTMLElement>(
      `[data-ss-option-index="${safeIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [highlightIndex, isOpen, filteredOptions]);

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
    const anchor = inputRef.current ?? containerRef.current;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
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

      // Match dropdown width to the input field (never wider than the trigger)
      let left = rect.left + scrollX;
      const dropdownWidth = rect.width;

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

  React.useLayoutEffect(() => {
    if (!autoOpen || disabled) return;

    suppressFocusCloseRef.current = true;
    setIsOpen(true);
    setIsFocused(true);
    setSearchQuery("");
    setHighlightIndex(0);

    const focusFrame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        updateDropdownPosition();
        suppressFocusCloseRef.current = false;
        onAutoOpenHandled?.();
      });
    });

    return () => cancelAnimationFrame(focusFrame);
  }, [autoOpen, disabled, onAutoOpenHandled, updateDropdownPosition]);

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
        setIsFocused(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const selectAllInputText = React.useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.select();
    });
  }, []);

  const openDropdown = React.useCallback(() => {
    setIsOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateDropdownPosition();
      });
    });
  }, [updateDropdownPosition]);

  // Handle input change: only update search query for filtering options
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);
    onSearchChange?.(newValue);

    if (newValue.length > 0) {
      openDropdown();
    } else {
      setIsOpen(false);
      if (value) {
        onValueChange("");
      }
    }

    // Only clear the value when the field is emptied; otherwise defer onValueChange
    // until blur/select so parent filters are not updated on every keystroke.
  };

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setIsOpen(false);
    setSearchQuery("");
    setIsFocused(false);
  };

  const handleCreateNew = (val: string) => {
    if (onCreate) {
      onCreate(val);
    } else {
      onValueChange(val);
    }
    setIsOpen(false);
    setSearchQuery("");
    setIsFocused(false);
  }

  const handleInputFocus = () => {
    setIsFocused(true);
    if (suppressFocusCloseRef.current) {
      setIsOpen(true);
      return;
    }
    if (!value) {
      openDropdown();
      setSearchQuery("");
      return;
    }
    setSearchQuery(displayValue);
    openDropdown();
    selectAllInputText();
  };

  const handleInputBlur = () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (
        containerRef.current?.contains(active) ||
        dropdownRef.current?.contains(active)
      ) {
        return;
      }

      setIsFocused(false);

      const query = searchQueryRef.current.trim();
      if (!query) {
        setIsOpen(false);
        setSearchQuery("");
        return;
      }

      const exact = options.find(
        (opt) =>
          opt.label.toLowerCase() === query.toLowerCase() ||
          opt.value === query,
      );
      if (exact) {
        handleSelect(exact.value);
        return;
      }
      if (filteredOptions.length === 1) {
        handleSelect(filteredOptions[0].value);
        return;
      }

      setIsOpen(false);
      setSearchQuery("");
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const len = filteredOptions.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      if (!isOpen) {
        if (!searchQuery && value) {
          setSearchQuery(displayValue);
        } else if (!searchQuery) {
          setSearchQuery("");
        }
        openDropdown();
        setHighlightIndex(0);
        return;
      }
      if (len === 0) return;
      setHighlightIndex((i) => Math.min(i + 1, len - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      if (!isOpen) {
        if (!searchQuery && value) {
          setSearchQuery(displayValue);
        } else if (!searchQuery) {
          setSearchQuery("");
        }
        openDropdown();
        const last = len > 0 ? len - 1 : 0;
        setHighlightIndex(last);
        return;
      }
      if (len === 0) return;
      setHighlightIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === "Enter") {
      if (isOpen && len > 0) {
        e.preventDefault();
        e.stopPropagation();
        const hi = Math.min(
          Math.max(highlightIndexRef.current, 0),
          len - 1,
        );
        handleSelect(filteredOptions[hi].value);
        return;
      }
      if (filteredOptions.length > 0 && searchQuery) {
        e.preventDefault();
        e.stopPropagation();
        handleSelect(filteredOptions[0].value);
      } else if ((allowCustom || onCreate) && searchQuery && !exactMatch) {
        e.preventDefault();
        e.stopPropagation();
        handleCreateNew(searchQuery);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      setSearchQuery("");
      setIsFocused(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          onClick={() => {
            if (disabled) return;
            if (value && displayValue) {
              if (!isFocused) {
                setSearchQuery(displayValue);
                selectAllInputText();
                openDropdown();
              }
              return;
            }
            if (!isOpen) {
              openDropdown();
              setSearchQuery("");
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "w-full h-8 text-xs",
            partCodeContext && "part-code-font font-mono",
            selectedDisplayLabelOnly && value && !isOpen && !isFocused && "truncate",
          )}
          {...props}
        />
      </div>

      {isOpen &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-x-hidden overflow-y-auto searchable-select-portal"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
              maxWidth: `${dropdownPosition.width}px`,
            }}
          >
            {filteredOptions.length === 0 && !exactMatch && (searchQuery && (allowCustom || onCreate)) && (
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreateNew(searchQuery);
                }}
                className="px-3 py-2 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors font-semibold text-primary truncate"
              >
                Add new {createLabel}: "{searchQuery}"
              </div>
            )}

            {filteredOptions.length === 0 && (!searchQuery || (!allowCustom && !onCreate)) && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {requireSearchHint
                  ? "Type to search parts..."
                  : "No options found"}
              </div>
            )}

            {filteredOptions.length > 0 && (
              <>
                {filteredOptions.map((option, idx) => (
                  <div
                    key={option.value}
                    data-ss-option-index={idx}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelect(option.value);
                    }}
                    className={cn(
                      "flex items-center justify-between gap-1 px-3 py-2 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors pointer-events-auto min-w-0",
                      idx === highlightIndex &&
                        "bg-accent text-accent-foreground",
                      value === option.value &&
                        idx !== highlightIndex &&
                        "bg-primary/10 text-primary",
                    )}
                  >
                    <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                      <span className={cn("font-medium truncate", partCodeContext && "part-code-font font-mono")}>{option.label}</span>
                      {(option.description || option.listOnlyDescription) && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {[option.description, option.listOnlyDescription]
                            .map((part) => String(part || "").trim())
                            .filter(Boolean)
                            .join(" | ")}
                        </span>
                      )}
                    </div>
                    {value === option.value && (
                      <Check className="h-3 w-3 shrink-0" />
                    )}
                  </div>
                ))}
                {showingCappedResults ? (
                  <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t">
                    Showing top {filteredOptions.length} matches — refine search for more
                  </div>
                ) : null}
                {!exactMatch && searchQuery && (allowCustom || onCreate) && (
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCreateNew(searchQuery);
                    }}
                    className="px-3 py-2 text-xs cursor-pointer border-t hover:bg-accent hover:text-accent-foreground transition-colors font-semibold text-primary truncate"
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
});
