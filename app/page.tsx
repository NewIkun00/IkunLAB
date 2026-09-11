'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Plus, X } from 'lucide-react';
import { PhysicsHero } from '@/components/physics-hero';
import { LiquidMetalButton } from '@/components/liquid-metal-button';
import { Project, ProjectCard, ProjectCategory } from '@/components/project-card';
import { RippleField } from '@/components/ripple-field';

const projects: Project[] = [
  { title: 'Signal / 01', tags: 'ART DIRECTION • WEB • 3D', image: '/images/project-glass.png', position: 'center', categories: ['AI设计工程', '独立开发者'] },
  { title: 'Matter Study', tags: 'INTERACTION • MOTION • CGI', image: '/images/hero-forms.png', position: '52% 45%', categories: ['3D美术视觉品牌'] },
  { title: 'Blue Hour', tags: 'IDENTITY • DIGITAL • EXPERIENCE', image: '/images/project-glass.png', position: '72% center', categories: ['用户体验'] },
  { title: 'Form & Flow', tags: 'CONCEPT • DESIGN • DEVELOPMENT', image: '/images/hero-forms.png', position: '28% 60%', categories: ['数字孪生'] },
];

const workCategories = ['全部', '用户体验', '数字孪生', 'AI设计工程', '3D美术视觉品牌', '独立开发者'] as const;
type WorkCategory = '全部' | ProjectCategory;

export default function Home() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const scrollIndicatorRef = useRef<HTMLDivElement>(null);
  const scrollThumbRef = useRef<HTMLSpanElement>(null);
  const scrollIdleTimerRef = useRef<number | null>(null);
  const [transition, setTransition] = useState<{ project: Project; rect: DOMRect; expanding: boolean } | null>(null);
  const [detail, setDetail] = useState<Project | null>(null);
  const [activeCategory, setActiveCategory] = useState<WorkCategory>('全部');
  const visibleProjects = activeCategory === '全部'
    ? projects
    : projects.filter((project) => project.categories.includes(activeCategory));

  useEffect(() => {
    const updateScrollIndicator = () => {
      const scrollRange = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(Math.max(window.scrollY / scrollRange, 0), 1);
      const track = scrollIndicatorRef.current;
      const thumb = scrollThumbRef.current;
      if (track && thumb) {
        const travel = Math.max(track.clientHeight - thumb.clientHeight, 0);
        thumb.style.setProperty('--scroll-y', `${progress * travel}px`);
      }
    };
    const onMove = (event: PointerEvent) => {
      if (cursorRef.current) cursorRef.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
    };
    const onScroll = () => {
      cursorRef.current?.classList.remove('is-active');
      updateScrollIndicator();
    };
    const onWheel = () => {
      scrollIndicatorRef.current?.classList.add('is-visible');
      if (scrollIdleTimerRef.current !== null) window.clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = window.setTimeout(() => {
        scrollIndicatorRef.current?.classList.remove('is-visible');
      }, 1050);
    };
    updateScrollIndicator();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      if (scrollIdleTimerRef.current !== null) window.clearTimeout(scrollIdleTimerRef.current);
    };
  }, []);

  const setCursorActive = (active: boolean) => cursorRef.current?.classList.toggle('is-active', active);

  const openProject = (project: Project, rect: DOMRect) => {
    setCursorActive(false);
    setTransition({ project, rect, expanding: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setTransition((current) => current ? { ...current, expanding: true } : null)));
    window.setTimeout(() => {
      setDetail(project);
      setTransition(null);
      document.body.style.overflow = 'hidden';
    }, 820);
  };

  const closeProject = () => {
    setDetail(null);
    document.body.style.overflow = '';
  };

  return (
    <main className="site-shell">
      <RippleField />
      <div ref={cursorRef} aria-hidden="true" className="cursor-orb">VIEW</div>
      <div ref={scrollIndicatorRef} aria-hidden="true" className="scroll-indicator">
        <span ref={scrollThumbRef} />
      </div>

      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Back to top">Ikun LAB</a>
      </header>

      <section id="top" className="hero">
        <div className="hero-heading">
          <h1>Hi，我是Ikun</h1>
          <p>AI、全栈体验设计、技术美术、独立开发者</p>
          <LiquidMetalButton href="#work">查看作品</LiquidMetalButton>
        </div>
        <div className="hero-visual"><PhysicsHero /></div>
        <button className="scroll-cue" onClick={() => document.querySelector('#work')?.scrollIntoView({ behavior: 'smooth' })}><Plus size={18} /><span>继续下潜，查看作品案例</span><Plus size={18} /></button>
      </section>

      <section id="work" className="work-section">
        <div className="section-heading"><div><span className="eyebrow">SELECTED WORK / 2022—26</span><h2>作品案例</h2></div><p>A SELECTION OF DIGITAL EXPERIENCES, IDENTITIES AND EXPERIMENTS CREATED FOR CURIOUS PEOPLE AND AMBITIOUS TEAMS.</p></div>
        <div className="work-tabs" role="tablist" aria-label="作品分类">
          {workCategories.map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={activeCategory === category}
              aria-controls="project-grid"
              className={activeCategory === category ? 'is-active' : ''}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <div id="project-grid" className="project-grid">
          {visibleProjects.map((project) => {
            const projectIndex = projects.findIndex((item) => item.title === project.title);
            return <ProjectCard key={project.title} project={project} index={projectIndex} onOpen={openProject} onHover={setCursorActive} />;
          })}
        </div>
      </section>

      <section className="statement"><div className="statement-top"><p>WHERE CREATIVE IDEAS<br />BECOME IMMERSIVE EXPERIENCES</p><div><p>I don&apos;t chase trends or make work that looks like everything else. I focus on distinct visual systems that reflect the idea, invite interaction and leave a clear memory.</p><p>Every project blends a strong concept with careful craft — from the first sketch to the smallest transition.</p></div></div><h2>STEP INTO<br />A NEW WORLD<br /><span>AND GO WILD</span></h2></section>
      <section id="contact" className="contact-section"><p>HAVE AN IDEA READY TO MOVE?</p><a href="mailto:hello@yourname.com">Let&apos;s work<br /><span>together!</span><ArrowUpRight /></a><div className="contact-scroll"><ArrowDown /> KEEP SCROLLING</div></section>
      <footer><div className="footer-top"><a href="mailto:hello@yourname.com">hello@yourname.com</a><div><span>SOCIAL</span><a href="#">Instagram</a><a href="#">LinkedIn</a><a href="#">Are.na</a></div><div><span>LOCATION</span><p>Shanghai / Everywhere<br />UTC +8</p></div></div><div className="footer-bottom"><span>©2026 YOUR—NAME</span><span>DESIGN + CODE WITH CARE</span><a href="#top">BACK TO TOP ↑</a></div></footer>

      {transition && <div className={`project-transition ${transition.expanding ? 'is-expanding' : ''}`} style={{ '--from-x': `${transition.rect.left}px`, '--from-y': `${transition.rect.top}px`, '--from-w': `${transition.rect.width}px`, '--from-h': `${transition.rect.height}px`, '--transition-image': `url(${transition.project.image})` } as React.CSSProperties} />}
      {detail && <aside className="project-detail" aria-label={`${detail.title} project detail`}><button onClick={closeProject}><X /> CLOSE</button><div className="detail-media"><img src={detail.image} alt="" /></div><div className="detail-title"><span>{detail.tags}</span><h2>{detail.title}</h2><p>An immersive digital case study built around motion, material and meaningful interaction.</p></div></aside>}
    </main>
  );
}
