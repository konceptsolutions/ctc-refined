import { cn } from "@/lib/utils";

/** Brand on top, Origin underneath — distinct colors so they are easy to tell apart. */
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
      <span
        className={cn(
          "inline-flex max-w-full items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold truncate",
          brandText === "-"
            ? "border-transparent bg-transparent text-muted-foreground font-medium"
            : "bg-emerald-100 text-emerald-900 border-emerald-200",
          brandClassName,
        )}
        title={brandText !== "-" ? `Brand: ${brandText}` : undefined}
      >
        {brandText}
      </span>
      {showOrigin ? (
        <span
          className={cn(
            "inline-flex max-w-full items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-tight truncate",
            "bg-orange-100 text-orange-950 border-orange-200",
            originClassName,
          )}
          title={`Origin: ${originText}`}
        >
          {originText}
        </span>
      ) : null}
    </div>
  );
}
