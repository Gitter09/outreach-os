import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useOutletContext } from "react-router-dom";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export function TasksPage() {
    const { setCommandOpen } = useOutletContext<{ setCommandOpen: (open: boolean) => void }>();
    const [_filter, setFilter] = useState("all");

    return (
        <div className="flex flex-col h-full relative">
            <PageHeader title="Tasks" onSearchClick={() => setCommandOpen(true)} />

            <div className="flex-1 overflow-auto p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">My Tasks</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">Track follow-ups and to-dos.</p>
                    </div>
                    <Select value={_filter} onValueChange={setFilter}>
                        <SelectTrigger className="w-36 h-8 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All tasks</SelectItem>
                            <SelectItem value="today">Due today</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <p className="text-sm text-muted-foreground">
                    Still building this one. Tasks tied to your contacts and companies — coming soon.
                </p>

                <div className="rounded-lg border divide-y">
                    {[
                        { nameWidth: "w-44", contactWidth: "w-28", dateWidth: "w-16" },
                        { nameWidth: "w-56", contactWidth: "w-20", dateWidth: "w-14" },
                        { nameWidth: "w-36", contactWidth: "w-32", dateWidth: "w-16" },
                        { nameWidth: "w-48", contactWidth: "w-24", dateWidth: "w-14" },
                    ].map((row, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3">
                            <div className="h-4 w-4 rounded border border-muted-foreground/30 shrink-0" />
                            <div className={`h-4 ${row.nameWidth} bg-muted rounded animate-pulse`} />
                            <div className={`h-4 ${row.contactWidth} bg-muted/60 rounded animate-pulse ml-auto`} />
                            <div className={`h-4 ${row.dateWidth} bg-muted/60 rounded animate-pulse`} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
