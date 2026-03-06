import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useErrors } from "@/hooks/use-errors";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mail, Send, Loader2, Calendar as CalendarIcon, FileText } from "lucide-react";
import { Contact, EmailTemplate } from "@/types/crm";
import { format } from "date-fns";


interface ComposeEmailDialogProps {
    contact: Contact | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface EmailAccount {
    id: string;
    email: string;
    provider: string;
}

export function ComposeEmailDialog({
    contact,
    open,
    onOpenChange,
}: ComposeEmailDialogProps) {
    const { handleError } = useErrors();
    const [to, setTo] = useState("");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);

    // Account Selection
    const [accounts, setAccounts] = useState<EmailAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>("");

    // Templates
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);

    const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
    const [isScheduling, setIsScheduling] = useState(false);

    // We need a ref to the textarea to get the cursor position
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const AVAILABLE_VARIABLES = ["first_name", "last_name", "company", "title", "location"];

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [accts, tpl] = await Promise.all([
                    invoke<EmailAccount[]>("get_email_accounts"),
                    invoke<EmailTemplate[]>("get_email_templates")
                ]);

                setAccounts(accts);
                if (accts.length > 0 && !selectedAccount) {
                    setSelectedAccount(accts[0].id);
                }
                setTemplates(tpl);
            } catch (err) {
                console.error("Failed to fetch data:", err);
            }
        };
        if (open) {
            fetchData();
        }
    }, [open]);

    // Pre-fill email when contact changes
    useEffect(() => {
        if (contact?.email) {
            setTo(contact.email);
        }
    }, [contact]);

    const insertVariable = (variable: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const textToInsert = `{{${variable}}}`;

        const newBody = body.substring(0, start) + textToInsert + body.substring(end);
        setBody(newBody);

        // Reset focus and cursor position after React re-renders
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
        }, 0);
    };

    const handleSend = async () => {
        if (!selectedAccount) {
            handleError("Please connect an email account first in Settings.");
            return;
        }
        if (!to || !subject || !body) {
            handleError("Please fill in all fields");
            return;
        }

        setSending(true);
        try {
            if (scheduledDate) {
                if (!contact?.id) {
                    handleError("Scheduling requires a contact context currently.");
                    setSending(false);
                    return;
                }

                await invoke("email_schedule", {
                    accountId: selectedAccount,
                    contactId: contact.id,
                    subject,
                    body,
                    scheduledAt: Math.floor(scheduledDate.getTime() / 1000)
                });
                toast.success(`Email scheduled for ${format(scheduledDate, "PP p")}`);
            } else {
                await invoke("email_send", {
                    accountId: selectedAccount,
                    to,
                    subject,
                    body
                });
                toast.success("Email sent successfully!");
            }
            onOpenChange(false);
            setSubject("");
            setBody("");
            setScheduledDate(undefined);
            setIsScheduling(false);
        } catch (err) {
            handleError(err, "Failed to send email");
        } finally {
            setSending(false);
        }
    };

    const applyTemplate = (template: EmailTemplate) => {
        if (!contact) return;

        const variables: Record<string, string> = {
            "first_name": contact.first_name || "",
            "last_name": contact.last_name || "",
            "company": contact.company || "",
            "title": contact.title || "",
            "location": contact.location || "",
        };

        let newSubject = template.subject || "";
        let newBody = template.body || "";

        Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
            newSubject = newSubject.replace(regex, value);
            newBody = newBody.replace(regex, value);
        });

        setSubject(newSubject);
        setBody(newBody);
        toast.info(`Applied template: ${template.name}`);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Compose Email
                    </DialogTitle>
                </DialogHeader>

                {accounts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <p className="text-muted-foreground text-center">
                            No email accounts connected.
                        </p>
                        <Button onClick={() => onOpenChange(false)} variant="outline">
                            Close and Go to Settings
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-4 gap-4 items-center">
                            <Label className="text-right">From</Label>
                            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>
                                            {acc.email} ({acc.provider})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-4 gap-4 items-center">
                            <Label htmlFor="to" className="text-right">To</Label>
                            <Input
                                id="to"
                                type="email"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                className="col-span-3"
                            />
                        </div>

                        <div className="grid grid-cols-4 gap-4 items-center">
                            <Label className="text-right">Template</Label>
                            <div className="col-span-3">
                                <Select onValueChange={(id) => {
                                    const tpl = templates.find(t => t.id === id);
                                    if (tpl) applyTemplate(tpl);
                                }}>
                                    <SelectTrigger>
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            <SelectValue placeholder="Select a template..." />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {templates.length === 0 ? (
                                            <div className="p-2 text-sm text-muted-foreground text-center">
                                                No templates created yet
                                            </div>
                                        ) : (
                                            templates.map(tpl => (
                                                <SelectItem key={tpl.id} value={tpl.id}>
                                                    {tpl.name}
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 items-start">
                            <Label htmlFor="subject" className="text-right pt-2">Subject</Label>
                            <div className="col-span-3">
                                <Input
                                    id="subject"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Subject line..."
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Message Body</Label>
                            <Textarea
                                ref={textareaRef}
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                rows={12}
                                className="font-sans"
                            />
                            <div className="flex flex-wrap gap-2 mt-1 items-center">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mr-1">Insert Variable:</span>
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

                    </div>
                )}

                <DialogFooter className="flex justify-between items-center w-full sm:justify-between">
                    <Popover open={isScheduling} onOpenChange={setIsScheduling}>
                        <PopoverTrigger asChild>
                            <Button variant={scheduledDate ? "secondary" : "ghost"} size="sm">
                                <CalendarIcon className="h-4 w-4 mr-2" />
                                {scheduledDate ? format(scheduledDate, "MMM d, h:mm a") : "Schedule Send"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-4" align="start">
                            <div className="space-y-4">
                                <Label>Schedule Time</Label>
                                <Input
                                    type="datetime-local"
                                    className="w-full block"
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            setScheduledDate(new Date(e.target.value));
                                        } else {
                                            setScheduledDate(undefined);
                                        }
                                    }}
                                    min={new Date().toISOString().slice(0, 16)}
                                />
                                <div className="flex justify-end pt-2">
                                    <Button size="sm" onClick={() => setIsScheduling(false)}>Done</Button>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>

                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSend} disabled={sending}>
                            {sending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {scheduledDate ? "Scheduling..." : "Sending..."}
                                </>
                            ) : (
                                <>
                                    {scheduledDate ? <CalendarIcon className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                                    {scheduledDate ? "Schedule" : "Send"}
                                </>
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
