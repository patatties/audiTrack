import { useParams } from "react-router-dom";
import FindingDialog from "@/components/FindingDialog";

export default function FindingDetail() {
  const { id } = useParams<{ id: string }>();
  return <FindingDialog id={id ?? null} detached onOpenChange={() => {}} />;
}
