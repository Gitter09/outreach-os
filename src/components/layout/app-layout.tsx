import { useState, useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "./app-sidebar";
import { CommandPalette } from "./command-palette";
import { ShortcutHelpDialog } from "./shortcut-help-dialog";
import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { ImportDialog } from "@/components/import/import-dialog";
import { ComposeEmailDialog } from "@/components/email/compose-email-dialog";
import { WhatsNewModal } from "@/components/whats-new-modal";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useKeyboardShortcuts, ShortcutActionMap } from "@/hooks/use-keyboard-shortcuts";
import type { Contact } from "@/types/crm";

function isNewerVersion(remote: string, current: string): boolean {
    const parse = (v: string) => v.split(".").map(Number);
    const [rM, rm, rp] = parse(remote);
    const [cM, cm, cp] = parse(current);
    if (rM !== cM) return rM > cM;
    if (rm !== cm) return rm > cm;
    return rp > cp;
}

export function AppLayout() {
    const [commandOpen, setCommandOpen] = useState(false);
    const [addContactOpen, setAddContactOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [composeEmailOpen, setComposeEmailOpen] = useState(false);
    const [composeContact, setComposeContact] = useState<Contact | null>(null);
    const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [newContactStatusId, setNewContactStatusId] = useState<string | undefined>(undefined);
    const [whatsNewOpen, setWhatsNewOpen] = useState(false);
    const [onboardingOpen, setOnboardingOpen] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
    const [updateDismissed, setUpdateDismissed] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const shortcutActions = useMemo<ShortcutActionMap>(() => ({
        command_palette: () => setCommandOpen((o) => !o),
        new_contact: () => setAddContactOpen(true),
        compose_email: async () => {
            const id = location.pathname.split("/")[2];
            try {
                const c = await invoke<Contact>("get_contact_by_id", { id });
                setComposeContact(c);
            } catch {
                setComposeContact(null);
            }
            setComposeEmailOpen(true);
        },
        open_settings: () => navigate("/settings"),
        import_contacts: () => setImportOpen(true),
        shortcut_help: () => setShortcutHelpOpen((o) => !o),
        nav_dashboard: () => navigate("/"),
        nav_people: () => navigate("/people"),
        nav_emails: () => navigate("/emails"),
        nav_tasks: () => navigate("/tasks"),
        nav_templates: () => navigate("/templates"),
    }), [navigate, location.pathname]);

    useKeyboardShortcuts(shortcutActions);

    useEffect(() => {
        async function checkVersions() {
            try {
                const currentVersion = await getVersion();

                // Onboarding vs What's New priority
                const settings = await invoke<Record<string, string>>("get_settings");
                const onboardingDone = settings["onboarding_complete"] === "true";
                const lastSeen = settings["last_seen_version"];

                if (!onboardingDone || import.meta.env.DEV) {
                    // True first launch → show onboarding
                    // DEV: always show for iteration
                    setOnboardingOpen(true);
                } else if (!lastSeen || lastSeen !== currentVersion) {
                    // Returning user, new version → show What's New
                    setWhatsNewOpen(true);
                }

                // Update check: ask Rust to fetch the latest GitHub release tag
                const latestTag = await invoke<string>("check_for_update");
                if (latestTag && isNewerVersion(latestTag, currentVersion)) {
                    setUpdateAvailable(latestTag);
                }
            } catch {
                // Silently ignore — update check is best-effort
            }
        }
        checkVersions();
    }, []);

    const handleWhatsNewClose = async (open: boolean) => {
        setWhatsNewOpen(open);
        if (!open) {
            try {
                const v = await getVersion();
                await invoke("save_setting", { key: "last_seen_version", value: v });
            } catch {
                // ignore
            }
        }
    };

    const handleOnboardingComplete = async (action: "import" | "add_contact" | "explore") => {
        setOnboardingOpen(false);

        // DEV: show What's New after onboarding so it can be iterated on
        if (import.meta.env.DEV) {
            setWhatsNewOpen(true);
        }

        try {
            const v = await getVersion();
            await invoke("save_setting", { key: "onboarding_complete", value: "true" });
            await invoke("save_setting", { key: "last_seen_version", value: v });
        } catch {
            // best-effort
        }

        // Post-onboarding hint toast
        const isMac = navigator.platform.toUpperCase().includes("MAC");
        const key = isMac ? "\u2318K" : "Ctrl+K";
        setTimeout(() => {
            toast(`press ${key} anytime \u2014 it finds everything.`, { duration: 5000 });
        }, 800);

        // Trigger the user's chosen action
        if (action === "import") {
            setImportOpen(true);
        } else if (action === "add_contact") {
            setAddContactOpen(true);
        }
    };

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background font-sans antialiased text-foreground">
            {updateAvailable && !updateDismissed && (
                <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground text-sm flex items-center justify-between px-4 py-2">
                    <span>v{updateAvailable} is out — a few things got better.</span>
                    <div className="flex items-center gap-4">
                        <button
                            className="underline underline-offset-2 hover:opacity-80 transition-opacity font-medium"
                            onClick={() => invoke("open_external_url", { url: "https://github.com/Gitter09/jobdex/releases/latest" })}
                        >
                            Get it
                        </button>
                        <button
                            className="opacity-70 hover:opacity-100 transition-opacity"
                            onClick={() => setUpdateDismissed(true)}
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}
            <AppSidebar />
            <main className="flex-1 overflow-y-auto relative">
                <Outlet context={{
                    commandOpen,
                    setCommandOpen,
                    addContactOpen,
                    setAddContactOpen,
                    importOpen,
                    setImportOpen,
                    refreshTrigger,
                    handleRefresh,
                    setNewContactStatusId,
                }} />
            </main>

            {/* Global Dialogs */}
            <CommandPalette
                open={commandOpen}
                onOpenChange={setCommandOpen}
                onContactsChanged={handleRefresh}
                onOpenImport={() => setImportOpen(true)}
                onOpenAddContact={() => setAddContactOpen(true)}
                onSelectContact={(id) => navigate(`/people/${id}`)}
                onNavigateTo={(path) => navigate(path)}
            />
            <AddContactDialog
                open={addContactOpen}
                onOpenChange={(open) => {
                    setAddContactOpen(open);
                    if (!open) setNewContactStatusId(undefined);
                }}
                onContactAdded={handleRefresh}
                initialStatusId={newContactStatusId}
            />
            <ImportDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                onImportComplete={handleRefresh}
            />
            <WhatsNewModal open={whatsNewOpen} onOpenChange={handleWhatsNewClose} />
            <ComposeEmailDialog
                contact={composeContact}
                open={composeEmailOpen}
                onOpenChange={(open) => {
                    setComposeEmailOpen(open);
                    if (!open) setComposeContact(null);
                }}
            />
            <ShortcutHelpDialog open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />

            {/* Onboarding — first launch only, z-60 (below lock screen z-100) */}
            {onboardingOpen && <OnboardingFlow onComplete={handleOnboardingComplete} />}
        </div>
    );
}
