import { comboToDisplay } from "@/lib/keyboard-shortcuts";
import { cn } from "@/lib/utils";

interface KeyComboProps {
    combo: string; // storage format: "Meta+Shift+k"
    className?: string;
}

/**
 * Renders a keyboard shortcut combo as styled <kbd> elements.
 * "Meta+Shift+k" → [⌘] [⇧] [K] on macOS
 */
export function KeyCombo({ combo, className }: KeyComboProps) {
    const display = comboToDisplay(combo);
    if (!display) return null;

    // Split display string back into individual tokens for per-key styling.
    // On Mac: "⌘⇧K" is a single concatenated string — split by known symbols.
    // On other: "Ctrl+Shift+K" — split by "+".
    const isMac = display.includes("⌘") || display.includes("⇧") || display.includes("⌥") || display.includes("⌃");

    let tokens: string[];
    if (isMac) {
        // Split each character that is a symbol or uppercase/digit as its own token
        tokens = display.split("").filter(c => c.trim() !== "");
        // But group multi-char sequences like "Ctrl" — only needed on non-mac, handled below
    } else {
        // "Ctrl+Shift+K" — split on "+" but be careful not to split a "+" key itself
        tokens = display.split("+").filter(Boolean);
    }

    return (
        <span className={cn("inline-flex items-center gap-0.5", className)}>
            {tokens.map((token, i) => (
                <kbd
                    key={i}
                    className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 text-[11px] font-mono font-medium rounded border bg-muted text-muted-foreground border-border/60 leading-none"
                >
                    {token}
                </kbd>
            ))}
        </span>
    );
}
