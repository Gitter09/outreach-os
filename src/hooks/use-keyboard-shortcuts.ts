import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useSettings } from "@/hooks/use-settings";
import {
    SHORTCUT_REGISTRY,
    ShortcutActionId,
    matchesCombo,
    getEffectiveBinding,
} from "@/lib/keyboard-shortcuts";

export type ShortcutActionMap = Partial<Record<ShortcutActionId, () => void | Promise<void>>>;

const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isInInput(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;
    if (INPUT_TAGS.has(target.tagName)) return true;
    if (target.getAttribute("contenteditable") === "true") return true;
    return false;
}

/**
 * Global keyboard shortcut dispatcher.
 * Reads live bindings from settings (with defaults fallback) and dispatches
 * to the provided action map.
 *
 * Pass a stable `actions` map (via useMemo at the call site) to avoid
 * re-registering the event listener on every render.
 */
export function useKeyboardShortcuts(actions: ShortcutActionMap): void {
    const { settings } = useSettings();
    const location = useLocation();

    // Pre-compute effective bindings when settings change
    const effectiveBindings = useMemo(() => {
        return SHORTCUT_REGISTRY.map((def) => ({
            def,
            binding: getEffectiveBinding(def, settings),
        }));
    }, [settings]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Skip held keys
            if (e.repeat) return;

            // Skip when typing in an input
            if (isInInput(e.target)) return;

            for (const { def, binding } of effectiveBindings) {
                if (!matchesCombo(e, binding)) continue;

                // Block all shortcuts on /settings routes (capture mode coexistence),
                // except command_palette which should work everywhere
                if (location.pathname.startsWith("/settings") && def.id !== "command_palette") continue;

                e.preventDefault();

                // Location restriction check
                if (def.locationRestriction) {
                    if (!def.locationRestriction.pattern.test(location.pathname)) {
                        toast.info(def.locationRestriction.toastMessage);
                        return;
                    }
                }

                const action = actions[def.id];
                if (action) {
                    void action();
                }
                return; // Only fire the first matching shortcut
            }
        };

        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [effectiveBindings, actions, location.pathname]);
}
