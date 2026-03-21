import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KeyCombo } from "@/components/ui/key-combo";
import { useSettings } from "@/hooks/use-settings";
import {
    SHORTCUT_REGISTRY,
    ShortcutCategory,
    getEffectiveBinding,
} from "@/lib/keyboard-shortcuts";

interface ShortcutHelpDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const CATEGORIES: ShortcutCategory[] = ["Actions", "Navigation", "System"];

export function ShortcutHelpDialog({ open, onOpenChange }: ShortcutHelpDialogProps) {
    const { settings } = useSettings();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Keyboard Shortcuts</DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-[60vh] -mx-6 px-6">
                    <div className="space-y-6 py-2">
                        {CATEGORIES.map((category) => {
                            const shortcuts = SHORTCUT_REGISTRY.filter(
                                (s) => s.category === category
                            );
                            return (
                                <div key={category}>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                        {category}
                                    </p>
                                    <div className="space-y-1">
                                        {shortcuts.map((def) => {
                                            const binding = getEffectiveBinding(def, settings);
                                            return (
                                                <div
                                                    key={def.id}
                                                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                                                >
                                                    <span className="text-sm text-foreground/80">
                                                        {def.label}
                                                        {def.locationRestriction && (
                                                            <span className="ml-2 text-[10px] text-muted-foreground/60 font-medium">
                                                                contact page only
                                                            </span>
                                                        )}
                                                    </span>
                                                    <KeyCombo combo={binding} />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>

                <p className="text-xs text-muted-foreground pt-1 border-t">
                    Customize shortcuts in{" "}
                    <span className="font-medium text-foreground/70">Settings → Keyboard</span>
                </p>
            </DialogContent>
        </Dialog>
    );
}
