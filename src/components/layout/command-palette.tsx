import { useEffect, useState } from "react";
import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandShortcut,
} from "@/components/ui/command";
import {
    Users,
    Zap,
    Mail,
    Settings,
    FileSpreadsheet,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Contact } from "@/types/crm";

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onContactsChanged?: () => void;
    onOpenImport?: () => void;
    onOpenAddContact?: () => void;
    onSelectContact?: (id: string) => void;
    onOpenSettings?: () => void;
}

export function CommandPalette({ open, onOpenChange, onContactsChanged, onOpenImport, onOpenAddContact, onSelectContact, onOpenSettings }: CommandPaletteProps) {
    const [contacts, setContacts] = useState<Contact[]>([]);

    useEffect(() => {
        if (open) {
            invoke<Contact[]>("get_contacts")
                .then(setContacts)
                .catch(console.error);
        }
    }, [open]);

    const handleAction = async (action: string) => {
        console.log("Triggering action:", action);
        if (action === "scrape_clipboard") {
            try {
                const result = await invoke("scrape_clipboard");
                console.log("Scrape completed, contact ID:", result);
                onOpenChange(false);
                onContactsChanged?.();
            } catch (error) {
                console.error("Scrape failed:", error);
                alert(`Scrape failed: ${error}`);
            }
        } else if (action === "open_import") {
            onOpenChange(false);
            onOpenImport?.();
        } else if (action === "add_contact") {
            onOpenChange(false);
            onOpenAddContact?.();
        } else if (action.startsWith("view_contact_")) {
            const id = action.replace("view_contact_", "");
            onOpenChange(false);
            onSelectContact?.(id);
        } else if (action === "navigate_settings") {
            onOpenChange(false);
            onOpenSettings?.();
        } else {
            // e.g. navigate_...
            onOpenChange(false);
        }
    };

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup heading="Intelligence">
                    <CommandItem
                        onSelect={() => handleAction("scrape_clipboard")}
                        onPointerDown={(e) => e.preventDefault()}
                    >
                        <Zap className="mr-2 h-4 w-4 text-yellow-500" />
                        <span>Clipboard Intelligence</span>
                        <CommandShortcut>Magic Paste</CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        onSelect={() => handleAction("add_contact")}
                        onPointerDown={(e) => e.preventDefault()}
                    >
                        <Users className="mr-2 h-4 w-4" />
                        <span>Add New Contact</span>
                        <CommandShortcut>C</CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        onSelect={() => handleAction("open_import")}
                        onPointerDown={(e) => e.preventDefault()}
                    >
                        <FileSpreadsheet className="mr-2 h-4 w-4 text-green-500" />
                        <span>Import from File</span>
                        <CommandShortcut>CSV/XLS</CommandShortcut>
                    </CommandItem>
                </CommandGroup>

                {contacts.length > 0 && (
                    <CommandGroup heading="Contacts">
                        {contacts.map((contact) => (
                            <CommandItem
                                key={contact.id}
                                onSelect={() => handleAction(`view_contact_${contact.id}`)}
                                onPointerDown={(e) => e.preventDefault()}
                            >
                                <Users className="mr-2 h-4 w-4" />
                                <span>{contact.first_name} {contact.last_name}</span>
                                <span className="ml-2 text-xs text-muted-foreground">{contact.email}</span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                <CommandGroup heading="Navigation">
                    <CommandItem
                        onSelect={() => handleAction("navigate_sent")}
                        onPointerDown={(e) => e.preventDefault()}
                    >
                        <Mail className="mr-2 h-4 w-4" />
                        <span>Sent Campaigns</span>
                    </CommandItem>
                    <CommandItem
                        onSelect={() => handleAction("navigate_settings")}
                        onPointerDown={(e) => e.preventDefault()}
                    >
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                    </CommandItem>
                </CommandGroup>
            </CommandList>

            <div className="flex items-center justify-between border-t border-t-accent px-4 py-2 bg-muted/30">
                <div className="flex gap-4">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Local-First</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span>Press</span>
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                        Enter
                    </kbd>
                    <span>to select</span>
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 ml-2">
                        Esc
                    </kbd>
                    <span>to close</span>
                </div>
            </div>
        </CommandDialog>
    );
}
