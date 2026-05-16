import { BookOpenCheck } from "lucide-react";
import ScheduledAssessmentsList from "./components/ScheduledAssessmentsList";
import { motion } from "framer-motion";

export default function ScheduledDpps() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BookOpenCheck className="h-6 w-6 text-primary" />
          Scheduled DPPs
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage DPP schedules and track practice planning.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <ScheduledAssessmentsList type="dpps" />
      </motion.div>
    </div>
  );
}
