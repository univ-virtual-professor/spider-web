import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "@shared/lib/firebase";
import { useTenant } from "@app/providers/TenantProvider";
import { Loader2, ArrowLeft } from "lucide-react";
import NotFound from "@/pages/NotFound";

type PageDoc = {
  title: string;
  content: string;
  status: "draft" | "live";
};

// Lightweight, theme-neutral renderer for the additional-pages CMS layer
// (WebsitePages.tsx) — deliberately doesn't try to match each of the 4 home
// page themes' internal header/footer components (theme1/2/3 + builder), to
// avoid a deep, risky rewrite of the existing single-page home builder. Only
// status: "live" pages are ever served here — draft pages 404 for the public.
export default function TenantCustomPage() {
  const { slug } = useParams<{ slug: string }>();
  const { tenant, loading: tenantLoading } = useTenant();
  const [page, setPage] = useState<PageDoc | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    if (!tenant?.educatorId || !slug) return;
    getDocs(
      query(
        collection(db, "educators", tenant.educatorId, "websitePages"),
        where("slug", "==", slug),
        where("status", "==", "live")
      )
    )
      .then((snap) => setPage(snap.empty ? null : (snap.docs[0].data() as PageDoc)))
      .catch(() => setPage(null));
  }, [tenant?.educatorId, slug]);

  if (tenantLoading || page === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!page) {
    return <NotFound />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {tenant?.coachingName || "Home"}
      </Link>
      <h1 className="mb-4 text-3xl font-bold">{page.title}</h1>
      <div className="whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
        {page.content}
      </div>
    </div>
  );
}
