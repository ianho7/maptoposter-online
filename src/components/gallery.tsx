import { useState, useRef, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { posters, type Poster } from "@/lib/posters";

// 将海报列表复制一份，用于实现无缝循环滚动
const doubledPosters = [...posters, ...posters];

// 滚动速度：像素/毫秒
const SCROLL_SPEED = 0.06;

// 两帧之间超过这个阈值（ms）视为从后台切回来的第一帧，直接跳过
const STALE_FRAME_THRESHOLD = 100;

export function PosterGallery() {
  const [selectedPoster, setSelectedPoster] = useState<Poster | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // rAF 状态
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const posRef = useRef(0); // 当前 translateX（负值，向左滚动）
  const lastTimeRef = useRef<number | null>(null);
  const isPausedRef = useRef(false); // 用 ref 而不是 state，避免 rAF 闭包捕获旧值
  const halfWidthRef = useRef(0); // 一半内容宽度，用于循环重置

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // ============================================================
  // rAF 动画循环
  // ============================================================
  const animate = useCallback((time: number) => {
    const track = trackRef.current;
    if (!track) return;

    if (lastTimeRef.current !== null) {
      const delta = time - lastTimeRef.current;

      // delta 超过阈值：刚从后台切回来的第一帧，跳过避免位置跳变
      if (delta < STALE_FRAME_THRESHOLD && !isPausedRef.current) {
        posRef.current -= delta * SCROLL_SPEED;

        // 无缝循环：走完一半就重置回 0
        if (halfWidthRef.current > 0 && posRef.current <= -halfWidthRef.current) {
          posRef.current += halfWidthRef.current;
        }

        track.style.transform = `translateX(${posRef.current}px)`;
      }
    }

    lastTimeRef.current = time;
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  // 测量 half-width 并启动动画
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    // 内容是两倍海报，宽度 / 2 即一组海报的宽度
    const measure = () => {
      halfWidthRef.current = track.scrollWidth / 2;
    };

    measure();

    // ResizeObserver 处理窗口 resize 时重新测量
    const ro = new ResizeObserver(measure);
    ro.observe(track);

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [animate]);

  // ============================================================
  // 悬停暂停
  // ============================================================
  const handleMouseEnter = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isPausedRef.current = false;
    // 重置 lastTime，防止恢复时因为悬停期间累计的时间差导致跳帧
    lastTimeRef.current = null;
  }, []);

  // ============================================================
  // Lightbox
  // ============================================================
  const handlePosterClick = (poster: Poster) => {
    isPausedRef.current = true;
    setSelectedPoster(poster);
  };

  const handleCloseLightbox = () => {
    setSelectedPoster(null);
    isPausedRef.current = false;
    lastTimeRef.current = null; // 重置，防止关闭时跳帧
  };

  const handleLightboxNavigate = useCallback((direction: "prev" | "next") => {
    setSelectedPoster((current) => {
      if (!current) return null;
      const currentIndex = posters.findIndex((p) => p.id === current.id);
      let newIndex: number;
      if (direction === "prev") {
        newIndex = currentIndex > 0 ? currentIndex - 1 : posters.length - 1;
      } else {
        newIndex = currentIndex < posters.length - 1 ? currentIndex + 1 : 0;
      }
      return posters[newIndex];
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedPoster) {
        if (e.key === "Escape") handleCloseLightbox();
        if (e.key === "ArrowLeft") handleLightboxNavigate("prev");
        if (e.key === "ArrowRight") handleLightboxNavigate("next");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPoster, handleLightboxNavigate]);

  return (
    <section className="relative min-h-[50vh] flex flex-col overflow-hidden user-select-none">
      {/* Gallery Container */}
      <div className="flex-1 relative flex items-center">
        {/* Scroll Container（overflow 隐藏，不再需要滚动条） */}
        <div
          className="w-full overflow-hidden py-4 sm:py-8"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* 滚动 Track：由 rAF 直接操控 transform */}
          <div
            ref={trackRef}
            className="flex items-center gap-4 sm:gap-6 md:gap-10 will-change-transform"
            // 初始 transform 由 rAF 接管，不要在这里写 style
          >
            {doubledPosters.map((poster, index) => (
              <button
                key={`${poster.id}-${index}`}
                data-poster-card
                onClick={() => handlePosterClick(poster)}
                className={cn(
                  "group relative flex-shrink-0",
                  "h-[45vh] sm:h-[55vh] md:h-[65vh] aspect-[3/4]",
                  "overflow-hidden cursor-pointer",
                  "transition-all duration-700 ease-out",
                  "focus:outline-none",
                  isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
                )}
                style={{
                  transitionDelay: isLoaded ? `${index * 50}ms` : "0ms",
                }}
              >
                {/* Card Frame */}
                <div className="absolute inset-0 bg-card shadow-sm transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-foreground/10">
                  {/* Image */}
                  <div className="absolute inset-3 md:inset-4 overflow-hidden bg-muted">
                    <img
                      src={poster.image}
                      alt={poster.title}
                      loading="lazy"
                      decoding="async"
                      className={cn(
                        "w-full h-full object-cover",
                        "transition-transform duration-700 ease-out",
                        "group-hover:scale-105"
                      )}
                    />
                  </div>

                  {/* Bottom Label */}
                  <div className="absolute bottom-0 inset-x-0 p-4 md:p-5 bg-gradient-to-t from-card via-card to-transparent" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {selectedPoster && (
        <div
          className="fixed inset-0 z-50 bg-foreground/95 backdrop-blur-sm"
          onClick={handleCloseLightbox}
        >
          <div className="absolute inset-0 flex items-center justify-center p-4 md:p-8">
            {/* Close Button */}
            <button
              onClick={handleCloseLightbox}
              className={cn(
                "absolute top-4 right-4 sm:top-6 sm:right-6 md:top-10 md:right-10 z-10",
                "w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center",
                "border border-background/30 rounded-full",
                "text-background/80 hover:text-background hover:border-background",
                "transition-all duration-300"
              )}
            >
              <X className="w-5 h-5" />
              <span className="sr-only">Close</span>
            </button>

            {/* Navigation */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLightboxNavigate("prev");
              }}
              className={cn(
                "absolute left-2 sm:left-10 z-10",
                "w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center",
                "border border-background/30 rounded-full",
                "text-background/80 hover:text-background hover:border-background",
                "transition-all duration-300"
              )}
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="sr-only">Previous poster</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLightboxNavigate("next");
              }}
              className={cn(
                "absolute right-2 sm:right-10 z-10",
                "w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center",
                "border border-background/30 rounded-full",
                "text-background/80 hover:text-background hover:border-background",
                "transition-all duration-300"
              )}
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="sr-only">Next poster</span>
            </button>

            {/* Main Image */}
            <div
              className="relative max-w-full sm:max-w-4xl max-h-[90vh] sm:max-h-[95vh] animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-card p-2 sm:p-3 md:p-6 shadow-2xl">
                <img
                  src={selectedPoster.image}
                  alt={selectedPoster.title}
                  className="max-h-[60vh] sm:max-h-[70vh] w-auto object-contain max-w-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
