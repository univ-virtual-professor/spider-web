import { useAuth } from "@app/providers/AuthProvider";
import ReportCard from "@features/shared/ReportCard";

export default function StudentReportCard() {
  const { profile } = useAuth();
  return (
    <ReportCard
      educatorId={profile?.educatorId ?? ""}
      studentUid={profile?.uid ?? ""}
      studentName={profile?.displayName || profile?.fullName || profile?.email || "Student"}
    />
  );
}
