'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Menu, Plus, Volume2, VolumeX, X } from 'lucide-react';

const projects = [
  { title: 'Signal / 01', tags: 'ART DIRECTION • WEB • 3D', image: '/images/project-glass.png', position: 'center' },
  { title: 'Matter Study', tags: 'INTERACTION • MOTION • CGI', image: '/images/hero-forms.png', position: '52% 45%' },
  { title: 'Blue Hour', tags: 'IDENTITY • DIGITAL • EXPERIENCE', image: '/images/project-glass.png', position: '72% center' },
  { title: 'Form & Flow', tags: 'CONCEPT • DESIGN • DEVELOPMENT', image: '/images/hero-forms.png', position: '28% 60%' },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [cursor, setCursor] = useState({ x: -100, y: -100, active: false });
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onMove = (event: PointerEvent) => setCursor((c) => ({ ...c, x: event.clientX, y: event.clientY }));
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const scrollToWork = () => document.querySelector('#work')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <main className="site-shell">
      <div aria-hidden="true" className={`cursor-orb ${cursor.active ? 'is-active' : ''}`} style={{ transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)` }}>VIEW</div>

      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Back to top">YOUR—NAME</a>
        <div className="top-actions">
          <button className="sound-button" onClick={() => setSoundOn(!soundOn)} aria-label={soundOn ? 'Mute ambient sound' : 'Enable ambient sound'}>{soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
          <a className="talk-link" href="mailto:hello@yourname.com">LET&apos;S TALK <ArrowUpRight size={15} /></a>
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={20} /> MENU</button>
        </div>
      </header>

      <div className={`menu-panel ${menuOpen ? 'is-open' : ''}`} aria-hidden={!menuOpen}>
        <div className="menu-head"><span>YOUR—NAME</span><button onClick={() => setMenuOpen(false)}><X size={20} /> CLOSE</button></div>
        <nav className="menu-links" aria-label="Primary navigation">
          {['HOME', 'ABOUT', 'PROJECTS', 'CONTACT'].map((item, index) => (
            <a key={item} href={`#${item === 'HOME' ? 'top' : item === 'PROJECTS' ? 'work' : item.toLowerCase()}`} onClick={() => setMenuOpen(false)}><span>0{index + 1}</span>{item}<ArrowUpRight /></a>
          ))}
        </nav>
        <p>Independent designer &amp; developer<br />Available for selected projects — 2026</p>
      </div>

      <section ref={heroRef} id="top" className="hero">
        <h1>I create visual stories<br />and interactive experiences<br />that make ideas tangible</h1>
        <div className="hero-visual"><img src="/images/hero-forms.png" alt="Original blue, white and black abstract 3D forms" /><div className="hero-index">01 / 04</div></div>
        <button className="scroll-cue" onClick={scrollToWork}><Plus size={18} /><span>SCROLL TO EXPLORE</span><Plus size={18} /></button>
      </section>

      <section id="about" className="manifesto dark-section">
        <div className="eyebrow">ABOUT THE PRACTICE</div>
        <h2>Bold ideas,<br /><em>brought to life.</em></h2>
        <div className="manifesto-copy"><p>I combine design, motion, creative technology and development to build digital experiences that feel visually striking and technically seamless.</p><a href="#contact">MY APPROACH <ArrowRight size={16} /></a></div>
        <div className="reel-card" onMouseEnter={() => setCursor(c => ({ ...c, active: true }))} onMouseLeave={() => setCursor(c => ({ ...c, active: false }))}>
          <img src="/images/project-glass.png" alt="Chrome ribbon flowing through cobalt glass structures" /><span>PLAY REEL</span><button aria-label="Play reel">▶</button>
        </div>
      </section>

      <section id="work" className="work-section">
        <div className="section-heading"><div><span className="eyebrow">SELECTED WORK / 2024—26</span><h2>Featured Work</h2></div><p>A SELECTION OF DIGITAL EXPERIENCES, IDENTITIES AND EXPERIMENTS CREATED FOR CURIOUS PEOPLE AND AMBITIOUS TEAMS.</p></div>
        <div className="project-grid">
          {projects.map((project, index) => (
            <a className={`project-card project-${index + 1}`} href="#contact" key={project.title} onMouseEnter={() => setCursor(c => ({ ...c, active: true }))} onMouseLeave={() => setCursor(c => ({ ...c, active: false }))}>
              <div className="project-image"><img src={project.image} alt="" style={{ objectPosition: project.position }} /></div>
              <div className="project-meta"><span>{project.tags}</span><ArrowUpRight size={18} /></div><h3>{project.title}</h3>
            </a>
          ))}
        </div>
      </section>

      <section className="statement">
        <div className="statement-top"><p>WHERE CREATIVE IDEAS<br />BECOME IMMERSIVE EXPERIENCES</p><div><p>I don&apos;t chase trends or make work that looks like everything else. I focus on distinct visual systems that reflect the idea, invite interaction and leave a clear memory.</p><p>Every project blends a strong concept with careful craft — from the first sketch to the smallest transition.</p></div></div>
        <h2>STEP INTO<br />A NEW WORLD<br /><span>AND GO WILD</span></h2>
      </section>

      <section id="contact" className="contact-section">
        <p>HAVE AN IDEA READY TO MOVE?</p><a href="mailto:hello@yourname.com">Let&apos;s work<br /><span>together!</span><ArrowUpRight /></a><div className="contact-scroll"><ArrowDown /> KEEP SCROLLING</div>
      </section>

      <footer>
        <div className="footer-top"><a href="mailto:hello@yourname.com">hello@yourname.com</a><div><span>SOCIAL</span><a href="#">Instagram</a><a href="#">LinkedIn</a><a href="#">Are.na</a></div><div><span>LOCATION</span><p>Shanghai / Everywhere<br />UTC +8</p></div></div>
        <div className="footer-bottom"><span>©2026 YOUR—NAME</span><span>DESIGN + CODE WITH CARE</span><a href="#top">BACK TO TOP ↑</a></div>
      </footer>
    </main>
  );
}
