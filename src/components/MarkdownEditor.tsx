import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, ListOrdered, Heading, Link as LinkIcon, Code } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}

export function MarkdownEditor({ value, onChange, rows = 6, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(kind: "bold" | "italic" | "code" | "h" | "ul" | "ol" | "link") {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value.slice(0, start);
    const sel = value.slice(start, end);
    const after = value.slice(end);
    let inserted = sel;
    let newStart = start;
    let newEnd = end;

    const wrap = (w: string) => {
      const text = sel || "tekst";
      inserted = `${w}${text}${w}`;
      newStart = start + w.length;
      newEnd = newStart + text.length;
    };

    const linePrefix = (fn: (i: number, line: string) => string) => {
      // Expand selection to whole lines
      const lineStart = before.lastIndexOf("\n") + 1;
      const afterNl = after.indexOf("\n");
      const lineEnd = afterNl === -1 ? value.length : end + afterNl;
      const block = value.slice(lineStart, lineEnd);
      const lines = block.split("\n");
      const newBlock = lines.map((l, i) => (l.length ? fn(i, l) : l)).join("\n");
      const next = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
      onChange(next);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = lineStart + newBlock.length;
        ta.setSelectionRange(pos, pos);
      });
      return true;
    };

    switch (kind) {
      case "bold": wrap("**"); break;
      case "italic": wrap("*"); break;
      case "code": wrap("`"); break;
      case "h": {
        linePrefix((_, l) => (l.startsWith("## ") ? l : `## ${l.replace(/^#+\s*/, "")}`));
        return;
      }
      case "ul": {
        linePrefix((_, l) => (l.startsWith("- ") ? l : `- ${l.replace(/^(\d+\.\s|-\s)/, "")}`));
        return;
      }
      case "ol": {
        linePrefix((i, l) => `${i + 1}. ${l.replace(/^(\d+\.\s|-\s)/, "")}`);
        return;
      }
      case "link": {
        const text = sel || "link";
        inserted = `[${text}](url)`;
        newStart = start + inserted.length - 4;
        newEnd = newStart + 3;
        break;
      }
    }

    const next = before + inserted + after;
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newStart, newEnd);
    });
  }

  const Btn = ({ k, icon: Icon, title }: { k: Parameters<typeof apply>[0]; icon: React.ComponentType<{ className?: string }>; title: string }) => (
    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" title={title} onClick={() => apply(k)}>
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );

  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1 py-1">
        <Btn k="bold" icon={Bold} title="Vet (Ctrl+B)" />
        <Btn k="italic" icon={Italic} title="Cursief" />
        <Btn k="h" icon={Heading} title="Kop" />
        <Btn k="ul" icon={List} title="Bullet list" />
        <Btn k="ol" icon={ListOrdered} title="Genummerde lijst" />
        <Btn k="link" icon={LinkIcon} title="Link" />
        <Btn k="code" icon={Code} title="Code" />
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            apply("bold");
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
            e.preventDefault();
            apply("italic");
          } else if (e.key === "Tab") {
            e.preventDefault();
            const ta = ref.current;
            if (!ta) return;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const lineStart = value.lastIndexOf("\n", start - 1) + 1;
            const afterNl = value.indexOf("\n", end);
            const lineEnd = afterNl === -1 ? value.length : end;
            const block = value.slice(lineStart, lineEnd);
            const lines = block.split("\n");
            const indent = "  ";
            const newLines = e.shiftKey
              ? lines.map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l.replace(/^ {1}/, "")))
              : lines.map((l) => indent + l);
            const newBlock = newLines.join("\n");
            const next = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
            onChange(next);
            const delta = newBlock.length - block.length;
            requestAnimationFrame(() => {
              ta.focus();
              ta.setSelectionRange(start + (e.shiftKey ? Math.max(-indent.length, delta) : indent.length), end + delta);
            });
          }
        }}
      />
    </div>
  );
}
