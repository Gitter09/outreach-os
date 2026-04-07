import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    List,
    ListOrdered,
    Undo2,
    Redo2,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    minHeight?: number;
    disabled?: boolean;
    className?: string;
    editorRef?: React.MutableRefObject<Editor | null>;
    onFocus?: () => void;
}

export function RichTextEditor({
    value,
    onChange,
    placeholder = "Write your message...",
    minHeight = 200,
    disabled = false,
    className,
    editorRef,
    onFocus,
}: RichTextEditorProps) {
    const isInternalChange = React.useRef(false);
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                code: false,
                codeBlock: false,
                blockquote: false,
            }),
            Underline,
            Placeholder.configure({ placeholder }),
        ],
        content: value,
        editable: !disabled,
        onUpdate: ({ editor }) => {
            isInternalChange.current = true;
            onChange(editor.getHTML());
        },
        onTransaction: () => forceUpdate(),
        editorProps: {
            attributes: {
                class: "tiptap focus:outline-none px-3 py-2 text-sm break-words",
                style: `min-height: ${minHeight}px`,
            },
        },
    });

    // Sync external value changes into the editor (e.g. template applied, reset on close)
    React.useEffect(() => {
        if (!editor) return;
        if (isInternalChange.current) {
            isInternalChange.current = false;
            return;
        }
        if (editor.getHTML() !== value) {
            editor.commands.setContent(value);
        }
    }, [value, editor]);

    // Expose the editor instance to the parent
    React.useEffect(() => {
        if (editorRef) editorRef.current = editor ?? null;
    }, [editor, editorRef]);

    // Keep editable in sync with disabled prop
    React.useEffect(() => {
        if (!editor) return;
        editor.setEditable(!disabled);
    }, [editor, disabled]);

    return (
        <div
            className={cn(
                "rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 min-w-0 overflow-hidden",
                disabled && "opacity-50 cursor-not-allowed",
                className
            )}
            onFocus={onFocus}
        >
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 border-b px-1 py-1 flex-wrap">
                <Toggle
                    size="sm"
                    pressed={editor?.isActive("bold") ?? false}
                    onPressedChange={() =>
                        editor?.chain().focus().toggleBold().run()
                    }
                    disabled={!editor || disabled}
                    aria-label="Bold"
                >
                    <Bold className="h-3.5 w-3.5" />
                </Toggle>
                <Toggle
                    size="sm"
                    pressed={editor?.isActive("italic") ?? false}
                    onPressedChange={() =>
                        editor?.chain().focus().toggleItalic().run()
                    }
                    disabled={!editor || disabled}
                    aria-label="Italic"
                >
                    <Italic className="h-3.5 w-3.5" />
                </Toggle>
                <Toggle
                    size="sm"
                    pressed={editor?.isActive("underline") ?? false}
                    onPressedChange={() =>
                        editor?.chain().focus().toggleUnderline().run()
                    }
                    disabled={!editor || disabled}
                    aria-label="Underline"
                >
                    <UnderlineIcon className="h-3.5 w-3.5" />
                </Toggle>
                <Toggle
                    size="sm"
                    pressed={editor?.isActive("strike") ?? false}
                    onPressedChange={() =>
                        editor?.chain().focus().toggleStrike().run()
                    }
                    disabled={!editor || disabled}
                    aria-label="Strikethrough"
                >
                    <Strikethrough className="h-3.5 w-3.5" />
                </Toggle>

                <Separator orientation="vertical" className="h-5 mx-1" />

                <Toggle
                    size="sm"
                    pressed={editor?.isActive("bulletList") ?? false}
                    onPressedChange={() =>
                        editor?.chain().focus().toggleBulletList().run()
                    }
                    disabled={!editor || disabled}
                    aria-label="Bullet list"
                >
                    <List className="h-3.5 w-3.5" />
                </Toggle>
                <Toggle
                    size="sm"
                    pressed={editor?.isActive("orderedList") ?? false}
                    onPressedChange={() =>
                        editor?.chain().focus().toggleOrderedList().run()
                    }
                    disabled={!editor || disabled}
                    aria-label="Ordered list"
                >
                    <ListOrdered className="h-3.5 w-3.5" />
                </Toggle>

                <Separator orientation="vertical" className="h-5 mx-1" />

                <Toggle
                    size="sm"
                    pressed={false}
                    onPressedChange={() =>
                        editor?.chain().focus().undo().run()
                    }
                    disabled={!editor || disabled || !editor?.can().undo()}
                    aria-label="Undo"
                >
                    <Undo2 className="h-3.5 w-3.5" />
                </Toggle>
                <Toggle
                    size="sm"
                    pressed={false}
                    onPressedChange={() =>
                        editor?.chain().focus().redo().run()
                    }
                    disabled={!editor || disabled || !editor?.can().redo()}
                    aria-label="Redo"
                >
                    <Redo2 className="h-3.5 w-3.5" />
                </Toggle>
            </div>

            {/* Editor area */}
            <EditorContent
                editor={editor}
                className="overflow-y-auto overflow-x-hidden"
            />
        </div>
    );
}

export type { Editor };
