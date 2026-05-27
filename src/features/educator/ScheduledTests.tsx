import { CalendarRange, ArrowLeft } from "lucide-react";
import ScheduledAssessmentsList from "./components/ScheduledAssessmentsList";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export default function ScheduledTests() {
  const isApp = new URLSearchParams(window.location.search).get("_app") === "1" || window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {!isApp && (
          <div>
            <Link
              to="/educator"
              className="flex w-fit rounded-full p-1 text-black hover:bg-primary hover:text-white"
            >
              <ArrowLeft className="h-6 w-6" />
            </Link>
          </div>
        )}
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarRange className="h-6 w-6 text-primary" />
            Scheduled Tests
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage upcoming and previous test schedules.
          </p>
        </div>
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

