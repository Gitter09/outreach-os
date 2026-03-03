import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Lock, Key, Trash2, ShieldAlert, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

export function SecuritySettingsTab() {
    const [hasPin, setHasPin] = useState<boolean | null>(null);
    const [showPinDialog, setShowPinDialog] = useState(false);
    const [pin, setPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");
    const [showPin, setShowPin] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showReAuthDialog, setShowReAuthDialog] = useState(false);
    const [reAuthAction, setReAuthAction] = useState<'change' | 'remove' | null>(null);
    const [currentPinInput, setCurrentPinInput] = useState("");
    const [reAuthLoading, setReAuthLoading] = useState(false);
    const [reAuthError, setReAuthError] = useState(false);

    const checkPinStatus = async () => {
        try {
            const status = await invoke<boolean>("has_lock_pin");
            setHasPin(status);
        } catch (error) {
            console.error("Failed to check PIN status:", error);
            toast.error("Security system error: Failed to access keychain");
            setHasPin(false);
        }
    };

    useEffect(() => {
        checkPinStatus();
    }, []);

    const handleSetPin = async () => {
        if (pin.length < 4 || pin.length > 8) {
            toast.error("PIN must be between 4 and 8 digits");
            return;
        }
        if (pin !== confirmPin) {
            toast.error("PINs do not match");
            return;
        }

        setLoading(true);
        try {
            await invoke("set_lock_pin", { pin });
            setHasPin(true);
            setShowPinDialog(false);
            setPin("");
            setConfirmPin("");
            toast.success("App lock PIN configured successfully");
        } catch (error) {
            toast.error(error as string || "Failed to set PIN");
        } finally {
            setLoading(false);
        }
    };

    const handleInitiateChangePin = () => {
        setReAuthAction('change');
        setShowReAuthDialog(true);
        setReAuthError(false);
        setCurrentPinInput('');
    };

    const handleInitiateRemovePin = () => {
        setReAuthAction('remove');
        setShowReAuthDialog(true);
        setReAuthError(false);
        setCurrentPinInput('');
    };

    const handleReAuthSubmit = async () => {
        if (currentPinInput.length < 4) return;

        setReAuthLoading(true);
        setReAuthError(false);
        try {
            const isValid = await invoke<boolean>("verify_lock_pin", { pin: currentPinInput });
            if (isValid) {
                setShowReAuthDialog(false);
                setCurrentPinInput("");
                if (reAuthAction === 'change') {
                    setShowPinDialog(true);
                } else if (reAuthAction === 'remove') {
                    await handleRemovePinConfirmed();
                }
            } else {
                setReAuthError(true);
            }
        } catch (error) {
            toast.error("Security system error while verifying PIN");
        } finally {
            setReAuthLoading(false);
        }
    };

    const handleRemovePinConfirmed = async () => {
        try {
            await invoke("remove_lock_pin");
            setHasPin(false);
            toast.success("App lock disabled");
        } catch (error) {
            toast.error(error as string || "Failed to remove PIN");
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Security</h3>
                <p className="text-sm text-muted-foreground">Manage your application security and access controls.</p>
            </div>

            <Card className="border-primary/10 bg-primary/5">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Lock className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-base">App Lock</CardTitle>
                            <CardDescription className="text-xs">
                                Require a PIN to access OutreachOS on startup.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-background border">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-medium">Startup PIN Protection</Label>
                            <p className="text-[11px] text-muted-foreground">
                                {hasPin
                                    ? "Enabled — You will be prompted for your PIN when the app launches."
                                    : "Disabled — Anyone with access to your computer can open the app."}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {hasPin ? (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleInitiateChangePin}
                                    >
                                        Change PIN
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={handleInitiateRemovePin}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Disable
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    size="sm"
                                    onClick={() => setShowPinDialog(true)}
                                >
                                    Enable App Lock
                                </Button>
                            )}
                        </div>
                    </div>

                    {showPinDialog && (
                        <div className="p-4 rounded-lg border bg-background space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Key className="h-4 w-4 text-primary" />
                                {hasPin ? "Change Security PIN" : "Set Security PIN"}
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="pin" className="text-xs">Enter PIN (4-8 digits)</Label>
                                    <div className="relative">
                                        <Input
                                            id="pin"
                                            type={showPin ? "text" : "password"}
                                            value={pin}
                                            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                            placeholder="••••"
                                            className="pr-10"
                                            autoComplete="off"
                                            autoCorrect="off"
                                            autoCapitalize="off"
                                            spellCheck="false"
                                            onPaste={(e) => e.preventDefault()}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPin(s => !s)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirmPin" className="text-xs">Confirm PIN</Label>
                                    <Input
                                        id="confirmPin"
                                        type={showPin ? "text" : "password"}
                                        value={confirmPin}
                                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                        placeholder="••••"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        spellCheck="false"
                                        onPaste={(e) => e.preventDefault()}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setShowPinDialog(false);
                                        setPin("");
                                        setConfirmPin("");
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleSetPin}
                                    disabled={loading || pin.length < 4}
                                >
                                    {loading ? "Saving..." : "Save PIN"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Re-Authentication Dialog */}
                    <Dialog open={showReAuthDialog} onOpenChange={setShowReAuthDialog}>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Verify Current PIN</DialogTitle>
                                <DialogDescription>
                                    Please enter your current security PIN to {reAuthAction === 'remove' ? 'disable the app lock' : 'change your PIN'}.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-col space-y-4 py-4">
                                <Input
                                    type={showPin ? "text" : "password"}
                                    value={currentPinInput}
                                    onChange={(e) => {
                                        setCurrentPinInput(e.target.value.replace(/\D/g, '').slice(0, 8));
                                        setReAuthError(false);
                                    }}
                                    placeholder="••••••••"
                                    className={reAuthError ? "border-destructive text-destructive" : ""}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck="false"
                                    onPaste={(e) => e.preventDefault()}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleReAuthSubmit();
                                    }}
                                    autoFocus
                                />
                                {reAuthError && (
                                    <p className="text-sm text-destructive font-medium">Incorrect PIN. Please try again.</p>
                                )}
                            </div>
                            <DialogFooter className="sm:justify-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setShowReAuthDialog(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleReAuthSubmit}
                                    disabled={reAuthLoading || currentPinInput.length < 4}
                                >
                                    {reAuthLoading ? "Verifying..." : "Verify"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </CardContent>
            </Card>

            <div className="grid gap-6 sm:grid-cols-2">
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-green-500" />
                            <CardTitle className="text-sm">Encryption</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Your database is fully encrypted with SQLCipher (AES-256-CBC). All OAuth tokens and service credentials are encrypted using AES-256-GCM before storage.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 text-orange-500" />
                            <CardTitle className="text-sm">Local Storage</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            No data leaves your device unless you explicitly export it. Your security keys are securely stored in your operating system's hardware-backed keychain.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
