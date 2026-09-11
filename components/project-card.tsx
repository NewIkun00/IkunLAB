'use client';

import { MouseEvent, useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';

export type ProjectCategory = '用户体验' | '数字孪生' | 'AI设计工程' | '3D美术视觉品牌' | '独立开发者';

export type Project = {
  title: string;
  tags: string;
  image: string;
  position: string;
  categories: ProjectCategory[];
};

export function ProjectCard({ project, index, onOpen, onHover }: { project: Project; index: number; onOpen: (project: Project, rect: DOMRect) => void; onHover: (active: boolean) => void }) {
  const cardRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        card.classList.add('in-view');
        observer.disconnect();
      }
    }, { threshold: .16 });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const move = (event: MouseEvent<HTMLButtonElement>) => {
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    card.style.setProperty('--mx', `${x * -34}px`);
    card.style.setProperty('--my', `${y * -28}px`);
    card.style.setProperty('--rx', `${y * -3.4}deg`);
    card.style.setProperty('--ry', `${x * 4.8}deg`);
    card.style.setProperty('--warp', `${50 + x * 13}% ${50 + y * 13}%`);
  };

  const leave = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.style.setProperty('--mx', '0px');
    event.currentTarget.style.setProperty('--my', '0px');
    event.currentTarget.style.setProperty('--rx', '0deg');
    event.currentTarget.style.setProperty('--ry', '0deg');
    event.currentTarget.style.setProperty('--warp', '50% 50%');
    onHover(false);
  };

  return (
    <button ref={cardRef} className={`project-card project-${index + 1}`} onMouseMove={move} onMouseEnter={() => onHover(true)} onMouseLeave={leave} onClick={() => onOpen(project, cardRef.current!.getBoundingClientRect())}>
      <div className="project-image"><img src={project.image} alt="" style={{ objectPosition: project.position }} /><span className="project-no">0{index + 1}</span></div>
      <div className="project-meta"><span>{project.tags}</span><ArrowUpRight size={18} /></div>
      <h3>{project.title}</h3>
    </button>
  );
}
