import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  message: string;
  instituteName: string;
  instituteLogo?: string | null;
  primaryColor: string;
  educatorId: string;
  onDone: () => void;
};

export function WelcomeModal({
  message,
  instituteName,
  instituteLogo,
  primaryColor,
  educatorId,
  onDone,
}: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    sessionStorage.setItem(`wm_seen_${educatorId}`, "1");
  }, [educatorId]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6"
          style={{ backgroundColor: "#0a0a0a" }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          <motion.div
            className="flex w-full max-w-sm flex-col items-center gap-6 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            {instituteLogo && (
              <img
                src={instituteLogo}
                alt={instituteName}
                className="h-16 w-16 rounded-2xl object-contain"
              />
            )}

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
                Message from
              </p>
              <p className="text-lg font-bold text-white">{instituteName}</p>
            </div>

            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{message}</p>
          </motion.div>

          {/* Progress bar — fills to 100% then dismisses */}
          <div className="absolute bottom-0 left-0 h-1 w-full bg-white/10">
            <motion.div
              className="h-full"
              style={{ backgroundColor: primaryColor }}
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 2.5, ease: "easeInOut" }}
              onAnimationComplete={() => {
                setVisible(false);
                setTimeout(onDone, 400);
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
