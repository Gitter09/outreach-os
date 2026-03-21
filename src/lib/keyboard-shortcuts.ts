// Central registry for all keyboard shortcuts.
// Pure TS — no React imports. Safe to use in non-component contexts.

export type ShortcutActionId =
    | "command_palette"
    | "new_contact"
    | "compose_email"
    | "open_settings"
    | "nav_dashboard"
    | "nav_people"
    | "nav_emails"
    | "nav_tasks"
    | "nav_templates"
    | "import_contacts"
    | "shortcut_help";

export type ShortcutCategory = "Navigation" | "Actions" | "System";

export interface ShortcutDefinition {
    id: ShortcutActionId;
    label: string;
    category: ShortcutCategory;
    defaultBinding: string; // e.g. "Meta+k"
    settingsKey: string;    // e.g. "shortcut.command_palette"
    locationRestriction?: {
        pattern: RegExp;
        toastMessage: string;
    };
}

// Canonical shortcut registry. Order within a category determines display order.
export const SHORTCUT_REGISTRY: ShortcutDefinition[] = [
    // System
    {
        id: "command_palette",
        label: "Command Palette",
        category: "System",
        defaultBinding: "Meta+k",
        settingsKey: "shortcut.command_palette",
    },
    {
        id: "shortcut_help",
        label: "Keyboard Shortcuts Help",
        category: "System",
        defaultBinding: "Meta+/",
        settingsKey: "shortcut.shortcut_help",
    },
    {
        id: "open_settings",
        label: "Settings",
        category: "System",
        defaultBinding: "Meta+,",
        settingsKey: "shortcut.open_settings",
    },
    // Actions
    {
        id: "new_contact",
        label: "New Contact",
        category: "Actions",
        defaultBinding: "Meta+n",
        settingsKey: "shortcut.new_contact",
    },
    {
        id: "compose_email",
        label: "Compose Email",
        category: "Actions",
        defaultBinding: "Meta+Shift+c",
        settingsKey: "shortcut.compose_email",
        locationRestriction: {
            pattern: /^\/people\/[^/]+$/,
            toastMessage: "I knew you would try this! This shortcut only works on a contact's page.",
        },
    },
    {
        id: "import_contacts",
        label: "Import Contacts",
        category: "Actions",
        defaultBinding: "Meta+i",
        settingsKey: "shortcut.import_contacts",
    },
    // Navigation
    {
        id: "nav_dashboard",
        label: "Dashboard",
        category: "Navigation",
        defaultBinding: "Meta+1",
        settingsKey: "shortcut.nav_dashboard",
    },
    {
        id: "nav_people",
        label: "People",
        category: "Navigation",
        defaultBinding: "Meta+2",
        settingsKey: "shortcut.nav_people",
    },
    {
        id: "nav_emails",
        label: "Emails",
        category: "Navigation",
        defaultBinding: "Meta+3",
        settingsKey: "shortcut.nav_emails",
    },
    {
        id: "nav_tasks",
        label: "Tasks",
        category: "Navigation",
        defaultBinding: "Meta+4",
        settingsKey: "shortcut.nav_tasks",
    },
    {
        id: "nav_templates",
        label: "Templates",
        category: "Navigation",
        defaultBinding: "Meta+5",
        settingsKey: "shortcut.nav_templates",
    },
];

// ─── Utility functions ───────────────────────────────────────────────────────

const isMac = (): boolean =>
    typeof navigator !== "undefined" &&
    (navigator.platform?.startsWith("Mac") || navigator.userAgent?.includes("Mac"));

/**
 * Convert a KeyboardEvent to the canonical storage string.
 * e.g. Cmd+Shift+N → "Meta+Shift+n"
 * Treats metaKey and ctrlKey as equivalent "Meta" for cross-platform storage.
 */
export function eventToCombo(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.metaKey || e.ctrlKey) parts.push("Meta");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    const key = e.key;
    // Ignore modifier-only keypresses
    if (["Meta", "Control", "Alt", "Shift"].includes(key)) return "";

    parts.push(key.toLowerCase());
    return parts.join("+");
}

/**
 * Convert a stored combo string to a human-readable display string.
 * "Meta+Shift+k" → "⌘⇧K" on macOS, "Ctrl+Shift+K" elsewhere.
 */
export function comboToDisplay(combo: string): string {
    if (!combo) return "";
    const tokens = combo.split("+");
    const mac = isMac();

    return tokens
        .map((token) => {
            if (token === "Meta") return mac ? "⌘" : "Ctrl";
            if (token === "Shift") return mac ? "⇧" : "Shift+";
            if (token === "Alt") return mac ? "⌥" : "Alt+";
            if (token === "Ctrl") return mac ? "⌃" : "Ctrl+";
            // Single character key — uppercase it for display
            if (token.length === 1) return token.toUpperCase();
            return token;
        })
        .join(mac ? "" : "+");
}

/**
 * Check whether a KeyboardEvent matches a stored combo string.
 * "Meta" in the combo matches e.metaKey || e.ctrlKey (cross-platform).
 */
export function matchesCombo(e: KeyboardEvent, combo: string): boolean {
    if (!combo) return false;
    const tokens = combo.split("+");
    const key = tokens[tokens.length - 1]; // last token is the key
    const mods = tokens.slice(0, -1);

    const wantsMeta = mods.includes("Meta");
    const wantsShift = mods.includes("Shift");
    const wantsAlt = mods.includes("Alt");

    const hasMeta = e.metaKey || e.ctrlKey;
    if (wantsMeta !== hasMeta) return false;
    if (wantsShift !== e.shiftKey) return false;
    if (wantsAlt !== e.altKey) return false;

    return e.key.toLowerCase() === key.toLowerCase();
}

/**
 * Get the effective binding for a shortcut definition.
 * Returns the user's stored override if set, otherwise the default.
 */
export function getEffectiveBinding(
    def: ShortcutDefinition,
    settings: Record<string, string | undefined>
): string {
    return settings[def.settingsKey] ?? def.defaultBinding;
}
