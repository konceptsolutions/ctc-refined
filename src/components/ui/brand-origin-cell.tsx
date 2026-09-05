import { cn } from "@/lib/utils";

/** Brand on top, Origin underneath — for items-table Brand columns. */
export function BrandOriginCell({
  brand,
  origin,
  className,
  brandClassName,
  originClassName,
  align = "left",
}: {
  brand?: string | null;
  origin?: string | null;
  className?: string;
  brandClassName?: string;
  originClassName?: string;
  align?: "left" | "center";
}) {
  const brandText = String(brand ?? "").trim() || "-";
  const originText = String(origin ?? "").trim();
  const showOrigin =
    originText.length > 0 &&
    originText.toLowerCase() !== "n/a";

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 min-w-0",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <span className={cn("text-xs font-medium text-foreground truncate", brandClassName)}>
        {brandText}
      </span>
      {showOrigin ? (
        <span
          className={cn(
            "text-[10px] text-muted-foreground leading-tight truncate",
            originClassName,
          )}
          title={originText}
        >
          {originText}
        </span>
      ) : null}
    </div>
  );
}
