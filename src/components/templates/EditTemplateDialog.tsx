import { useState, useEffect, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { invoke } from "@tauri-apps/api/core";
import { useErrors } from "@/hooks/use-errors";
import { EmailTemplate } from "@/types/crm";
import { toast } from "sonner";

interface EditTemplateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    template?: EmailTemplate; // If provided, we're editing
    onSuccess: () => void;
}

export function EditTemplateDialog({
    open,
    onOpenChange,
    template,
    onSuccess,
}: EditTemplateDialogProps) {
    const { handleError } = useErrors();
    const [isLoading, setIsLoading] = useState(false);
    const [name, setName] = useState("");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");

    // Refs and focus tracking for variable insertion into the correct field
    const subjectRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [focusedField, setFocusedField] = useState<"subject" | "body">("body");

    const AVAILABLE_VARIABLES = ["first_name", "last_name", "company", "title", "location"];

    useEffect(() => {
        if (open) {
            if (template) {
                setName(template.name);
                setSubject(template.subject || "");
                setBody(template.body || "");
            } else {
                setName("");
                setSubject("");
                setBody("");
            }
        }
    }, [open, template]);

    const insertVariable = (variable: string) => {
        const textToInsert = `{{${variable}}}`;

        if (focusedField === "subject") {
            const input = subjectRef.current;
            if (!input) return;
            const start = input.selectionStart ?? subject.length;
            const end = input.selectionEnd ?? subject.length;
            const newSubject = subject.substring(0, start) + textToInsert + subject.substring(end);
            setSubject(newSubject);
            setTimeout(() => {
                input.focus();
                input.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
            }, 0);
        } else {
            const textarea = textareaRef.current;
            if (!textarea) return;
            const start = textarea.selectionStart ?? body.length;
            const end = textarea.selectionEnd ?? body.length;
            const newBody = body.substring(0, start) + textToInsert + body.substring(end);
            setBody(newBody);
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
            }, 0);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Template name is required");
            return;
        }

        setIsLoading(true);
        try {
            await invoke("upsert_email_template", {
                id: template?.id,
                name,
                subject: subject || null,
                body: body || null,
            });
            toast.success(template ? "Template updated" : "Template created");
            onSuccess();
            onOpenChange(false);
        } catch (error) {
            handleError(error, "Failed to save template");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{template ? "Edit Template" : "Create Template"}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Template Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g., Initial Outreach, Follow Up #1"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isLoading}
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="subject">Default Subject</Label>
                        <Input
                            id="subject"
                            ref={subjectRef}
                            placeholder="e.g., Question about {{company}}"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            onFocus={() => setFocusedField("subject")}
                            disabled={isLoading}
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="body">Email Body</Label>
                        <Textarea
                            id="body"
                            ref={textareaRef}
                            placeholder="Write your template here..."
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            onFocus={() => setFocusedField("body")}
                            disabled={isLoading}
                            rows={10}
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                        <div className="flex flex-wrap gap-2 mt-1 items-center">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mr-1">Insert:</span>
                            {AVAILABLE_VARIABLES.map(v => (
                                <Badge
                                    key={v}
                                    variant="secondary"
                                    className="cursor-pointer hover:bg-muted font-mono text-[10px] px-1.5 py-0"
                                    onClick={() => insertVariable(v)}
                                >
                                    {`{{${v}}}`}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    <DialogFooter className="pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? "Saving..." : template ? "Update Template" : "Create Template"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
