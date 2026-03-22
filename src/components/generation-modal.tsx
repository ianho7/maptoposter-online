import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";
import SnakeGame from "@/components/snake-game";
import * as m from "@/paraglide/messages";

interface GenerationModalProps {
  isGenerating: boolean;
  generationProgress: number;
  generationStep: string;
  isGameOpen: boolean;
  generationCompleteRef: React.MutableRefObject<boolean>;
  onGameOpenChange: (open: boolean) => void;
  onClose: () => void;
  triggerLabel: string;
}

export function GenerationModal({
  isGenerating,
  generationProgress,
  generationStep,
  isGameOpen,
  generationCompleteRef,
  onGameOpenChange,
  onClose,
  triggerLabel,
}: GenerationModalProps) {
  if (!isGenerating) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-[400px] p-6 shadow-2xl bg-card border-primary">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className=" text-lg text-primary">{m.creating_art()}</h3>
            <span className="text-sm font-mono text-primary/60">
              {Math.round(generationProgress)}%
            </span>
          </div>
          <Progress value={generationProgress} className="h-2 bg-secondary" />
          <p className="text-xs text-center text-muted-foreground/70 flex items-center justify-center gap-1.5">
            <Clock className="w-3 h-3" />
            {m.generating_time_estimate()}
          </p>
          <p
            className={`text-sm text-center ${generationProgress === 100 && isGameOpen ? "" : "animate-pulse"} text-muted-foreground`}
          >
            {generationProgress === 100 && isGameOpen
              ? (m.game_complete_hint?.() ?? "图片已生成完毕！请关闭游戏后继续")
              : generationStep}
          </p>
          <SnakeGame
            inline={true}
            onOpenChange={(open) => {
              onGameOpenChange(open);
              if (!open && generationCompleteRef.current) {
                onClose();
                generationCompleteRef.current = false;
              }
            }}
            triggerLabel={triggerLabel}
          />
          <div
            className="flex justify-end pt-2"
            style={{
              visibility: generationProgress === 100 && isGameOpen ? "visible" : "hidden",
            }}
          >
            <Button
              size="sm"
              className="text-muted-foreground bg-secondary hover:bg-primary hover:text-primary-foreground cursor-pointer"
              onClick={() => {
                onClose();
                generationCompleteRef.current = false;
              }}
            >
              关闭
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
