import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useErrors } from "@/hooks/use-errors";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertCircle } from "lucide-react";
import { useStatuses } from "@/hooks/use-statuses";
import { Contact } from "@/types/crm";
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

interface EditContactDialogProps {
    contact: Contact;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onContactUpdated: () => void;
}

export function EditContactDialog({ contact, open, onOpenChange, onContactUpdated }: EditContactDialogProps) {
    const [loading, setLoading] = useState(false);
    const { handleError } = useErrors();

    const [firstName, setFirstName] = useState(contact.first_name);
    const [lastName, setLastName] = useState(contact.last_name);
    const [title, setTitle] = useState(contact.title || "");
    const [company, setCompany] = useState(contact.company || "");
    const [location, setLocation] = useState(contact.location || "");
    const [email, setEmail] = useState(contact.email || "");
    const [linkedinUrl, setLinkedinUrl] = useState(contact.linkedin_url || "");
    const [companyWebsite, setCompanyWebsite] = useState(contact.company_website || "");
    const [selectedStatusId, setSelectedStatusId] = useState(contact.status_id);
    const [isConfirmSaveOpen, setIsConfirmSaveOpen] = useState(false);

    const { statuses } = useStatuses();

    useEffect(() => {
        if (open) {
            setFirstName(contact.first_name);
            setLastName(contact.last_name);
            setTitle(contact.title || "");
            setCompany(contact.company || "");
            setLocation(contact.location || "");
            setEmail(contact.email || "");
            setLinkedinUrl(contact.linkedin_url || "");
            setCompanyWebsite(contact.company_website || "");
            setSelectedStatusId(contact.status_id);
        }
    }, [contact, open]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!firstName.trim() || !lastName.trim()) return;
        setIsConfirmSaveOpen(true);
    };

    const handleConfirmSave = async () => {
        setLoading(true);
        try {
            await invoke("update_contact", {
                args: {
                    id: contact.id,
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    title: title.trim() || null,
                    company: company.trim() || null,
                    location: location.trim() || null,
                    companyWebsite: companyWebsite.trim() || null,
                    email: email.trim() || null,
                    linkedinUrl: linkedinUrl.trim() || null,
                    statusId: selectedStatusId,
                }
            });

            onContactUpdated();
            onOpenChange(false);
        } catch (error) {
            handleError(error, "Failed to update contact");
        } finally {
            setLoading(false);
            setIsConfirmSaveOpen(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Edit Contact</DialogTitle>
                        <DialogDescription>
                            Update the details for {contact.first_name} {contact.last_name}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-firstName">First Name *</Label>
                                <Input
                                    id="edit-firstName"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    required
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-lastName">Last Name *</Label>
                                <Input
                                    id="edit-lastName"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    required
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-title">Title</Label>
                                <Input
                                    id="edit-title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g. CEO"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-company">Company</Label>
                                <Input
                                    id="edit-company"
                                    value={company}
                                    onChange={(e) => setCompany(e.target.value)}
                                    placeholder="e.g. Acme Inc"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-location">Location</Label>
                                <Input
                                    id="edit-location"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder="e.g. San Francisco"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-website">Company Website</Label>
                                <Input
                                    id="edit-website"
                                    value={companyWebsite}
                                    onChange={(e) => setCompanyWebsite(e.target.value)}
                                    placeholder="e.g. acme.com"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-email">Email</Label>
                            <Input
                                id="edit-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-linkedin">LinkedIn URL</Label>
                            <Input
                                id="edit-linkedin"
                                type="url"
                                value={linkedinUrl}
                                onChange={(e) => setLinkedinUrl(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-status">Status</Label>
                            <Select value={selectedStatusId} onValueChange={setSelectedStatusId}>
                                <SelectTrigger id="edit-status">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {statuses.map((status) => (
                                        <SelectItem key={status.id} value={status.id}>
                                            {status.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>

            <AlertDialog open={isConfirmSaveOpen} onOpenChange={setIsConfirmSaveOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-primary" />
                            Confirm Changes
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to save the changes to <strong>{contact.first_name} {contact.last_name}</strong>?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Editing</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmSave} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Confirm & Save
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}
