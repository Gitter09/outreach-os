import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { RichTextEditor } from "@/components/email/rich-text-editor";
import { useErrors } from "@/hooks/use-errors";
import { EmailSignature } from "@/types/crm";
import { toast } from "sonner";

interface EditSignatureDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    signature?: EmailSignature;
    onSuccess: () => void;
}

export function EditSignatureDialog({
    open,
    onOpenChange,
    signature,
    onSuccess,
}: EditSignatureDialogProps) {
    const { handleError } = useErrors();
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState("");
    const [content, setContent] = useState("");

    useEffect(() => {
        if (open) {
            setName(signature?.name ?? "");
            setContent(signature?.content ?? "");
        }
    }, [open, signature]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            handleError("Signature name is required");
            return;
        }
        setLoading(true);
        try {
            await invoke("upsert_signature", {
                id: signature?.id ?? null,
                name: name.trim(),
                content: content.trim(),
            });
            toast.success(signature ? "Signature updated" : "Signature created");
            onSuccess();
            onOpenChange(false);
        } catch (err) {
            handleError(err, "Failed to save signature");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{signature ? "Edit Signature" : "New Signature"}</DialogTitle>
                    <DialogDescription>
                        Signatures are appended to the bottom of your emails.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="sig-name">Name</Label>
                        <Input
                            id="sig-name"
                            placeholder="e.g. Work, Personal"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={loading}
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="sig-content">Signature</Label>
                        <RichTextEditor
                            value={content}
                            onChange={setContent}
                            placeholder="— Your Name&#10;Title · LinkedIn"
                            minHeight={140}
                            disabled={loading}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                            ) : (
                                signature ? "Update" : "Create"
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
