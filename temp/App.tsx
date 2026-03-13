import { useState, useRef, useEffect, useCallback } from 'react';

// Canvas configuration
const CANVAS_WIDTH = 4000;
const CANVAS_HEIGHT = 3000;
const MINIMAP_SCALE = 0.05;

// Section positions on canvas
const SECTIONS = {
    intro: { x: 600, y: 300 },
    craft: { x: 1400, y: 200 },
    quotes: { x: 600, y: 850 },
    photos: { x: 1400, y: 900 },
    about: { x: 2200, y: 300 },
};

// Decorated Card Component with orange border and corner squares
function DecoratedCard({
    children,
    className = '',
    cornerSize = 'md'
}: {
    children: React.ReactNode;
    className?: string;
    cornerSize?: 'sm' | 'md' | 'lg';
}) {
    const sizeMap = {
        sm: 'w-10 h-10',
        md: 'w-12 h-12',
        lg: 'w-14 h-14'
    };
    const offsetMap = {
        sm: '-top-5 -left-5',
        md: '-top-6 -left-6',
        lg: '-top-7 -left-7'
    };
    const cornerClass = sizeMap[cornerSize];

    return (
        <div className={`relative ${className}`}>
            {/* Orange border frame */}
            <div className="absolute inset-0 border border-[#cf725f]/40 rounded-2xl pointer-events-none" />

            {/* Corner decorations */}
            <div className={`absolute ${cornerSize === 'sm' ? '-top-5 -left-5' : cornerSize === 'md' ? '-top-6 -left-6' : '-top-7 -left-7'} ${cornerClass} bg-[#faf7f5] border border-[#cf725f]/40 rounded-lg`} />
            <div className={`absolute ${cornerSize === 'sm' ? '-top-5 -right-5' : cornerSize === 'md' ? '-top-6 -right-6' : '-top-7 -right-7'} ${cornerClass} bg-[#faf7f5] border border-[#cf725f]/40 rounded-lg`} />
            <div className={`absolute ${cornerSize === 'sm' ? '-bottom-5 -left-5' : cornerSize === 'md' ? '-bottom-6 -left-6' : '-bottom-7 -left-7'} ${cornerClass} bg-[#faf7f5] border border-[#cf725f]/40 rounded-lg`} />
            <div className={`absolute ${cornerSize === 'sm' ? '-bottom-5 -right-5' : cornerSize === 'md' ? '-bottom-6 -right-6' : '-bottom-7 -right-7'} ${cornerClass} bg-[#faf7f5] border border-[#cf725f]/40 rounded-lg`} />

            {/* Card content */}
            <div className="bg-white rounded-2xl shadow-lg shadow-black/5 relative z-10">
                {children}
            </div>
        </div>
    );
}

// Section Label Component
function SectionLabel({ label }: { label: string }) {
    return (
        <div className="absolute -top-10 left-8 flex items-center gap-2 bg-[#cf725f] text-white text-xs font-mono px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-white/50 rounded-full" />
            {label}
        </div>
    );
}

