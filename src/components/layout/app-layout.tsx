import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "./app-sidebar";
import { CommandPalette } from "./command-palette";
import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { ImportDialog } from "@/components/import/import-dialog";

export function AppLayout() {
    const [commandOpen, setCommandOpen] = useState(false);
    const [addContactOpen, setAddContactOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [newContactStatusId, setNewContactStatusId] = useState<string | undefined>(undefined);
    const location = useLocation();
    const navigate = useNavigate();

    const isSettings = location.pathname.startsWith("/settings");

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                if (isSettings) return;
                e.preventDefault();
                setCommandOpen((open) => !open);
            }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, [isSettings]);

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background font-sans antialiased text-foreground">
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
                onOpenSettings={() => navigate("/settings")}
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
        </div>
    );
}
