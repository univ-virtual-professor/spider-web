import { useLocation, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Search, User } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { HealthStudentData } from "./components/StudentHealthOverview";

export default function StudentHealthCategoryList() {
  const location = useLocation();
  const navigate = useNavigate();
  const isApp = new URLSearchParams(window.location.search).get("_app") === "1" || window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";

  const state = location.state as { students?: HealthStudentData[]; title?: string } | null;
  const students = state?.students || [];
  const title = state?.title || "Student Health List";

  const [search, setSearch] = useState("");

  const filteredStudents = students.filter(
    (s) =>
      !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6 duration-700 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-4">
        {!isApp && (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => navigate("/educator/analytics")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Showing {students.length} students in this category.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col justify-between space-y-4 pb-4 sm:flex-row sm:items-center sm:space-y-0">
          <CardTitle className="text-base font-semibold">Student List</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="h-9 pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredStudents.length > 0 ? (
            <div className="flex flex-col gap-3">
              {filteredStudents.map((student) => {
                return (
                  <div
                    key={student.id}
                    className="flex flex-col items-start justify-between gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {student.name || "Unknown Student"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {student.email || "No email"}
                        </p>
                      </div>
                    </div>

                    <div className="flex w-full items-center justify-between gap-4 sm:ml-auto sm:w-auto sm:justify-end">
                      <Link to={`/educator/students/${student.id}`}>
                        <Button size="sm" variant="outline">
                          View Detail
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              {students.length === 0
                ? "No students available in this category."
                : "No students match your search."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

