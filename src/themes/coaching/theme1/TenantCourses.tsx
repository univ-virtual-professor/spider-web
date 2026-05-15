import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTenant } from "@app/providers/TenantProvider";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Loader2, FileText, ArrowRight, Search, Clock } from "lucide-react";
import { Input } from "@shared/ui/input";
import Theme1CTA from "./Theme1CTA";
import Theme1FAQ from "./Theme1FAQ";
import Theme1Layout from "./Theme1Layout";

type TestSeries = {
  id: string;
  title: string;
  description: string;
  price: string | number;
  coverImage?: string;
  subject?: string;
  difficulty?: string;
  testsCount?: number;
  durationMinutes?: number;
};

export default function TenantCourses() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [courses, setCourses] = useState<TestSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!tenant?.educatorId) return;

    const fetchCourses = async () => {
      try {
        // Fetch ALL tests from the educator's sub-collection
        const q = query(
          collection(db, "educators", tenant.educatorId, "my_tests"),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        const fetchedData = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TestSeries[];

        setCourses(fetchedData);
      } catch (error) {
        console.error("Error fetching courses:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [tenant?.educatorId]);

  // Client-side search filtering
  const filteredCourses = courses.filter(
    (c) =>
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.subject && c.subject.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (tenantLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tenant) return null;

  return (
    <Theme1Layout>
      <div className="container min-h-screen py-20">
        <div className="mb-10 flex flex-col items-center justify-between gap-4 md:flex-row">
          <div>
            <h1 className="mb-2 text-3xl font-bold">All Test Series</h1>
            <p className="text-muted-foreground">
              Browse all available exam packages and mock tests.
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tests..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {filteredCourses.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed bg-muted/30 py-20 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-xl font-semibold">No test series found</h3>
            <p className="text-muted-foreground">Check back later for new content.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCourses.map((course) => (
              <Link key={course.id} to={`/course/${course.id}`}>
                <Card className="group h-full overflow-hidden border bg-card transition-all duration-300 hover:shadow-lg">
                  {/* Image / Placeholder */}
                  <div className="relative aspect-video overflow-hidden bg-muted">
                    {course.coverImage ? (
                      <img
                        src={course.coverImage}
                        alt={course.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-primary/5 text-primary/40">
                        <FileText className="h-10 w-10" />
                        <span className="text-xs font-medium uppercase tracking-wider">
                          No Cover Image
                        </span>
                      </div>
                    )}
                    {course.subject && (
                      <div className="absolute right-2 top-2">
                        <Badge className="bg-white/90 text-black shadow-sm backdrop-blur-md hover:bg-white">
                          {course.subject}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <CardContent className="flex h-full flex-col p-5">
                    <h3 className="mb-2 line-clamp-1 text-lg font-bold transition-colors group-hover:text-primary">
                      {course.title}
                    </h3>
                    <p className="mb-4 line-clamp-2 h-10 text-sm text-muted-foreground">
                      {course.description}
                    </p>

                    <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
                      {course.testsCount !== undefined && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" /> {course.testsCount} Tests
                        </span>
                      )}
                      {course.durationMinutes && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {course.durationMinutes}m
                        </span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-4">
                      <span
                        className={`font-bold ${course.price === "Included" || course.price == 0 ? "text-green-600" : ""}`}
                      >
                        {course.price === "Included" || course.price == 0
                          ? "Free"
                          : `₹${course.price}`}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 p-0 hover:bg-transparent hover:text-primary"
                      >
                        View Details <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Theme1FAQ />
      <Theme1CTA />
    </Theme1Layout>
  );
}
