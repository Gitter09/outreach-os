import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Contact } from "@/types/crm";
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
import { UserPlus, RefreshCcw, Mail, Linkedin, Trash2, Search, ListFilter, LayoutList, Columns } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
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
import { CommandPalette } from "@/components/layout/command-palette";
import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
// import { ContactDetailSheet } from "@/components/contacts/contact-detail-sheet"; // Removing Sheet
import { ContactDetailPage } from "@/pages/ContactDetailPage";
import { ImportDialog } from "@/components/import/import-dialog";
import { TopCommandBar } from "@/components/layout/top-command-bar";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { useStatuses } from "@/hooks/use-statuses";
import { getColorHex } from "@/lib/utils";
import { ManageTagsDialog } from "@/components/tags/manage-tags-dialog";
import { useTags } from "@/hooks/use-tags";
import "./App.css";

function Dashboard() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const { statuses, refreshStatuses } = useStatuses();
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [loading, setLoading] = useState(true);
  // const [sheetOpen, setSheetOpen] = useState(false); // No sheet anymore

  // Add Contact Dialog State
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addQuickStatusId, setAddQuickStatusId] = useState<string | null>(null);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [commandOpen, setCommandOpen] = useState(false);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const { tags: availableTags } = useTags();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const [sortBy, setSortBy] = useState("added_desc"); // added_desc, name_asc, contacted_desc, status

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch =
      searchQuery === "" ||
      `${contact.first_name} ${contact.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (contact.email && contact.email.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === "all" || (contact.status_id || "def-stat-001") === statusFilter;

    const matchesTag =
      tagFilter === "all" || (contact.tags && contact.tags.some(t => t.id === tagFilter));

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
        // Default is desc created_at
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  // Selection handlers
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
      console.error("Failed to delete contacts:", error);
      alert(`Failed to delete: ${error}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleContactClick = (contact: Contact) => {
    // Navigate to full page
    navigate(`/contact/${contact.id}`);
  };

  async function fetchContacts() {
    try {
      setLoading(true);
      const data = await invoke<Contact[]>("get_contacts");
      setContacts(data);

      // Also refresh statuses to ensure Kanban columns are in sync
      await refreshStatuses();

      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch contacts/statuses:", error);
      setLoading(false);
    }
  }

  const handleContactMove = async (contactId: string, newStatusId: string) => {
    // Optimistically update
    setContacts(prev => prev.map(c =>
      c.id === contactId ? { ...c, status_id: newStatusId } : c
    ));

    try {
      await invoke("update_contact", {
        id: contactId,
        statusId: newStatusId
      });
      fetchContacts();
    } catch (err) {
      console.error("Failed to move contact", err);
      alert("Failed to update status");
      fetchContacts(); // Revert
    }
  };

  const handleOpenAddContact = (statusId?: string) => {
    setAddQuickStatusId(statusId || null);
    setAddContactOpen(true);
  };

  // Status Management (Legacy: Locked to strict pipeline)
  // const [editingStatus, setEditingStatus] = useState<Status | null>(null);
  // ... removed for strict mode


  useEffect(() => {
    // Fix orphan contacts on startup
    const init = async () => {
      try {
        await invoke<string>("fix_orphan_contacts");
      } catch (err) {
        console.error("[App] Failed to fix orphans:", err);
      }
      fetchContacts();
    };
    init();
  }, []);

  return (
    <div className="min-h-screen bg-background p-8 font-sans antialiased text-foreground">
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onContactsChanged={fetchContacts}
        onOpenImport={() => setImportDialogOpen(true)}
        onOpenAddContact={() => handleOpenAddContact()}
        onSelectContact={(id) => {
          const contact = contacts.find((c) => c.id === id);
          if (contact) {
            handleContactClick(contact);
          }
        }}
      />
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => {
          fetchContacts();
        }}
      />
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">OutreachOS</h1>
            <p className="text-muted-foreground mt-1">
              Your local-first intelligence engine.
            </p>
          </div>
          <TopCommandBar onClick={() => setCommandOpen(true)} className="mx-8 flex-1 max-w-md" />
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={fetchContacts}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => handleOpenAddContact()}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          </div>
        </header>

        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-medium">Contacts</CardTitle>
              <div className="flex gap-2 w-full max-w-sm">
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
                    <DropdownMenuLabel>Filter by Tags</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup value={tagFilter} onValueChange={setTagFilter}>
                      <DropdownMenuRadioItem value="all">All Tags</DropdownMenuRadioItem>
                      {availableTags.map((tag) => (
                        <DropdownMenuRadioItem key={tag.id} value={tag.id}>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                            {tag.name}
                          </div>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
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
                      Start by adding a contact manually or use Clipboard Intelligence (Trigger Cmd+K).
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
                              onCheckedChange={() => {
                                // Manual toggle wrapper
                              }}
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
                                <Button variant="ghost" size="icon" className="h-8 w-8">
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
      {
        selectedIds.size > 0 && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground border shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-10 fade-in duration-300 z-50">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <div className="h-4 w-px bg-border" />
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
        )
      }

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

      {/* Dialogs */}


      {/* No ContactDetailSheet anymore - logic moved to Route */}

      <AddContactDialog
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        onContactAdded={fetchContacts}
        initialStatusId={addQuickStatusId || undefined}
      />
      <ManageTagsDialog open={manageTagsOpen} onOpenChange={setManageTagsOpen} />
    </div >
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/contact/:id" element={<ContactDetailPage />} />
      </Routes>
    </Router>
  )
}

export default App;
