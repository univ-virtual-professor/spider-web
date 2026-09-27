import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import ReportCard from "@features/shared/ReportCard";
import { Loader2 } from "lucide-react";

export default function EducatorStudentReportCard() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const { profile } = useAuth();
  const educatorId: string = profile?.uid ?? "";
  const [studentName, setStudentName] = useState<string | null>(null);

  useEffect(() => {
    if (!educatorId || !studentId) return;
    getDoc(doc(db, "educators", educatorId, "students", studentId)).then((snap) => {
      const data = snap.exists() ? snap.data() : null;
      setStudentName(String(data?.name || data?.displayName || "Student"));
    });
  }, [educatorId, studentId]);

  if (studentName === null) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <ReportCard educatorId={educatorId} studentUid={studentId} studentName={studentName} />;
}
