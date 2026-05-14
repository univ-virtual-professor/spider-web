import { motion } from "framer-motion";
import { Card, CardContent } from "@shared/ui/card";
import { cn } from "@shared/lib/utils";

import { ReactNode } from "react";

interface MetricCardProps {
  title: ReactNode;
  value: string | number;
  description?: ReactNode;
  delay?: number;
  blendWithGradient?: boolean;
}

export default function MetricCard({
  title,
  value,
  description,
  delay = 0,
  blendWithGradient = false,
}: MetricCardProps) {
  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card
        className={cn(
          "card-hover h-full",
          blendWithGradient && "border-white/30 bg-white/10 text-white backdrop-blur-sm"
        )}
      >
        <CardContent className="p-4 h-full">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className={cn("text-xs font-medium", blendWithGradient ? "text-white/85" : "text-muted-foreground")}>{title}</div>
              <p className="text-xl sm:text-2xl font-bold font-display">{value}</p>
              {description && (
                <div className={cn("text-xs font-medium mt-1", blendWithGradient ? "text-white/70" : "text-muted-foreground")}>
                  {description}
                </div>
              )}
            </div>
            
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
