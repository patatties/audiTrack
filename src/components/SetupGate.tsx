import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useSetupStatus } from "@/lib/setup";

/**
 * Sends every page to /setup until the first setup is completed (or skipped).
 * Databases that already contain data are marked as set up by the API, so they never see it.
 * If the status cannot be loaded the app is shown as usual (it reports its own API errors).
 */
export default function SetupGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useSetupStatus();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading audiTrack…
      </div>
    );
  }
  if (data && !data.completed) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}
