import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Languages, Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function TranslateButton({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const translate = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const data = await apiPost("translate", { text: value });
      if (!data?.ok) throw new Error(data?.error ?? "Translation failed");
      onChange(data.translation);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title="Translate to English"
      disabled={!value.trim() || busy}
      onClick={translate}
      className={cn("h-6 w-6 text-muted-foreground hover:text-foreground", className)}
    >
      {busy
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <Languages className="h-3.5 w-3.5" />}
    </Button>
  );
}
