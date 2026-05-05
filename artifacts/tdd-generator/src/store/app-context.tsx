import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { TddFormData } from "@workspace/api-client-react";

export type FormDraft = Omit<
  Partial<TddFormData>,
  "environmentsRequired" | "azureRegions"
> & {
  environmentsRequired?: string[];
  azureRegions?: string[];
  architectureDiagramBase64?: string;
  architectureDiagramName?: string;
};

export interface HistoryEntry {
  id: string;
  applicationName: string;
  generatedAt: string;
  snippet: string;
  markdown: string;
}

interface AppContextType {
  formData: FormDraft;
  setFormData: (data: FormDraft) => void;
  updateFormData: (data: FormDraft) => void;
  draftSavedAt: string | null;
  clearDraft: () => void;
  history: HistoryEntry[];
  addHistoryEntry: (entry: Omit<HistoryEntry, "id" | "generatedAt">) => void;
  removeHistoryEntry: (id: string) => void;
  clearHistory: () => void;
  restoreFromHistory: (entry: HistoryEntry) => void;
}

const HISTORY_KEY = "tdd-document-history";
const MAX_HISTORY = 10;

function loadHistoryFromStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistoryToStorage(history: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch { /* quota exceeded or private mode — safe to ignore */ }
}

const DEFAULT_FORM: FormDraft = {
  organization: "",
  applicationType: "Greenfield",
  networkPosture: "Internal-Only",
  environmentsRequired: ["Dev", "QA", "Prod"],
  azureRegions: ["canadacentral"],
  workloadTier: "Tier 2",
  haEnabled: false,
  drEnabled: false,
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [formData, setFormData] = useState<FormDraft>(DEFAULT_FORM);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistoryFromStorage);

  const updateFormData = useCallback((data: FormDraft) => {
    setFormData((prev) => ({ ...prev, ...data }));
  }, []);

  const clearDraft = useCallback(() => {
    setFormData(DEFAULT_FORM);
  }, []);

  const addHistoryEntry = useCallback(
    (entry: Omit<HistoryEntry, "id" | "generatedAt">) => {
      const newEntry: HistoryEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        generatedAt: new Date().toISOString(),
      };
      setHistory((prev) => {
        const deduplicated = prev.filter(
          (h) => h.applicationName !== entry.applicationName,
        );
        const updated = [newEntry, ...deduplicated].slice(0, MAX_HISTORY);
        saveHistoryToStorage(updated);
        return updated;
      });
    },
    [],
  );

  const removeHistoryEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((h) => h.id !== id);
      saveHistoryToStorage(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* safe to ignore */ }
    setHistory([]);
  }, []);

  const restoreFromHistory = useCallback((entry: HistoryEntry) => {
    setFormData((prev) => ({
      ...prev,
      applicationName: entry.applicationName,
    }));
  }, []);

  return (
    <AppContext.Provider
      value={{
        formData,
        setFormData,
        updateFormData,
        draftSavedAt: null,
        clearDraft,
        history,
        addHistoryEntry,
        removeHistoryEntry,
        clearHistory,
        restoreFromHistory,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("Missing AppProvider");
  return ctx;
};
