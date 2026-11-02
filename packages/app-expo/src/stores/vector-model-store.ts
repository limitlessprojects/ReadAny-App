/**
 * Vector Model Store — manages embedding/vector model configurations
 */
import type { VectorModelConfig } from "@readany/core/types";
import { create } from "zustand";
import { withPersist } from "./persist";

export type BuiltinModelStatus = "idle" | "downloading" | "ready" | "error";

export interface BuiltinModelState {
  status: BuiltinModelStatus;
  progress?: number;
  error?: string;
}

export interface VectorModelState {
  vectorModels: VectorModelConfig[];
  selectedVectorModelId: string | null;
  vectorModelEnabled: boolean;
  autoVectorizeOnImport: boolean;
  vectorModelMode: "remote" | "builtin";
  selectedBuiltinModelId: string | null;
  builtinModelStates: Record<string, BuiltinModelState>;

  setVectorModelEnabled: (enabled: boolean) => void;
  setAutoVectorizeOnImport: (enabled: boolean) => void;
  setVectorModelMode: (mode: "remote" | "builtin") => void;
  addVectorModel: (model: VectorModelConfig) => void;
  updateVectorModel: (id: string, updates: Partial<VectorModelConfig>) => void;
  deleteVectorModel: (id: string) => void;
  setSelectedVectorModelId: (id: string | null) => void;
  getSelectedVectorModel: () => VectorModelConfig | null;
  setSelectedBuiltinModelId: (id: string | null) => void;
  updateBuiltinModelState: (id: string, state: Partial<BuiltinModelState>) => void;
  hasVectorCapability: () => boolean;
}

export const useVectorModelStore = create<VectorModelState>()(
  withPersist("vector-model", (set, get) => ({
    vectorModels: [],
    selectedVectorModelId: null,
    vectorModelEnabled: true,
    autoVectorizeOnImport: false,
    vectorModelMode: "remote",
    selectedBuiltinModelId: null,
    builtinModelStates: {},

    setVectorModelEnabled: (vectorModelEnabled) => set({ vectorModelEnabled }),
    setAutoVectorizeOnImport: (autoVectorizeOnImport) => set({ autoVectorizeOnImport }),
    setVectorModelMode: (vectorModelMode) => set({ vectorModelMode }),

    addVectorModel: (model) => {
      const { vectorModels } = get();
      set({ vectorModels: [...vectorModels, model] });
    },

    updateVectorModel: (id, updates) => {
      const { vectorModels } = get();
      set({
        vectorModels: vectorModels.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      });
    },

    deleteVectorModel: (id) => {
      const { vectorModels, selectedVectorModelId } = get();
      const newModels = vectorModels.filter((m) => m.id !== id);
      const newSelected = selectedVectorModelId === id ? null : selectedVectorModelId;
      set({ vectorModels: newModels, selectedVectorModelId: newSelected });
    },

    setSelectedVectorModelId: (selectedVectorModelId) => set({ selectedVectorModelId }),

    getSelectedVectorModel: () => {
      const { vectorModels, selectedVectorModelId } = get();
      return vectorModels.find((m) => m.id === selectedVectorModelId) || null;
    },

    setSelectedBuiltinModelId: (selectedBuiltinModelId) => set({ selectedBuiltinModelId }),

    updateBuiltinModelState: (id, state) =>
      set((s) => ({
        builtinModelStates: {
          ...s.builtinModelStates,
          [id]: { ...s.builtinModelStates[id], ...state } as BuiltinModelState,
        },
      })),

    hasVectorCapability: () => {
      const { vectorModelEnabled, vectorModelMode } = get();
      if (!vectorModelEnabled) return false;
      if (vectorModelMode === "builtin") {
        const { selectedBuiltinModelId } = get();
        return !!selectedBuiltinModelId;
      }
      const selected = get().getSelectedVectorModel();
      return selected != null;
    },
  })),
);
