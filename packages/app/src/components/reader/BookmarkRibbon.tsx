interface BookmarkRibbonProps {
  visible: boolean;
}

/**
 * A bookmark ribbon shown at the top-right of the reader page
 * when the current position is bookmarked.
 */
export function BookmarkRibbon({ visible }: BookmarkRibbonProps) {
  return (
    <div
      className="pointer-events-none absolute right-5 top-0 z-10 transition-all duration-300 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-20px)",
      }}
    >
      <svg width="14" height="40" viewBox="0 0 14 40">
        <path d="M0 0h14v36l-7-4-7 4V0z" className="fill-primary" />
      </svg>
    </div>
  );
}
