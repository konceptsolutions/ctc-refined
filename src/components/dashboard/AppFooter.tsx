const SOFTWARE_NAME = "CTC Crystal Trading Platform";
const POWERED_BY = "Knocept Solutions";
const YEAR = new Date().getFullYear();

/** Slim app-wide footer; rendered with Sidebar so every layout page shows it. */
export const AppFooter = () => {
  return (
    <footer
      className="fixed bottom-0 right-0 z-30 h-8 border-t border-border bg-card/95 backdrop-blur-sm flex items-center justify-center px-3 text-[11px] sm:text-xs text-muted-foreground transition-[left] duration-200 ease-in-out"
      style={{ left: "var(--app-sidebar-width, 4rem)" }}
    >
      <p className="truncate text-center leading-none">
        <span className="font-medium text-foreground/80">{SOFTWARE_NAME}</span>
        <span className="mx-1.5 text-border">·</span>
        <span>
          Powered by <span className="font-medium text-foreground/80">{POWERED_BY}</span>
        </span>
        <span className="mx-1.5 hidden sm:inline text-border">·</span>
        <span className="hidden sm:inline">© {YEAR}</span>
      </p>
    </footer>
  );
};
