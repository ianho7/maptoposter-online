import { useState, useRef, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Loader2, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { posters, type Poster } from "@/lib/posters";
import * as m from "@/paraglide/messages";

// 将海报列表复制一份，用于实现无缝循环滚动
const doubledPosters = [...posters, ...posters];

// 滚动速度：像素/毫秒
const SCROLL_SPEED = 0.1;

// 两帧之间超过这个阈值（ms）视为从后台切回来的第一帧，直接跳过
const STALE_FRAME_THRESHOLD = 100;

export function PosterGallery() {
  const [selectedPoster, setSelectedPoster] = useState<Poster | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [imageLoading, setImageLoading] = useState(true); // 大图加载状态

  // rAF 状态
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const posRef = useRef(0); // 当前 translateX（负值，向左滚动）
  const lastTimeRef = useRef<number | null>(null);
  const isPausedRef = useRef(false); // 用 ref 而不是 state，避免 rAF 闭包捕获旧值
  const halfWidthRef = useRef(0); // 一半内容宽度，用于循环重置

  // 预加载状态
  const preloadedRef = useRef<Set<number>>(new Set());
  const preloadingRef = useRef<Set<number>>(new Set());
  const navigationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 缩放/平移状态
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgWrapperRef = useRef<HTMLDivElement>(null);
  const [imageKey, setImageKey] = useState(0); // 用于触发动画

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
  // 缩放/平移
  // ============================================================
  // 使用 ref 存储处理函数，确保移除时能正确引用
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);
  const mouseDownHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpHandlerRef = useRef<(() => void) | null>(null);

  wheelHandlerRef.current = (e: WheelEvent) => {
    const container = containerRef.current;
    if (!container || !container.contains(e.target as Node)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const currentScale = scaleRef.current;
    const newScale = Math.min(Math.max(currentScale * delta, 0.5), 5);
    scaleRef.current = newScale;
    setScale(newScale);
  };

  mouseDownHandlerRef.current = (e: MouseEvent) => {
    const container = containerRef.current;
    if (!container || !container.contains(e.target as Node)) return;
    if (scaleRef.current > 1) {
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.clientX - positionRef.current.x,
        y: e.clientY - positionRef.current.y,
      };
    }
  };

  mouseMoveHandlerRef.current = (e: MouseEvent) => {
    if (isDraggingRef.current) {
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      positionRef.current = { x: newX, y: newY };
      setPosition({ x: newX, y: newY });
    }
  };

  mouseUpHandlerRef.current = () => {
    isDraggingRef.current = false;
  };

  const handleResetZoom = useCallback(() => {
    scaleRef.current = 1;
    setScale(1);
    setPosition({ x: 0, y: 0 });
    positionRef.current = { x: 0, y: 0 };
  }, []);

  // 缩放/平移事件（使用原生事件监听以支持 preventDefault）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wheelHandler = wheelHandlerRef.current!;
    const mouseDownHandler = mouseDownHandlerRef.current!;
    const mouseMoveHandler = mouseMoveHandlerRef.current!;
    const mouseUpHandler = mouseUpHandlerRef.current!;

    // wheel 需要 passive: false 以支持 preventDefault
    container.addEventListener("wheel", wheelHandler, { passive: false });
    container.addEventListener("mousedown", mouseDownHandler);
    window.addEventListener("mousemove", mouseMoveHandler);
    window.addEventListener("mouseup", mouseUpHandler);

    return () => {
      container.removeEventListener("wheel", wheelHandler);
      container.removeEventListener("mousedown", mouseDownHandler);
      window.removeEventListener("mousemove", mouseMoveHandler);
      window.removeEventListener("mouseup", mouseUpHandler);
    };
  }, [selectedPoster]); // 只需要在打开/关闭 lightbox 时重新设置

  // 切换海报时重置缩放
  useEffect(() => {
    handleResetZoom();
  }, [selectedPoster, handleResetZoom]);

  // ============================================================
  // Lightbox
  // ============================================================
  // 预加载单张图片
  const preloadImage = useCallback((poster: Poster) => {
    const id = poster.id;
    if (preloadedRef.current.has(id) || preloadingRef.current.has(id)) return;
    preloadingRef.current.add(id);
    const img = new Image();
    img.onload = () => {
      preloadedRef.current.add(id);
      preloadingRef.current.delete(id);
    };
    img.onerror = () => {
      preloadingRef.current.delete(id);
    };
    img.src = poster.image;
  }, []);

  // 预加载相邻图片（前后各一张）
  const preloadAdjacent = useCallback(
    (currentPoster: Poster) => {
      const currentIndex = posters.findIndex((p) => p.id === currentPoster.id);
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : posters.length - 1;
      const nextIndex = currentIndex < posters.length - 1 ? currentIndex + 1 : 0;
      preloadImage(posters[prevIndex]);
      preloadImage(posters[nextIndex]);
    },
    [preloadImage]
  );

  const handlePosterClick = (poster: Poster) => {
    isPausedRef.current = true;
    setSelectedPoster(poster);
    setImageLoading(true);
    preloadAdjacent(poster);
  };

  const handleCloseLightbox = () => {
    setSelectedPoster(null);
    isPausedRef.current = false;
    lastTimeRef.current = null; // 重置，防止关闭时跳帧
  };

  const handleLightboxNavigate = useCallback(
    (direction: "prev" | "next") => {
      // 清除待处理的导航（防抖）
      if (navigationDebounceRef.current) {
        clearTimeout(navigationDebounceRef.current);
      }

      // 防抖 300ms：只响应最后一次点击
      navigationDebounceRef.current = setTimeout(() => {
        setSelectedPoster((current) => {
          if (!current) return null;
          const currentIndex = posters.findIndex((p) => p.id === current.id);
          let newIndex: number;
          if (direction === "prev") {
            newIndex = currentIndex > 0 ? currentIndex - 1 : posters.length - 1;
          } else {
            newIndex = currentIndex < posters.length - 1 ? currentIndex + 1 : 0;
          }
          const newPoster = posters[newIndex];
          setImageLoading(true);
          setImageKey((k) => k + 1);
          preloadAdjacent(newPoster);
          return newPoster;
        });
      }, 300);
    },
    [preloadAdjacent]
  );

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

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (navigationDebounceRef.current) {
        clearTimeout(navigationDebounceRef.current);
      }
    };
  }, []);

  return (
    <section aria-label="Poster gallery" className="relative min-h-[50vh] flex flex-col px-0 md:px-20 overflow-hidden user-select-none">
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
                data-ai-action="select-poster"
                data-poster-id={poster.id}
                data-poster-title={poster.title}
                onClick={() => handlePosterClick(poster)}
                className={cn(
                  "group relative flex-shrink-0",
                  "h-[45vh] sm:h-[55vh] md:h-[65vh] aspect-[3/4]",
                  "overflow-hidden cursor-pointer",
                  "transition-all duration-700 ease-out",
                  "focus:outline-none",
                  isLoaded ? "opacity-100 translate-y-0" : "opacity-90 translate-y-12"
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
              aria-label="Close lightbox"
              data-ai-action="close-lightbox"
              className={cn(
                "absolute top-4 right-4 sm:top-6 sm:right-6 md:top-10 md:right-10 z-10",
                "w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full",
                "text-background/80 hover:text-background",
                "hover:bg-background/10 active:bg-background/20",
                "active:scale-75 transition-all duration-150",
                "cursor-pointer"
              )}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Navigation */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLightboxNavigate("prev");
              }}
              aria-label="Previous poster"
              data-ai-action="navigate-prev-poster"
              className={cn(
                "absolute left-2 sm:left-10 z-10",
                "w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full",
                "text-background/80 hover:text-background",
                "hover:bg-background/10 active:bg-background/20",
                "active:scale-75 transition-all duration-150",
                "cursor-pointer"
              )}
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLightboxNavigate("next");
              }}
              aria-label="Next poster"
              data-ai-action="navigate-next-poster"
              className={cn(
                "absolute right-2 sm:right-10 z-10",
                "w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full",
                "text-background/80 hover:text-background",
                "hover:bg-background/10 active:bg-background/20",
                "active:scale-75 transition-all duration-150",
                "cursor-pointer"
              )}
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
            </button>

            {/* Main Image */}
            <div
              ref={containerRef}
              className="relative max-w-[95vw] max-h-[95vh] animate-scale-in"
              onClick={(e) => e.stopPropagation()}
              style={{
                cursor: scale > 1 ? (isDraggingRef.current ? "grabbing" : "grab") : "default",
              }}
            >
              <div className="bg-card p-2 sm:p-4 md:p-6 shadow-2xl overflow-hidden">
                {/* Loading Spinner */}
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  </div>
                )}
                {/* Reset Zoom Button */}
                {scale !== 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetZoom();
                    }}
                    className={cn(
                      "absolute top-2 right-2 sm:top-3 sm:right-3 z-20",
                      "flex items-center gap-1.5 px-3 py-1.5",
                      "bg-foreground/80 hover:bg-foreground text-background rounded-full",
                      "text-xs font-medium",
                      "transition-all duration-300 shadow-lg"
                    )}
                    title={m.gallery_zoom_hint()}
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                    <span>{m.gallery_reset_zoom()}</span>
                  </button>
                )}
                <div
                  key={imageKey}
                  ref={imgWrapperRef}
                  className={cn(
                    "flex items-center justify-center transition-all duration-300",
                    imageLoading ? "opacity-90 scale-95" : "opacity-100 scale-100"
                  )}
                  style={{ overflow: "hidden" }}
                >
                  <img
                    src={selectedPoster.image}
                    alt={selectedPoster.title}
                    onLoad={() => setImageLoading(false)}
                    onError={() => setImageLoading(false)}
                    className={cn("max-h-[85vh] w-auto object-contain", scale > 1 && "select-none")}
                    style={{
                      transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                      transformOrigin: "center center",
                    }}
                    draggable={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
