import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@shared/ui/dialog";
import { Label } from "@shared/ui/label";
import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import { Loader2, FolderPlus } from "lucide-react";

const NewFolderButton = ({
  createFolderOpen,
  setCreateFolderOpen,
  newFolderName,
  setNewFolderName,
  folderCreating,
  handleCreateFolder,
}) => {
  return (
    <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-xl border-dashed">
          <FolderPlus className="mr-2 h-4 w-4" /> New Folder
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
          <DialogDescription>
            Folders help you organize your tests beyond just subjects.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Folder Name</Label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!folderCreating) void handleCreateFolder();
                }
              }}
              placeholder="e.g. Revision Tests"
              className="rounded-xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>
            Cancel
          </Button>
          <Button
            className="gradient-bg text-white"
            onClick={handleCreateFolder}
            disabled={folderCreating || !newFolderName.trim()}
          >
            {folderCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewFolderButton;
