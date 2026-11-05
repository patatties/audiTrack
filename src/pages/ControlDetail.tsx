import { useParams } from "react-router-dom";
import ControlOverviewDialog from "@/components/ControlOverviewDialog";

export default function ControlDetail() {
  const { id } = useParams<{ id: string }>();
  return <ControlOverviewDialog controlId={id ?? null} detached onOpenChange={() => {}} />;
}