function App() {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: -300, y: -100 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [copiedLink, setCopiedLink] = useState(false);

    useEffect(() => {
        const updateSize = () => {
            setViewportSize({ width: window.innerWidth, height: window.innerHeight });
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('a, button, input')) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }, [position]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging) return;
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;

        const maxX = 100;
        const maxY = 100;
        const minX = -(CANVAS_WIDTH - viewportSize.width + 100);
        const minY = -(CANVAS_HEIGHT - viewportSize.height + 100);

        setPosition({
            x: Math.min(maxX, Math.max(minX, newX)),
            y: Math.min(maxY, Math.max(minY, newY)),
        });
    }, [isDragging, dragStart, viewportSize]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const navigateToSection = (section: keyof typeof SECTIONS) => {
        const target = SECTIONS[section];
        setPosition({
            x: -target.x + viewportSize.width / 2 - 200,
            y: -target.y + viewportSize.height / 2 - 200,
        });
    };

    const copyLink = () => {
        navigator.clipboard.writeText('https://bilal.world');
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    };

    return (
        <div
            className="w-full h-full overflow-hidden"
            style={{
                backgroundColor: '#faf7f5',
                backgroundImage: 'radial-gradient(circle, #e8e2de 1px, transparent 1px)',
                backgroundSize: '20px 20px'
            }}
        >
            {/* Sidebar Navigation */}
            <Sidebar onNavigate={navigateToSection} />

            {/* Minimap */}
            <Minimap
                position={position}
                viewportSize={viewportSize}
                sections={SECTIONS}
            />

            {/* Top Logo */}
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2">
                <svg width="40" height="16" viewBox="0 0 40 16" fill="none">
                    <text x="0" y="13" fill="#52504d" fontFamily="Georgia, serif" fontSize="14" fontWeight="500">Bilal</text>
                </svg>
                <span className="text-sm text-[#9e9692]">Personal website</span>
            </div>

            {/* Draggable Canvas */}
            <div
                ref={canvasRef}
                className={`absolute ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{
                    width: CANVAS_WIDTH,
                    height: CANVAS_HEIGHT,
                    transform: `translate(${position.x}px, ${position.y}px)`,
                    transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Intro Section */}
                <IntroSection
                    position={SECTIONS.intro}
                    onCopyLink={copyLink}
                    copiedLink={copiedLink}
                />

                {/* Craft Section */}
                <CraftSection position={SECTIONS.craft} />

                {/* Quotes Section */}
                <QuotesSection position={SECTIONS.quotes} />

                {/* Photos Section */}
                <PhotosSection position={SECTIONS.photos} />

                {/* About Section */}
                <AboutSection position={SECTIONS.about} />
            </div>

            {/* Drag hint */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 text-sm text-[#9e9692] pointer-events-none flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3" />
                </svg>
                Drag and pan around
            </div>
        </div>
    );
}

// Sidebar Component
function Sidebar({ onNavigate }: { onNavigate: (section: keyof typeof SECTIONS) => void }) {
    const sections = [
        { id: 'intro', label: 'Intro', icon: '01' },
        { id: 'craft', label: 'Craft', icon: '02' },
        { id: 'quotes', label: 'Quotes', icon: '03' },
        { id: 'photos', label: 'Photos', icon: '04' },
        { id: 'about', label: 'About', icon: '05' },
    ];

    return (
        <div className="fixed left-6 top-1/2 -translate-y-1/2 z-50">
            <div className="bg-white rounded-2xl shadow-lg shadow-black/5 px-3 py-4 border border-black/[0.03]">
                <div className="text-[10px] text-[#9e9692] mb-3 px-2 font-medium uppercase tracking-wider">Sections</div>
                {sections.map((section) => (
                    <button
                        type="button"
                        key={section.id}
                        onClick={() => onNavigate(section.id as keyof typeof SECTIONS)}
                        className="flex items-center gap-2 w-full text-left px-2 py-2 text-sm text-[#52504d] hover:bg-[#f5f0ed] rounded-xl transition-all duration-200 group"
                    >
                        <span className="text-[10px] text-[#c9c2bf] group-hover:text-[#cf725f] transition-colors">{section.icon}</span>
                        <span>{section.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

// Minimap Component
function Minimap({
    position,
    viewportSize,
    sections
}: {
    position: { x: number; y: number };
    viewportSize: { width: number; height: number };
    sections: typeof SECTIONS;
}) {
    const minimapWidth = CANVAS_WIDTH * MINIMAP_SCALE;
    const minimapHeight = CANVAS_HEIGHT * MINIMAP_SCALE;
    const viewWidth = viewportSize.width * MINIMAP_SCALE;
    const viewHeight = viewportSize.height * MINIMAP_SCALE;

    return (
        <div
            className="fixed bottom-6 left-6 z-50 bg-white rounded-xl shadow-lg shadow-black/5 overflow-hidden border border-black/[0.03]"
            style={{ width: minimapWidth + 16, height: minimapHeight + 16, padding: 8 }}
        >
            <div
                className="relative bg-[#f8f5f3] rounded-lg"
                style={{ width: minimapWidth, height: minimapHeight }}
            >
                {/* Section markers */}
                {Object.entries(sections).map(([key, pos]) => (
                    <div
                        key={key}
                        className="absolute w-1.5 h-1.5 bg-[#cf725f] rounded-full"
                        style={{
                            left: pos.x * MINIMAP_SCALE - 3,
                            top: pos.y * MINIMAP_SCALE - 3,
                        }}
                    />
                ))}

                {/* Viewport indicator */}
                <div
                    className="absolute border-2 border-[#cf725f] rounded bg-[#cf725f]/10"
                    style={{
                        width: Math.max(viewWidth, 20),
                        height: Math.max(viewHeight, 15),
                        left: -position.x * MINIMAP_SCALE,
                        top: -position.y * MINIMAP_SCALE,
                        transition: 'all 0.1s ease-out',
                    }}
                />
            </div>
        </div>
    );
}

// Intro Section
function IntroSection({
    position,
    onCopyLink,
    copiedLink
}: {
    position: { x: number; y: number };
    onCopyLink: () => void;
    copiedLink: boolean;
}) {
    return (
        <div
            className="absolute"
            style={{ left: position.x, top: position.y }}
        >
            <div className="flex gap-6 items-start">
                {/* Main intro card */}
                <DecoratedCard className="w-[480px]" cornerSize="md">
                    <SectionLabel label="Intro" />
                    <div className="p-8">
                        <h1 className="font-display text-[42px] text-[#52504d] leading-[1.1] mb-6 tracking-tight">
                            Software Designer
                            <span className="inline-block mx-2 align-middle">
                                <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                                    <text x="0" y="16" fill="#cf725f" fontFamily="Georgia, serif" fontStyle="italic" fontSize="18">and</text>
                                </svg>
                            </span>
                            <br />Engineer
                        </h1>

                        <p className="text-[#9e9692] leading-relaxed mb-6 text-[15px]">
                            Creating software with care and intention. I design and write code,
                            people call it design engineering. Currently at Bending Spoons,
                            quietly thinking and building on the side.
                        </p>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onCopyLink}
                                className="flex items-center gap-2 px-4 py-2.5 bg-[#f5f0ed] rounded-full text-sm text-[#52504d] hover:bg-[#ebe4df] transition-all duration-200"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                </svg>
                                {copiedLink ? 'Copied!' : 'Copy link'}
                            </button>

                            <a
                                href="https://x.com/bilal_limi"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#cf725f] hover:opacity-80 transition-opacity"
                            >
                                X (Twitter)
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M7 17L17 7M17 7H7M17 7v10" />
                                </svg>
                            </a>
                        </div>
                    </div>
                </DecoratedCard>

                {/* Profile image cards */}
                <div className="flex flex-col gap-4 mt-8">
                    <div className="bg-white rounded-2xl overflow-hidden w-44 h-44 shadow-lg shadow-black/5 border border-[#cf725f]/20">
                        <div className="w-full h-full bg-gradient-to-br from-[#e8ddd5] via-[#d4c4b8] to-[#c9b8a8] flex items-center justify-center">
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#8a7f75" strokeWidth="1">
                                <circle cx="12" cy="8" r="4" />
                                <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                            </svg>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl overflow-hidden w-44 h-28 shadow-lg shadow-black/5 border border-[#cf725f]/20">
                        <div className="w-full h-full bg-gradient-to-br from-[#f0e8e0] to-[#e4d8ca] flex items-center justify-center">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a89888" strokeWidth="1">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <path d="M21 15l-5-5L5 21" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Figma hint */}
            <div className="mt-8 p-4 bg-white/80 backdrop-blur-sm rounded-xl max-w-md shadow-sm border border-[#cf725f]/10">
                <p className="text-sm text-[#9e9692] leading-relaxed">
                    Does this feel a bit like a design tool — Figma, maybe? That's intentional.
                    A canvas for you to explore, free of spatial constraints.
                </p>
            </div>
        </div>
    );
}

// Craft Section
function CraftSection({ position }: { position: { x: number; y: number } }) {
    const projects = [
        {
            gradient: 'from-[#1a1a2e] to-[#16213e]',
            title: 'Music Player',
            icon: (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="10,8 16,12 10,16" fill="white" />
                </svg>
            )
        },
        {
            gradient: 'from-[#2d3436] to-[#636e72]',
            title: 'Transfer App',
            icon: (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                    <path d="M17 1l4 4-4 4" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <path d="M7 23l-4-4 4-4" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
            )
        },
        {
            gradient: 'from-[#6c5ce7] to-[#a29bfe]',
            title: 'Gooey Tooltip',
            icon: (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
            )
        },
    ];

    return (
        <div
            className="absolute"
            style={{ left: position.x, top: position.y }}
        >
            <DecoratedCard className="w-[520px]" cornerSize="md">
                <SectionLabel label="Craft" />
                <div className="p-8">
                    <div className="flex items-baseline justify-between mb-6">
                        <div>
                            <h2 className="font-display text-3xl text-[#52504d] tracking-tight">Craft.</h2>
                            <p className="text-[#9e9692] text-sm mt-1">Some of my work</p>
                        </div>
                        <button
                            type="button"
                            className="text-sm text-[#4a90d9] hover:text-[#3a7bc8] flex items-center gap-1 transition-colors"
                        >
                            See all
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        {projects.map((project) => (
                            <div
                                key={project.title}
                                className="rounded-xl overflow-hidden aspect-square cursor-pointer hover:scale-[1.02] transition-transform duration-200 group"
                            >
                                <div className={`w-full h-full bg-gradient-to-br ${project.gradient} flex items-center justify-center relative`}>
                                    {project.icon}
                                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-white text-xs">{project.title}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-sm text-[#9e9692] leading-relaxed mt-6">
                        I enjoy crafting small visual and code experiments in my free time.
                        A few see the light of the day. Most teach me something.
                    </p>
                </div>
            </DecoratedCard>

            <div className="mt-8 p-4 bg-white/80 backdrop-blur-sm rounded-xl max-w-sm shadow-sm border border-[#cf725f]/10">
                <p className="text-xs text-[#9e9692] leading-relaxed">
                    Tip: on the left, a small minimap lives in the corner. I made it mostly for fun,
                    but it helps on smaller screens.
                </p>
            </div>
        </div>
    );
}

// Quotes Section
function QuotesSection({ position }: { position: { x: number; y: number } }) {
    const quotes = [
        { text: "Any energy that goes into how you seem comes out of being good.", author: "Paul Graham" },
        { text: "Emotions can override any level of intelligence.", author: "Morgan Housel" },
        { text: "Physical ownership is stressful because things break.", author: "Marc Lou" },
        { text: "You can just ship things.", author: "Guillermo Rauch" },
        { text: "Sometimes magic is just someone spending more time on something than anyone else might expect.", author: "Teller" },
        { text: "Don't let good process excuse bad results.", author: "Sam Altman" },
    ];

    return (
        <div
            className="absolute"
            style={{ left: position.x, top: position.y }}
        >
            <DecoratedCard className="w-[480px]" cornerSize="md">
                <SectionLabel label="Quotes" />
                <div className="p-8">
                    <h2 className="font-display text-3xl text-[#52504d] mb-2 tracking-tight">Quotes.</h2>
                    <p className="text-[#9e9692] text-sm mb-6">Things that resonate</p>

                    <div className="space-y-3">
                        {quotes.map((quote) => (
                            <div key={quote.author} className="p-4 rounded-xl bg-gradient-to-br from-[#faf8f6] to-[#f5f0ed] border border-black/[0.02]">
                                <blockquote className="text-sm text-[#52504d] mb-2 leading-relaxed">
                                    "{quote.text}"
                                </blockquote>
                                <cite className="text-xs text-[#9e9692] not-italic font-medium">
                                    {quote.author}
                                </cite>
                            </div>
                        ))}
                    </div>
                </div>
            </DecoratedCard>

            <div className="mt-8 p-4 bg-white/80 backdrop-blur-sm rounded-xl max-w-sm shadow-sm border border-[#cf725f]/10">
                <p className="text-xs text-[#9e9692] leading-relaxed">
                    Internet fragments that stuck. Collected while reading blogs, scrolling X, or watching anime.
                </p>
            </div>
        </div>
    );
}

// Photos Section
function PhotosSection({ position }: { position: { x: number; y: number } }) {
    const photos = [
        { gradient: 'from-[#667eea] to-[#764ba2]', label: 'Golden Gate' },
        { gradient: 'from-[#f093fb] to-[#f5576c]', label: 'Italian Villa' },
        { gradient: 'from-[#4facfe] to-[#00f2fe]', label: 'Apple Park' },
        { gradient: 'from-[#43e97b] to-[#38f9d7]', label: 'Sequoia' },
    ];

    return (
        <div
            className="absolute"
            style={{ left: position.x, top: position.y }}
        >
            <DecoratedCard className="w-[520px]" cornerSize="md">
                <SectionLabel label="Photos" />
                <div className="p-8">
                    <h2 className="font-display text-3xl text-[#52504d] mb-2 tracking-tight">Photos.</h2>

                    <div className="flex items-center gap-4 mb-6">
                        <span className="text-xs text-[#cf725f] font-mono">37.3328</span>
                        <span className="text-xs text-[#9e9692] font-mono">-122.005</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {photos.map((photo) => (
                            <div
                                key={photo.label}
                                className="rounded-xl overflow-hidden aspect-video cursor-pointer hover:scale-[1.02] transition-transform duration-200 group"
                            >
                                <div className={`w-full h-full bg-gradient-to-br ${photo.gradient} flex items-end p-3 relative`}>
                                    <span className="text-white/90 text-xs font-medium">{photo.label}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-sm text-[#9e9692] leading-relaxed mt-6">
                        I don't take many photos. Every year I tell myself I will. Every year I don't.
                        Looking back, I'm glad I took these.
                    </p>
                </div>
            </DecoratedCard>

            {/* Decorative stamp */}
            <div className="absolute -right-16 top-8">
                <div className="w-14 h-14 rounded-full bg-[#e8e2de] flex items-center justify-center shadow-sm border border-[#cf725f]/20">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8a7f75" strokeWidth="1.5">
                        <path d="M12 2v20M12 2c-4 4-8 6-8 10 0 6 4 10 8 10s8-4 8-10c0-4-4-6-8-10z" />
                    </svg>
                </div>
            </div>
        </div>
    );
}

// About Section
function AboutSection({ position }: { position: { x: number; y: number } }) {
    return (
        <div
            className="absolute"
            style={{ left: position.x, top: position.y }}
        >
            <DecoratedCard className="w-[520px]" cornerSize="md">
                <SectionLabel label="About" />
                <div className="p-8">
                    <h2 className="font-display text-3xl text-[#52504d] mb-6 tracking-tight">About.</h2>

                    <div className="space-y-6">
                        <div>
                            <h3 className="text-sm font-medium text-[#52504d] mb-2">What I do</h3>
                            <p className="text-sm text-[#9e9692] leading-relaxed">
                                My work spans interfaces, design systems, illustration, and code,
                                with a focus on carrying ideas all the way from design to production.
                            </p>
                        </div>

                        <div>
                            <h3 className="text-sm font-medium text-[#52504d] mb-2">Now</h3>
                            <p className="text-sm text-[#9e9692] leading-relaxed">
                                These days I'm designing products at{' '}
                                <a href="https://bendingspoons.com" className="text-[#cf725f] hover:underline">
                                    Bending Spoons
                                </a>
                                . Over time I've moved across teams and products, taking on different roles —
                                from product design and growth work to brand, often taking care of the
                                implementation as well.
                            </p>
                        </div>

                        <div>
                            <h3 className="text-sm font-medium text-[#52504d] mb-2">How it started</h3>
                            <p className="text-sm text-[#9e9692] leading-relaxed">
                                The web opened my eyes to what was possible. Around fifteen, I started building
                                small blogs and websites, mostly for fun and with very little idea of what I was
                                doing. I still remember days spent tweaking WordPress themes and nights fixing
                                odd Internet Explorer bugs.
                            </p>
                        </div>

                        <div>
                            <h3 className="text-sm font-medium text-[#52504d] mb-2">Things</h3>
                            <ul className="text-sm text-[#9e9692] space-y-2">
                                <li className="flex items-start gap-2">
                                    <span className="text-[#cf725f] mt-1">•</span>
                                    Usually this is where people list hobbies — climbing, traveling, going out. I don't. I mostly just like building things.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#cf725f] mt-1">•</span>
                                    I listen to a lot of podcasts.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#cf725f] mt-1">•</span>
                                    I'm 22. My next birthday is in 179 days.
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Signature */}
                    <div className="mt-8 pt-6 border-t border-[#e4d8ca]">
                        <svg width="80" height="30" viewBox="0 0 80 30" fill="none">
                            <path d="M5 20 Q10 5 20 15 T40 10 Q50 5 60 15 T75 12" stroke="#9e9692" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                        </svg>
                        <p className="text-xs text-[#9e9692] mt-3">
                            End. Last update: 9 Mar 2026
                        </p>
                    </div>
                </div>
            </DecoratedCard>

            {/* Designers I admire */}
            <div className="mt-8 bg-white rounded-2xl p-5 w-[380px] shadow-lg shadow-black/5 border border-[#cf725f]/20">
                <p className="text-xs text-[#9e9692] mb-3">
                    A few designers I deeply admire and follow:
                </p>
                <div className="flex flex-wrap gap-2">
                    {['Rauno Freiberg', 'Claudio Guglieri', 'Brian Lovin', 'James McDonald', 'Paco'].map((name) => (
                        <span
                            key={name}
                            className="text-xs text-[#cf725f] bg-[#cf725f]/10 px-2.5 py-1 rounded-full hover:bg-[#cf725f]/20 transition-colors cursor-pointer"
                        >
                            {name}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default App;
