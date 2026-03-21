import { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Contact, ContactEvent } from "@/types/crm";
import { useErrors } from "@/hooks/use-errors";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Mail, Linkedin, Calendar, MapPin, Building, Loader2, Sparkles, Briefcase, Copy, RotateCw, MoreHorizontal, Send, Check, Pencil, Trash2, Tag as TagIcon, Plus, X, Clock, RefreshCw } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { StatusPicker } from "@/components/contacts/status-picker";
import { getInitials, cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditContactDialog } from "@/components/contacts/edit-contact-dialog";
import { ManageTagsDialog } from "@/components/tags/manage-tags-dialog";
import { useTags } from "@/hooks/use-tags";
import { ComposeEmailDialog } from "@/components/email/compose-email-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailHistoryTab } from "@/components/contacts/email-history-tab";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { formatDistanceToNow, format } from "date-fns";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";

export function ContactDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [contact, setContact] = useState<Contact | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
    const [isEmailOpen, setIsEmailOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
    const [isSummaryEditOpen, setIsSummaryEditOpen] = useState(false);
    const [summaryDraft, setSummaryDraft] = useState("");
    const [events, setEvents] = useState<ContactEvent[]>([]);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [activity, setActivity] = useState<ContactEvent[]>([]);
    const [activityLoading, setActivityLoading] = useState(true);
    const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<ContactEvent | null>(null);
    const [eventTitleDraft, setEventTitleDraft] = useState("");
    const [eventDateDraft, setEventDateDraft] = useState<Date | undefined>(undefined);
    const [eventTimeDraft, setEventTimeDraft] = useState("10:00");
    const [eventDescDraft, setEventDescDraft] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const { setCommandOpen } = useOutletContext<{ setCommandOpen: (open: boolean) => void }>();
    // const { statuses } = useStatuses(); // Not used for progress bar anymore

    const { tags: availableTags, assignTag, unassignTag } = useTags();
    const { handleError } = useErrors();

    // Fetch Contact
    const fetchContact = async () => {
        if (!id) return;
        try {
            // ContactWithTags uses #[serde(flatten)], so all Contact fields + tags are at root
            const result = await invoke<Contact & { tags: Contact['tags'] }>("get_contact_by_id", { id });
            setContact(result);
        } catch (err) {
            handleError(err, "Failed to load contact");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContact();
        fetchEvents();
        fetchActivity();
    }, [id]);

    const fetchEvents = async () => {
        if (!id) return;
        setEventsLoading(true);
        try {
            const result = await invoke<ContactEvent[]>("get_contact_events", { contactId: id });
            setEvents(result);
        } catch (err) {
            handleError(err, "Failed to load events");
        } finally {
            setEventsLoading(false);
        }
    };

    const fetchActivity = async () => {
        if (!id) return;
        setActivityLoading(true);
        try {
            const result = await invoke<ContactEvent[]>("get_contact_activity", { contactId: id });
            setActivity(result);
        } catch (err) {
            // Silently fail — activity is non-critical
            console.error("Failed to load activity:", err);
        } finally {
            setActivityLoading(false);
        }
    };

    const handleSyncEmails = async () => {
        if (!id) return;
        setIsSyncing(true);
        try {
            await invoke("sync_contact_emails", { contactId: id });
            toast.success("Email sync started. This may take a moment to reflect.");
            // Refresh contact to get updated last_interaction_at
            setTimeout(fetchContact, 2000);
        } catch (err) {
            handleError(err, "Failed to sync emails");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSaveEvent = async () => {
        if (!id) return;
        if (!eventTitleDraft || !eventDateDraft) {
            toast.error("Please provide a title and date");
            return;
        }

        try {
            // Combine date and time
            const [hours, minutes] = eventTimeDraft.split(':').map(Number);
            const eventAt = new Date(eventDateDraft);
            eventAt.setHours(hours, minutes, 0, 0);

            if (selectedEvent) {
                await invoke("update_contact_event", {
                    args: {
                        id: selectedEvent.id,
                        title: eventTitleDraft,
                        description: eventDescDraft || null,
                        eventAt: eventAt.toISOString()
                    }
                });
                toast.success("Event updated");
            } else {
                await invoke("create_contact_event", {
                    args: {
                        contactId: id,
                        title: eventTitleDraft,
                        description: eventDescDraft || null,
                        eventAt: eventAt.toISOString()
                    }
                });
                toast.success("Event created");
            }
            fetchEvents();
            setIsEventDialogOpen(false);
            resetEventDrafts();
        } catch (err) {
            handleError(err, "Failed to save event");
        }
    };

    const handleDeleteEvent = async (eventId: string) => {
        try {
            await invoke("delete_contact_event", { id: eventId });
            toast.success("Event deleted");
            fetchEvents();
        } catch (err) {
            handleError(err, "Failed to delete event");
        }
    };

    const resetEventDrafts = () => {
        setSelectedEvent(null);
        setEventTitleDraft("");
        setEventDateDraft(new Date());
        setEventTimeDraft("10:00");
        setEventDescDraft("");
    };

    const openCreateEvent = () => {
        resetEventDrafts();
        setIsEventDialogOpen(true);
    };

    const openEditEvent = (event: ContactEvent) => {
        setSelectedEvent(event);
        setEventTitleDraft(event.title);
        const d = new Date(event.event_at);
        setEventDateDraft(d);
        setEventTimeDraft(format(d, "HH:mm"));
        setEventDescDraft(event.description || "");
        setIsEventDialogOpen(true);
    };

    const handleSaveSummary = async () => {
        if (!contact) return;
        try {
            await invoke("update_contact", {
                args: {
                    id: contact.id,
                    intelligenceSummary: summaryDraft
                }
            });
            await fetchContact();
            setIsSummaryEditOpen(false);
        } catch (error) {
            handleError(error, "Failed to save summary");
        }
    };

    const handleDelete = async () => {
        if (!contact) return;
        try {
            await invoke("delete_contact", { id: contact.id });
            navigate("/");
        } catch (error) {
            console.error("Delete failed:", error);
        }
    };

    const handleEmail = () => {
        setIsEmailOpen(true);
    };

    const handleCopy = () => {
        if (!contact) return;
        const text = `${contact.first_name} ${contact.last_name}\n${contact.title || ""} ${contact.company ? "at " + contact.company : ""}\n${contact.email || ""}\n${contact.linkedin_url || ""}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getWebsiteUrl = (url: string) => {
        if (!url) return "";
        if (url.startsWith("http")) return url;
        return `https://${url}`;
    };



    if (loading) {
        return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
    }

    if (!contact) {
        return <div className="flex h-screen items-center justify-center">Contact not found</div>;
    }

    return (
        <>
            <div className="min-h-screen bg-background border-l font-sans flex flex-col">
                <PageHeader
                    onSearchClick={() => setCommandOpen(true)}
                    leftActions={
                        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => navigate("/contacts")}>
                            <ArrowLeft className="h-4 w-4" />
                            Back to Contacts
                        </Button>
                    }
                />

                <div className="grid grid-cols-12 min-h-[calc(100vh-60px)]">
                    {/* LEFT COLUMN: Profile & Context */}
                    <div className="col-span-12 md:col-span-4 lg:col-span-3 border-r bg-muted/10 p-6 flex flex-col gap-6">

                        {/* Identity Section */}
                        <div className="space-y-4">
                            <Avatar className="h-20 w-20 border shadow-sm">
                                <AvatarImage src={`https://logo.clearbit.com/${contact.company_website}`} alt={contact.company} className="object-cover bg-white" />
                                <AvatarFallback className="text-xl bg-primary/10 text-primary">
                                    {getInitials(contact.first_name, contact.last_name)}
                                </AvatarFallback>
                            </Avatar>

                            <div>
                                <h1 className="text-xl font-bold tracking-tight">{contact.first_name} {contact.last_name}</h1>
                                {contact.title && <p className="text-muted-foreground font-medium">{contact.title}</p>}
                                <p className="text-muted-foreground/80 text-sm flex items-center gap-1.5 mt-1">
                                    {contact.company && (
                                        <>
                                            Is at <span className="font-medium text-foreground">{contact.company}</span>
                                        </>
                                    )}
                                </p>
                            </div>

                            {/* Primary Action Row */}
                            <div className="flex items-center gap-2">
                                <Button className="flex-1 gap-2 shadow-sm" variant="outline" onClick={handleEmail} disabled={!contact.email}>
                                    <Mail className="h-4 w-4" />
                                    Compose email
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn("h-9 w-9 transition-all duration-200", copied ? "text-green-500 bg-green-50/10" : "text-muted-foreground")}
                                    title="Copy Info"
                                    onClick={handleCopy}
                                >
                                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                </Button>
                                {contact.linkedin_url && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 text-muted-foreground hover:text-primary transition-colors"
                                        title="LinkedIn Profile"
                                        onClick={() => invoke("open_external_url", { url: getWebsiteUrl(contact.linkedin_url!) })}
                                    >
                                        <Linkedin className="h-4 w-4" />
                                    </Button>
                                )}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground cursor-pointer" title="More">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="cursor-pointer">
                                            <Pencil className="mr-2 h-4 w-4" /> Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)} className="text-red-600 focus:text-red-600 cursor-pointer">
                                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        <div className="h-px bg-border w-full" />

                        {/* Details List */}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground w-1/3">
                                    <Briefcase className="h-3 w-3" />
                                    Name
                                </div>
                                <div className="text-sm font-medium w-2/3 truncate">{contact.first_name} {contact.last_name}</div>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground w-1/3">
                                    <Briefcase className="h-3 w-3" />
                                    Description
                                </div>
                                <div className="text-sm w-2/3 truncate" title={`${contact.title || ""} at ${contact.company || ""}`}>
                                    {contact.title && contact.company ? `${contact.title} at ${contact.company}` : (contact.title || contact.company || "-")}
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground w-1/3">
                                    <Mail className="h-3 w-3" />
                                    Email
                                </div>
                                <div className="w-2/3 flex justify-start">
                                    {contact.email ? (
                                        <Badge variant="outline" className="font-normal text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors px-2 py-0.5 h-6" onClick={handleEmail}>
                                            {contact.email}
                                        </Badge>
                                    ) : (
                                        <span className="text-sm text-muted-foreground">-</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground w-1/3">
                                    <MapPin className="h-3 w-3" />
                                    Location
                                </div>
                                <div className="text-sm w-2/3 truncate">{contact.location || "-"}</div>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground w-1/3">
                                    <Building className="h-3 w-3" />
                                    Company
                                </div>
                                <div className="text-sm w-2/3 flex items-center gap-2">
                                    {contact.company ? (
                                        <>
                                            <Avatar className="h-5 w-5 rounded-sm">
                                                <AvatarImage src={`https://logo.clearbit.com/${contact.company_website}`} />
                                                <AvatarFallback className="rounded-sm bg-muted text-[10px]">{contact.company[0]}</AvatarFallback>
                                            </Avatar>
                                            {contact.company_website ? (
                                                <button 
                                                    onClick={() => invoke("open_external_url", { url: getWebsiteUrl(contact.company_website!) })}
                                                    className="truncate underline decoration-dotted underline-offset-2 hover:text-primary cursor-pointer border-none bg-transparent p-0 text-left"
                                                >
                                                    {contact.company}
                                                </button>
                                            ) : (
                                                <span className="truncate">{contact.company}</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-sm text-muted-foreground">-</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground w-1/3">
                                    <RotateCw className="h-3 w-3" />
                                    Last interact...
                                </div>
                                <div className="text-sm w-2/3 truncate">
                                    {contact.last_contacted_date ? (
                                        (() => {
                                            try {
                                                const d = new Date(contact.last_contacted_date);
                                                if (isNaN(d.getTime())) return "Never";
                                                return formatDistanceToNow(d, { addSuffix: true });
                                            } catch (e) {
                                                return "Never";
                                            }
                                        })()
                                    ) : "Never"}
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground w-1/3">
                                    <Clock className="h-3 w-3" />
                                    Next Contact
                                </div>
                                <div className="w-2/3 flex justify-start">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <div className="cursor-pointer">
                                                {contact.next_contact_date ? (
                                                    <Badge variant="secondary" className="font-normal hover:bg-muted transition-colors px-2 py-0.5 h-6">
                                                        {format(new Date(contact.next_contact_date), "MMM d, yyyy")}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted underline-offset-4">
                                                        Set follow-up
                                                    </span>
                                                )}
                                            </div>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <CalendarComponent
                                                mode="single"
                                                selected={contact.next_contact_date ? new Date(contact.next_contact_date) : undefined}
                                                onSelect={async (date) => {
                                                    try {
                                                        await invoke("update_contact", {
                                                            args: {
                                                                id: contact.id,
                                                                nextContactDate: date ? date.toISOString() : null
                                                            }
                                                        });
                                                        fetchContact();
                                                        toast.success("Follow-up date updated");
                                                    } catch (err) {
                                                        handleError(err, "Failed to update date");
                                                    }
                                                }}
                                                initialFocus
                                            />
                                            {contact.next_contact_date && (
                                                <div className="p-2 border-t flex justify-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-xs text-red-500 hover:text-red-600 w-full h-8"
                                                        onClick={async () => {
                                                            try {
                                                                await invoke("clear_contact_next_date", {
                                                                    id: contact.id
                                                                });
                                                                fetchContact();
                                                                toast.success("Follow-up date cleared");
                                                            } catch (err) {
                                                                handleError(err, "Failed to clear date");
                                                            }
                                                        }}
                                                    >
                                                        Clear Date
                                                    </Button>
                                                </div>
                                            )}
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                            <div className="flex items-start justify-between py-2 pt-4 border-t mt-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground w-1/3 pt-1">
                                    <TagIcon className="h-3 w-3" />
                                    Tags
                                </div>
                                <div className="w-2/3 flex flex-wrap gap-1.5 min-h-[24px]">
                                    {contact.tags?.map((tag) => (
                                        <Badge key={tag.id} variant="outline" className="font-normal text-[10px] px-1.5 py-0.5 h-auto flex items-center gap-1 bg-background" style={{ borderColor: `${tag.color}60`, color: tag.color }}>
                                            {tag.name}
                                            <div
                                                role="button"
                                                className="cursor-pointer hover:bg-muted-foreground/10 rounded-full h-3.5 w-3.5 flex items-center justify-center transition-colors"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    await unassignTag(contact.id, tag.id);
                                                    fetchContact();
                                                }}
                                            >
                                                <X className="h-2.5 w-2.5" />
                                            </div>
                                        </Badge>
                                    ))}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted ml-0.5">
                                                <Plus className="h-3.5 w-3.5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-[180px]">
                                            {availableTags.filter(t => !contact.tags?.some(ct => ct.id === t.id)).length === 0 ? (
                                                <div className="p-2 text-xs text-muted-foreground text-center">No more tags</div>
                                            ) : (
                                                availableTags.filter(t => !contact.tags?.some(ct => ct.id === t.id)).map(tag => (
                                                    <DropdownMenuItem
                                                        key={tag.id}
                                                        onClick={async () => {
                                                            await assignTag(contact.id, tag.id);
                                                            fetchContact();
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                                                            {tag.name}
                                                        </div>
                                                    </DropdownMenuItem>
                                                ))
                                            )}
                                            <div className="h-px bg-border my-1" />
                                            <DropdownMenuItem onClick={() => setIsManageTagsOpen(true)}>
                                                <div className="flex items-center gap-2 text-primary">
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Manage Tags
                                                </div>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Content (Highlights + Activity) */}
                    <div className="col-span-12 md:col-span-8 lg:col-span-9 p-8 bg-background overflow-y-auto flex flex-col gap-14 w-full">

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10 w-full">
                            {/* LEFT COLUMN: Highlights */}
                            <section className="flex flex-col">
                                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                                    Highlights
                                </h2>
                                {/* Summary Card */}
                                <Card
                                    className={cn(
                                        "shadow-sm transition-all duration-200 flex-1 min-h-[250px] flex flex-col",
                                        contact.intelligence_summary && "hover:shadow-md cursor-pointer hover:bg-muted/30"
                                    )}
                                >
                                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Summary</CardTitle>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSummaryDraft(contact.intelligence_summary || "");
                                                setIsSummaryEditOpen(true);
                                            }}
                                        >
                                            <Pencil className="h-3 w-3" />
                                            Update
                                        </Button>
                                    </CardHeader>
                                    <CardContent onClick={() => contact.intelligence_summary && setIsSummaryExpanded(!isSummaryExpanded)}>
                                        <div className="text-sm leading-relaxed">
                                            {contact.intelligence_summary ? (
                                                <p className={cn("whitespace-pre-wrap text-muted-foreground/90", !isSummaryExpanded && "line-clamp-4")}>
                                                    {contact.intelligence_summary}
                                                </p>
                                            ) : (
                                                <div className="text-muted-foreground italic text-xs">
                                                    No summary available. Click "Update" to add focused insights for this contact.
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </section>

                            {/* RIGHT COLUMN: Upcoming Events */}
                            <section className="flex flex-col">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-semibold flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        Upcoming Events
                                    </h2>
                                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={openCreateEvent}>
                                        <Plus className="h-3.5 w-3.5" />
                                        Add Event
                                    </Button>
                                </div>

                                {eventsLoading ? (
                                    <div className="flex justify-center p-8 flex-1 min-h-[250px] items-center"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>
                                ) : events.length === 0 ? (
                                    <Card className="border-dashed bg-muted/20 flex-1 min-h-[250px] flex flex-col items-center justify-center">
                                        <CardContent className="p-8 flex flex-col items-center text-center">
                                            <Calendar className="h-8 w-8 text-muted-foreground/40 mb-3" />
                                            <p className="text-sm text-muted-foreground">No upcoming events scheduled.</p>
                                            <Button variant="link" className="mt-2 h-auto p-0" onClick={openCreateEvent}>Schedule your first event</Button>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <ScrollArea className="h-[225px]">
                                        <div className="space-y-4 pr-3 [mask-image:linear-gradient(to_bottom,black_80%,transparent_100%)]">
                                            {events.map(event => (
                                                <Card key={event.id} className="shadow-sm hover:shadow-md transition-shadow group">
                                                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                                        <CardTitle className="text-sm font-medium truncate pr-8">{event.title}</CardTitle>
                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEvent(event)}>
                                                                <Pencil className="h-3 w-3" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteEvent(event.id)}>
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                                            <div className="flex items-center gap-1">
                                                                <Calendar className="h-3 w-3" />
                                                                {format(new Date(event.event_at), "MMM d, yyyy")}
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3 ml-1" />
                                                                {format(new Date(event.event_at), "h:mm a")}
                                                            </div>
                                                        </div>
                                                        {event.description && (
                                                            <p className="text-xs text-muted-foreground/80 line-clamp-2">{event.description}</p>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                )}
                            </section>

                            {/* Row 2: Company & LinkedIn */}
                            <section>
                                <div className="flex items-center gap-2 mb-4">
                                    <Building className="h-4 w-4 text-muted-foreground" />
                                    <h2 className="text-lg font-semibold">Company</h2>
                                </div>
                                <Card className="shadow-sm hover:shadow-md transition-shadow h-[100px] flex flex-col justify-center">
                                    <CardContent className="flex items-center gap-3 pt-0">
                                        <Avatar className="h-10 w-10 rounded-md border">
                                            <AvatarImage src={`https://logo.clearbit.com/${contact.company_website}`} />
                                            <AvatarFallback className="rounded-md bg-muted text-xs">{contact.company ? contact.company[0] : "C"}</AvatarFallback>
                                        </Avatar>
                                        <div className="overflow-hidden">
                                            <div className="font-medium truncate">{contact.company || "Unknown"}</div>
                                            <div className="text-xs text-muted-foreground truncate">{contact.location || "-"}</div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </section>

                            <section>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="h-5 w-5 rounded bg-[#0077b5] flex items-center justify-center text-white font-bold text-[10px]">in</div>
                                    <h2 className="text-lg font-semibold">LinkedIn</h2>
                                </div>
                                <Card className="shadow-sm hover:shadow-md transition-shadow h-[100px] flex flex-col justify-center">
                                    <CardContent className="pt-0">
                                        {contact.linkedin_url ? (
                                            <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:underline break-all">
                                                {contact.linkedin_url}
                                            </a>
                                        ) : (
                                            <div className="text-muted-foreground text-sm">No LinkedIn profile linked.</div>
                                        )}
                                    </CardContent>
                                </Card>
                            </section>
                        </div>

                        {/* Pipeline Status Section */}
                        <section>
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Send className="h-4 w-4 text-muted-foreground" />
                                Pipeline Status
                            </h2>
                            <Card className="shadow-sm hover:shadow-md transition-shadow">
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-sm font-medium flex items-center gap-2">
                                            <span className="text-muted-foreground">Stage:</span>
                                            <div onClick={(e) => e.stopPropagation()}>
                                                <StatusPicker
                                                    currentStatusId={contact.status_id}
                                                    onStatusChange={async (newId) => {
                                                        await invoke("update_contact", {
                                                            args: { id: contact.id, statusId: newId }
                                                        });
                                                        // Optimistic UI update
                                                        setContact(prev => prev ? { ...prev, status_id: newId } : null);
                                                        // Refresh activity tab in real-time
                                                        fetchActivity();
                                                    }}
                                                    className="h-7"
                                                />
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground">Automated email</div>
                                    </div>
                                    {/* Status Progress Bar */}
                                    <div className="flex gap-1 h-1.5 mt-3">
                                        {(() => {
                                            // Define the 4 steps
                                            const steps = [
                                                { id: 'stat-new', color: '#3b82f6' },       // New
                                                { id: 'stat-contacted', color: '#eab308' }, // Contacted
                                                { id: 'stat-replied', color: '#a855f7' },   // Replied
                                                { id: 'stat-final', color: '#64748b' }      // Final (Int/NI)
                                            ];

                                            // Determine current step index
                                            let currentStep = 0;
                                            const sId = contact.status_id;
                                            if (sId === 'stat-contacted') currentStep = 1;
                                            else if (sId === 'stat-replied') currentStep = 2;
                                            else if (sId === 'stat-interested' || sId === 'stat-not-interested' || sId === 'stat-int-ni') currentStep = 3;

                                            // Determine color for the final step if active
                                            let finalColor = '#64748b';
                                            if (sId === 'stat-interested') finalColor = '#22c55e'; // Green
                                            else if (sId === 'stat-not-interested') finalColor = '#ef4444'; // Red

                                            return steps.map((step, index) => {
                                                const isActive = index <= currentStep;
                                                let color = step.color;

                                                // Use specific color for final step if active
                                                if (index === 3 && isActive) {
                                                    color = finalColor;
                                                }

                                                return (
                                                    <div
                                                        key={index}
                                                        className={cn(
                                                            "flex-1 rounded-full transition-all",
                                                            isActive ? "opacity-100" : "opacity-20"
                                                        )}
                                                        style={{ backgroundColor: isActive ? color : undefined }}
                                                    >
                                                        {!isActive && (
                                                            <div className="w-full h-full bg-muted rounded-full" />
                                                        )}
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </CardContent>
                            </Card>
                        </section>

                        {/* Activity & History Section */}
                        <section>
                            <Tabs defaultValue="emails" className="w-full">
                                <div className="flex items-center justify-between mb-6">
                                    <TabsList className="bg-muted/50 p-1">
                                        <TabsTrigger value="emails" className="flex items-center gap-2 data-[state=active]:bg-background">
                                            <Mail className="h-4 w-4" />
                                            Emails
                                        </TabsTrigger>
                                        <TabsTrigger value="activity" className="flex items-center gap-2 data-[state=active]:bg-background">
                                            <Briefcase className="h-4 w-4" />
                                            Activity
                                        </TabsTrigger>
                                    </TabsList>
                                    {id && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-2 text-muted-foreground hover:text-foreground"
                                            onClick={handleSyncEmails}
                                            disabled={isSyncing}
                                        >
                                            <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
                                            {isSyncing ? "Syncing..." : "Sync Email"}
                                        </Button>
                                    )}
                                </div>

                                <TabsContent value="activity" className="mt-0">
                                    <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                                        <div className="p-1 rounded bg-muted">
                                            <Briefcase className="h-4 w-4 text-foreground" />
                                        </div>
                                        Activity
                                    </h2>
                                    <Card className="border shadow-sm">
                                        <div className="divide-y">
                                            {activityLoading ? (
                                                <div className="flex justify-center p-8 items-center">
                                                    <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
                                                </div>
                                            ) : (
                                                <>
                                                    {activity.length === 0 && (
                                                        <div className="p-6 text-center">
                                                            <p className="text-sm text-muted-foreground">
                                                                Nothing here yet. Change a status or send an email to see activity.
                                                            </p>
                                                        </div>
                                                    )}
                                                    {activity.map((event) => {
                                                        const isEmail = event.title.startsWith("Email sent:") || event.title.startsWith("Email received:") || event.title.startsWith("Email scheduled:");
                                                        const isStatus = event.title.startsWith("Moved to");
                                                        const isTag = event.title.startsWith("Tag added:") || event.title.startsWith("Tag removed:");
                                                        const IconComp = isEmail ? Mail : isStatus ? ArrowRight : isTag ? TagIcon : Calendar;
                                                        return (
                                                            <div key={event.id} className="p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors">
                                                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center border shrink-0 mt-0.5">
                                                                    <IconComp className="h-4 w-4 text-muted-foreground" />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm text-foreground">{event.title}</p>
                                                                    {event.description && (
                                                                        <p className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-2">{event.description}</p>
                                                                    )}
                                                                    <p className="text-xs text-muted-foreground mt-1">
                                                                        {formatDistanceToNow(new Date(event.event_at), { addSuffix: true })}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {/* Sentinel: contact creation — always pinned at the bottom */}
                                                    <div className="p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors">
                                                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center border shrink-0 mt-0.5">
                                                            <Check className="h-4 w-4 text-muted-foreground" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-foreground">Contact created</p>
                                                            <p className="text-xs text-muted-foreground mt-1">
                                                                {formatDistanceToNow(new Date(contact.created_at), { addSuffix: true })}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </Card>
                                </TabsContent>


                                <TabsContent value="emails" className="mt-0">
                                    <Card className="border shadow-sm">
                                        <CardContent className="p-0">
                                            <EmailHistoryTab contact={contact} />
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            </Tabs>
                        </section>
                    </div>
                </div>
            </div>

            {/* Dialogs */}
            {
                contact && (
                    <>
                        <EditContactDialog
                            contact={contact}
                            open={isEditOpen}
                            onOpenChange={setIsEditOpen}
                            onContactUpdated={fetchContact}
                        />

                        <ManageTagsDialog
                            open={isManageTagsOpen}
                            onOpenChange={setIsManageTagsOpen}
                        />

                        <ComposeEmailDialog
                            contact={contact}
                            open={isEmailOpen}
                            onOpenChange={setIsEmailOpen}
                            onEmailSent={fetchActivity}
                        />

                        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently delete <strong>{contact.first_name} {contact.last_name}</strong> and all their interaction history. This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
                                        Delete Contact
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>

                        {/* Event Edit/Create Dialog */}
                        <Dialog open={isEventDialogOpen} onOpenChange={(open) => {
                            if (!open) setIsEventDialogOpen(false);
                        }}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>{selectedEvent ? "Edit Event" : "Add Event"}</DialogTitle>
                                    <DialogDescription>
                                        Schedule a call, meeting, or follow-up for <strong>{contact.first_name}</strong>.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium uppercase text-muted-foreground">Title</label>
                                        <Input
                                            placeholder="e.g. Project Kickoff"
                                            value={eventTitleDraft}
                                            onChange={(e) => setEventTitleDraft(e.target.value)}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium uppercase text-muted-foreground">Date</label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !eventDateDraft && "text-muted-foreground")}>
                                                        <Calendar className="mr-2 h-4 w-4" />
                                                        {eventDateDraft ? format(eventDateDraft, "PPP") : <span>Pick a date</span>}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0">
                                                    <CalendarComponent
                                                        mode="single"
                                                        selected={eventDateDraft}
                                                        onSelect={setEventDateDraft}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium uppercase text-muted-foreground">Time</label>
                                            <Input
                                                type="time"
                                                value={eventTimeDraft}
                                                onChange={(e) => setEventTimeDraft(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium uppercase text-muted-foreground">Description (Optional)</label>
                                        <Textarea
                                            placeholder="Call notes or objective..."
                                            value={eventDescDraft}
                                            onChange={(e) => setEventDescDraft(e.target.value)}
                                            className="resize-none"
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="ghost" onClick={() => setIsEventDialogOpen(false)}>Cancel</Button>
                                    <Button onClick={handleSaveEvent}>Save Event</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        {/* Summary Edit Dialog */}
                        <Dialog open={isSummaryEditOpen} onOpenChange={setIsSummaryEditOpen}>
                            <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>Contact Summary</DialogTitle>
                                    <DialogDescription>
                                        Add key context or focused insights for <strong>{contact.first_name}</strong>.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                    <Textarea
                                        placeholder="Type a summary..."
                                        className="min-h-[200px] resize-none focus-visible:ring-primary/30"
                                        value={summaryDraft}
                                        onChange={(e) => setSummaryDraft(e.target.value)}
                                    />
                                </div>
                                <DialogFooter>
                                    <Button variant="ghost" onClick={() => setIsSummaryEditOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleSaveSummary}>
                                        Save Summary
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
        </>
    )
}
