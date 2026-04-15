import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
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
import { Loader2 } from "lucide-react";
import { useStatuses } from "@/hooks/use-statuses";
import { useErrors } from "@/hooks/use-errors";
import { cn } from "@/lib/utils";

interface AddContactDialogProps {
    onContactAdded: () => void;
    // Optional props for controlled mode
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    initialStatusId?: string;
}

export function AddContactDialog({ onContactAdded, open: controlledOpen, onOpenChange: setControlledOpen, initialStatusId }: AddContactDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? setControlledOpen! : setInternalOpen;

    const [loading, setLoading] = useState(false);

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [title, setTitle] = useState("");
    const [company, setCompany] = useState("");
    const [location, setLocation] = useState("");
    const [email, setEmail] = useState("");
    const [linkedinUrl, setLinkedinUrl] = useState("");
    const [companyWebsite, setCompanyWebsite] = useState("");
    const [selectedStatusId, setSelectedStatusId] = useState(initialStatusId || "");

    const [isCreatingNewStatus, setIsCreatingNewStatus] = useState(false);
    const [newStatusLabel, setNewStatusLabel] = useState("");
    const [selectedColor, setSelectedColor] = useState("#3b82f6"); // Default Blue
    const colorInputRef = useRef<HTMLInputElement>(null);

    const statusColors = [
        { name: "Blue", value: "#3b82f6" },
        { name: "Green", value: "#22c55e" },
        { name: "Purple", value: "#a855f7" },
        { name: "Yellow", value: "#eab308" },
        { name: "Orange", value: "#f97316" },
        { name: "Pink", value: "#ec4899" },
        { name: "Gray", value: "#64748b" },
    ];

    const { statuses, addStatus } = useStatuses();
    const { handleError } = useErrors();

    // Sync status if initialStatusId changes (e.g. clicking different column 'New' buttons)
    useEffect(() => {
        if (open) {
            setSelectedStatusId(initialStatusId || "");
            setIsCreatingNewStatus(false);
            setNewStatusLabel("");
            setSelectedColor("#3b82f6");
        }
    }, [initialStatusId, open]);

    // Once statuses load, pre-select the default (or first) status if nothing is chosen
    useEffect(() => {
        if (statuses.length > 0 && !selectedStatusId) {
            const defaultStatus = statuses.find((s) => s.is_default) ?? statuses[0];
            setSelectedStatusId(defaultStatus.id);
        }
    }, [statuses, selectedStatusId]);

    const resetForm = () => {
        setFirstName("");
        setLastName("");
        setTitle("");
        setCompany("");
        setLocation("");
        setEmail("");
        setLinkedinUrl("");
        setCompanyWebsite("");
        setSelectedStatusId(initialStatusId || "");
        setIsCreatingNewStatus(false);
        setNewStatusLabel("");
        setSelectedColor("#3b82f6");
    };

    const handleStatusChange = (value: string) => {
        if (value === "create-new") {
            setIsCreatingNewStatus(true);
            setSelectedStatusId(""); // Clear selection
        } else {
            setIsCreatingNewStatus(false);
            setSelectedStatusId(value);
        }
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!firstName.trim() || !lastName.trim()) {
            return; // Basic validation
        }

        if (isCreatingNewStatus && !newStatusLabel.trim()) {
            return;
        }

        setLoading(true);
        try {
            let statusId = selectedStatusId;

            // Create status first if needed
            if (isCreatingNewStatus) {
                statusId = await addStatus(newStatusLabel.trim(), selectedColor);
            }

            await invoke("add_contact", {
                args: {
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    title: title.trim() || null,
                    company: company.trim() || null,
                    location: location.trim() || null,
                    companyWebsite: companyWebsite.trim() || null,
                    email: email.trim() || null,
                    linkedinUrl: linkedinUrl.trim() || null,
                    statusId: statusId,
                }
            });

            resetForm();
            setOpen(false);
            onContactAdded();
        } catch (error) {
            handleError(error, "Failed to add contact");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {/* Trigger removed - controlled externally */}
            <DialogContent
                className="sm:max-w-[425px]"
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                }}
            >
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>New Contact</DialogTitle>
                        <DialogDescription>
                            Add a new contact to your outreach pipeline.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="firstName">First Name *</Label>
                                <Input
                                    id="firstName"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    placeholder="John"
                                    required
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lastName">Last Name *</Label>
                                <Input
                                    id="lastName"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    placeholder="Doe"
                                    required
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="title">Title</Label>
                                <Input
                                    id="title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="VP of Sales"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="company">Company</Label>
                                <Input
                                    id="company"
                                    value={company}
                                    onChange={(e) => setCompany(e.target.value)}
                                    placeholder="Acme Corp"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="location">Location</Label>
                                <Input
                                    id="location"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder="San Francisco, CA"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="companyWebsite">Company Website</Label>
                                <Input
                                    id="companyWebsite"
                                    value={companyWebsite}
                                    onChange={(e) => setCompanyWebsite(e.target.value)}
                                    placeholder="acme.com"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="john.doe@example.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="linkedin">LinkedIn URL</Label>
                            <Input
                                id="linkedin"
                                type="url"
                                value={linkedinUrl}
                                onChange={(e) => setLinkedinUrl(e.target.value)}
                                placeholder="https://linkedin.com/in/johndoe"
                            />
                        </div>

                        <div className="space-y-2">
                                <Label htmlFor="status">Status</Label>
                                {isCreatingNewStatus ? (
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <Input
                                                value={newStatusLabel}
                                                onChange={(e) => setNewStatusLabel(e.target.value)}
                                                placeholder="Status Name (e.g. Negotiating)"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    // Move focus to a stable element before unmounting the autoFocus input
                                                    // otherwise browser might scroll to bottom if focus is lost
                                                    const firstNameInput = document.getElementById("firstName");
                                                    if (firstNameInput) firstNameInput.focus({ preventScroll: true });

                                                    setIsCreatingNewStatus(false);
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground mr-1">Color:</span>
                                            <div className="flex flex-wrap gap-2">
                                                {statusColors.map((color) => (
                                                    <button
                                                        key={color.value}
                                                        type="button"
                                                        onClick={() => setSelectedColor(color.value)}
                                                        className={cn(
                                                            "w-6 h-6 rounded-full border-2 transition-all",
                                                            selectedColor === color.value ? "border-foreground scale-110 shadow-sm" : "border-transparent hover:scale-105"
                                                        )}
                                                        style={{ backgroundColor: color.value }}
                                                        title={color.name}
                                                    />
                                                ))}
                                                {/* Custom Color Trigger */}
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            "w-6 h-6 rounded-full border-2 border-transparent transition-all bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500",
                                                            !statusColors.find(c => c.value === selectedColor) && "border-foreground scale-110 shadow-sm"
                                                        )}
                                                        title="Custom Color"
                                                        onClick={() => colorInputRef.current?.click()}
                                                    />
                                                    <input
                                                        type="color"
                                                        ref={colorInputRef}
                                                        className="absolute inset-0 opacity-0 w-full h-full pointer-events-none"
                                                        value={selectedColor}
                                                        onChange={(e) => setSelectedColor(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <Select
                                        value={selectedStatusId}
                                        onValueChange={handleStatusChange}
                                    >
                                        <SelectTrigger id="status">
                                            <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {statuses.map((status) => (
                                                <SelectItem key={status.id} value={status.id}>
                                                    {status.label}
                                                </SelectItem>
                                            ))}
                                            <div className="h-px bg-muted my-1" />
                                            <SelectItem value="create-new" className="text-primary font-medium focus:text-primary">
                                                + Create new status...
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpen(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading || !firstName.trim() || !lastName.trim()}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Adding...
                                </>
                            ) : (
                                "Add Contact"
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
