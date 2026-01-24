import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Contact } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Calendar, MapPin, Building, Loader2, Sparkles, Briefcase, Copy, RotateCw, MoreHorizontal, Send, Check, Pencil, Trash2, Tag as TagIcon, Plus, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export function ContactDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [contact, setContact] = useState<Contact | null>(null);
    const [loading, setLoading] = useState(true);
    const [enriching, setEnriching] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
    const [isEmailOpen, setIsEmailOpen] = useState(false);
    // const { statuses } = useStatuses(); // Not used for progress bar anymore

    const { tags: availableTags, assignTag, unassignTag } = useTags();

    // Fetch Contact
    const fetchContact = async () => {
        if (!id) return;
        try {
            // TODO: Add get_contact_by_id command for performance later
            const contacts = await invoke<Contact[]>("get_contacts");
            const found = contacts.find(c => c.id === id);
            setContact(found || null);
        } catch (err) {
            console.error("Failed to fetch contact:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContact();
    }, [id]);

    const handleEnrich = async () => {
        if (!contact) return;
        setEnriching(true);
        try {
            await invoke("enrich_contact_cmd", { id: contact.id });
            await fetchContact();
        } catch (error) {
            console.error("Enrichment failed:", error);
        } finally {
            setEnriching(false);
        }
    };

    const handleDelete = async () => {
        if (!contact || !confirm("Are you sure you want to delete this contact?")) return;
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
        // Toast would go here
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
        <div className="min-h-screen bg-background border-l font-sans">
            {/* Back Navigation Bar */}
            <div className="h-14 border-b flex items-center px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => navigate(-1)}>
                    <ArrowLeft className="h-4 w-4" />
                    Back to Contacts
                </Button>
            </div>

            <div className="grid grid-cols-12 min-h-[calc(100vh-3.5rem)]">
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
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="Copy Info" onClick={handleCopy}>
                                <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="Refresh Data" onClick={handleEnrich} disabled={enriching}>
                                {enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="More">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                                        <Pencil className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleDelete} className="text-red-600 focus:text-red-600">
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
                                            <a href={getWebsiteUrl(contact.company_website)} target="_blank" rel="noreferrer" className="truncate underline decoration-dotted underline-offset-2 hover:text-primary cursor-pointer">
                                                {contact.company}
                                            </a>
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
                                    // Calculate relative time (e.g., "6 hours ago") - simplified for MVP
                                    new Date(contact.last_contacted_date).toLocaleDateString()
                                ) : "Never"}
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
                <div className="col-span-12 md:col-span-8 lg:col-span-9 p-8 bg-background overflow-y-auto">

                    <div className="max-w-4xl mx-auto space-y-10">
                        {/* Highlights Section */}
                        <section>
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-muted-foreground" />
                                Highlights
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Summary Card */}
                                <Card className="col-span-2 md:col-span-1 shadow-sm hover:shadow-md transition-shadow">
                                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Summary</CardTitle>
                                        <Sparkles className="h-4 w-4 text-purple-500" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-sm leading-relaxed">
                                            {contact.intelligence_summary ? (
                                                <p className="line-clamp-4">{contact.intelligence_summary}</p>
                                            ) : (
                                                <div className="text-muted-foreground italic text-xs">
                                                    No AI summary available. Click "Refresh" to generate insights.
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* LinkedIn / Social Card */}
                                <Card className="col-span-2 md:col-span-1 shadow-sm hover:shadow-md transition-shadow">
                                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">LinkedIn</CardTitle>
                                        <div className="h-5 w-5 rounded bg-[#0077b5] flex items-center justify-center text-white font-bold text-[10px]">in</div>
                                    </CardHeader>
                                    <CardContent>
                                        {contact.linkedin_url ? (
                                            <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:underline break-all">
                                                {contact.linkedin_url.replace("https://www.linkedin.com/in/", "").replace("https://linkedin.com/in/", "")}
                                            </a>
                                        ) : (
                                            <div className="text-muted-foreground text-sm">No LinkedIn profile linked.</div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Upcoming Card */}
                                <Card className="shadow-sm hover:shadow-md transition-shadow">
                                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming</CardTitle>
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-medium">Demo Call</div>
                                                <div className="text-xs text-muted-foreground">Nov 29, 10:40 AM</div>
                                            </div>
                                            <div className="h-10 w-10 rounded bg-muted flex flex-col items-center justify-center text-xs border">
                                                <span className="font-bold uppercase text-[10px] text-muted-foreground">THU</span>
                                                <span className="font-bold">29</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Company Card */}
                                <Card className="shadow-sm hover:shadow-md transition-shadow">
                                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Company</CardTitle>
                                        <Building className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent className="flex items-center gap-3">
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

                                {/* Sales Outreach Stage */}
                                <Card className="col-span-2 shadow-sm hover:shadow-md transition-shadow">
                                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Sales Outreach</CardTitle>
                                        <Send className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-sm font-medium flex items-center gap-2">
                                                <span className="text-muted-foreground">Stage:</span>
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <StatusPicker
                                                        currentStatusId={contact.status_id}
                                                        onStatusChange={async (newId) => {
                                                            await invoke("update_contact", { id: contact.id, statusId: newId });
                                                            // Optimistic update
                                                            setContact(prev => prev ? { ...prev, status_id: newId } : null);
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
                            </div>
                        </section>

                        {/* Activity Section */}
                        <section>
                            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                                <div className="p-1 rounded bg-muted">
                                    <Briefcase className="h-4 w-4 text-foreground" />
                                </div>
                                Activity
                            </h2>

                            <Card className="border shadow-sm">
                                <div className="divide-y">
                                    {/* Default Item */}
                                    {/* In a real app we would map over activity logs here */}
                                    <div className="p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors">
                                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center border shrink-0">
                                            <Check className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-foreground">
                                                Contact created
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{new Date(contact.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    {/* Mock items removed as per user request */}
                                </div>
                            </Card>
                        </section>
                    </div>
                </div>
            </div>

            {/* Edit Dialog */}
            {
                contact && (
                    <EditContactDialog
                        contact={contact}
                        open={isEditOpen}
                        onOpenChange={setIsEditOpen}
                        onContactUpdated={fetchContact}
                    />
                )
            }

            <ManageTagsDialog
                open={isManageTagsOpen}
                onOpenChange={setIsManageTagsOpen}
            />

            <ComposeEmailDialog
                contact={contact}
                open={isEmailOpen}
                onOpenChange={setIsEmailOpen}
            />
        </div >
    );
}
