import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Contact, Status } from "@/types/crm";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, RefreshCcw, Mail, Linkedin, Trash2, Search, ListFilter, LayoutList, Columns, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
import { PageHeader } from "@/components/layout/page-header";
import { AddContactDropdown } from "@/components/contacts/add-contact-dropdown";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { useStatuses } from "@/hooks/use-statuses";
import { getColorHex } from "@/lib/utils";
import { ManageTagsDialog } from "@/components/tags/manage-tags-dialog";
import { EditStatusDialog } from "@/components/settings/edit-status-dialog";
import { useTags } from "@/hooks/use-tags";
import { useErrors } from "@/hooks/use-errors";

// Module-level flag: ensures the token-expired toast fires at most once per app session,
// even if ContactsPage re-mounts on navigation.
let tokenExpiredToastShown = false;

export function ContactsPage() {
    const navigate = useNavigate();
    const { handleError } = useErrors();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const { statuses, refreshStatuses, addStatus, editStatus, removeStatus } = useStatuses();
    const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
    const [loading, setLoading] = useState(true);

    const { setCommandOpen, setAddContactOpen, setImportOpen, refreshTrigger, setNewContactStatusId } = useOutletContext<{
        setCommandOpen: (open: boolean) => void;
        setAddContactOpen: (open: boolean) => void;
        setImportOpen: (open: boolean) => void;
        refreshTrigger: number;
        setNewContactStatusId: (id: string | undefined) => void;
    }>();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isBulkUpdatingStatus, setIsBulkUpdatingStatus] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
    const [manageTagsOpen, setManageTagsOpen] = useState(false);
    const { tags: availableTags } = useTags();

    // Status management (Kanban edit/delete/add)
    const [editingStatus, setEditingStatus] = useState<Status | null>(null);
    const [deletingStatus, setDeletingStatus] = useState<Status | null>(null);
    const [editStatusDialogOpen, setEditStatusDialogOpen] = useState(false);
    const [addStatusDialogOpen, setAddStatusDialogOpen] = useState(false);
    const [isDeletingStatus, setIsDeletingStatus] = useState(false);

    // Re-fetch when global actions complete
    useEffect(() => {
        if (refreshTrigger > 0) {
            fetchContacts();
        }
    }, [refreshTrigger]);

    const [sortBy, setSortBy] = useState("added_desc");

    const filteredContacts = contacts.filter((contact) => {
        const matchesSearch =
            searchQuery === "" ||
            `${contact.first_name} ${contact.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (contact.email && contact.email.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesStatus =
            statusFilter === "all" || (contact.status_id || "stat-new") === statusFilter;

        const matchesTag =
            tagFilters.size === 0 ||
            (contact.tags && contact.tags.some(t => tagFilters.has(t.id)));

        return matchesSearch && matchesStatus && matchesTag;
    }).sort((a, b) => {
        switch (sortBy) {
            case "name_asc":
                return a.first_name.localeCompare(b.first_name);
            case "contacted_desc":
                const dateA = a.last_contacted_date ? new Date(a.last_contacted_date).getTime() : 0;
                const dateB = b.last_contacted_date ? new Date(b.last_contacted_date).getTime() : 0;
                return dateB - dateA;
            case "status":
                return (a.status_label || a.status || "").localeCompare(b.status_label || b.status || "");
            case "added_desc":
            default:
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
    });

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredContacts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredContacts.map(c => c.id)));
        }
    };

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleBulkDelete = async () => {
        setIsDeleting(true);
        try {
            await invoke("delete_contacts_bulk", { ids: Array.from(selectedIds) });
            setSelectedIds(new Set());
            setDeleteDialogOpen(false);
            fetchContacts();
        } catch (error) {
            handleError(error, "Failed to delete contacts");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleBulkStatusChange = async (statusId: string) => {
        setIsBulkUpdatingStatus(true);
        try {
            const count = selectedIds.size;
            await invoke("update_contacts_status_bulk", { ids: Array.from(selectedIds), status_id: statusId });
            const statusLabel = statuses.find(s => s.id === statusId)?.label ?? "new status";
            setSelectedIds(new Set());
            fetchContacts();
            toast.success(`${count} ${count === 1 ? "contact" : "contacts"} moved to ${statusLabel}.`);
        } catch (error) {
            handleError(error, "Failed to update status");
        } finally {
            setIsBulkUpdatingStatus(false);
        }
    };

    const handleContactClick = (contact: Contact) => {
        navigate(`/people/${contact.id}`);
    };

    async function fetchContacts() {
        try {
            setLoading(true);
            const data = await invoke<Contact[]>("get_contacts");
            setContacts(data);
            await refreshStatuses();
            setLoading(false);
        } catch (error) {
            handleError(error, "Failed to fetch contacts");
            setLoading(false);
        }
    }

    const handleContactMove = async (contactId: string, newStatusId: string) => {
        setContacts(prev => prev.map(c =>
            c.id === contactId ? { ...c, status_id: newStatusId } : c
        ));

        try {
            await invoke("update_contact", {
                args: {
                    id: contactId,
                    statusId: newStatusId
                }
            });
            fetchContacts();
        } catch (err) {
            handleError(err, "Failed to update status");
            fetchContacts();
        }
    };

    const handleOpenAddContact = (statusId?: string) => {
        setNewContactStatusId(statusId);
        setAddContactOpen(true);
    };

    const handleEditStatus = (status: Status) => {
        setEditingStatus(status);
        setEditStatusDialogOpen(true);
    };

    const handleDeleteStatus = (status: Status) => {
        setDeletingStatus(status);
    };

    const handleConfirmDeleteStatus = async () => {
        if (!deletingStatus) return;
        setIsDeletingStatus(true);
        try {
            await removeStatus(deletingStatus.id);
            toast.success(`"${deletingStatus.label}" stage removed.`);
            setDeletingStatus(null);
        } catch (error) {
            handleError(error, "Failed to delete stage");
        } finally {
            setIsDeletingStatus(false);
        }
    };

    const handleSaveStatus = async (label: string, color: string) => {
        if (editingStatus) {
            await editStatus(editingStatus.id, label, color);
            toast.success("Stage updated.");
        }
    };

    const handleAddStatus = async (label: string, color: string) => {
        await addStatus(label, color);
        toast.success(`"${label}" stage added.`);
    };

    useEffect(() => {
        const init = async () => {
            try {
                await invoke<string>("fix_orphan_contacts");
            } catch (err) {
                handleError(err, "Failed to initialize database");
            }
            fetchContacts();

            // Sync email accounts on launch (fire-and-forget, non-blocking)
            try {
                const results = await invoke<Array<{
                    account_email: string;
                    provider: string;
                    synced_count: number;
                    token_expired: boolean;
                }>>("sync_email_accounts");

                const expired = results.filter((r) => r.token_expired).map((r) => r.account_email);
                if (expired.length > 0 && !tokenExpiredToastShown) {
                    tokenExpiredToastShown = true;
                    handleError(`Email token expired for: ${expired.join(", ")}. Go to Settings → Email to reconnect.`);
                }
            } catch (err) {
                handleError(err, "Email sync failed on launch");
            }
        };
        init();
    }, []);

    return (
        <div className="flex flex-col h-full relative">
            <PageHeader
                title="People"
                onSearchClick={() => setCommandOpen(true)}
            >
                <Button variant="outline" size="sm" onClick={fetchContacts}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Refresh
                </Button>
                <AddContactDropdown
                    onAddManually={() => setAddContactOpen(true)}
                    onImportFile={() => setImportOpen(true)}
                />
            </PageHeader>

            <div className="flex-1 overflow-auto p-6 space-y-6">
                <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-medium">People</CardTitle>
                            <div className="flex gap-2 w-full max-w-lg">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by name, email, company..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 h-9"
                                    />
                                </div>
                                <div className="flex border rounded-md mr-2">
                                    <Button
                                        variant={viewMode === "table" ? "secondary" : "ghost"}
                                        size="icon"
                                        className="h-9 w-9 rounded-r-none"
                                        onClick={() => setViewMode("table")}
                                        title="List View"
                                    >
                                        <LayoutList className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={viewMode === "kanban" ? "secondary" : "ghost"}
                                        size="icon"
                                        className="h-9 w-9 rounded-l-none"
                                        onClick={() => setViewMode("kanban")}
                                        title="Kanban Board"
                                    >
                                        <Columns className="h-4 w-4" />
                                    </Button>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="h-9 gap-2 ml-auto">
                                            <ListFilter className="h-3.5 w-3.5" />
                                            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                                                Filter & Sort
                                            </span>
                                            {tagFilters.size > 0 && (
                                                <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium h-4 w-4 flex items-center justify-center">
                                                    {tagFilters.size}
                                                </span>
                                            )}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-[200px]">
                                        <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}>
                                            <DropdownMenuRadioItem value="all">All Statuses</DropdownMenuRadioItem>
                                            {statuses.map((status) => (
                                                <DropdownMenuRadioItem key={status.id} value={status.id}>
                                                    {status.label}
                                                </DropdownMenuRadioItem>
                                            ))}
                                        </DropdownMenuRadioGroup>
                                        <DropdownMenuSeparator />
                                        <div className="flex items-center justify-between px-2 py-1.5">
                                            <span className="text-xs font-semibold text-muted-foreground">Filter by Tags</span>
                                            {tagFilters.size > 0 && (
                                                <button
                                                    className="text-xs text-primary hover:underline"
                                                    onClick={(e) => { e.preventDefault(); setTagFilters(new Set()); }}
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                        <DropdownMenuSeparator />
                                        {availableTags.length === 0 ? (
                                            <div className="px-2 py-1.5 text-xs text-muted-foreground">No tags yet</div>
                                        ) : (
                                            availableTags.map((tag) => (
                                                <DropdownMenuCheckboxItem
                                                    key={tag.id}
                                                    checked={tagFilters.has(tag.id)}
                                                    onCheckedChange={(checked) => {
                                                        setTagFilters(prev => {
                                                            const next = new Set(prev);
                                                            checked ? next.add(tag.id) : next.delete(tag.id);
                                                            return next;
                                                        });
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                                                        {tag.name}
                                                    </div>
                                                </DropdownMenuCheckboxItem>
                                            ))
                                        )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setManageTagsOpen(true); }}>
                                            <ListFilter className="mr-2 h-4 w-4" />
                                            Manage Tags...
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuRadioGroup value={sortBy} onValueChange={setSortBy}>
                                            <DropdownMenuRadioItem value="added_desc">Date Added (Newest)</DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="name_asc">Name (A-Z)</DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="contacted_desc">Last Contacted</DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-20 text-muted-foreground animate-pulse">
                                Loading intelligence...
                            </div>
                        ) : contacts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                                <div className="bg-muted rounded-full p-4">
                                    <UserPlus className="h-8 w-8 text-muted-foreground" />
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <h3 className="font-semibold text-xl">No contacts yet</h3>
                                        <p className="text-muted-foreground max-w-sm">
                                            Add your first contact to get started — paste in a LinkedIn profile, import a CSV, or type it in manually.
                                        </p>
                                    </div>
                                    <Button size="lg" onClick={() => handleOpenAddContact()}>
                                        <UserPlus className="mr-2 h-5 w-5" />
                                        Add Your First Contact
                                    </Button>
                                </div>
                            </div>
                        ) : viewMode === "kanban" ? (
                            <div className="h-[calc(100vh-250px)] min-h-[500px]">
                                <KanbanBoard
                                    contacts={filteredContacts}
                                    statuses={statuses}
                                    onContactMove={handleContactMove}
                                    onContactClick={handleContactClick}
                                    onAddContact={handleOpenAddContact}
                                    onEditStatus={handleEditStatus}
                                    onDeleteStatus={handleDeleteStatus}
                                    onAddStatus={() => setAddStatusDialogOpen(true)}
                                />
                            </div>
                        ) : (
                            <>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px]">
                                                <Checkbox
                                                    checked={filteredContacts.length > 0 && selectedIds.size === filteredContacts.length}
                                                    onCheckedChange={toggleSelectAll}
                                                    aria-label="Select all"
                                                />
                                            </TableHead>
                                            <TableHead>Target</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredContacts.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center">
                                                    No results found.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredContacts.map((contact) => (
                                                <TableRow
                                                    key={contact.id}
                                                    className="group transition-colors hover:bg-muted/50 cursor-pointer"
                                                    onClick={() => handleContactClick(contact)}
                                                    data-state={selectedIds.has(contact.id) ? "selected" : undefined}
                                                >
                                                    <TableCell className="w-[50px]" onClick={(e) => e.stopPropagation()}>
                                                        <Checkbox
                                                            checked={selectedIds.has(contact.id)}
                                                            onCheckedChange={() => { }}
                                                            onClick={(e) => toggleSelect(contact.id, e)}
                                                            aria-label={`Select ${contact.first_name}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-medium">
                                                        <div className="flex flex-col">
                                                            <span>{contact.first_name} {contact.last_name}</span>
                                                            <span className="text-xs text-muted-foreground font-normal">
                                                                {contact.title && contact.company ? `${contact.title} at ${contact.company}` : (contact.title || contact.company || "VCReach Personalizer Ready")}
                                                            </span>
                                                            {contact.tags && contact.tags.length > 0 && (
                                                                <div className="flex gap-1 flex-wrap mt-1">
                                                                    {contact.tags.slice(0, 3).map((tag) => (
                                                                        <div key={tag.id} className="text-[9px] px-1.5 py-0 rounded border bg-muted" style={{ borderColor: `${tag.color}40`, color: tag.color }}>
                                                                            {tag.name}
                                                                        </div>
                                                                    ))}
                                                                    {contact.tags.length > 3 && <span className="text-[9px] text-muted-foreground">+{contact.tags.length - 3}</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {contact.email ? (
                                                            <div className="flex items-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                                                                <Mail className="mr-2 h-3.5 w-3.5" />
                                                                {contact.email}
                                                            </div>
                                                        ) : "-"}
                                                    </TableCell>
                                                    <TableCell>
                                                        {(() => {
                                                            const hex = getColorHex(contact.status_color);
                                                            return (
                                                                <span
                                                                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border"
                                                                    style={{
                                                                        backgroundColor: `${hex}20`,
                                                                        color: hex,
                                                                        borderColor: `${hex}40`
                                                                    }}
                                                                >
                                                                    {contact.status_label || contact.status || "New"}
                                                                </span>
                                                            );
                                                        })()}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {contact.linkedin_url && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const url = contact.linkedin_url!.startsWith('http') ? contact.linkedin_url! : `https://${contact.linkedin_url}`;
                                                                        invoke("open_external_url", { url });
                                                                    }}
                                                                >
                                                                    <Linkedin className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <RefreshCcw className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )))
                                        }
                                    </TableBody>
                                </Table>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Floating Bulk Actions Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground border shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-10 fade-in duration-300 z-50">
                    <span className="text-sm font-medium">{selectedIds.size} selected</span>
                    <div className="h-4 w-px bg-border" />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="rounded-full"
                                disabled={isBulkUpdatingStatus}
                            >
                                Change Status
                                <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" side="top">
                            <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {statuses.map((status) => (
                                <DropdownMenuItem
                                    key={status.id}
                                    onSelect={() => handleBulkStatusChange(status.id)}
                                >
                                    <div
                                        className="h-2 w-2 rounded-full mr-2 shrink-0"
                                        style={{ backgroundColor: getColorHex(status.color) }}
                                    />
                                    {status.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteDialogOpen(true)}
                        className="rounded-full"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Selected
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedIds(new Set())}
                        className="rounded-full"
                    >
                        Cancel
                    </Button>
                </div>
            )}

            {/* Bulk Delete Confirmation */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete
                            <span className="font-bold text-foreground"> {selectedIds.size} </span>
                            contacts and remove their data from our servers.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => {
                                e.preventDefault();
                                handleBulkDelete();
                            }}
                            disabled={isDeleting}
                        >
                            {isDeleting ? "Deleting..." : "Delete Contacts"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <ManageTagsDialog open={manageTagsOpen} onOpenChange={setManageTagsOpen} />

            {/* Edit Status Dialog */}
            <EditStatusDialog
                status={editingStatus}
                open={editStatusDialogOpen}
                onOpenChange={(open) => {
                    setEditStatusDialogOpen(open);
                    if (!open) setEditingStatus(null);
                }}
                onSave={handleSaveStatus}
            />

            {/* Add Status Dialog */}
            <EditStatusDialog
                open={addStatusDialogOpen}
                onOpenChange={setAddStatusDialogOpen}
                onSave={handleAddStatus}
            />

            {/* Delete Status Confirmation */}
            <AlertDialog
                open={!!deletingStatus}
                onOpenChange={(open) => { if (!open) setDeletingStatus(null); }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove this stage?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Any contacts in <span className="font-semibold text-foreground">"{deletingStatus?.label}"</span> will lose their stage. This can't be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingStatus}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => { e.preventDefault(); handleConfirmDeleteStatus(); }}
                            disabled={isDeletingStatus}
                        >
                            {isDeletingStatus ? "Removing…" : "Remove stage"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
