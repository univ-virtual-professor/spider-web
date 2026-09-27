import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useEmployee } from "@shared/contexts/EmployeeContext";
import { PERMISSIONS } from "@shared/lib/rolesConfig";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Switch } from "@shared/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/ui/dialog";
import { DsPageHeader, DsCard, DsStatusPill } from "@shared/ui/ds";
import { Loader2, ExternalLink } from "lucide-react";

type PageType = "batch" | "results" | "custom";
type PageDoc = {
  id: string;
  title: string;
  slug: string;
  pageType: PageType;
  content: string;
  status: "draft" | "live";
};

export default function WebsitePages() {
  const { profile } = useAuth();
  const educatorId: string = profile?.uid ?? "";
  const tenantSlug: string = profile?.tenantSlug ?? "";
  const { isEmployee, hasPermission } = useEmployee();
  const canManage = !isEmployee || hasPermission(PERMISSIONS.WEBSITE_MANAGE);
  const navigate = useNavigate();

  const [pages, setPages] = useState<PageDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [instituteName, setInstituteName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [accentColor, setAccentColor] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<PageDoc | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formType, setFormType] = useState<PageType>("custom");
  const [formContent, setFormContent] = useState("");
  const [formLive, setFormLive] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(collection(db, "educators", educatorId, "websitePages"), (snap) => {
      setPages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
    });
    return () => unsub();
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId) return;
    getDoc(doc(db, "educators", educatorId)).then((snap) => {
      const data = snap.exists() ? (snap.data() as any) : null;
      setInstituteName(data?.builderConfig?.instituteName || data?.coachingName || "");
      setLogoUrl(
        data?.builderConfig?.instituteLogo || data?.websiteConfig?.logoUrl || data?.photoURL || ""
      );
      setAccentColor(data?.builderConfig?.customColor || "");
    });
  }, [educatorId]);

  function slugify(s: string) {
    return s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function openNew() {
    setEditingPage(null);
    setFormTitle("");
    setFormSlug("");
    setFormType("custom");
    setFormContent("");
    setFormLive(false);
    setDialogOpen(true);
  }

  function openEdit(page: PageDoc) {
    setEditingPage(page);
    setFormTitle(page.title);
    setFormSlug(page.slug);
    setFormType(page.pageType);
    setFormContent(page.content);
    setFormLive(page.status === "live");
    setDialogOpen(true);
  }

  async function savePage() {
    const slug = slugify(formSlug || formTitle);
    if (!formTitle.trim() || !slug) {
      toast.error("Title is required");
      return;
    }
    const clash = pages.find((p) => p.slug === slug && p.id !== editingPage?.id);
    if (clash) {
      toast.error("Another page already uses this URL");
      return;
    }
    setSaving(true);
    try {
      const data = {
        title: formTitle.trim(),
        slug,
        pageType: formType,
        content: formContent,
        status: formLive ? ("live" as const) : ("draft" as const),
        updatedAt: Timestamp.now(),
      };
      if (editingPage) {
        await updateDoc(doc(db, "educators", educatorId, "websitePages", editingPage.id), data);
      } else {
        await addDoc(collection(db, "educators", educatorId, "websitePages"), {
          ...data,
          createdAt: Timestamp.now(),
        });
      }
      toast.success("Page saved");
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save page");
    } finally {
      setSaving(false);
    }
  }

  async function toggleLive(page: PageDoc) {
    try {
      await updateDoc(doc(db, "educators", educatorId, "websitePages", page.id), {
        status: page.status === "live" ? "draft" : "live",
        updatedAt: Timestamp.now(),
      });
    } catch {
      toast.error("Failed to update status");
    }
  }

  async function deletePage(page: PageDoc) {
    if (!window.confirm(`Delete page "${page.title}"?`)) return;
    try {
      await deleteDoc(doc(db, "educators", educatorId, "websitePages", page.id));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-ds-slate" />
      </div>
    );
  }

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader
        title="Portal & branding"
        subtitle="Your public pages and the look of the student and staff apps."
        secondary={{
          label: "Preview site",
          onClick: () =>
            tenantSlug && window.open(`https://${tenantSlug}.univlive.tech/`, "_blank"),
        }}
        primary={canManage ? { label: "New page", onClick: openNew } : undefined}
      />

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_1fr]">
        <DsCard className="overflow-hidden">
          <div className="flex items-center border-b border-ds-ink/[.08] px-4 py-3">
            <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">Public pages</div>
            <div className="flex-1" />
            {canManage && (
              <button
                onClick={openNew}
                className="rounded-md bg-ds-fill px-2.5 py-1 font-ds-sans text-[11.5px] font-semibold text-ds-ink hover:bg-ds-ink/10"
              >
                New page
              </button>
            )}
          </div>

          {/* Home is always first — managed via the separate InstituteBuilder, not this collection */}
          <div className="flex items-center gap-3.5 border-b border-ds-ink/[.055] px-4 py-3">
            <div
              className="h-[52px] w-[78px] shrink-0 rounded-md border border-ds-ink/10"
              style={{
                background:
                  "repeating-linear-gradient(135deg, hsl(var(--ds-fill)) 0 6px, transparent 6px 12px)",
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="font-ds-sans text-[12.5px] font-semibold text-ds-ink">Home</div>
              <div className="mt-0.5 font-ds-mono text-[11px] text-ds-ink/45">
                {tenantSlug ? `${tenantSlug}.univlive.tech` : "/"}
              </div>
            </div>
            <DsStatusPill tone="positive">Live</DsStatusPill>
            <button
              onClick={() => navigate("/educator/settings?builder=true")}
              className="h-7 rounded-md border border-ds-ink/15 px-2.5 font-ds-sans text-[11.5px] font-medium text-ds-ink hover:bg-ds-fill"
            >
              Edit
            </button>
          </div>

          {pages.length === 0 ? (
            <p className="py-10 text-center font-ds-sans text-[12.5px] text-ds-slate">
              No additional pages yet.
            </p>
          ) : (
            pages.map((page) => (
              <div
                key={page.id}
                className="flex items-center gap-3.5 border-b border-ds-ink/[.055] px-4 py-3 last:border-0"
              >
                <div
                  className="h-[52px] w-[78px] shrink-0 rounded-md border border-ds-ink/10"
                  style={{
                    background:
                      "repeating-linear-gradient(135deg, hsl(var(--ds-fill)) 0 6px, transparent 6px 12px)",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-ds-sans text-[12.5px] font-semibold text-ds-ink">
                    {page.title}
                  </div>
                  <a
                    href={`https://${tenantSlug}.univlive.tech/p/${page.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 flex items-center gap-1 font-ds-mono text-[11px] text-ds-ink/45 hover:text-ds-accent"
                  >
                    /p/{page.slug}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  <div className="mt-0.5 font-ds-sans text-[11px] capitalize text-ds-ink/45">
                    {page.pageType}
                  </div>
                </div>
                <DsStatusPill tone={page.status === "live" ? "positive" : "slate"}>
                  {page.status === "live" ? "Live" : "Draft"}
                </DsStatusPill>
                {canManage && (
                  <>
                    <Switch
                      checked={page.status === "live"}
                      onCheckedChange={() => toggleLive(page)}
                    />
                    <button
                      onClick={() => openEdit(page)}
                      className="h-7 rounded-md border border-ds-ink/15 px-2.5 font-ds-sans text-[11.5px] font-medium text-ds-ink hover:bg-ds-fill"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deletePage(page)}
                      className="font-ds-sans text-[11px] text-ds-slate hover:text-red-600"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </DsCard>

        <div className="flex flex-col gap-3.5">
          <DsCard className="p-4">
            <div className="mb-2.5 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Domain
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-ds-fill px-2.5 py-2">
              <div className="h-1.5 w-1.5 rounded-full bg-ds-positive" />
              <div className="font-ds-mono text-[12.5px] font-medium text-ds-ink">
                {tenantSlug ? `${tenantSlug}.univlive.tech` : "not set"}
              </div>
              <div className="flex-1" />
              <div className="font-ds-sans text-[11px] text-ds-ink/50">SSL active</div>
            </div>
          </DsCard>

          <DsCard className="flex-1 p-4">
            <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Portal branding
            </div>
            <p className="mb-3.5 mt-1 font-ds-sans text-[11.5px] leading-[1.5] text-ds-ink/50">
              Applies to the student and staff apps as well as public pages.
            </p>
            <div className="mb-3.5 flex gap-2.5">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="h-[52px] w-[52px] shrink-0 rounded-[10px] object-cover"
                />
              ) : (
                <div
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[10px] font-ds-sans text-[20px] font-bold text-white"
                  style={{ background: accentColor || "hsl(var(--ds-accent))" }}
                >
                  {instituteName.slice(0, 1).toUpperCase() || "V"}
                </div>
              )}
              <div className="flex flex-1 flex-col justify-center gap-1">
                <div className="font-ds-sans text-[11.5px] text-ds-ink/50">
                  {instituteName || "Institute name"}
                </div>
                <button
                  onClick={() => navigate("/educator/settings?builder=true")}
                  className="flex h-7 items-center justify-center rounded-md border border-dashed border-ds-ink/20 font-ds-sans text-[11.5px] font-medium text-ds-ink/45 hover:border-ds-ink/35"
                >
                  Edit in Customize Website
                </button>
              </div>
            </div>
            {accentColor && (
              <>
                <div className="mb-1.5 font-ds-sans text-[11.5px] text-ds-ink/50">Accent</div>
                <div
                  className="h-7 w-7 rounded-md"
                  style={{
                    background: accentColor,
                    boxShadow: `0 0 0 2px white, 0 0 0 3.5px ${accentColor}`,
                  }}
                />
              </>
            )}
          </DsCard>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPage ? "Edit Page" : "New Page"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>URL slug</Label>
              <Input
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                placeholder={formTitle ? slugify(formTitle) : "auto-generated from title"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Page type</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as PageType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="batch">Batch page</SelectItem>
                  <SelectItem value="results">Results page</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={8}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formLive} onCheckedChange={setFormLive} />
              <Label>{formLive ? "Live (publicly visible)" : "Draft (hidden from public)"}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePage} disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
