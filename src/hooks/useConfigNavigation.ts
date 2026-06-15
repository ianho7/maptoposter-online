import { useEffect, useRef, useState, type RefObject } from "react";
import { type NavSection } from "@/components/config-nav";

interface ConfigNavigation {
  configScrollRef: RefObject<HTMLDivElement | null>;
  activeSection: string;
  setSectionRef: (id: string) => (el: HTMLElement | null) => void;
  handleNavNavigate: (sectionId: string) => void;
}

const DEFAULT_SECTION_ID = "section-location";
const OBSERVER_THRESHOLDS = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

export function useConfigNavigation(navSections: NavSection[]): ConfigNavigation {
  const defaultSectionId = navSections[0]?.id ?? DEFAULT_SECTION_ID;
  const configScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState(defaultSectionId);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const isNavScrollingRef = useRef(false);
  const navScrollResetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ioRatiosRef = useRef<Map<Element, number>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setSectionRef = (id: string) => (el: HTMLElement | null) => {
    const previousEl = sectionRefs.current.get(id);
    if (previousEl) {
      observerRef.current?.unobserve(previousEl);
      ioRatiosRef.current.delete(previousEl);
      sectionRefs.current.delete(id);
    }

    if (el) {
      sectionRefs.current.set(id, el);
      ioRatiosRef.current.set(el, 0);
      observerRef.current?.observe(el);
    }
  };

  const handleNavNavigate = (sectionId: string) => {
    isNavScrollingRef.current = true;
    if (navScrollResetTimerRef.current) {
      clearTimeout(navScrollResetTimerRef.current);
    }
    setActiveSection(sectionId);
    const el = sectionRefs.current.get(sectionId);
    const container = configScrollRef.current;
    if (el && container) {
      requestAnimationFrame(() => {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const scrollTop = container.scrollTop + elRect.top - containerRect.top;
        container.scrollTo({ top: scrollTop, behavior: "smooth" });
      });
      navScrollResetTimerRef.current = setTimeout(() => {
        isNavScrollingRef.current = false;
      }, 450);
    } else {
      isNavScrollingRef.current = false;
    }
  };

  useEffect(() => {
    const scrollContainer = configScrollRef.current;
    if (!scrollContainer) return;

    const onUserScroll = () => {
      isNavScrollingRef.current = false;
      if (navScrollResetTimerRef.current) {
        clearTimeout(navScrollResetTimerRef.current);
        navScrollResetTimerRef.current = undefined;
      }
    };
    scrollContainer.addEventListener("wheel", onUserScroll, { passive: true });
    scrollContainer.addEventListener("scroll", onUserScroll, { passive: true });
    scrollContainer.addEventListener("touchstart", onUserScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        if (isNavScrollingRef.current) return;
        for (const entry of entries) {
          ioRatiosRef.current.set(entry.target, entry.intersectionRatio);
        }

        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [el, ratio] of ioRatiosRef.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = el.id;
          }
        }
        if (bestId) {
          setActiveSection(bestId);
        }
      },
      {
        root: scrollContainer,
        threshold: OBSERVER_THRESHOLDS,
      }
    );
    observerRef.current = observer;

    for (const el of sectionRefs.current.values()) {
      ioRatiosRef.current.set(el, 0);
      observer.observe(el);
    }

    return () => {
      if (navScrollResetTimerRef.current) {
        clearTimeout(navScrollResetTimerRef.current);
      }
      scrollContainer.removeEventListener("wheel", onUserScroll);
      scrollContainer.removeEventListener("scroll", onUserScroll);
      scrollContainer.removeEventListener("touchstart", onUserScroll);
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!navSections.some((section) => section.id === activeSection)) {
      setActiveSection(defaultSectionId);
    }
  }, [activeSection, defaultSectionId, navSections]);

  return {
    configScrollRef,
    activeSection,
    setSectionRef,
    handleNavNavigate,
  };
}
