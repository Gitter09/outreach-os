import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Contact, EmailMessage } from "@/types/crm";
import { useErrors } from "@/hooks/use-errors";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Mail, ArrowUpRight, ArrowDownLeft, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";



interface EmailHistoryTabProps {
    contact: Contact;
}

function EmailMessageItem({ email, contact }: { email: EmailMessage, contact: Contact }) {
    const isOutbound = email.from_email !== contact.email;

    return (
        <div className="flex gap-4 group">
            <div className={`mt-1 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isOutbound ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                {isOutbound ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
            </div>
            <div className="flex-1 space-y-2 border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors shadow-sm">
                <div className="flex justify-between items-start">
                    <h4 className="text-sm font-semibold">{email.subject || "(No Subject)"}</h4>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {email.sent_at ? format(new Date(email.sent_at), "MMM d, yyyy") : "(Unknown Date)"}
                    </span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>{isOutbound ? `To: ${email.to_email}` : `From: ${email.from_email}`}</span>
                    <div className="flex items-center gap-1.5">
                        {email.status === 'scheduled' && <Badge variant="outline" className="text-[10px] h-5">Scheduled</Badge>}
                    </div>

                </div>
                <div className="text-xs text-muted-foreground mt-3 font-mono bg-muted/30 p-3 rounded-md border border-muted/20 leading-relaxed max-h-[120px] overflow-hidden">
                    {email.body || "(No Body Content)"}
                </div>
            </div>
        </div>
    );
}

export function EmailHistoryTab({ contact }: EmailHistoryTabProps) {
    const [emails, setEmails] = useState<EmailMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const { handleError } = useErrors();

    useEffect(() => {
        const fetchEmails = async () => {
            setLoading(true);
            try {
                const data = await invoke<EmailMessage[]>("get_emails_for_contact", { contactId: contact.id });
                setEmails(data);
            } catch (error) {
                handleError(error, "Failed to fetch emails");
            } finally {
                setLoading(false);
            }
        };
        if (contact.id) {
            fetchEmails();
        }
    }, [contact.id]);

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>;
    }

    if (emails.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 rounded-lg border border-dashed h-[300px]">
                <Mail className="h-8 w-8 text-muted-foreground mb-3 opacity-50" />
                <h3 className="font-medium text-sm text-foreground">No email history</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                    Emails sent to or received from this contact will appear here.
                </p>
            </div>
        );
    }

    return (
        <ScrollArea className="h-[400px]">
            <div className="space-y-4 p-6">
                {emails.map((email) => (
                    <EmailMessageItem key={email.id} email={email} contact={contact} />
                ))}
            </div>
        </ScrollArea>
    );
}
