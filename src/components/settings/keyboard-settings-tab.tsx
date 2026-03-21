import { useState, useEffect, useRef } from "react";
import { RotateCcw, MapPin } from "lucide-react";
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

// ─── ShortcutRow ─────────────────────────────────────────────────────────────

interface ShortcutRowProps {
    def: ShortcutDefinition;
}

function ShortcutRow({ def }: ShortcutRowProps) {
    const { settings, updateSetting } = useSettings();
    const [capturing, setCapturing] = useState(false);
    const [conflict, setConflict] = useState<string | null>(null);
    const captureRef = useRef<HTMLDivElement>(null);

    const effectiveBinding = getEffectiveBinding(def, settings);
    const isCustomized =
        settings[def.settingsKey] !== undefined &&
        settings[def.settingsKey] !== def.defaultBinding;

    function startCapture() {
        setCapturing(true);
        setConflict(null);
        // Focus the capture div so keydown fires on it
        setTimeout(() => captureRef.current?.focus(), 0);
    }

    function cancelCapture() {
        setCapturing(false);
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

            const combo = eventToCombo(e);
            if (!combo) return; // modifier-only keypress

            // Conflict check — compare against all other actions' effective bindings
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
            updateSetting(def.settingsKey, combo);
        };

        // Use capture phase so stopPropagation prevents the global shortcut hook from also firing
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
                        <div
                            ref={captureRef}
                            tabIndex={0}
                            onBlur={cancelCapture}
                            className="inline-flex items-center h-6 px-2 text-xs text-muted-foreground border border-dashed border-primary/60 rounded bg-primary/5 outline-none cursor-text min-w-[80px] justify-center"
                        >
                            Press keys…
                        </div>
                    ) : (
                        <button
                            onClick={startCapture}
                            title="Click to reassign"
                            className="focus:outline-none"
                        >
                            <KeyCombo combo={effectiveBinding} />
                        </button>
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
                    <h3 className="text-lg font-medium">Keyboard Shortcuts</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Click any shortcut badge to reassign it. Press Esc to cancel.
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
