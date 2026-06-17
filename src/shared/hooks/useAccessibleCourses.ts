import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@shared/lib/firebase";

export type GlobalCourse = { id: string; name: string };
export type GlobalSubject = { id: string; name: string; courseId: string };

type Result = {
  courses: GlobalCourse[];
  subjects: GlobalSubject[];
  allowedSubjectIds: string[];
  loading: boolean;
};

const CACHE_TTL = 5 * 60 * 1000;

export function useAccessibleCourses(educatorId: string): Result {
  const [courses, setCourses] = useState<GlobalCourse[]>([]);
  const [subjects, setSubjects] = useState<GlobalSubject[]>([]);
  const [allowedSubjectIds, setAllowedSubjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!educatorId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      const cacheKey = `accessible_courses_${educatorId}`;
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const { courses: cc, subjects: cs, ids, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL) {
            if (!cancelled) {
              setCourses(cc);
              setSubjects(cs);
              setAllowedSubjectIds(ids);
              setLoading(false);
            }
            return;
          }
        }
      } catch {}

      setLoading(true);
      try {
        const eduSnap = await getDoc(doc(db, "educators", educatorId));
        const ids: string[] = eduSnap.exists() ? (eduSnap.data().allowedSubjectIds ?? []) : [];

        if (ids.length === 0) {
          if (!cancelled) {
            setAllowedSubjectIds([]);
            setCourses([]);
            setSubjects([]);
          }
          return;
        }

        // Fetch only the allowed subjects by ID in parallel (not the full collection)
        const subjectSnaps = await Promise.all(ids.map((id) => getDoc(doc(db, "subjects", id))));
        const allowedSubjects: GlobalSubject[] = subjectSnaps
          .filter((d) => d.exists())
          .map((d) => ({
            id: d.id,
            name: d.data()!.name as string,
            courseId: d.data()!.courseId as string,
          }));

        const courseIds = [...new Set(allowedSubjects.map((s) => s.courseId).filter(Boolean))];
        const courseSnaps = await Promise.all(
          courseIds.map((id) => getDoc(doc(db, "courses", id)))
        );
        const loadedCourses: GlobalCourse[] = courseSnaps
          .filter((d) => d.exists() && d.data()?.isActive !== false)
          .map((d) => ({ id: d.id, name: d.data()!.name as string }));

        if (!cancelled) {
          setAllowedSubjectIds(ids);
          setSubjects(allowedSubjects);
          setCourses(loadedCourses);
          try {
            sessionStorage.setItem(
              cacheKey,
              JSON.stringify({ courses: loadedCourses, subjects: allowedSubjects, ids, ts: Date.now() })
            );
          } catch {}
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [educatorId]);

  return { courses, subjects, allowedSubjectIds, loading };
}
