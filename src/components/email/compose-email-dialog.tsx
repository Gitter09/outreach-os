import { useState, useEffect, useRef } from "react";
import { RichTextEditor, type Editor } from "@/components/email/rich-text-editor";
import { invoke } from "@tauri-apps/api/core";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
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
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { toast } from "sonner";
import { useErrors } from "@/hooks/use-errors";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mail, Send, Loader2, Calendar as CalendarIcon, FileText, Clock, Trash2, Pencil, X, Check, Paperclip } from "lucide-react";
import { Contact, EmailAccount, EmailTemplate, ScheduledEmail, EmailSignature } from "@/types/crm";
import { format } from "date-fns";

interface ComposeEmailDialogProps {
    contact: Contact | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEmailSent?: () => void;
}

export function ComposeEmailDialog({
    contact,
    open,
    onOpenChange,
    onEmailSent,
}: ComposeEmailDialogProps) {
    const { handleError } = useErrors();
    const [to, setTo] = useState("");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);

    const [accounts, setAccounts] = useState<EmailAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>("");
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
    const [scheduledTime, setScheduledTime] = useState("");
    const [isScheduling, setIsScheduling] = useState(false);
    const [signatures, setSignatures] = useState<EmailSignature[]>([]);
    const [selectedSignatureId, setSelectedSignatureId] = useState<string>("none");
    const SIGNATURE_SEPARATOR_HTML = '<hr class="signature-separator" />';
    const [contactScheduled, setContactScheduled] = useState<ScheduledEmail[]>([]);
    const [showScheduledDialog, setShowScheduledDialog] = useState(false);
    const [editingEmail, setEditingEmail] = useState<ScheduledEmail | null>(null);
    const [editSubject, setEditSubject] = useState("");
    const [editBody, setEditBody] = useState("");
    const [editDate, setEditDate] = useState<Date | undefined>(undefined);
    const [editTime, setEditTime] = useState("");
    const [editSaving, setEditSaving] = useState(false);
    const [attachments, setAttachments] = useState<string[]>([]);

    // Variable insertion — track which field is focused
    const subjectRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<Editor | null>(null);
    const [focusedField, setFocusedField] = useState<"subject" | "body">("body");

    const AVAILABLE_VARIABLES = ["first_name", "last_name", "company", "title", "location"];

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [accts, tpl, sigs] = await Promise.all([
                    invoke<EmailAccount[]>("get_email_accounts"),
                    invoke<EmailTemplate[]>("get_email_templates"),
                    invoke<EmailSignature[]>("get_signatures"),
                ]);

                setAccounts(accts);
                if (accts.length > 0 && !selectedAccount) {
                    setSelectedAccount(accts[0].id);
                }
                setTemplates(tpl);
                setSignatures(sigs);
            } catch (err) {
                handleError(err, "Failed to load email data");
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

    // Fetch contact's scheduled emails when dialog opens with a contact
    useEffect(() => {
        if (open && contact?.id) {
            invoke<ScheduledEmail[]>("get_scheduled_emails", { contactId: contact.id })
                .then(setContactScheduled)
                .catch(() => setContactScheduled([]));
        } else {
            setContactScheduled([]);
        }
    }, [open, contact?.id]);

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
            editorRef.current?.chain().focus().insertContent(textToInsert).run();
        }
    };

    const handleAttachFiles = async () => {
        try {
            const selected = await openFileDialog({ multiple: true });
            if (!selected) return;
            const paths = Array.isArray(selected) ? selected : [selected];
            setAttachments(prev => {
                const existing = new Set(prev);
                return [...prev, ...paths.filter(p => !existing.has(p))];
            });
        } catch (err) {
            handleError(err, "Failed to open file picker");
        }
    };

    const removeAttachment = (path: string) => {
        setAttachments(prev => prev.filter(p => p !== path));
    };

    const getScheduledDateTime = (): Date | null => {
        if (!scheduledDate) return null;
        const combined = new Date(scheduledDate);
        if (scheduledTime) {
            const [hours, minutes] = scheduledTime.split(":").map(Number);
            combined.setHours(hours, minutes, 0, 0);
        } else {
            const now = new Date();
            combined.setHours(now.getHours() + 1, 0, 0, 0);
        }
        return combined;
    };

    const handleSend = async () => {
        if (!selectedAccount) {
            handleError("Please connect an email account first in Settings.");
            return;
        }
        const isBodyEmpty = !body || body === "<p></p>" || body.replace(/<[^>]*>/g, "").trim() === "";
        if (!to || !subject || isBodyEmpty) {
            handleError("Please fill in all fields");
            return;
        }

        setSending(true);
        try {
            const scheduleAt = getScheduledDateTime();
            if (scheduleAt) {
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
                    scheduledAt: Math.floor(scheduleAt.getTime() / 1000),
                    attachmentPaths: attachments,
                });
                toast.success(`Email scheduled for ${format(scheduleAt, "PP p")}`);
            } else {
                await invoke("email_send", {
                    accountId: selectedAccount,
                    contactId: contact?.id ?? null,
                    to,
                    subject,
                    body,
                    attachmentPaths: attachments,
                });
                toast.success("Email sent successfully!");
                onEmailSent?.();
            }
            onOpenChange(false);
            setSubject("");
            setBody("");
            editorRef.current?.commands.setContent("");
            setScheduledDate(undefined);
            setScheduledTime("");
            setIsScheduling(false);
            setSelectedSignatureId("none");
            setAttachments([]);
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
        editorRef.current?.commands.setContent(newBody);
        if (template.attachment_paths?.length) {
            setAttachments(prev => {
                const existing = new Set(prev);
                return [...prev, ...template.attachment_paths.filter(p => !existing.has(p))];
            });
        }
        toast.info(`Applied template: ${template.name}`);
    };

    const applySignature = (sigId: string) => {
        // Strip any previously applied signature first
        const currentHtml = editorRef.current?.getHTML() ?? body;
        const baseHtml = selectedSignatureId !== "none"
            ? currentHtml.split(SIGNATURE_SEPARATOR_HTML)[0]
            : currentHtml;

        if (sigId === "none") {
            setBody(baseHtml);
            editorRef.current?.commands.setContent(baseHtml);
            setSelectedSignatureId("none");
            return;
        }

        const sig = signatures.find((s) => s.id === sigId);
        if (sig) {
            // Support both plain-text and HTML signature content
            const sigHtml = sig.content.includes("<")
                ? sig.content
                : `<p>${sig.content.replace(/\n/g, "<br />")}</p>`;
            const newHtml = baseHtml + SIGNATURE_SEPARATOR_HTML + sigHtml;
            setBody(newHtml);
            editorRef.current?.commands.setContent(newHtml);
            setSelectedSignatureId(sigId);
        }
    };

    const openEdit = (email: ScheduledEmail) => {
        const d = new Date(email.scheduledAt);
        setEditDate(d);
        setEditTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
        setEditSubject(email.subject);
        setEditBody(email.body);
        setEditingEmail(email);
    };

    const saveEdit = async () => {
        if (!editingEmail || !editDate) return;
        setEditSaving(true);
        const combined = new Date(editDate);
        if (editTime) {
            const [h, m] = editTime.split(":").map(Number);
            combined.setHours(h, m, 0, 0);
        }
        try {
            await invoke("update_scheduled_email", {
                id: editingEmail.id,
                subject: editSubject,
                body: editBody,
                scheduledAt: Math.floor(combined.getTime() / 1000),
            });
            toast.success("Scheduled email updated");
            const updated = await invoke<ScheduledEmail[]>("get_scheduled_emails", { contactId: contact?.id });
            setContactScheduled(updated);
            setEditingEmail(null);
        } catch (err) {
            handleError(err, "Failed to update scheduled email");
        } finally {
            setEditSaving(false);
        }
    };

    const scheduleAt = getScheduledDateTime();

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
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
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

                        {signatures.length > 0 && (
                            <div className="grid grid-cols-4 gap-4 items-center">
                                <Label className="text-right">Signature</Label>
                                <div className="col-span-3">
                                    <Select value={selectedSignatureId} onValueChange={applySignature}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="No signature" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No signature</SelectItem>
                                            {signatures.map((sig) => (
                                                <SelectItem key={sig.id} value={sig.id}>
                                                    {sig.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-4 gap-4 items-start">
                            <Label htmlFor="subject" className="text-right pt-2">Subject</Label>
                            <div className="col-span-3">
                                <Input
                                    id="subject"
                                    ref={subjectRef}
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    onFocus={() => setFocusedField("subject")}
                                    placeholder="Subject line..."
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Message Body</Label>
                            <RichTextEditor
                                value={body}
                                onChange={setBody}
                                placeholder="Write your message..."
                                minHeight={280}
                                disabled={sending}
                                editorRef={editorRef}
                                onFocus={() => setFocusedField("body")}
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

                        {/* Attachments */}
                        <div className="space-y-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleAttachFiles}
                                className="h-7 px-2 text-xs gap-1.5 text-muted-foreground"
                            >
                                <Paperclip className="h-3.5 w-3.5" />
                                Attach files
                            </Button>
                            {attachments.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {attachments.map((path) => {
                                        const name = path.split("/").pop() ?? path;
                                        return (
                                            <Badge
                                                key={path}
                                                variant="secondary"
                                                className="flex items-center gap-1 text-xs font-normal max-w-[220px]"
                                            >
                                                <Paperclip className="h-3 w-3 shrink-0" />
                                                <span className="truncate">{name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeAttachment(path)}
                                                    className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5 shrink-0"
                                                    aria-label={`Remove ${name}`}
                                                >
                                                    <X className="h-2.5 w-2.5" />
                                                </button>
                                            </Badge>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>
                )}

                <DialogFooter className="flex justify-between items-center w-full sm:justify-between">
                    <Popover open={isScheduling} onOpenChange={setIsScheduling}>
                        <PopoverTrigger asChild>
                            <Button variant={scheduleAt ? "secondary" : "ghost"} size="sm">
                                <CalendarIcon className="h-4 w-4 mr-2" />
                                {scheduleAt ? format(scheduleAt, "MMM d, h:mm a") : "Schedule Send"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-4" align="start">
                            <div className="space-y-3">
                                <CalendarComponent
                                    mode="single"
                                    selected={scheduledDate}
                                    onSelect={(date) => {
                                        setScheduledDate(date);
                                        if (!scheduledTime && date) {
                                            const next = new Date();
                                            next.setHours(next.getHours() + 1, 0, 0, 0);
                                            const hh = String(next.getHours()).padStart(2, "0");
                                            const mm = String(next.getMinutes()).padStart(2, "0");
                                            setScheduledTime(`${hh}:${mm}`);
                                        }
                                    }}
                                    initialFocus
                                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                />
                                <div className="px-1">
                                    <Label className="text-xs font-medium uppercase text-muted-foreground">Time</Label>
                                    <Input
                                        type="time"
                                        value={scheduledTime}
                                        onChange={(e) => setScheduledTime(e.target.value)}
                                        className="mt-1"
                                    />
                                </div>
                                <div className="flex justify-between gap-2 pt-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setScheduledDate(undefined);
                                            setScheduledTime("");
                                            setIsScheduling(false);
                                        }}
                                    >
                                        Clear
                                    </Button>
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
                                    {scheduleAt ? "Scheduling..." : "Sending..."}
                                </>
                            ) : (
                                <>
                                    {scheduleAt ? <CalendarIcon className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                                    {scheduleAt ? "Schedule" : "Send"}
                                </>
                            )}
                        </Button>
                    </div>
                    {contact && contactScheduled.filter(e => e.status === "pending").length > 0 && (
                        <Button
                            variant="link"
                            size="sm"
                            className="text-xs text-muted-foreground h-auto p-0 ml-2"
                            onClick={() => setShowScheduledDialog(true)}
                        >
                            <Clock className="h-3 w-3 mr-1" />
                            {contactScheduled.filter(e => e.status === "pending").length} scheduled for {contact.first_name}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>

            {/* Scheduled emails for this contact */}
            <Dialog open={showScheduledDialog} onOpenChange={setShowScheduledDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Scheduled for {contact?.first_name}</DialogTitle>
                        <DialogDescription>
                            Pending emails queued to send to {contact?.first_name} {contact?.last_name}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2 max-h-[480px] overflow-y-auto">
                        {contactScheduled.filter(e => e.status === "pending").length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No pending scheduled emails.</p>
                        ) : (
                            contactScheduled.filter(e => e.status === "pending").map((email) => (
                                <div key={email.id} className="rounded-lg border bg-card">
                                    {editingEmail?.id === email.id ? (
                                        <div className="p-3 space-y-3">
                                            <Input
                                                value={editSubject}
                                                onChange={(e) => setEditSubject(e.target.value)}
                                                placeholder="Subject"
                                                autoCorrect="off"
                                                autoCapitalize="off"
                                                spellCheck={false}
                                                className="text-sm"
                                            />
                                            <Textarea
                                                value={editBody}
                                                onChange={(e) => setEditBody(e.target.value)}
                                                placeholder="Email body"
                                                autoCorrect="off"
                                                autoCapitalize="off"
                                                spellCheck={false}
                                                rows={5}
                                                className="text-sm font-sans"
                                            />
                                            <div className="flex gap-2 items-center">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" size="sm" className="text-xs gap-1">
                                                            <CalendarIcon className="h-3 w-3" />
                                                            {editDate ? format(editDate, "MMM d") : "Pick date"}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <CalendarComponent
                                                            mode="single"
                                                            selected={editDate}
                                                            onSelect={setEditDate}
                                                            initialFocus
                                                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                <Input
                                                    type="time"
                                                    value={editTime}
                                                    onChange={(e) => setEditTime(e.target.value)}
                                                    className="w-32 text-xs"
                                                />
                                                <div className="flex gap-1 ml-auto">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                        onClick={() => setEditingEmail(null)}
                                                        title="Cancel edit"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7 text-green-600 hover:text-green-700"
                                                        onClick={saveEdit}
                                                        disabled={editSaving}
                                                        title="Save changes"
                                                    >
                                                        {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between p-3 group">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">{email.subject}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {format(new Date(email.scheduledAt), "MMM d, h:mm a")}
                                                </p>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                    onClick={() => openEdit(email)}
                                                    title="Edit scheduled email"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                                    onClick={async () => {
                                                        try {
                                                            await invoke("cancel_scheduled_email", { id: email.id });
                                                            toast.success("Scheduled email cancelled");
                                                            setContactScheduled(prev => prev.filter(e => e.id !== email.id));
                                                        } catch (err) {
                                                            handleError(err, "Failed to cancel email");
                                                        }
                                                    }}
                                                    title="Cancel scheduled send"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}
