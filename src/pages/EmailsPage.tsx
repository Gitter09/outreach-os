import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Calendar, Loader2, Trash2, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useOutletContext, useNavigate } from "react-router-dom";
import { useErrors } from "@/hooks/use-errors";
import { ScheduledEmail, EmailMessage } from "@/types/crm";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailBody } from "@/components/email/EmailBody";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function EmailsPage() {
    const { setCommandOpen } = useOutletContext<{ setCommandOpen: (open: boolean) => void }>();
    const navigate = useNavigate();
    const { handleError } = useErrors();
    const [scheduled, setScheduled] = useState<ScheduledEmail[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancelTarget, setCancelTarget] = useState<ScheduledEmail | null>(null);
    const [inbox, setInbox] = useState<EmailMessage[]>([]);
    const [inboxLoading, setInboxLoading] = useState(true);
    const [inboxFilter, setInboxFilter] = useState<"all" | "received" | "sent">("all");

    const fetchScheduled = useCallback(async () => {
        setLoading(true);
        try {
            const data = await invoke<ScheduledEmail[]>("get_scheduled_emails", { contactId: null });
            setScheduled(data);
        } catch (err) {
            handleError(err, "Failed to load scheduled emails");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchInbox = useCallback(async (filter: "all" | "received" | "sent") => {
        setInboxLoading(true);
        try {
            const data = await invoke<EmailMessage[]>("get_all_emails", {
                statusFilter: filter === "all" ? null : filter,
                limit: 100,
                offset: 0,
            });
            setInbox(data);
        } catch (err) {
            handleError(err, "Failed to load inbox");
        } finally {
            setInboxLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchScheduled();
        fetchInbox("all");
    }, [fetchScheduled, fetchInbox]);

    const handleCancel = async () => {
        if (!cancelTarget) return;
        try {
            await invoke("cancel_scheduled_email", { id: cancelTarget.id });
            toast.success("Scheduled email cancelled");
            setScheduled((prev) => prev.filter((e) => e.id !== cancelTarget.id));
        } catch (err) {
            handleError(err, "Failed to cancel scheduled email");
        } finally {
            setCancelTarget(null);
        }
    };

    const pending = scheduled.filter((e) => e.status === "pending");
    const failed = scheduled.filter((e) => e.status === "failed");

    return (
        <div className="flex flex-col h-full relative">
            <PageHeader title="Emails" onSearchClick={() => setCommandOpen(true)} />

            <div className="flex-1 overflow-auto p-6 space-y-8">
                {/* Scheduled Section */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-muted-foreground" />
                                Scheduled
                            </h2>
                            <p className="text-sm text-muted-foreground mt-0.5">Emails queued to send automatically.</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={fetchScheduled} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        </Button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : scheduled.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                                <Calendar className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                <h3 className="text-base font-medium">Nothing scheduled</h3>
                                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                    Compose an email and pick a send date to schedule it.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-6">
                            {pending.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Pending</h3>
                                    <div className="rounded-lg border divide-y">
                                        {pending.map((email) => (
                                            <ScheduledEmailRow
                                                key={email.id}
                                                email={email}
                                                onCancel={() => setCancelTarget(email)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {failed.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Failed</h3>
                                    <div className="rounded-lg border divide-y">
                                        {failed.map((email) => (
                                            <ScheduledEmailRow
                                                key={email.id}
                                                email={email}
                                                onCancel={() => setCancelTarget(email)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Inbox */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                                <Mail className="h-5 w-5 text-muted-foreground" />
                                Inbox
                            </h2>
                            <p className="text-sm text-muted-foreground mt-0.5">All synced email conversations.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Tabs value={inboxFilter} onValueChange={(v) => {
                                const f = v as "all" | "received" | "sent";
                                setInboxFilter(f);
                                fetchInbox(f);
                            }}>
                                <TabsList className="h-8">
                                    <TabsTrigger value="all" className="text-xs px-3 h-6">All</TabsTrigger>
                                    <TabsTrigger value="received" className="text-xs px-3 h-6">Received</TabsTrigger>
                                    <TabsTrigger value="sent" className="text-xs px-3 h-6">Sent</TabsTrigger>
                                </TabsList>
                            </Tabs>
                            <Button variant="ghost" size="sm" onClick={() => fetchInbox(inboxFilter)} disabled={inboxLoading}>
                                <RefreshCw className={`h-4 w-4 ${inboxLoading ? "animate-spin" : ""}`} />
                            </Button>
                        </div>
                    </div>

                    {inboxLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : inbox.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                                <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                <h3 className="text-base font-medium">No emails yet</h3>
                                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                    Connect a Gmail account and sync to see your email history here.
                                </p>
                                <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/settings")}>
                                    Go to Settings
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="rounded-lg border divide-y">
                            {inbox.map((email) => (
                                <InboxEmailRow key={email.id} email={email} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel this scheduled email?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <strong>"{cancelTarget?.subject}"</strong> to {cancelTarget?.contactFirstName} {cancelTarget?.contactLastName} will be permanently removed. This can't be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={handleCancel}
                        >
                            Cancel send
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function InboxEmailRow({ email }: { email: EmailMessage }) {
    const [expanded, setExpanded] = useState(false);
    const isOutbound = email.status === "sent";

    return (
        <div className="bg-card hover:bg-muted/20 transition-colors">
            <button
                className="w-full flex items-start gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded((v) => !v)}
            >
                <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${isOutbound ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                    {isOutbound ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-sm truncate">{email.subject || "(No Subject)"}</span>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                            {email.sent_at ? format(new Date(email.sent_at), "MMM d, yyyy, h:mm a") : ""}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {isOutbound ? `To: ${email.to_email}` : `From: ${email.from_email}`}
                    </p>
                </div>
                <div className="shrink-0 mt-1 text-muted-foreground">
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </div>
            </button>
            {expanded && (
                <div className="px-4 pb-4 pl-14">
                    <EmailBody email={email} />
                </div>
            )}
        </div>
    );
}

function ScheduledEmailRow({ email, onCancel }: { email: ScheduledEmail; onCancel: () => void }) {
    const scheduledDate = new Date(email.scheduledAt);
    const overdue = email.status === "pending" && isPast(scheduledDate);

    return (
        <div className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors group">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm truncate">{email.subject}</span>
                    {email.status === "failed" && (
                        <Badge variant="destructive" className="text-[10px] shrink-0">Failed</Badge>
                    )}
                    {overdue && (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 shrink-0">
                            Overdue
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>To: {email.contactFirstName} {email.contactLastName}</span>
                    <span>·</span>
                    <span>{format(scheduledDate, "MMM d, h:mm a")}</span>
                    {email.errorMessage && (
                        <>
                            <span>·</span>
                            <span className="flex items-center gap-1 text-destructive">
                                <AlertCircle className="h-3 w-3" />
                                {email.errorMessage}
                            </span>
                        </>
                    )}
                </div>
            </div>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-3"
                onClick={onCancel}
                title="Cancel scheduled send"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}
