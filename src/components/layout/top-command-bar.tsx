import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopCommandBarProps {
    onClick: () => void;
    className?: string;
}

export function TopCommandBar({ onClick, className }: TopCommandBarProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "relative flex items-center w-full max-w-md h-9 rounded-md border border-input bg-muted/40 px-3 py-1 text-sm shadow-sm transition-all hover:bg-transparent hover:border-primary group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
        >
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 group-hover:text-primary group-hover:opacity-100 transition-colors" />
            <span className="text-muted-foreground opacity-50 flex-1 text-left truncate group-hover:text-primary group-hover:opacity-100 transition-colors">
                Search contacts or run commands...
            </span>
            <kbd className="pointer-events-none ml-auto hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">⌘</span>K
            </kbd>
        </button>
    );
}
