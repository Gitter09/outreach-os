import { Card, CardContent } from "@/components/ui/card";
import { CheckSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useOutletContext } from "react-router-dom";

export function TasksPage() {
    const { setCommandOpen } = useOutletContext<{ setCommandOpen: (open: boolean) => void }>();

    return (
        <div className="flex flex-col h-full relative">
            <PageHeader title="Tasks" onSearchClick={() => setCommandOpen(true)} />

            <div className="flex-1 overflow-auto p-6 space-y-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">My Tasks</h2>
                    <p className="text-muted-foreground mt-1">Track follow-ups and to-dos.</p>
                </div>

                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <CheckSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
                        <h3 className="text-lg font-medium">Tasks Coming Soon</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-md">
                            Manage your outreach follow-ups, deadlines, and reminders here.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
