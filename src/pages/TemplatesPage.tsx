import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useOutletContext } from "react-router-dom";

export function TemplatesPage() {
    const { setCommandOpen } = useOutletContext<{ setCommandOpen: (open: boolean) => void }>();

    return (
        <div className="flex flex-col h-full relative">
            <PageHeader title="Templates" onSearchClick={() => setCommandOpen(true)} />

            <div className="flex-1 overflow-auto p-6 space-y-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Email Templates</h2>
                    <p className="text-muted-foreground mt-1">Create and manage reusable email templates.</p>
                </div>

                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
                        <h3 className="text-lg font-medium">Templates Coming Soon</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-md">
                            Build reusable email templates with merge variables like {"{{first_name}}"} and {"{{company}}"}.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
