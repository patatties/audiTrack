import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookMarked, X } from "lucide-react";
import { cn } from "@/lib/utils";

import readmeContent from "../../README.md?raw";

const rawModules = import.meta.glob(
  "/src/content/manual/*.md",
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

interface Article {
  id: string;
  title: string;
  content: string;
}

const manualArticles: Article[] = Object.entries(rawModules)
  .map(([path, content]) => {
    const filename = path.split("/").pop()!.replace(".md", "");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : filename;
    return { id: filename, title, content };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const articles: Article[] = [
  { id: "readme", title: "README", content: readmeContent.split("public/manual/").join("/manual/") },
  ...manualArticles,
];

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i;

export default function KnowledgeBase() {
  const [activeId, setActiveId] = useState(articles[0]?.id ?? "");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const active = articles.find((a) => a.id === activeId);

  return (
    <div className="flex min-h-screen -mx-6 -my-8 lg:-mx-10">
      <aside className="sticky top-0 h-screen w-56 shrink-0 border-r border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <BookMarked className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Manual</span>
        </div>
        <nav className="space-y-0.5 p-2">
          {articles.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No articles yet.</p>
          )}
          {articles.map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveId(a.id)}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                activeId === a.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {a.title}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {active ? (
          <div className="mx-auto max-w-3xl px-8 py-8">
            <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-primary prose-img:rounded-lg prose-img:border prose-img:border-border">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ src, alt }) => (
                    <img
                      src={src}
                      alt={alt}
                      className="cursor-zoom-in rounded-lg border border-border"
                      onClick={() => src && setLightbox(src)}
                    />
                  ),
                  a: ({ href, children }) => {
                    if (href && IMAGE_EXT.test(href)) {
                      return (
                        <span
                          className="cursor-zoom-in"
                          onClick={() => setLightbox(href)}
                        >
                          {children}
                        </span>
                      );
                    }
                    return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                  },
                }}
              >
                {active.content}
              </ReactMarkdown>
            </article>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Add .md files to src/content/manual/ to get started.
          </div>
        )}
      </main>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-1.5 text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            className="max-h-full max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
