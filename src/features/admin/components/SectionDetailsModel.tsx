import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";

type SectionDetailsModelProps = {
  isOpen: boolean;
  isEditMode?: boolean;
  onClose: () => void;
  sectionId: string;
};

export const SectionDetailsModel: React.FC<SectionDetailsModelProps> = ({
  isOpen,
  onClose,
  sectionId,
  isEditMode,
}) => {
  // Fetch section details using sectionId and display them in the modal
  // You can use useEffect to fetch data when the component mounts

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Section Details</DialogTitle>
          <DialogDescription>
            Here you can view and edit the details of the section.
          </DialogDescription>
        </DialogHeader>
        {/* Display section details here */}
        <Button onClick={onClose}>Close</Button>
      </DialogContent>
    </Dialog>
  );
};
