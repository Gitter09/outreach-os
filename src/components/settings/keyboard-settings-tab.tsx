import { useState, useEffect, useRef } from "react";
import { RotateCcw, MapPin, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { KeyCombo } from "@/components/ui/key-combo";
import { useSettings } from "@/hooks/use-settings";
import {
    SHORTCUT_REGISTRY,
    ShortcutCategory,
    ShortcutDefinition,
    eventToCombo,
    comboToDisplay,
    getEffectiveBinding,
} from "@/lib/keyboard-shortcuts";

const CATEGORIES: ShortcutCategory[] = ["Actions", "Navigation", "System"];

/**
 * Build a display combo from a KeyboardEvent, including modifier-only presses.
 * Used for live preview during capture — unlike eventToCombo, this does NOT
 * skip modifier-only keypresses so users see [⌘] [⇧] as they hold modifiers.
 */
function eventToLiveCombo(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.metaKey || e.ctrlKey) parts.push("Meta");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    const key = e.key;
    if (!["Meta", "Control", "Alt", "Shift"].includes(key)) {
        parts.push(key.toLowerCase());
    }
    return parts.join("+");
}

// ─── ShortcutRow ─────────────────────────────────────────────────────────────

interface ShortcutRowProps {
    def: ShortcutDefinition;
}

function ShortcutRow({ def }: ShortcutRowProps) {
    const { settings, updateSetting } = useSettings();
    const [capturing, setCapturing] = useState(false);
    const [liveCombo, setLiveCombo] = useState("");
    const [conflict, setConflict] = useState<string | null>(null);
    const captureRef = useRef<HTMLDivElement>(null);

    const effectiveBinding = getEffectiveBinding(def, settings);
    const isCustomized =
        settings[def.settingsKey] !== undefined &&
        settings[def.settingsKey] !== def.defaultBinding;

    function startCapture() {
        setCapturing(true);
        setLiveCombo("");
        setConflict(null);
        setTimeout(() => captureRef.current?.focus(), 0);
    }

    function cancelCapture() {
        setCapturing(false);
        setLiveCombo("");
        setConflict(null);
    }

    async function handleReset() {
        await updateSetting(def.settingsKey, def.defaultBinding);
    }

    useEffect(() => {
        if (!capturing) return;

        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === "Escape") {
                cancelCapture();
                return;
            }

            // Update live display on every keydown (including modifier-only)
            setLiveCombo(eventToLiveCombo(e));

            const combo = eventToCombo(e);
            if (!combo) return; // modifier-only — keep showing partial combo, wait for key

            // Conflict check
            const conflictDef = SHORTCUT_REGISTRY.find(
                (other) =>
                    other.id !== def.id &&
                    getEffectiveBinding(other, settings) === combo
            );

            if (conflictDef) {
                setConflict(`Already used by "${conflictDef.label}"`);
                return;
            }

            setConflict(null);
            setCapturing(false);
            setLiveCombo("");
            updateSetting(def.settingsKey, combo);
        };

        document.addEventListener("keydown", handler, true);
        return () => document.removeEventListener("keydown", handler, true);
    }, [capturing, def, settings, updateSetting]);

    return (
        <TooltipProvider delayDuration={0}>
            <div className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/40 transition-colors group">
                {/* Label */}
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-foreground/80 truncate">{def.label}</span>
                    {def.locationRestriction && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <MapPin className="h-3 w-3 text-muted-foreground/50 shrink-0 cursor-default" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-xs">
                                Contact detail page only
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 shrink-0">
                    {conflict && (
                        <span className="text-xs text-destructive">{conflict}</span>
                    )}

                    {capturing ? (
                        /* Capture box: shows live keys as they're pressed */
                        <div
                            ref={captureRef}
                            tabIndex={0}
                            onBlur={cancelCapture}
                            className="inline-flex items-center justify-center h-7 min-w-[90px] px-2 border border-dashed border-primary/60 rounded bg-primary/5 outline-none"
                        >
                            {liveCombo ? (
                                <KeyCombo combo={liveCombo} />
                            ) : (
                                <span className="text-[11px] text-muted-foreground italic">
                                    Press keys…
                                </span>
                            )}
                        </div>
                    ) : (
                        /* Badge: click to enter capture mode */
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={startCapture}
                                    className="group/badge relative inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
                                >
                                    <KeyCombo combo={effectiveBinding} />
                                    <Pencil className="h-2.5 w-2.5 text-muted-foreground/40 opacity-0 group-hover/badge:opacity-100 transition-opacity" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">
                                Click to reassign
                            </TooltipContent>
                        </Tooltip>
                    )}

                    {isCustomized && !capturing && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={handleReset}
                                    className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
                                    aria-label="Reset to default"
                                >
                                    <RotateCcw className="h-3 w-3" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">
                                Reset to {comboToDisplay(def.defaultBinding)}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
}

// ─── KeyboardSettingsTab ──────────────────────────────────────────────────────

export function KeyboardSettingsTab() {
    const { updateSetting } = useSettings();

    async function handleResetAll() {
        await Promise.all(
            SHORTCUT_REGISTRY.map((def) => updateSetting(def.settingsKey, def.defaultBinding))
        );
        toast.success("Shortcuts reset to defaults.");
    }

    return (
        <div className="space-y-8">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-lg font-medium">Shortcuts</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Click any shortcut to reassign it. Press Esc to cancel.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleResetAll}>
                    Reset all
                </Button>
            </div>

            <Separator />

            <div className="space-y-8">
                {CATEGORIES.map((category) => {
                    const shortcuts = SHORTCUT_REGISTRY.filter(
                        (s) => s.category === category
                    );
                    return (
                        <div key={category}>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
                                {category}
                            </p>
                            <div>
                                {shortcuts.map((def) => (
                                    <ShortcutRow key={def.id} def={def} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
