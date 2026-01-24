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
            const accentColor = settings["theme_color"] || "#3b82f6"

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

            // Apply Accent Color
            const hsl = hexToHSL(accentColor);
            let styleTag = document.getElementById('dynamic-theme-overrides');
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'dynamic-theme-overrides';
                document.head.appendChild(styleTag);
            }

            // Split HSL for accent variation
            const parts = hsl.split(' ');
            const h = parts[0];
            const s = parts[1];
            const l = parts[2].replace('%', '');
            const accentL = parseInt(l) > 50 ? '90%' : '20%';

            styleTag.innerHTML = `
              :root, .dark {
                --primary: ${hsl} !important;
                --ring: ${hsl} !important;
                --accent: ${h} ${s} ${accentL} !important;
              }
              ::selection {
                background: hsla(${h}, ${s.replace('%', '')}%, ${l}%, 0.3);
              }
            `;
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

// Helper to convert hex to shadcn-style CSS variable (H S% L%)
function hexToHSL(hex: string): string {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }

    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
