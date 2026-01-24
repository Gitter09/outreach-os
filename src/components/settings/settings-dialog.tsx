import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    Brain,
    Palette,
    LayoutTemplate,
    Database,
    Key,
    Save,
    CheckCircle2,
    Loader2,
    Sun,
    Moon,
    Monitor,
    Trash2,
    FileCode
} from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type Tab = "ai" | "appearance" | "pipeline" | "data" | "prompts";

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    const [activeTab, setActiveTab] = useState<Tab>("ai");
    const { settings, loading, updateSetting } = useSettings();
    const [apiKey, setApiKey] = useState("");
    const [savingKey, setSavingKey] = useState(false);
    const [keySaved, setKeySaved] = useState(false);

    // AI Form State
    const [aiProvider, setAiProvider] = useState("gemini");
    const [aiModel, setAiModel] = useState("");
    const [aiBaseUrl, setAiBaseUrl] = useState("");

    // Sync from settings hook
    useEffect(() => {
        if (!loading) {
            setAiProvider(settings["ai_provider"] || "gemini");
            setAiModel(settings["ai_model"] || "google/gemini-2.0-flash-exp:free");
            setAiBaseUrl(settings["ai_base_url"] || "https://openrouter.ai/api/v1");
        }
    }, [settings, loading]);

    const handleSaveKey = async () => {
        if (!apiKey) return;
        setSavingKey(true);
        try {
            // Save to keyring
            let serviceName = "OPENROUTER_API_KEY";
            if (aiProvider === "gemini") serviceName = "GEMINI_API_KEY";
            else if (aiProvider === "ollama") serviceName = "OLLAMA_API_KEY"; // usually not needed but consistent

            await invoke("save_api_key", { service: serviceName, key: apiKey });
            setKeySaved(true);
            setTimeout(() => setKeySaved(false), 2000);
            setApiKey(""); // Clear input for security
        } catch (err) {
            console.error("Failed to save key:", err);
            alert("Failed to save API key");
        } finally {
            setSavingKey(false);
        }
    };

    const handleSettingChange = (key: string, value: string) => {
        updateSetting(key, value);
    };

    const renderSidebar = () => (
        <div className="w-[200px] border-r h-full bg-muted/30 p-2 space-y-1">
            <h2 className="px-4 py-2 text-sm font-semibold text-muted-foreground mb-2">Settings</h2>

            <button
                onClick={() => setActiveTab("ai")}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all border ${activeTab === "ai"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "text-muted-foreground border-transparent hover:border-primary hover:text-primary hover:bg-transparent"
                    }`}
            >
                <Brain className="h-4 w-4" />
                Intelligence
            </button>

            <button
                onClick={() => setActiveTab("appearance")}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all border ${activeTab === "appearance"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "text-muted-foreground border-transparent hover:border-primary hover:text-primary hover:bg-transparent"
                    }`}
            >
                <Palette className="h-4 w-4" />
                Appearance
            </button>

            <button
                onClick={() => setActiveTab("prompts")}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all border ${activeTab === "prompts"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "text-muted-foreground border-transparent hover:border-primary hover:text-primary hover:bg-transparent"
                    }`}
            >
                <FileCode className="h-4 w-4" />
                AI Prompts
            </button>

            <button
                onClick={() => setActiveTab("pipeline")}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all border ${activeTab === "pipeline"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "text-muted-foreground border-transparent hover:border-primary hover:text-primary hover:bg-transparent"
                    }`}
            >
                <LayoutTemplate className="h-4 w-4" />
                Pipeline
            </button>

            <button
                onClick={() => setActiveTab("data")}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all border ${activeTab === "data"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "text-muted-foreground border-transparent hover:border-primary hover:text-primary hover:bg-transparent"
                    }`}
            >
                <Database className="h-4 w-4" />
                Data
            </button>
        </div>
    );

    const renderAiContent = () => (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Artificial Intelligence</h3>
                <p className="text-sm text-muted-foreground">Configure your LLM provider and model preferences.</p>
            </div>

            <Separator />

            {/* Provider Selection */}
            <div className="space-y-3">
                <Label>AI Provider</Label>
                <div className="grid grid-cols-3 gap-2">
                    {["gemini", "openrouter", "ollama"].map((provider) => (
                        <div
                            key={provider}
                            className={`border rounded-md p-3 cursor-pointer transition-all ${aiProvider === provider
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "hover:border-primary/50"
                                }`}
                            onClick={() => {
                                setAiProvider(provider);
                                handleSettingChange("ai_provider", provider);
                            }}
                        >
                            <div className="font-medium capitalize">{provider}</div>
                            <div className="text-xs text-muted-foreground">
                                {provider === "gemini" ? "Native Google API" :
                                    provider === "openrouter" ? "Model Aggregator" : "Local Inference"}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Connection Settings */}
            <div className="space-y-4 border p-4 rounded-md bg-muted/10">
                <h4 className="text-sm font-medium flex items-center gap-2 text-primary">
                    <Key className="h-4 w-4" />
                    Connection Details
                </h4>

                {/* API Key */}
                {aiProvider !== "ollama" && (
                    <div className="space-y-2">
                        <Label htmlFor="apiKey">API Key</Label>
                        <div className="flex gap-2">
                            <Input
                                id="apiKey"
                                type="password"
                                placeholder={`Enter ${aiProvider === "openrouter" ? "OpenRouter" : "Gemini"} key...`}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                            <Button onClick={handleSaveKey} disabled={!apiKey || savingKey}>
                                {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> :
                                    keySaved ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Save className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Keys are stored securely in your system's keychain.
                        </p>
                    </div>
                )}

                {/* Dynamic Model Configuration */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="model">Model ID</Label>
                        <Input
                            id="model"
                            value={aiModel}
                            onChange={(e) => {
                                setAiModel(e.target.value);
                                handleSettingChange("ai_model", e.target.value);
                            }}
                            placeholder="e.g. google/gemini-2.0-flash-exp:free"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Specific model identifier string.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="baseUrl">Base URL</Label>
                        <Input
                            id="baseUrl"
                            value={aiBaseUrl}
                            onChange={(e) => {
                                setAiBaseUrl(e.target.value);
                                handleSettingChange("ai_base_url", e.target.value);
                            }}
                            placeholder="https://openrouter.ai/api/v1"
                        />
                    </div>
                </div>
            </div>

        </div>
    );

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
            // We'll need a backend command for this too, or just execute a series of deletes.
            // For now, let's assume we'll use a single command we're about to add.
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
                <Brain className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="space-y-1">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Privacy Note</p>
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-normal">
                        Your data is stored locally in an SQLite database. OutreachOS does not upload your contacts to any server except when explicitly using AI enrichment features.
                    </p>
                </div>
            </div>
        </div>
    );

    const renderPromptsContent = () => (
        <div className="space-y-8">
            <div>
                <h3 className="text-lg font-medium">AI Customization</h3>
                <p className="text-sm text-muted-foreground">Fine-tune the behavior of the AI engine by editing system prompts.</p>
            </div>

            <Separator />

            <div className="space-y-6">
                <div className="space-y-2">
                    <Label className="text-sm font-semibold">Email Drafting Template</Label>
                    <p className="text-[11px] text-muted-foreground italic mb-2">Available variables: {"{{first_name}}"}, {"{{company}}"}, {"{{summary}}"}, {"{{intel}}"}</p>
                    <Textarea
                        rows={6}
                        value={settings["prompt_email_draft"] || ""}
                        onChange={(e) => handleSettingChange("prompt_email_draft", e.target.value)}
                        placeholder="Default prompt used if left empty..."
                        className="font-mono text-xs"
                    />
                </div>

                <div className="space-y-2">
                    <Label className="text-sm font-semibold">Subject Line Template</Label>
                    <p className="text-[11px] text-muted-foreground italic mb-2">Available variables: {"{{first_name}}"}, {"{{company}}"}</p>
                    <Textarea
                        rows={4}
                        value={settings["prompt_subject_line"] || ""}
                        onChange={(e) => handleSettingChange("prompt_subject_line", e.target.value)}
                        placeholder="Default prompt used if left empty..."
                        className="font-mono text-xs"
                    />
                </div>

                <div className="p-3 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">
                        <strong>Warning:</strong> Modifying these prompts can significantly change the quality of AI output. Ensure you keep the variable placeholders intact.
                    </p>
                </div>
            </div>
        </div>
    );

    const renderContent = () => {
        switch (activeTab) {
            case "ai": return renderAiContent();
            case "appearance": return renderAppearanceContent();
            case "prompts": return renderPromptsContent();
            case "pipeline": return <div className="p-4 text-muted-foreground">Pipeline configuration coming soon.</div>;
            case "data": return renderDataContent();
            default: return null;
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[800px] h-[600px] p-0 flex gap-0 overflow-hidden">
                {renderSidebar()}
                <ScrollArea className="flex-1 p-6 h-full">
                    {renderContent()}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
