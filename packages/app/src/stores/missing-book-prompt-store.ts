import { create } from "zustand";

interface MissingBookPromptOptions {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
}

interface MissingBookPromptState extends MissingBookPromptOptions {
  open: boolean;
  resolver: ((value: boolean) => void) | null;
  showPrompt: (options: MissingBookPromptOptions) => Promise<boolean>;
  resolvePrompt: (value: boolean) => void;
}

const EMPTY: MissingBookPromptOptions = {
  title: "",
  description: "",
  confirmLabel: "",
  cancelLabel: "",
};

export const useMissingBookPromptStore = create<MissingBookPromptState>((set, get) => ({
  ...EMPTY,
  open: false,
  resolver: null,
  showPrompt: (options) =>
    new Promise<boolean>((resolve) => {
      const currentResolver = get().resolver;
      if (currentResolver) {
        currentResolver(false);
      }
      set({
        ...options,
        open: true,
        resolver: resolve,
      });
    }),
  resolvePrompt: (value) => {
    const resolver = get().resolver;
    set({
      ...EMPTY,
      open: false,
      resolver: null,
    });
    resolver?.(value);
  },
}));
