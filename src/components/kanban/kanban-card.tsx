
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Contact } from "@/types/crm";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, getColorHex } from "@/lib/utils";

interface KanbanCardProps {
    contact: Contact;
    onClick?: (contact: Contact) => void;
}

export function KanbanCard({ contact, onClick }: KanbanCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: contact.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const statusColor = getColorHex(contact.status_color);

    return (
        <div
            ref={setNodeRef}
            style={{
                ...style,
                borderLeftColor: statusColor,
                borderLeftWidth: statusColor !== "transparent" ? "4px" : "1px"
            }}
            {...attributes}
            {...listeners}
            onClick={() => onClick?.(contact)}
            className={cn(
                "group relative p-3 bg-card rounded-lg border shadow-sm touch-none transition-all",
                "hover:shadow-md hover:border-primary/50 cursor-grab active:cursor-grabbing border-l-4",
                isDragging && "opacity-50 rotate-3 scale-105 z-50 shadow-xl ring-2 ring-primary",
            )}
        >
            <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8 transition-transform group-hover:scale-110">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                        {contact.first_name[0]}{contact.last_name[0]}
                    </AvatarFallback>
                </Avatar>

                <div className="flex-1 overflow-hidden">
                    <h4 className="font-medium text-sm truncate leading-none mb-1">
                        {contact.first_name} {contact.last_name}
                    </h4>
                    <p className="text-[11px] text-muted-foreground truncate mb-2">
                        {contact.email || "No email"}
                    </p>

                    {/* Tiny badges or indicators could go here */}
                    {contact.effective_next_date && (
                        <div className="flex items-center gap-1 mt-2">
                            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                Next: {new Date(contact.effective_next_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
