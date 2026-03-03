import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { EmailSettingsTab } from "@/components/settings/email-settings-tab";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
    CheckCircle2,
    Sun,
    Moon,
    Monitor,
    Trash2,
    Database,
} from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { PageHeader } from "@/components/layout/page-header";

type SettingsTab = "email" | "appearance" | "pipeline" | "data";

const tabTitles: Record<SettingsTab, string> = {
    email: "Email Integration",
    appearance: "Appearance",
    pipeline: "Pipeline",
    data: "Data",
};

export function SettingsPage() {
    const { tab } = useParams<{ tab?: string }>();
    const navigate = useNavigate();
    const activeTab = (tab as SettingsTab) || "appearance";

    const { settings, loading, updateSetting } = useSettings();

    // Redirect /settings to /settings/ai
    useEffect(() => {
        if (!tab) {
            navigate("/settings/appearance", { replace: true });
        }
    }, [tab, navigate]);

    // Sync from settings hook
    useEffect(() => {
        if (!loading) {
            // Placeholder for future manual settings sync
        }
    }, [settings, loading]);


    const handleSettingChange = (key: string, value: string) => {
        updateSetting(key, value);
    };


    const renderAppearanceContent = () => (
        <div className="space-y-8">
            <div>
                <h3 className="text-lg font-medium">Appearance</h3>
                <p className="text-sm text-muted-foreground">Customize how OutreachOS looks and feels.</p>
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

            {/* Accent Color */}
            <div className="space-y-4">
                <Label className="text-sm font-semibold">Accent Color</Label>
                <div className="flex flex-wrap gap-3">
                    {[
                        { name: "Blue", hex: "#3b82f6" },
                        { name: "Green", hex: "#22c55e" },
                        { name: "Purple", hex: "#a855f7" },
                        { name: "Orange", hex: "#f97316" },
                        { name: "Pink", hex: "#ec4899" },
                        { name: "Indigo", hex: "#6366f1" },
                        { name: "Red", hex: "#ef4444" },
                    ].map((color) => (
                        <button
                            key={color.hex}
                            onClick={() => handleSettingChange("theme_color", color.hex)}
                            className={cn(
                                "w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center",
                                settings["theme_color"] === color.hex
                                    ? "border-foreground scale-110 shadow-md"
                                    : "border-transparent hover:scale-105"
                            )}
                            style={{ backgroundColor: color.hex }}
                            title={color.name}
                        >
                            {settings["theme_color"] === color.hex && (
                                <CheckCircle2 className="h-4 w-4 text-white drop-shadow-sm" />
                            )}
                        </button>
                    ))}

                    {/* Custom Color Input */}
                    <div className="relative">
                        <button
                            className={cn(
                                "w-10 h-10 rounded-full border-2 transition-all bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500",
                                ![
                                    "#3b82f6", "#22c55e", "#a855f7", "#f97316", "#ec4899", "#6366f1", "#ef4444"
                                ].includes(settings["theme_color"] || "#3b82f6")
                                    ? "border-foreground scale-110"
                                    : "border-transparent"
                            )}
                            onClick={() => (document.getElementById("custom-accent-color") as HTMLInputElement)?.click()}
                        />
                        <input
                            id="custom-accent-color"
                            type="color"
                            className="absolute inset-0 opacity-0 pointer-events-none"
                            value={settings["theme_color"] || "#3b82f6"}
                            onChange={(e) => handleSettingChange("theme_color", e.target.value)}
                        />
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">Choose a primary color for buttons, highlights, and active states.</p>
            </div>
        </div>
    );

    const handleExport = async () => {
        try {
            const data = await invoke<string>("export_all_data");
            const blob = new Blob([data], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `outreach-os-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export failed:", error);
            alert("Failed to export data");
        }
    };

    const handleClearDatabase = async () => {
        if (!confirm("Are you sure? This will delete all contacts, statuses, and tags. This action cannot be undone.")) {
            return;
        }
        try {
            await invoke("clear_all_data");
            alert("Database cleared successfully. The app will now reload.");
            window.location.reload();
        } catch (error) {
            console.error("Clear failed:", error);
            alert("Failed to clear database");
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

                <div className="border rounded-lg p-6 space-y-4 bg-destructive/5 border-destructive/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-destructive/10 rounded-md">
                            <Trash2 className="h-5 w-5 text-destructive" />
                        </div>
                        <h4 className="font-semibold text-destructive">Factory Reset</h4>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Permanently delete all contacts, tags, and custom statuses. Your settings and API keys will remain untouched.
                    </p>
                    <Button variant="destructive" className="w-full" onClick={handleClearDatabase}>
                        Clear All Data
                    </Button>
                </div>
            </div>

            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex gap-3">
                <Database className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="space-y-1">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Privacy Note</p>
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-normal">
                        Your data is stored locally in an SQLite database. OutreachOS does not upload your contacts to any server.
                    </p>
                </div>
            </div>
        </div>
    );


    const renderContent = () => {
        switch (activeTab) {
            case "email": return <EmailSettingsTab />;
            case "appearance": return renderAppearanceContent();
            case "pipeline": return <div className="p-4 text-muted-foreground">Pipeline configuration coming soon.</div>;
            case "data": return renderDataContent();
            default: return renderAppearanceContent();
        }
    };

    return (
        <div className="flex flex-col h-full relative">
            <PageHeader title={tabTitles[activeTab] || "Settings"} />
            <div className="flex-1 overflow-auto p-6 max-w-4xl w-full">
                {renderContent()}
            </div>
        </div>
    );
}
