import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEmailAI } from "@/hooks/use-email-ai";
import {
    Command,
    CommandGroup,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Send, Loader2, Sparkles } from "lucide-react";
import { Contact } from "@/types/crm";

interface ComposeEmailDialogProps {
    contact: Contact | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Email templates
const TEMPLATES = [
    {
        name: "VC Intro",
        subject: "Quick intro - [Your Background]",
        body: `Hi {{first_name}},

I came across your profile and was impressed by [specific observation].

I'm reaching out because [brief value prop]. I'd love to learn more about [their work/company].

Would you be open to a brief call next week?

Best,
[Your Name]`,
    },
    {
        name: "Job Application",
        subject: "Application - [Position] at [Company]",
        body: `Hi {{first_name}},

I'm excited to apply for the [Position] role at [Company].

My background in [relevant experience] aligns well with what you're looking for. [Specific achievement].

I've attached my resume for your review. I'd welcome the opportunity to discuss how I can contribute to your team.

Best regards,
[Your Name]`,
    },
    {
        name: "Follow Up",
        subject: "Following up on our conversation",
        body: `Hi {{first_name}},

I wanted to follow up on [previous context].

[Additional value/question].

Looking forward to hearing from you.

Best,
[Your Name]`,
    },
];

export function ComposeEmailDialog({
    contact,
    open,
    onOpenChange,
}: ComposeEmailDialogProps) {
    const [to, setTo] = useState("");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const [gmailConnected, setGmailConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);

    // AI State
    const { draftEmail, generateSubjectLines, drafting, generatingSubjects } = useEmailAI();
    const [subjectSuggestions, setSubjectSuggestions] = useState<string[]>([]);
    const [suggestionsOpen, setSuggestionsOpen] = useState(false);

    // Check Gmail connection status
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const connected = await invoke<boolean>("gmail_status");
                setGmailConnected(connected);
            } catch (err) {
                console.error("Failed to check Gmail status:", err);
            }
        };
        if (open) {
            checkStatus();
        }
    }, [open]);

    // Pre-fill email when contact changes
    useEffect(() => {
        if (contact?.email) {
            setTo(contact.email);
        }
    }, [contact]);

    const handleConnect = async () => {
        setConnecting(true);
        try {
            await invoke("gmail_connect");
            setGmailConnected(true);
        } catch (err) {
            alert(`Failed to connect: ${err}`);
        } finally {
            setConnecting(false);
        }
    };

    const handleSend = async () => {
        if (!to || !subject || !body) {
            alert("Please fill in all fields");
            return;
        }

        setSending(true);
        try {
            await invoke("send_email", { to, subject, body });
            alert("Email sent successfully!");
            onOpenChange(false);
            setSubject("");
            setBody("");
        } catch (err) {
            alert(`Failed to send: ${err}`);
        } finally {
            setSending(false);
        }
    };

    const applyTemplate = (template: typeof TEMPLATES[0]) => {
        const firstName = contact?.first_name || "there";
        setSubject(template.subject);
        setBody(template.body.replace(/\{\{first_name\}\}/g, firstName));
    };

    const insertHook = () => {
        if (contact?.intelligence_summary) {
            setBody((prev) => prev + "\n\n---\n" + contact.intelligence_summary);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Compose Email
                    </DialogTitle>
                    <DialogDescription>
                        {gmailConnected
                            ? `Sending as your connected Gmail account`
                            : `Connect Gmail to send emails directly`}
                    </DialogDescription>
                </DialogHeader>

                {!gmailConnected ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <p className="text-muted-foreground text-center">
                            Connect your Gmail account to send emails directly from OutreachOS.
                        </p>
                        <Button onClick={handleConnect} disabled={connecting}>
                            {connecting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Connecting...
                                </>
                            ) : (
                                <>
                                    <Mail className="mr-2 h-4 w-4" />
                                    Connect Gmail
                                </>
                            )}
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Templates */}
                        <div className="flex gap-2 flex-wrap">
                            {TEMPLATES.map((template) => (
                                <Button
                                    key={template.name}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => applyTemplate(template)}
                                >
                                    {template.name}
                                </Button>
                            ))}
                            {contact?.intelligence_summary && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={insertHook}
                                    className="ml-auto"
                                >
                                    <Sparkles className="mr-1 h-3 w-3" />
                                    Insert Hook
                                </Button>
                            )}
                        </div>

                        {/* Form */}
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label htmlFor="to">To</Label>
                                <Input
                                    id="to"
                                    type="email"
                                    value={to}
                                    onChange={(e) => setTo(e.target.value)}
                                    placeholder="recipient@example.com"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="subject">Subject</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="subject"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        placeholder="Email subject"
                                    />
                                    <Popover open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={async () => {
                                                    if (!contact) {
                                                        toast.error("Contact context needed for AI");
                                                        return;
                                                    }
                                                    const lines = await generateSubjectLines(contact.id);
                                                    setSubjectSuggestions(lines);
                                                    setSuggestionsOpen(true);
                                                }}
                                                disabled={generatingSubjects}
                                            >
                                                {generatingSubjects ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Sparkles className="h-4 w-4 text-purple-600" />
                                                )}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0" align="end">
                                            <Command>
                                                <CommandList>
                                                    <CommandGroup heading="AI Suggestions">
                                                        {subjectSuggestions.map((suggestion) => (
                                                            <CommandItem
                                                                key={suggestion}
                                                                onSelect={() => {
                                                                    setSubject(suggestion);
                                                                    setSuggestionsOpen(false);
                                                                }}
                                                            >
                                                                <Sparkles className="mr-2 h-3 w-3" />
                                                                {suggestion}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                            <div className="space-y-1 relative">
                                <Label htmlFor="body">Message</Label>
                                <Textarea
                                    id="body"
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    placeholder="Write your message..."
                                    rows={10}
                                    className="resize-none"
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="absolute top-6 right-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                    onClick={async () => {
                                        if (!contact) {
                                            toast.error("Contact context needed for AI");
                                            return;
                                        }
                                        const draft = await draftEmail(contact.id);
                                        setBody(draft);
                                    }}
                                    disabled={drafting}
                                >
                                    {drafting ? (
                                        <>
                                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                            Drafting...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="mr-1 h-3 w-3" />
                                            Draft with AI
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    {gmailConnected && (
                        <Button onClick={handleSend} disabled={sending}>
                            {sending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <Send className="mr-2 h-4 w-4" />
                                    Send
                                </>
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
