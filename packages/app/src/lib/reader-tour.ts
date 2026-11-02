import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import i18n from "@readany/core/i18n";

const READER_TOUR_SEEN_KEY = "readany-reader-tour-seen";

let activeTour: ReturnType<typeof driver> | null = null;

/** Escape hatch for view switches (e.g. opening the chat panel mid-tour):
 *  tear the tour down. destroy() fires onDestroyed, which marks the tour
 *  seen — once the user heads elsewhere we don't nag them again. */
export function stopReaderTour(): void {
  try {
    activeTour?.destroy();
  } catch {
    /* already destroyed */
  }
  activeTour = null;
}

export function hasSeenReaderTour(): boolean {
  return localStorage.getItem(READER_TOUR_SEEN_KEY) === "true";
}

export function markReaderTourSeen(): void {
  localStorage.setItem(READER_TOUR_SEEN_KEY, "true");
}

export function resetReaderTour(): void {
  localStorage.removeItem(READER_TOUR_SEEN_KEY);
}

export function startReaderTour() {
  activeTour?.destroy();
  const d = driver({
    showProgress: true,
    animate: true,
    overlayColor: "rgba(0, 0, 0, 0.6)",
    stagePadding: 0,
    stageRadius: 8,
    nextBtnText: i18n.t("tour.next", "Next"),
    prevBtnText: i18n.t("tour.prev", "Previous"),
    doneBtnText: i18n.t("tour.done", "Got it"),
    progressText: i18n.t("tour.progress", "{{current}} / {{total}}"),
    onDestroyed: () => {
      if (activeTour === d) activeTour = null;
      markReaderTourSeen();
    },
    steps: [
      {
        element: "#reader-zone-prev",
        popover: {
          title: i18n.t("readerTour.prevPage.title", "Previous Page"),
          description: i18n.t(
            "readerTour.prevPage.desc",
            "Click or tap the left area to go to the previous page.",
          ),
          side: "right",
          align: "center",
        },
      },
      {
        element: "#reader-zone-toolbar",
        popover: {
          title: i18n.t("readerTour.toolbar.title", "Toggle Toolbar"),
          description: i18n.t(
            "readerTour.toolbar.desc",
            "Click or tap the center area to show/hide the toolbar. You can also hover at the top/bottom edge.",
          ),
          side: "bottom",
          align: "center",
        },
      },
      {
        element: "#reader-zone-next",
        popover: {
          title: i18n.t("readerTour.nextPage.title", "Next Page"),
          description: i18n.t(
            "readerTour.nextPage.desc",
            "Click or tap the right area to go to the next page.",
          ),
          side: "left",
          align: "center",
        },
      },
    ],
  });

  activeTour = d;
  d.drive();
}
