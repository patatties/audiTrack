import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Link as LinkIcon, Undo, Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
}

export function RichTextEditor({ value, onChange, placeholder, className, editable = true }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-primary underline" } }),
      Placeholder.configure({ placeholder: placeholder ?? "Start typing..." }),
    ],
    content: value || "",
    editable,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none min-h-[200px] px-3 py-2",
          "prose-headings:font-semibold prose-headings:text-foreground",
          "prose-p:text-foreground prose-strong:text-foreground",
          "prose-ul:my-2 prose-ol:my-2 prose-li:my-0",
          "prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none",
          "prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-3 prose-blockquote:italic",
          "prose-a:text-primary",
        ),
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  if (!editable) {
    return <EditorContent editor={editor} className={className} />;
  }

  const Btn = ({
    onClick, active, disabled, children, title,
  }: {
    onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode; title: string;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn("h-7 w-7 p-0", active && "bg-secondary text-foreground")}
    >
      {children}
    </Button>
  );

  return (
    <div className={cn("rounded-md border border-input bg-background", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1 py-1">
        <Btn title="Bold (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Bold className="h-3.5 w-3.5" /></Btn>
        <Btn title="Italic (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Italic className="h-3.5 w-3.5" /></Btn>
        <Btn title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}><Strikethrough className="h-3.5 w-3.5" /></Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })}><Heading1 className="h-3.5 w-3.5" /></Btn>
        <Btn title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}><Heading2 className="h-3.5 w-3.5" /></Btn>
        <Btn title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })}><Heading3 className="h-3.5 w-3.5" /></Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}><List className="h-3.5 w-3.5" /></Btn>
        <Btn title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}><ListOrdered className="h-3.5 w-3.5" /></Btn>
        <Btn title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}><Quote className="h-3.5 w-3.5" /></Btn>
        <Btn title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")}><Code className="h-3.5 w-3.5" /></Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn title="Link" onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("URL", prev ?? "https://");
          if (url === null) return;
          if (url === "") editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }} active={editor.isActive("link")}><LinkIcon className="h-3.5 w-3.5" /></Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo className="h-3.5 w-3.5" /></Btn>
        <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo className="h-3.5 w-3.5" /></Btn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextView({ html, className }: { html: string; className?: string }) {
  if (!html || !html.trim()) return null;
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none",
        "prose-headings:font-semibold prose-headings:text-foreground",
        "prose-p:text-foreground prose-strong:text-foreground",
        "prose-ul:my-2 prose-ol:my-2 prose-li:my-0",
        "prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none",
        "prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-3 prose-blockquote:italic",
        "prose-a:text-primary",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
