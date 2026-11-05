import { useParams } from "react-router-dom";
import RemediationPlanDialog from "@/components/RemediationPlanDialog";

export default function RemediationDetail() {
  const { id } = useParams<{ id: string }>();
  return <RemediationPlanDialog id={id ?? null} detached onOpenChange={() => {}} />;
}
