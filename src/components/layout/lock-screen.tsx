import { useState, useEffect } from "react";
import { Shield, Lock, Delete, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useErrors } from "@/hooks/use-errors";

interface LockScreenProps {
    onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
    const { handleError } = useErrors();
    const [pin, setPin] = useState("");
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleKeyClick = (digit: string) => {
        if (pin.length < 8) {
            setPin(prev => prev + digit);
            setError(false);
        }
    };

    const handleBackspace = () => {
        setPin(prev => prev.slice(0, -1));
        setError(false);
    };

    const handleSubmit = async () => {
        if (pin.length < 4) return;

        setLoading(true);
        try {
            const success = await invoke<boolean>("verify_lock_pin", { pin });
            if (success) {
                onUnlock();
            } else {
                setError(true);
                setPin("");
                toast.error("Invalid PIN");
            }
        } catch (err) {
            handleError(err, "Security system error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key >= "0" && e.key <= "9") {
                handleKeyClick(e.key);
            } else if (e.key === "Backspace") {
                handleBackspace();
            } else if (e.key === "Enter") {
                handleSubmit();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [pin]);

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md animate-in fade-in duration-500 select-none">
            <div className="w-full max-w-[320px] space-y-8 text-center">
                <div className="space-y-4">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
                        <Lock className={cn("h-8 w-8 text-primary transition-transform duration-300", error && "animate-shake")} />
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-xl font-bold tracking-tight">JobDex Locked</h2>
                        <p className="text-sm text-muted-foreground">Enter your security PIN to continue</p>
                    </div>
                </div>

                {/* Masked PIN Input Box */}
                <div className="flex justify-center">
                    <div className="w-full max-w-[280px] bg-muted/20 border border-primary/20 rounded-xl px-4 py-3 flex items-center justify-center shadow-inner group-focus-within:border-primary/40 transition-colors h-[64px]">
                        <input
                            type="password"
                            value={pin}
                            readOnly
                            className="w-full h-full bg-transparent border-none text-center text-3xl tracking-[0.4em] font-mono focus:outline-none select-none cursor-default text-primary"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck="false"
                            onPaste={(e) => e.preventDefault()}
                        />
                    </div>
                </div>

                {/* Numpad Grid */}
                <div className="grid grid-cols-3 gap-3">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                        <button
                            key={digit}
                            onClick={() => handleKeyClick(digit)}
                            className="h-14 w-full rounded-xl bg-muted/50 hover:bg-muted text-xl font-semibold transition-all hover:scale-105 active:scale-95 flex items-center justify-center border border-transparent hover:border-border"
                        >
                            {digit}
                        </button>
                    ))}
                    <button
                        onClick={handleBackspace}
                        className="h-14 w-full rounded-xl bg-transparent hover:bg-muted/30 text-muted-foreground transition-all flex items-center justify-center"
                        title="Backspace"
                    >
                        <Delete className="h-5 w-5" />
                    </button>
                    <button
                        onClick={() => handleKeyClick("0")}
                        className="h-14 w-full rounded-xl bg-muted/50 hover:bg-muted text-xl font-semibold transition-all hover:scale-105 active:scale-95 flex items-center justify-center border border-transparent hover:border-border"
                    >
                        0
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || pin.length < 4}
                        className={cn(
                            "h-14 w-full rounded-xl transition-all flex items-center justify-center",
                            pin.length >= 4
                                ? "bg-primary text-primary-foreground shadow-lg hover:brightness-110 hover:scale-105 outline-none"
                                : "bg-muted/20 text-muted-foreground cursor-not-allowed outline-none"
                        )}
                    >
                        {loading ? <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" /> : <Check className="h-6 w-6 font-bold" />}
                    </button>
                </div>

                <div className="flex flex-col gap-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center justify-center gap-2">
                        <Shield className="h-3 w-3" /> Hardware Secured Session
                    </p>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-4px); }
                    75% { transform: translateX(4px); }
                }
                .animate-shake {
                    animation: shake 0.2s ease-in-out 0s 2;
                    color: #ef4444 !important;
                }
            `}} />
        </div>
    );
}
