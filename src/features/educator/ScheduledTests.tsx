import { CalendarRange } from "lucide-react";
import ScheduledAssessmentsList from "./components/ScheduledAssessmentsList";
import { motion } from "framer-motion";

export default function ScheduledTests() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CalendarRange className="h-6 w-6 text-primary" />
          Scheduled Tests
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage upcoming and previous test schedules.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <ScheduledAssessmentsList type="tests" />
      </motion.div>
    </div>
  );
}
