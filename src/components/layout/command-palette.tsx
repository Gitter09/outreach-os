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
    FileSpreadsheet,
    Palette,
    PlugZap,
    Kanban,
    Database,
    Shield,
    Keyboard,
    Info,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Contact } from "@/types/crm";
import { useErrors } from "@/hooks/use-errors";

const SETTINGS_DESTINATIONS = [
    { id: "appearance", label: "Appearance",         hint: "Theme & display",        icon: Palette,   path: "/settings/appearance" },
    { id: "email",      label: "Email Integration",  hint: "Gmail · Outlook",        icon: PlugZap,   path: "/settings/email" },
    { id: "pipeline",   label: "Pipeline",           hint: "Stages & statuses",      icon: Kanban,    path: "/settings/pipeline" },
    { id: "security",   label: "Security",           hint: "Encryption & password",  icon: Shield,    path: "/settings/security" },
    { id: "keyboard",   label: "Keyboard Shortcuts", hint: "Customize bindings",     icon: Keyboard,  path: "/settings/keyboard" },
    { id: "data",       label: "Data",               hint: "Export · factory reset", icon: Database,  path: "/settings/data" },
    { id: "about",      label: "About",              hint: "Version & release notes",icon: Info,      path: "/settings/about" },
] as const;

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onContactsChanged?: () => void;
    onOpenImport?: () => void;
    onOpenAddContact?: () => void;
    onSelectContact?: (id: string) => void;
    onNavigateTo?: (path: string) => void;
}

export function CommandPalette({ open, onOpenChange, onOpenImport, onOpenAddContact, onSelectContact, onNavigateTo }: CommandPaletteProps) {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const { handleError } = useErrors();

    useEffect(() => {
        if (open) {
            invoke<Contact[]>("get_contacts")
                .then(setContacts)
                .catch((err) => handleError(err, "Failed to load contacts"));
        }
    }, [open, handleError]);

    const handleAction = (action: string) => {
        if (action === "open_import") {
            onOpenChange(false);
            onOpenImport?.();
        } else if (action === "add_contact") {
            onOpenChange(false);
            onOpenAddContact?.();
        } else if (action.startsWith("view_contact_")) {
            const id = action.replace("view_contact_", "");
            onOpenChange(false);
            onSelectContact?.(id);
        } else if (action.startsWith("navigate_settings_")) {
            const path = action.replace("navigate_settings_", "");
            onOpenChange(false);
            onNavigateTo?.(path);
        } else {
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

                <CommandGroup heading="Settings">
                    {SETTINGS_DESTINATIONS.map(({ id, label, hint, icon: Icon, path }) => (
                        <CommandItem
                            key={id}
                            onSelect={() => handleAction(`navigate_settings_${path}`)}
                            onPointerDown={(e) => e.preventDefault()}
                        >
                            <Icon className="mr-2 h-4 w-4" />
                            <span>{label}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{hint}</span>
                        </CommandItem>
                    ))}
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
