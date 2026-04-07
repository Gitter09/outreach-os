import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, Plus, Pencil, Trash2, Mail, Paperclip } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { useErrors } from "@/hooks/use-errors";
import { EmailTemplate } from "@/types/crm";
import { EditTemplateDialog } from "@/components/templates/EditTemplateDialog";
import { toast } from "sonner";
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

export function TemplatesPage() {
    const { setCommandOpen } = useOutletContext<{ setCommandOpen: (open: boolean) => void }>();
    const { handleError } = useErrors();
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | undefined>();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | undefined>();

    const fetchTemplates = async () => {
        setIsLoading(true);
        try {
            const data = await invoke<EmailTemplate[]>("get_email_templates");
            setTemplates(data);
        } catch (error) {
            handleError(error, "Failed to load templates");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const handleCreate = () => {
        setSelectedTemplate(undefined);
        setIsEditDialogOpen(true);
    };

    const handleEdit = (template: EmailTemplate) => {
        setSelectedTemplate(template);
        setIsEditDialogOpen(true);
    };

    const handleDeleteConfirm = (template: EmailTemplate) => {
        setTemplateToDelete(template);
        setIsDeleteDialogOpen(true);
    };

    const handleDelete = async () => {
        if (!templateToDelete) return;
        try {
            await invoke("delete_email_template", { id: templateToDelete.id });
            toast.success("Template deleted");
            fetchTemplates();
        } catch (error) {
            handleError(error, "Failed to delete template");
        } finally {
            setIsDeleteDialogOpen(false);
            setTemplateToDelete(undefined);
        }
    };

    return (
        <div className="flex flex-col h-full relative">
            <PageHeader title="Templates" onSearchClick={() => setCommandOpen(true)} />

            <div className="flex-1 overflow-auto p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Email Templates</h2>
                        <p className="text-muted-foreground mt-1">Create and manage reusable email templates.</p>
                    </div>
                    <Button onClick={handleCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Template
                    </Button>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                            <Card key={i} className="animate-pulse h-[200px] border-dashed" />
                        ))}
                    </div>
                ) : templates.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
                            <h3 className="text-lg font-medium">No templates found</h3>
                            <p className="text-sm text-muted-foreground mt-1 max-w-md">
                                Build reusable email templates with merge variables like {"{{first_name}}"} and {"{{company}}"}.
                            </p>
                            <Button variant="outline" className="mt-6" onClick={handleCreate}>
                                <Plus className="mr-2 h-4 w-4" />
                                Create your first template
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
                        {templates.map((template) => (
                            <Card key={template.id} className="flex flex-col h-[280px]">
                                <CardHeader>
                                    <CardTitle className="text-lg line-clamp-1">{template.name}</CardTitle>
                                    <CardDescription className="flex items-center gap-2 mt-2">
                                        <Mail className="h-3 w-3" />
                                        <span className="line-clamp-1 italic">
                                            {template.subject || "No subject"}
                                        </span>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1 overflow-hidden relative group">
                                    <div className="text-sm text-muted-foreground line-clamp-5">
                                        {template.body
                                            ? template.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || "No body content"
                                            : "No body content"}
                                    </div>
                                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
                                </CardContent>
                                <div className="px-3 py-2 flex items-center justify-between border-t mt-auto gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                                        {template.attachment_paths?.length > 0 && (
                                            <>
                                                <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                                                {template.attachment_paths.length === 1 ? (
                                                    <button
                                                        className="text-xs text-muted-foreground truncate hover:text-foreground hover:underline transition-colors text-left"
                                                        title={template.attachment_paths[0].split(/[\\/]/).pop()}
                                                        onClick={() => invoke("open_attachment", { filePath: template.attachment_paths[0] }).catch(e => handleError(e, "Could not open file"))}
                                                    >
                                                        {(() => { const n = template.attachment_paths[0].split(/[\\/]/).pop() ?? ""; return n.length > 24 ? n.slice(0, 21) + "…" : n; })()}
                                                    </button>
                                                ) : (
                                                    <span
                                                        className="text-xs text-muted-foreground truncate"
                                                        title={template.attachment_paths.map(p => p.split(/[\\/]/).pop()).join(", ")}
                                                    >
                                                        {template.attachment_paths.length} attachments
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleEdit(template)}
                                            className="h-8 w-8"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDeleteConfirm(template)}
                                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <EditTemplateDialog
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                template={selectedTemplate}
                onSuccess={fetchTemplates}
            />

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Template</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{templateToDelete?.name}"? This action cannot be
                            undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
