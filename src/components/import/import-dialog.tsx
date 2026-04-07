import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useErrors } from "@/hooks/use-errors";

interface ImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImportComplete?: () => void;
}

interface ImportPreview {
    headers: string[];
    total_rows: number;
}

interface ImportAnalysis {
    total_detected: number;
    new_count: number;
    duplicate_count: number;
}

interface ImportResult {
    imported: number;
    skipped: number;
    merged: number;
    failed: number;
    errors: string[];
}

interface ColumnMapping {
    first_name: number | null;
    last_name: number | null;
    email: number | null;
    linkedin_url: number | null;
    company: number | null;
    title: number | null;
    location: number | null;
    company_website: number | null;
}

export function ImportDialog({ open, onOpenChange, onImportComplete }: ImportDialogProps) {
    const { handleError } = useErrors();
    const [filePath, setFilePath] = useState<string | null>(null);
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false); // Used for both import & analysis loading states if needed, but we have specific ones.
    const [analyzing, setAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    const [mapping, setMapping] = useState<ColumnMapping>({
        first_name: null,
        last_name: null,
        email: null,
        linkedin_url: null,
        company: null,
        title: null,
        location: null,
        company_website: null,
    });

    const handleSelectFile = async () => {
        const selected = await openFileDialog({
            multiple: false,
            filters: [
                { name: "Spreadsheets", extensions: ["csv", "xlsx", "xls"] },
            ],
        });

        if (selected && typeof selected === "string") {
            setFilePath(selected);
            setLoading(true);
            setImportResult(null);

            try {
                const result = await invoke<ImportPreview>("get_import_headers", { filePath: selected });
                setPreview(result);

                // Auto-detect column mappings
                const autoMapping = { ...mapping };
                result.headers.forEach((header, index) => {
                    const lower = header.toLowerCase();
                    if (lower.includes("first") && lower.includes("name")) {
                        autoMapping.first_name = index;
                    } else if (lower.includes("last") && lower.includes("name")) {
                        autoMapping.last_name = index;
                    } else if (lower === "name" || lower === "full name") {
                        autoMapping.first_name = index; // Use as first name if no split
                    } else if (lower.includes("email") || lower.includes("e-mail")) {
                        autoMapping.email = index;
                    } else if (lower.includes("linkedin")) {
                        autoMapping.linkedin_url = index;
                    } else if (lower.includes("company") || lower.includes("organization")) {
                        autoMapping.company = index;
                    } else if (lower.includes("title") || lower.includes("position") || lower.includes("role")) {
                        autoMapping.title = index;
                    } else if (lower.includes("location") || lower.includes("city") || lower.includes("region")) {
                        autoMapping.location = index;
                    } else if (lower.includes("website") || lower === "url" || lower.includes("company url")) {
                        autoMapping.company_website = index;
                    }
                });
                setMapping(autoMapping);
            } catch (err) {
                handleError(err, "Failed to load file");
            } finally {
                setLoading(false);
            }
        }
    };

    const handleAnalyze = async () => {
        if (!filePath) return;
        setAnalyzing(true);
        try {
            const result = await invoke<ImportAnalysis>("analyze_import", {
                filePath,
                mapping,
            });
            setAnalysis(result);
        } catch (err) {
            handleError(err, "Analysis failed");
        } finally {
            setAnalyzing(false);
        }
    };

    const handleImport = async (mode: "skip" | "merge") => {
        if (!filePath) return;

        setImporting(true);
        try {
            const result = await invoke<ImportResult>("import_contacts", {
                filePath,
                mapping,
                mode,
            });
            setImportResult(result);
            onImportComplete?.();
        } catch (err) {
            handleError(err, "Import failed");
        } finally {
            setImporting(false);
        }
    };

    const handleClose = () => {
        setFilePath(null);
        setPreview(null);
        setAnalysis(null);
        setMapping({
            first_name: null,
            last_name: null,
            email: null,
            linkedin_url: null,
            company: null,
            title: null,
            location: null,
            company_website: null,
        });
        setImportResult(null);
        onOpenChange(false);
    };

    const updateMapping = (field: keyof ColumnMapping, value: string) => {
        setMapping(prev => ({
            ...prev,
            [field]: value === "none" ? null : parseInt(value, 10),
        }));
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[90vw] lg:max-w-[1200px] w-[95%] max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" />
                        Import Contacts
                    </DialogTitle>
                    <DialogDescription>
                        Import contacts from a CSV or Excel file
                    </DialogDescription>
                </DialogHeader>

                {importResult !== null ? (
                    /* Success State */
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        {importResult.failed > 0 ? (
                            <AlertCircle className="h-16 w-16 text-amber-500" />
                        ) : (
                            <CheckCircle className="h-16 w-16 text-green-500" />
                        )}
                        <h3 className="text-xl font-semibold">
                            {importResult.failed > 0 ? "Import Complete with Warnings" : "Import Complete!"}
                        </h3>
                        <div className="text-center space-y-1">
                            <p className="text-muted-foreground">
                                <strong>{importResult.imported}</strong> new contacts imported
                                {importResult.merged > 0 && (
                                    <span>, <strong>{importResult.merged}</strong> merged</span>
                                )}
                                {importResult.skipped > 0 && (
                                    <span>, <strong>{importResult.skipped}</strong> skipped</span>
                                )}
                                {importResult.failed > 0 && (
                                    <span className="text-amber-600">, <strong>{importResult.failed}</strong> failed</span>
                                )}
                                .
                            </p>
                            {importResult.errors.length > 0 && (
                                <div className="mt-4 max-h-32 overflow-y-auto text-xs text-left bg-muted/50 p-3 rounded border max-w-md">
                                    {importResult.errors.map((err, i) => (
                                        <div key={i} className="text-amber-600 py-0.5">{err}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <Button onClick={handleClose}>Done</Button>
                    </div>
                ) : !preview ? (
                    /* File Selection State */
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <div className="p-6 rounded-full bg-muted">
                            <Upload className="h-12 w-12 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground text-center">
                            Select a CSV, XLSX, or XLS file to import
                        </p>
                        <Button onClick={handleSelectFile} disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Loading...
                                </>
                            ) : (
                                "Choose File"
                            )}
                        </Button>
                    </div>
                ) : analysis ? (
                    /* Analysis Result State */
                    <div className="flex flex-col items-center justify-center py-8 space-y-6">
                        <div className="text-center space-y-2">
                            <h3 className="text-lg font-semibold">Analysis Complete</h3>
                            <p className="text-muted-foreground">
                                We found <strong>{analysis.total_detected}</strong> contacts in your file.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                            <div className="bg-muted/50 p-4 rounded-lg text-center border">
                                <div className="text-2xl font-bold text-green-600">{analysis.new_count}</div>
                                <div className="text-xs text-muted-foreground uppercase font-medium mt-1">New</div>
                            </div>
                            <div className="bg-muted/50 p-4 rounded-lg text-center border">
                                <div className="text-2xl font-bold text-amber-600">{analysis.duplicate_count}</div>
                                <div className="text-xs text-muted-foreground uppercase font-medium mt-1">Duplicates</div>
                            </div>
                        </div>

                        <div className="w-full max-w-md space-y-3">
                            <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded text-sm text-blue-700 dark:text-blue-300 flex gap-3">
                                <div className="shrink-0 mt-0.5">ℹ️</div>
                                <div>
                                    Duplicates are detected based on Email, LinkedIn URL, or Name + Company match.
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 border rounded-lg bg-muted/30">
                                    <div className="text-xs font-bold uppercase text-muted-foreground mb-1">Skip Duplicates</div>
                                    <div className="text-[11px] leading-tight text-muted-foreground">Only add the {analysis.new_count} new contacts. Existing ones will be untouched.</div>
                                </div>
                                <div className="p-3 border rounded-lg bg-muted/30">
                                    <div className="text-xs font-bold uppercase text-muted-foreground mb-1">Merge & Update</div>
                                    <div className="text-[11px] leading-tight text-muted-foreground">Add new contacts AND fill missing info for the {analysis.duplicate_count} duplicates.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Mapping State */
                    <div className="space-y-6">
                        <div className="text-sm text-muted-foreground">
                            File: <code className="bg-muted px-1 rounded">{filePath?.split("/").pop()}</code>
                            {" • "}{preview.total_rows} rows detected
                        </div>

                        {/* Column Mapping */}
                        <div className="space-y-4">
                            <h4 className="font-medium">Map Columns</h4>
                            <div className="grid grid-cols-2 gap-4">
                                {(["first_name", "last_name", "email", "linkedin_url", "company", "title", "location", "company_website"] as const).map(field => (
                                    <div key={field} className="space-y-1">
                                        <Label className="text-xs uppercase text-muted-foreground">
                                            {field.replace("_", " ")}
                                        </Label>
                                        <Select
                                            value={mapping[field]?.toString() ?? "none"}
                                            onValueChange={(v) => updateMapping(field, v)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select column" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">— Not mapped —</SelectItem>
                                                {preview.headers.map((header, idx) => (
                                                    <SelectItem key={idx} value={idx.toString()}>
                                                        {header}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                )}

                {preview && importResult === null && !analysis && (
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setPreview(null); setFilePath(null); }}>
                            Back
                        </Button>
                        <Button
                            onClick={handleAnalyze}
                            disabled={analyzing || (mapping.first_name === null && mapping.last_name === null)}
                        >
                            {analyzing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                "Check for Duplicates"
                            )}
                        </Button>
                    </DialogFooter>
                )}

                {analysis && importResult === null && (
                    <DialogFooter className="sm:justify-between">
                        <Button variant="ghost" onClick={() => setAnalysis(null)}>
                            Back to Mapping
                        </Button>

                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => handleImport("skip")}
                                disabled={importing}
                            >
                                Skip Duplicates
                            </Button>
                            <Button
                                onClick={() => handleImport("merge")}
                                disabled={importing}
                            >
                                {importing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Importing...
                                    </>
                                ) : (
                                    "Merge & Update"
                                )}
                            </Button>
                        </div>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog >
    );
}
