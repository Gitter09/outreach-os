import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Settings {
    [key: string]: string | undefined;

    // AI
    ai_provider?: "gemini" | "ollama" | "openrouter";
    ai_model?: string;
    ai_base_url?: string;
    ai_temperature?: string;

    // Appearance
    theme_mode?: "light" | "dark" | "system";

    // CRM
    default_status_id?: string;
}

interface SettingsContextType {
    settings: Settings;
    loading: boolean;
    updateSetting: (key: string, value: string) => Promise<void>;
    getSetting: (key: string, defaultValue?: string) => string;
    refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<Settings>({});
    const [loading, setLoading] = useState(true);

    const fetchSettings = useCallback(async () => {
        try {
            const data = await invoke<Settings>("get_settings");
            setSettings(data);
        } catch (error) {
            console.error("Failed to load settings:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const updateSetting = async (key: string, value: string) => {
        // Optimistic update
        setSettings(prev => ({ ...prev, [key]: value }));

        try {
            await invoke("save_setting", { key, value });
        } catch (error) {
            console.error(`Failed to save setting ${key}:`, error);
            // Revert on error? For now, we assume success and let next fetch correct it
            fetchSettings();
        }
    };

    const getSetting = (key: string, defaultValue: string = ""): string => {
        return settings[key] ?? defaultValue;
    };

    return (
        <SettingsContext.Provider value={{
            settings,
            loading,
            updateSetting,
            getSetting,
            refreshSettings: fetchSettings
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error("useSettings must be used within a SettingsProvider");
    }
    return context;
}
