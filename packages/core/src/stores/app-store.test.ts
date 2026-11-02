import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./app-store";

describe("app-store tab initial location", () => {
  beforeEach(() => {
    useAppStore.setState({
      tabs: [{ id: "home", type: "home", title: "Home" }],
      activeTabId: "home",
      sidebarOpen: false,
      sidebarTab: "chat",
      showSettings: false,
      settingsTab: "general",
    });
  });

  it("updates and clears reader initialCfi on an existing tab", () => {
    const { addTab } = useAppStore.getState();

    addTab({
      id: "reader-book-1",
      type: "reader",
      title: "Book 1",
      bookId: "book-1",
      initialCfi: "epubcfi(/6/2)",
    });
    addTab({
      id: "reader-book-1",
      type: "reader",
      title: "Book 1",
      bookId: "book-1",
      initialCfi: "page:3",
    });

    expect(useAppStore.getState().tabs.find((tab) => tab.id === "reader-book-1")?.initialCfi).toBe(
      "page:3",
    );

    addTab({
      id: "reader-book-1",
      type: "reader",
      title: "Book 1",
      bookId: "book-1",
      initialCfi: undefined,
    });

    expect(
      useAppStore.getState().tabs.find((tab) => tab.id === "reader-book-1")?.initialCfi,
    ).toBeUndefined();
  });

  it("opens an EPUB draft workspace tab with draft identity", () => {
    const { addTab } = useAppStore.getState();

    addTab({
      id: "epub-draft-draft-1",
      type: "epubDraft",
      title: "Draft",
      bookId: "book-1",
      draftId: "draft-1",
    });

    const tab = useAppStore.getState().tabs.find((item) => item.id === "epub-draft-draft-1");
    expect(tab).toMatchObject({
      type: "epubDraft",
      bookId: "book-1",
      draftId: "draft-1",
    });
    expect(useAppStore.getState().activeTabId).toBe("epub-draft-draft-1");
  });
});
