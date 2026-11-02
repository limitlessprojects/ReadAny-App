import { create } from "zustand";

interface MissingBookPromptOptions {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
}

interface MissingBookPromptState extends MissingBookPromptOptions {
  visible: boolean;
  resolver: ((value: boolean) => void) | null;
  showPrompt: (options: MissingBookPromptOptions) => Promise<boolean>;
  resolvePrompt: (value: boolean) => void;
}

const DEFAULT_COPY: MissingBookPromptOptions = {
  title: "",
  description: "",
  confirmLabel: "",
  cancelLabel: "",
};

export const useMissingBookPromptStore = create<MissingBookPromptState>((set, get) => ({
  ...DEFAULT_COPY,
  visible: false,
  resolver: null,
  showPrompt: (options) =>
    new Promise<boolean>((resolve) => {
      const currentResolver = get().resolver;
      if (currentResolver) {
        currentResolver(false);
      }
      set({
        ...options,
        visible: true,
        resolver: resolve,
      });
    }),
  resolvePrompt: (value) => {
    const resolver = get().resolver;
    set({
      ...DEFAULT_COPY,
      visible: false,
      resolver: null,
    });
    resolver?.(value);
  },
}));
