import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag } from "@/types/crm";
import { useTags } from "@/hooks/use-tags";
import { Trash2, Pencil, Plus, X, Check, Loader2 } from "lucide-react";

interface ManageTagsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onTagsChanged?: () => void;
}

export function ManageTagsDialog({ open, onOpenChange, onTagsChanged }: ManageTagsDialogProps) {
    const { tags, createTag, updateTag, deleteTag } = useTags();
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [newTagName, setNewTagName] = useState("");
    const [newTagColor, setNewTagColor] = useState("#64748b");
    const [isCreating, setIsCreating] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isCreatingSaving, setIsCreatingSaving] = useState(false);

    const handleClose = (open: boolean) => {
        if (!open) {
            setEditingTag(null);
            setNewTagName("");
            setNewTagColor("#64748b");
            setIsCreating(false);
        }
        onOpenChange(open);
    };

    const handleCreate = async () => {
        if (!newTagName.trim()) return;
        setIsCreatingSaving(true);
        try {
            await createTag(newTagName.trim(), newTagColor);
            setNewTagName("");
            setNewTagColor("#64748b");
            setIsCreating(false);
            onTagsChanged?.();
        } catch {
            // error already handled in useTags
        } finally {
            setIsCreatingSaving(false);
        }
    };

    const handleUpdate = async (tag: Tag) => {
        if (!editingTag) return;
        setSavingId(tag.id);
        try {
            await updateTag(tag.id, editingTag.name, editingTag.color);
            setEditingTag(null);
            onTagsChanged?.();
        } catch {
            // error already handled in useTags
        } finally {
            setSavingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            await deleteTag(id);
            onTagsChanged?.();
        } catch {
            // error already handled in useTags
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Manage Tags</DialogTitle>
                    <DialogDescription>
                        Create, edit, or delete tags to organize your contacts.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* List of Tags */}
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {tags.length === 0 && !isCreating && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No tags yet. Create one below.
                            </p>
                        )}
                        {tags.map((tag) => (
                            <div key={tag.id} className="flex items-center justify-between p-2 rounded-md border bg-card">
                                {editingTag?.id === tag.id ? (
                                    <div className="flex items-center gap-2 w-full">
                                        <input
                                            type="color"
                                            value={editingTag.color}
                                            onChange={(e) => setEditingTag({ ...editingTag, color: e.target.value })}
                                            className="h-8 w-8 rounded cursor-pointer border-none bg-transparent flex-shrink-0"
                                        />
                                        <Input
                                            value={editingTag.name}
                                            onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                                            onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(editingTag); }}
                                            className="h-8"
                                            autoFocus
                                            autoCorrect="off"
                                            autoCapitalize="off"
                                            spellCheck={false}
                                        />
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 flex-shrink-0 text-green-600"
                                            disabled={savingId === tag.id}
                                            onClick={() => handleUpdate(editingTag)}
                                        >
                                            {savingId === tag.id
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <Check className="h-4 w-4" />}
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 flex-shrink-0"
                                            onClick={() => setEditingTag(null)}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                                            <span className="font-medium text-sm truncate">{tag.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8"
                                                onClick={() => setEditingTag(tag)}
                                            >
                                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 text-destructive"
                                                disabled={deletingId === tag.id}
                                                onClick={() => handleDelete(tag.id)}
                                            >
                                                {deletingId === tag.id
                                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    : <Trash2 className="h-3.5 w-3.5" />}
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Create New Tag */}
                    {isCreating ? (
                        <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50 mt-2">
                            <input
                                type="color"
                                value={newTagColor}
                                onChange={(e) => setNewTagColor(e.target.value)}
                                className="h-8 w-8 rounded cursor-pointer border-none bg-transparent flex-shrink-0"
                            />
                            <Input
                                placeholder="Tag name"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                                className="h-8"
                                autoFocus
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                            />
                            <Button size="sm" onClick={handleCreate} disabled={isCreatingSaving || !newTagName.trim()}>
                                {isCreatingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
                        </div>
                    ) : (
                        <Button variant="outline" className="w-full border-dashed" onClick={() => setIsCreating(true)}>
                            <Plus className="mr-2 h-4 w-4" /> Create New Tag
                        </Button>
                    )}
                </div>

                <DialogFooter>
                    <Button onClick={() => handleClose(false)}>Done</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
