import { useEffect, ReactNode } from "react"
import { useSettings } from "@/hooks/use-settings"

type ThemeProviderProps = {
    children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
    const { settings, loading } = useSettings()

    useEffect(() => {
        if (loading) return

        const root = window.document.documentElement

        const applyTheme = () => {
            const themeMode = settings["theme_mode"] || "system"

            root.classList.remove("light", "dark")
            let effectiveTheme: "light" | "dark" = "light"

            if (themeMode === "system") {
                effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
                    ? "dark"
                    : "light"
            } else {
                effectiveTheme = themeMode as "light" | "dark"
            }

            root.classList.add(effectiveTheme)
            root.style.colorScheme = effectiveTheme;
        };

        applyTheme();

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => {
            if (settings["theme_mode"] === "system") applyTheme();
        };

        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);

    }, [settings, loading])

    return <>{children}</>
}

