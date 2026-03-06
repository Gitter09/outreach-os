import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { TopCommandBar } from "./top-command-bar";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
    title?: string;
    leftActions?: ReactNode;
    children?: ReactNode; // Right side actions
    onSearchClick?: () => void;
    showSearch?: boolean;
    className?: string;
}

export function PageHeader({
    title,
    leftActions,
    children,
    onSearchClick,
    showSearch = true,
    className
}: PageHeaderProps) {
    const location = useLocation();
    const isSettings = location.pathname.startsWith("/settings");

    // Override showSearch if on settings page
    const shouldShowSearch = showSearch && !isSettings;

    return (
        <header className={cn(
            "h-[60px] px-6 border-b flex items-center justify-between shrink-0 bg-background/95 backdrop-blur z-10 sticky top-0",
            className
        )}>
            <div className="flex items-center gap-4 min-w-0">
                {leftActions}
                {title && (
                    <h1 className="text-lg font-semibold tracking-tight truncate">
                        {title}
                    </h1>
                )}
            </div>

            <div className="flex items-center gap-3">
                {shouldShowSearch && onSearchClick && (
                    <TopCommandBar onClick={onSearchClick} className="w-64 hidden md:flex" />
                )}
                <div className="flex items-center gap-4">
                    {children}
                </div>
            </div>
        </header>
    );
}
