'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import liquidMetalButtonSource from './liquid-metal-button.html?raw';

type LiquidMetalButtonProps = {
  href: string;
  children: ReactNode;
};

const bridge = `
<style id="portfolio-button-adapter">
  html,body{background:transparent!important}
  .stage{
    --h:44px;
    --bw:calc(1680 * var(--u));
    --pad:calc(300 * var(--u));
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  }
  .plate,
  body.hot .plate,
  body.press .plate{box-shadow:none!important}
  .btn{gap:0;font-size:15px}
  .btn .ico{display:none}
</style>
<script id="portfolio-button-bridge">
  window.addEventListener('message', event => {
    if(event.source !== parent) return;
    const config = event.data && event.data.portfolioLiquidButton;
    if(!config) return;
    const label = btn.querySelector('.lbl');
    if(label) label.textContent = String(config.text || '').slice(0, 16);
    btn.setAttribute('aria-label', String(config.text || '查看作品'));
  });
  btn.addEventListener('click', () => {
    parent.postMessage({ portfolioLiquidButton: { type: 'activate' } }, '*');
  });
</script>`;

export function LiquidMetalButton({ href, children }: LiquidMetalButtonProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const text = String(children);
  const source = useMemo(
    () => liquidMetalButtonSource.replace('</body>', `${bridge}\n</body>`),
    [],
  );

  const sync = () => {
    frameRef.current?.contentWindow?.postMessage({
      portfolioLiquidButton: { text },
    }, '*');
  };

  useEffect(() => {
    const receiveMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.portfolioLiquidButton?.type !== 'activate') return;
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
    };
    window.addEventListener('message', receiveMessage);
    return () => window.removeEventListener('message', receiveMessage);
  }, [href]);

  useEffect(() => {
    if (ready) sync();
  }, [ready, text]);

  return (
    <div className="liquid-metal-button" data-ready={ready || undefined}>
      <iframe
        ref={frameRef}
        className="liquid-metal-button__frame"
        title="液态金属查看作品按钮"
        srcDoc={source}
        sandbox="allow-scripts"
        loading="eager"
        onLoad={() => {
          setReady(true);
          sync();
        }}
      />
    </div>
  );
}
