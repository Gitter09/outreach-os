import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, Key, Loader2, Mail, Plus, RefreshCw, Trash2, Pencil, PenLine } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useErrors } from "@/hooks/use-errors";
import { EmailAccount, EmailSignature, SyncResult } from "@/types/crm";
import { EditSignatureDialog } from "@/components/settings/EditSignatureDialog";

export function EmailSettingsTab() {
    const [accounts, setAccounts] = useState<EmailAccount[]>([]);
    const { handleError } = useErrors();
    const [loading, setLoading] = useState(false);
    const [connecting, setConnecting] = useState<"gmail" | "outlook" | null>(null);
    const [setupProvider, setSetupProvider] = useState<"gmail" | "outlook" | null>(null);
    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState<string | null>(null); // account_id or "all"
    const [showAdvanced, setShowAdvanced] = useState(false);

    const [signatures, setSignatures] = useState<EmailSignature[]>([]);
    const [editSignature, setEditSignature] = useState<EmailSignature | undefined>(undefined);
    const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);

    const fetchSignatures = async () => {
        try {
            const data = await invoke<EmailSignature[]>("get_signatures");
            setSignatures(data);
        } catch (e) {
            handleError(e, "Failed to fetch signatures");
        }
    };

    const handleDeleteSignature = async (id: string) => {
        try {
            await invoke("delete_signature", { id });
            toast.success("Signature deleted");
            setSignatures((prev) => prev.filter((s) => s.id !== id));
        } catch (e) {
            handleError(e, "Failed to delete signature");
        }
    };

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const data = await invoke<EmailAccount[]>("get_email_accounts");
            setAccounts(data);
        } catch (e) {
            handleError(e, "Failed to fetch email accounts");
        } finally {
            setLoading(false);
        }
    };


    useEffect(() => {
        fetchAccounts();
        fetchSignatures();
    }, []);

    const handleSaveCredentials = async () => {
        if (!setupProvider || !clientId.trim()) {
            handleError("Please provide a Client ID");
            return;
        }

        if (setupProvider === "gmail" && !clientSecret.trim()) {
            handleError("Gmail requires a Client Secret");
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
            setClientId("");
            setClientSecret("");
        } catch (error) {
            handleError(error, "Failed to save credentials");
        } finally {
            setSaving(false);
        }
    };

    const handleConnect = async (provider: "gmail" | "outlook") => {
        setConnecting(provider);
        try {
            const command = provider === "gmail" ? "gmail_connect" : "outlook_connect";
            const result = await invoke<string>(command);
            toast.success(result);
            fetchAccounts();
        } catch (e: unknown) {
            // Check if it's a "not configured" error
            const errorStr = (typeof e === "object" && e !== null && "message" in e) ? String(e.message) : String(e);
            if (errorStr.includes("credentials not configured") || errorStr.includes("disabled while in beta")) {
                setSetupProvider(provider);
            } else {
                handleError(e, `Failed to connect ${provider}`);
            }
        } finally {
            setConnecting(null);
        }
    };



    const handleDelete = async (id: string) => {
        try {
            await invoke("delete_email_account", { accountId: id });
            toast.success("Account disconnected");
            setAccounts(accounts.filter((a) => a.id !== id));
        } catch (error) {
            handleError(error, "Failed to disconnect account");
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
            handleError(error, `Full re-sync failed for ${accountEmail}`);
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
                handleError(`Token expired for: ${expired.join(", ")}. Please reconnect those accounts.`);
            }

            fetchAccounts();
        } catch (error) {
            handleError(error, "Sync failed");
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
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium">Email</h3>
                    <p className="text-sm text-muted-foreground">
                        Connect your Gmail or Outlook account to send and receive emails.
                    </p>
                </div>
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
                                <><Plus className="mr-2 h-4 w-4" /> Connect Gmail</>
                            )}
                        </Button>
                        <div className="mt-2 text-center">
                            <Button
                                variant="link"
                                size="sm"
                                className="text-[10px] text-muted-foreground h-auto p-0"
                                onClick={() => {
                                    setSetupProvider("gmail");
                                    setShowAdvanced(true);
                                }}
                            >
                                Custom Credentials
                            </Button>
                        </div>
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
                                <><Plus className="mr-2 h-4 w-4" /> Connect Outlook</>
                            )}
                        </Button>
                        <div className="mt-2 text-center">
                            <Button
                                variant="link"
                                size="sm"
                                className="text-[10px] text-muted-foreground h-auto p-0"
                                onClick={() => {
                                    setSetupProvider("outlook");
                                    setShowAdvanced(true);
                                }}
                            >
                                Custom Credentials
                            </Button>
                        </div>
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


            {/* Signatures */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-medium flex items-center gap-2">
                            <PenLine className="h-4 w-4" />
                            Signatures
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Append a signature when composing emails.
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => {
                            setEditSignature(undefined);
                            setSignatureDialogOpen(true);
                        }}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add signature
                    </Button>
                </div>

                {signatures.length === 0 ? (
                    <div className="text-center p-6 border rounded-lg border-dashed text-muted-foreground text-sm">
                        No signatures yet.
                    </div>
                ) : (
                    <div className="grid gap-2">
                        {signatures.map((sig) => (
                            <div
                                key={sig.id}
                                className="flex items-start justify-between p-4 border rounded-lg bg-card"
                            >
                                <div className="min-w-0">
                                    <p className="font-medium text-sm">{sig.name}</p>
                                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-2 font-mono">
                                        {sig.content}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 ml-3 shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground"
                                        onClick={() => {
                                            setEditSignature(sig);
                                            setSignatureDialogOpen(true);
                                        }}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        onClick={() => handleDeleteSignature(sig.id)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <EditSignatureDialog
                open={signatureDialogOpen}
                onOpenChange={setSignatureDialogOpen}
                signature={editSignature}
                onSuccess={fetchSignatures}
            />

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
                        {!showAdvanced ? (
                            <div className="bg-primary/5 p-6 rounded-lg text-center border border-primary/20">
                                <Key className="h-10 w-10 text-primary mx-auto mb-4 opacity-50" />
                                <h4 className="text-base font-semibold mb-1">Standard Setup Preferred</h4>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Standard users can usually just click the main "Connect" button on the previous screen.
                                    Only use this dialog if you are a developer or have your own Cloud Console project.
                                </p>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowAdvanced(true)}
                                    className="gap-2"
                                >
                                    <Key className="h-4 w-4" /> Configure Custom Credentials
                                </Button>
                            </div>
                        ) : (
                            <>
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
                                        onClick={() => window.open(getSetupGuideUrl(setupProvider ?? "gmail"), "_blank")}
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
                                        <Label htmlFor="client-secret">
                                            Client Secret {setupProvider === "outlook" && <span className="text-muted-foreground font-normal">(Optional - leave blank if Public Client)</span>}
                                        </Label>
                                        <Input
                                            id="client-secret"
                                            type="password"
                                            placeholder={setupProvider === "outlook" ? "Leave blank for Mobile/Desktop apps" : "Enter your OAuth Client Secret"}
                                            value={clientSecret}
                                            onChange={(e) => setClientSecret(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="flex gap-2 pt-2">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                    setSetupProvider(null);
                                    setShowAdvanced(false);
                                }}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                            {showAdvanced && (
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
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
