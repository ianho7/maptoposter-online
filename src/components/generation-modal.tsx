import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";
import { useState, useEffect } from "react";
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
  // 追踪用户是否与游戏有过交互（按过方向键或点击过 UI）
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // 当海报生成完成时，检查是否需要自动关闭
  // 如果用户没有与游戏交互过，则自动关闭弹窗
  useEffect(() => {
    if (generationProgress === 100 && !hasUserInteracted) {
      // 生成完成且用户没有交互，自动关闭弹窗
      onClose();
      // 重置状态，为下次生成做准备
      setHasUserInteracted(false);
      generationCompleteRef.current = false;
    }
  }, [generationProgress, hasUserInteracted, onClose, generationCompleteRef]);

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
            {generationProgress === 100 && isGameOpen ? m.game_complete_hint() : generationStep}
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
            // 当用户有任何交互（键盘方向键或 UI 方向键）时，不再自动关闭
            onUserInteracted={() => {
              setHasUserInteracted(true);
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
              {m.generation_modal_close()}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
