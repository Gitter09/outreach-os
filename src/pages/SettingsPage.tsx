import { useEffect, useState } from "react";
import { useErrors } from "@/hooks/use-errors";
import { toast } from "sonner";
import { useParams, useNavigate } from "react-router-dom";
import { EmailSettingsTab } from "@/components/settings/email-settings-tab";
import { SecuritySettingsTab } from "@/components/settings/security-settings-tab";
import { AboutTab } from "@/components/settings/about-tab";
import { PipelineSettingsTab } from "@/components/settings/pipeline-settings-tab";
import { KeyboardSettingsTab } from "@/components/settings/keyboard-settings-tab";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
    Sun,
    Moon,
    Monitor,
    Trash2,
    Database,
    Power,
    Upload,
} from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import type { ImportSummary } from "@/types/crm";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";

type SettingsTab = "email" | "appearance" | "pipeline" | "data" | "security" | "keyboard" | "about";

const tabTitles: Record<SettingsTab, string> = {
    email: "Email Integration",
    appearance: "Appearance",
    pipeline: "Pipeline",
    data: "Data",
    security: "Security",
    keyboard: "Shortcuts",
    about: "About",
};

export function SettingsPage() {
    const { tab } = useParams<{ tab?: string }>();
    const navigate = useNavigate();
    const activeTab = (tab as SettingsTab) || "appearance";

    const { settings, updateSetting } = useSettings();
    const { handleError } = useErrors();

    const [autostart, setAutostart] = useState(false);
    const [pendingImportPath, setPendingImportPath] = useState<string | null>(null);
    const [importLoading, setImportLoading] = useState(false);

    useEffect(() => {
        invoke<boolean>("is_background_service_enabled")
            .then(setAutostart)
            .catch(() => {});
    }, []);

    const handleAutostartToggle = async () => {
        try {
            if (autostart) {
                await invoke("disable_background_service");
                setAutostart(false);
                toast.success("Background service disabled");
            } else {
                await invoke("enable_background_service");
                setAutostart(true);
                toast.success("JobDex will run in the background on login");
            }
        } catch (error) {
            handleError(error, "Failed to toggle background service");
        }
    };

    useEffect(() => {
        if (!tab) {
            navigate("/settings/appearance", { replace: true });
        }
    }, [tab, navigate]);


    const handleSettingChange = (key: string, value: string) => {
        updateSetting(key, value);
    };


    const renderAppearanceContent = () => (
        <div className="space-y-8">
            <div>
                <h3 className="text-lg font-medium">Appearance</h3>
                <p className="text-sm text-muted-foreground">Customize how JobDex looks and feels.</p>
            </div>

            <Separator />

            {/* Theme Mode */}
            <div className="space-y-4">
                <Label className="text-sm font-semibold">Theme Mode</Label>
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { id: "light", label: "Light", icon: Sun },
                        { id: "dark", label: "Dark", icon: Moon },
                        { id: "system", label: "System", icon: Monitor },
                    ].map((t) => (
                        <button
                            key={t.id}
                            onClick={() => handleSettingChange("theme_mode", t.id)}
                            className={cn(
                                "flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all",
                                (settings["theme_mode"] || "system") === t.id
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : "border-transparent bg-muted/50 hover:bg-muted"
                            )}
                        >
                            <t.icon className="h-5 w-5" />
                            <span className="text-xs font-medium">{t.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <Separator />

            {/* Background Service */}
            <div className="space-y-4">
                <Label className="text-sm font-semibold">Background Service</Label>
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-md">
                            <Power className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-medium">Start on login</p>
                            <p className="text-xs text-muted-foreground">
                                Launch JobDex in the background when you start your computer.
                                Scheduled emails will send even when the window is closed.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant={autostart ? "default" : "outline"}
                        size="sm"
                        onClick={handleAutostartToggle}
                    >
                        {autostart ? "Enabled" : "Disabled"}
                    </Button>
                </div>
            </div>

        </div>
    );

    const handleExport = async () => {
        try {
            const filePath = await saveFileDialog({
                defaultPath: `jobdex-export-${new Date().toISOString().split("T")[0]}.json`,
                filters: [{ name: "JSON", extensions: ["json"] }],
            });
            if (!filePath) return;
            await invoke("export_all_data_to_path", { filePath });
            toast.success("Export saved.");
        } catch (error) {
            handleError(error, "Failed to export data");
        }
    };

    const [clearDialogOpen, setClearDialogOpen] = useState(false);

    const handleClearDatabase = async () => {
        setClearDialogOpen(false);
        try {
            await invoke("clear_all_data");
            toast.success("Database cleared. Reloading...");
            setTimeout(() => window.location.reload(), 1000);
        } catch (error) {
            handleError(error, "Failed to clear database");
        }
    };

    const handleRestoreClick = async () => {
        try {
            const selected = await openFileDialog({
                multiple: false,
                filters: [{ name: "JobDex Backup", extensions: ["json"] }],
            });
            if (selected && typeof selected === "string") {
                setPendingImportPath(selected);
            }
        } catch (error) {
            handleError(error, "Failed to open file picker");
        }
    };

    const handleRestoreConfirm = async () => {
        if (!pendingImportPath) return;
        setImportLoading(true);
        try {
            const result = await invoke<ImportSummary>("import_all_data", { filePath: pendingImportPath });
            const parts = [
                `${result.contactsAdded} contacts added`,
                `${result.contactsUpdated} updated`,
            ];
            if (result.statusesAdded > 0) parts.push(`${result.statusesAdded} statuses added`);
            if (result.tagsAdded > 0) parts.push(`${result.tagsAdded} tags added`);
            if (result.eventsRestored > 0) parts.push(`${result.eventsRestored} events restored`);
            if (result.templatesRestored > 0) parts.push(`${result.templatesRestored} templates restored`);
            if (result.signaturesRestored > 0) parts.push(`${result.signaturesRestored} signatures restored`);
            if (result.scheduledRestored > 0) parts.push(`${result.scheduledRestored} scheduled emails restored`);

            toast.success(`Import complete — ${parts.join(", ")}.`);
        } catch (error) {
            handleError(error, "Import failed. The file may be invalid or corrupted.");
        } finally {
            setImportLoading(false);
            setPendingImportPath(null);
        }
    };

    const renderDataContent = () => (
        <div className="space-y-8">
            <div>
                <h3 className="text-lg font-medium">Data Management</h3>
                <p className="text-sm text-muted-foreground">Export your data for backup or clear the database to start fresh.</p>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border rounded-lg p-6 space-y-4 bg-muted/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-md">
                            <Database className="h-5 w-5 text-primary" />
                        </div>
                        <h4 className="font-semibold">Export Data</h4>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Download a full snapshot of your CRM data, including contacts, pipeline statuses, and application settings in JSON format.
                    </p>
                    <Button variant="outline" className="w-full" onClick={handleExport}>
                        Generate Export
                    </Button>
                </div>

                <div className="border rounded-lg p-6 space-y-4 bg-muted/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-md">
                            <Upload className="h-5 w-5 text-primary" />
                        </div>
                        <h4 className="font-semibold">Restore from Backup</h4>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Restore contacts, statuses, and tags from a previously exported backup file. Email templates and signatures are not included in backups.
                    </p>
                    <Button variant="outline" className="w-full" onClick={handleRestoreClick}>
                        Choose backup file...
                    </Button>
                </div>

                <div className="border rounded-lg p-6 space-y-4 bg-destructive/5 border-destructive/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-destructive/10 rounded-md">
                            <Trash2 className="h-5 w-5 text-destructive" />
                        </div>
                        <h4 className="font-semibold text-destructive">Factory Reset</h4>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Permanently delete all contacts, tags, custom statuses, email accounts, templates, signatures, and contact events. Your app settings and API keys will remain untouched.
                    </p>
                    <Button variant="destructive" className="w-full" onClick={() => setClearDialogOpen(true)}>
                        Clear All Data
                    </Button>
                </div>
            </div>

            <AlertDialog open={!!pendingImportPath} onOpenChange={(open) => { if (!open) setPendingImportPath(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restore from backup?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will merge the backup into your existing data. Nothing will be deleted. Any new contacts, statuses, and tags in the file will be added.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={importLoading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRestoreConfirm} disabled={importLoading}>
                            {importLoading ? "Importing..." : "Restore"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clear all data?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete all contacts, statuses, tags, email accounts, templates, signatures, scheduled emails, and contact events. This action cannot be undone. Your app settings and API keys will remain untouched.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleClearDatabase}>
                            Clear All Data
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex gap-3">
                <Database className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="space-y-1">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Privacy Note</p>
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-normal">
                        Your data is stored locally in an SQLite database. JobDex does not upload your contacts to any server.
                    </p>
                </div>
            </div>
        </div>
    );


    const renderContent = () => {
        switch (activeTab) {
            case "email": return <EmailSettingsTab />;
            case "appearance": return renderAppearanceContent();
            case "pipeline": return <PipelineSettingsTab />;
            case "data": return renderDataContent();
            case "security": return <SecuritySettingsTab />;
            case "keyboard": return <KeyboardSettingsTab />;
            case "about": return <AboutTab />;
            default: return renderAppearanceContent();
        }
    };

    return (
        <div className="flex flex-col h-full relative">
            <PageHeader title={tabTitles[activeTab] || "Settings"} />
            <div className={`flex-1 overflow-auto p-6 w-full ${activeTab !== "about" ? "max-w-4xl" : ""}`}>
                {renderContent()}
            </div>
        </div>
    );
}
