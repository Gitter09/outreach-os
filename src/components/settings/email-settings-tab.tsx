import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, Key, Loader2, Mail, Plus, RefreshCw, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface EmailAccount {
    id: string;
    provider: string;
    email: string;
    created_at: string;
    expires_at?: number;
    last_synced_at?: string;
}

interface CredentialStatus {
    gmail_configured: boolean;
    outlook_configured: boolean;
}

interface SyncResult {
    account_id: string;
    account_email: string;
    provider: string;
    synced_count: number;
    skipped_count: number;
    token_expired: boolean;
    error?: string;
}

export function EmailSettingsTab() {
    const [accounts, setAccounts] = useState<EmailAccount[]>([]);
    const [loading, setLoading] = useState(false);
    const [connecting, setConnecting] = useState<"gmail" | "outlook" | null>(null);

    // Tracking Config States
    const [trackingBaseUrl, setTrackingBaseUrl] = useState("");
    const [trackingSecret, setTrackingSecret] = useState("");
    const [savingTracking, setSavingTracking] = useState(false);
    const [pollingTracking, setPollingTracking] = useState(false);
    const [credentialStatus, setCredentialStatus] = useState<CredentialStatus | null>(null);
    const [setupProvider, setSetupProvider] = useState<"gmail" | "outlook" | null>(null);
    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState<string | null>(null); // account_id or "all"

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const data = await invoke<EmailAccount[]>("get_email_accounts");
            setAccounts(data);
        } catch (e) {
            toast.error(`Failed to fetch email accounts: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    async function fetchTrackingConfig() {
        try {
            const settings = await invoke<Record<string, string>>("get_settings");
            if (settings) {
                setTrackingBaseUrl(settings.tracking_base_url || "");
                setTrackingSecret(settings.tracking_secret || "");
            }
        } catch (e) {
            console.error("Failed to fetch tracking config:", e);
        }
    }

    const checkCredentials = async () => {
        try {
            const status = await invoke<CredentialStatus>("check_email_credentials");
            setCredentialStatus(status);
        } catch (error) {
            console.error("Failed to check credentials:", error);
        }
    };

    useEffect(() => {
        fetchAccounts();
        checkCredentials();
        fetchTrackingConfig();
    }, []);

    const handleSaveCredentials = async () => {
        if (!setupProvider || !clientId.trim() || !clientSecret.trim()) {
            toast.error("Please fill in all fields");
            return;
        }

        setSaving(true);
        try {
            await invoke("save_email_credentials", {
                provider: setupProvider,
                clientId: clientId.trim(),
                clientSecret: clientSecret.trim(),
            });
            toast.success(`${setupProvider === "gmail" ? "Gmail" : "Outlook"} credentials saved successfully`);
            setSetupProvider(null);
            setClientId("");
            setClientSecret("");
            checkCredentials();
        } catch (error) {
            toast.error("Failed to save credentials: " + error);
        } finally {
            setSaving(false);
        }
    };

    const handleConnect = async (provider: "gmail" | "outlook") => {
        const isConfigured = provider === "gmail"
            ? credentialStatus?.gmail_configured
            : credentialStatus?.outlook_configured;

        if (!isConfigured) {
            setSetupProvider(provider);
            return;
        }

        setConnecting(provider);
        try {
            const command = provider === "gmail" ? "gmail_connect" : "outlook_connect";
            const result = await invoke<string>(command);
            toast.success(result);
            fetchAccounts();
        } catch (e) {
            toast.error(`Failed to connect ${provider}: ` + e);
        } finally {
            setConnecting(null);
        }
    };

    async function handleSaveTracking() {
        setSavingTracking(true);
        try {
            await invoke("save_setting", { key: "tracking_base_url", value: trackingBaseUrl });
            await invoke("save_setting", { key: "tracking_secret", value: trackingSecret });
            toast.success("Tracking configuration saved");
        } catch (e) {
            toast.error(`Failed to save tracking config: ${e}`);
        } finally {
            setSavingTracking(false);
        }
    }

    async function handlePollTracking() {
        setPollingTracking(true);
        try {
            const count: number = await invoke("poll_email_tracking");
            toast.success(`Polled tracking events. Imported ${count} new events.`);
        } catch (e) {
            toast.error(`Failed to poll tracking events: ${e}`);
        } finally {
            setPollingTracking(false);
        }
    }

    const handleDelete = async (id: string) => {
        try {
            await invoke("delete_email_account", { accountId: id });
            toast.success("Account disconnected");
            setAccounts(accounts.filter((a) => a.id !== id));
        } catch (error) {
            toast.error("Failed to disconnect account: " + error);
        }
    };

    const handleFullResync = async (accountId: string, accountEmail: string, provider: string) => {
        setSyncing(accountId + "_full");
        try {
            // Reset last_synced_at so the sync fetches ALL messages (not just new ones)
            await invoke("reset_email_sync_state", { accountId });
            // Now run a full sync
            const result = await invoke<SyncResult>("sync_email_account", { accountId });
            if (result.token_expired) {
                toast.error(`Token expired for ${accountEmail}. Please reconnect your account.`, {
                    action: {
                        label: "Reconnect",
                        onClick: () => handleConnect(provider as "gmail" | "outlook"),
                    },
                });
            } else {
                toast.success(
                    `Full re-sync complete: ${result.synced_count} email${result.synced_count !== 1 ? "s" : ""} updated from ${accountEmail}`
                );
                fetchAccounts();
            }
        } catch (error) {
            toast.error(`Full re-sync failed for ${accountEmail}: ` + error);
        } finally {
            setSyncing(null);
        }
    };

    const handleSyncAccount = async (accountId: string, accountEmail: string, provider: string) => {
        setSyncing(accountId);
        try {
            const result = await invoke<SyncResult>("sync_email_account", { accountId });
            if (result.token_expired) {
                toast.error(`Token expired for ${accountEmail}. Please reconnect your account.`, {
                    action: {
                        label: "Reconnect",
                        onClick: () => handleConnect(provider as "gmail" | "outlook"),
                    },
                });
            } else {
                toast.success(
                    `Synced ${result.synced_count} new email${result.synced_count !== 1 ? "s" : ""} from ${accountEmail}`
                );
                fetchAccounts();
            }
        } catch (error) {
            toast.error(`Sync failed for ${accountEmail}: ` + error);
        } finally {
            setSyncing(null);
        }
    };

    const handleSyncAll = async () => {
        setSyncing("all");
        try {
            const results = await invoke<SyncResult[]>("sync_email_accounts");
            let totalSynced = 0;
            const expired: string[] = [];

            for (const result of results) {
                if (result.token_expired) {
                    expired.push(result.account_email);
                } else {
                    totalSynced += result.synced_count;
                }
            }

            if (totalSynced > 0) {
                toast.success(`Synced ${totalSynced} new email${totalSynced !== 1 ? "s" : ""} across all accounts`);
            } else if (expired.length === 0) {
                toast.success("All accounts up to date");
            }

            if (expired.length > 0) {
                toast.error(`Token expired for: ${expired.join(", ")}. Please reconnect those accounts.`);
            }

            fetchAccounts();
        } catch (error) {
            toast.error("Sync failed: " + error);
        } finally {
            setSyncing(null);
        }
    };

    const getSetupGuideUrl = (provider: "gmail" | "outlook") => {
        if (provider === "gmail") {
            return "https://console.cloud.google.com/apis/credentials";
        }
        return "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade";
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Email Accounts</h3>
                <p className="text-sm text-muted-foreground">
                    Connect your email accounts to track conversations and schedule emails.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Mail className="h-4 w-4" /> Gmail
                        </CardTitle>
                        <CardDescription>Connect your Google Workspace or Gmail account.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleConnect("gmail")}
                            disabled={connecting !== null}
                        >
                            {connecting === "gmail" ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...</>
                            ) : (
                                <>
                                    {credentialStatus?.gmail_configured ? (
                                        <><Plus className="mr-2 h-4 w-4" /> Connect Gmail</>
                                    ) : (
                                        <><Key className="mr-2 h-4 w-4" /> Setup Gmail</>
                                    )}
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Mail className="h-4 w-4" /> Outlook
                        </CardTitle>
                        <CardDescription>Connect your Outlook or Microsoft 365 account.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleConnect("outlook")}
                            disabled={connecting !== null}
                        >
                            {connecting === "outlook" ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...</>
                            ) : (
                                <>
                                    {credentialStatus?.outlook_configured ? (
                                        <><Plus className="mr-2 h-4 w-4" /> Connect Outlook</>
                                    ) : (
                                        <><Key className="mr-2 h-4 w-4" /> Setup Outlook</>
                                    )}
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Connected Accounts</h4>
                    <div className="flex items-center gap-2">
                        {accounts.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleSyncAll}
                                disabled={syncing !== null}
                                className="gap-2"
                            >
                                {syncing === "all" ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                Sync All
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={fetchAccounts} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        </Button>
                    </div>
                </div>

                {accounts.length === 0 ? (
                    <div className="text-center p-8 border rounded-lg border-dashed text-muted-foreground =text-sm">
                        No accounts connected yet.
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {accounts.map((account) => (
                            <div
                                key={account.id}
                                className="flex items-center justify-between p-4 border rounded-lg bg-card"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Mail className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">{account.email}</p>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="capitalize">{account.provider}</span>
                                            <span>•</span>
                                            <span>Connected {new Date(account.created_at).toLocaleDateString()}</span>
                                            {account.last_synced_at && (
                                                <>
                                                    <span>•</span>
                                                    <span>
                                                        Synced {new Date(account.last_synced_at).toLocaleTimeString([], {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                        Active
                                    </Badge>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleSyncAccount(account.id, account.email, account.provider)}
                                        disabled={syncing !== null}
                                        title="Sync new emails"
                                        className="gap-1.5 text-xs"
                                    >
                                        {syncing === account.id ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        )}
                                        Sync
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleFullResync(account.id, account.email, account.provider)}
                                        disabled={syncing !== null}
                                        title="Re-fetch all emails (fixes missing content)"
                                        className="gap-1.5 text-xs text-muted-foreground"
                                    >
                                        {syncing === account.id + "_full" ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        )}
                                        Full Re-sync
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-muted-foreground hover:text-destructive"
                                        onClick={() => handleDelete(account.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="pt-6 border-t mt-6">
                <div>
                    <h3 className="text-lg font-medium">Tracking Configuration</h3>
                    <p className="text-sm text-muted-foreground pb-4">
                        Configure your portfolio server endpoints to track email opens and link clicks.
                    </p>
                </div>
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-base">Portfolio Server Config</CardTitle>
                                <CardDescription>
                                    Enter the base URL and shared secret for your tracking endpoints.
                                </CardDescription>
                            </div>
                            {trackingBaseUrl && trackingSecret && (
                                <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 shrink-0">
                                    Configured ✓
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Base URL</Label>
                            <Input
                                placeholder="https://yourportfolio.com"
                                value={trackingBaseUrl}
                                onChange={(e) => setTrackingBaseUrl(e.target.value)}
                            />
                            {trackingBaseUrl && (
                                <p className="text-xs text-muted-foreground">Currently set to: <span className="font-mono text-foreground">{trackingBaseUrl}</span></p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Shared Secret</Label>
                            <Input
                                type="password"
                                placeholder="Enter your shared secret"
                                value={trackingSecret}
                                onChange={(e) => setTrackingSecret(e.target.value)}
                            />
                            {trackingSecret && (
                                <p className="text-xs text-muted-foreground">Secret is saved ({trackingSecret.length} characters)</p>
                            )}
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Button
                                onClick={handleSaveTracking}
                                disabled={savingTracking}
                            >
                                {savingTracking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                Save Config
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handlePollTracking}
                                disabled={pollingTracking || !trackingBaseUrl || !trackingSecret}
                            >
                                {pollingTracking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                Poll Events Now
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Credential Setup Dialog */}
            <Dialog open={setupProvider !== null} onOpenChange={(open) => !open && setSetupProvider(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            Setup {setupProvider === "gmail" ? "Gmail" : "Outlook"} Credentials
                        </DialogTitle>
                        <DialogDescription>
                            You need to configure OAuth credentials before connecting your account.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="bg-muted p-4 rounded-lg space-y-2">
                            <p className="text-sm font-medium">Step 1: Create OAuth App</p>
                            <p className="text-sm text-muted-foreground">
                                {setupProvider === "gmail"
                                    ? "Go to Google Cloud Console and create a new OAuth 2.0 Client ID (Desktop app type)."
                                    : "Go to Azure Portal and register a new app with redirect URI: http://localhost:8420"}
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() => window.open(getSetupGuideUrl(setupProvider!), "_blank")}
                            >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Open {setupProvider === "gmail" ? "Google Cloud Console" : "Azure Portal"}
                            </Button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <Label htmlFor="client-id">Client ID</Label>
                                <Input
                                    id="client-id"
                                    placeholder="Enter your OAuth Client ID"
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                />
                            </div>
                            <div>
                                <Label htmlFor="client-secret">Client Secret</Label>
                                <Input
                                    id="client-secret"
                                    type="password"
                                    placeholder="Enter your OAuth Client Secret"
                                    value={clientSecret}
                                    onChange={(e) => setClientSecret(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => setSetupProvider(null)}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={handleSaveCredentials}
                                disabled={saving}
                            >
                                {saving ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                                ) : (
                                    "Save & Continue"
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
