import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { UserPlus, FileSpreadsheet, ChevronDown } from "lucide-react";

interface AddContactDropdownProps {
    onAddManually: () => void;
    onImportFile: () => void;
}

export function AddContactDropdown({ onAddManually, onImportFile }: AddContactDropdownProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="sm" className="cursor-pointer">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Contact
                    <ChevronDown className="ml-2 h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onAddManually}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Manually
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onImportFile}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Import from File
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
