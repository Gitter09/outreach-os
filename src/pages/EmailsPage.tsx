import { Card, CardContent } from "@/components/ui/card";
import { Mail } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useOutletContext } from "react-router-dom";

export function EmailsPage() {
    const { setCommandOpen } = useOutletContext<{ setCommandOpen: (open: boolean) => void }>();

    return (
        <div className="flex flex-col h-full relative">
            <PageHeader title="Emails" onSearchClick={() => setCommandOpen(true)} />

            <div className="flex-1 overflow-auto p-6 space-y-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Inbox</h2>
                    <p className="text-muted-foreground mt-1">View and manage your email conversations.</p>
                </div>

                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <Mail className="h-12 w-12 text-muted-foreground/40 mb-4" />
                        <h3 className="text-lg font-medium">Inbox Coming Soon</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-md">
                            A unified inbox for all your connected email accounts will appear here.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
