import { useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@shared/ui/radio-group";
import { toast } from "@shared/hooks/use-toast";
import { auth } from "@shared/lib/firebase";

const MONKEY_KING = import.meta.env.VITE_MONKEY_KING_API_URL as string;

type AdminTarget = "admin_all" | "admin_students" | "admin_educators";

interface AdminBroadcastModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AdminBroadcastModal({ open, onOpenChange }: AdminBroadcastModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<AdminTarget>("admin_all");
  const [sending, setSending] = useState(false);

  const reset = () => {
    setTitle("");
    setBody("");
    setTargetType("admin_all");
  };

  const handleSend = async () => {
    const trimTitle = title.trim();
    const trimBody = body.trim();
    if (!trimTitle) { toast({ title: "Title required", variant: "destructive" }); return; }
    if (!trimBody) { toast({ title: "Message body required", variant: "destructive" }); return; }

    setSending(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${MONKEY_KING}/api/notifications/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: trimTitle, body: trimBody, target_type: targetType }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to send");

      toast({
        title: "Notification sent",
        description: `Delivered to ${data.recipientCount} recipient(s).`,
      });
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast({ title: "Failed to send", description: e?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Broadcast Notification
          </DialogTitle>
          <DialogDescription>
            Push an in-app notification to users on the platform.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title <span className="text-muted-foreground text-xs">({title.length}/100)</span></Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 100))}
              placeholder="e.g. Platform Maintenance Tonight"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Message <span className="text-muted-foreground text-xs">({body.length}/500)</span></Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 500))}
              placeholder="Write your notification message here…"
              rows={4}
              className="rounded-xl resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Send to</Label>
            <RadioGroup value={targetType} onValueChange={(v) => setTargetType(v as AdminTarget)} className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="admin_all" id="t-all" />
                <Label htmlFor="t-all" className="cursor-pointer font-normal">All users (educators + students)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="admin_students" id="t-students" />
                <Label htmlFor="t-students" className="cursor-pointer font-normal">Students only</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="admin_educators" id="t-educators" />
                <Label htmlFor="t-educators" className="cursor-pointer font-normal">Educators only</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl" disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !title.trim() || !body.trim()}
            className="rounded-xl gradient-bg text-white"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Megaphone className="h-4 w-4 mr-2" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
