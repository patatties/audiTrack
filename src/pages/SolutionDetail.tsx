import { useParams } from "react-router-dom";
import { SolutionDialog } from "@/pages/Solutions";

export default function SolutionDetail() {
  const { id } = useParams<{ id: string }>();
  return <SolutionDialog id={id ?? null} detached onOpenChange={() => {}} />;
}
