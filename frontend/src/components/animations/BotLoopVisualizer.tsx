// ============================================================================
// src/components/animations/BotLoopVisualizerUltra.tsx
// Cinemático: path curvo, partículas conectadas, cometa/trail do bot,
// cartões com depth + tilt, parallax multi-camada, ripple ao tocar nós,
// e comentários com stagger. Sem libs extras além de framer-motion.
// ============================================================================

import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo } from 'react'

export type BotLoopVisualizerUltraProps = {
  className?: string
  speed?: number           // velocidade global (1 = normal)
  accent?: string          // cor principal do bot/trilhas
  glow?: number            // 0..1 intensidade de brilho
  density?: number         // 0..1 quantidade de partículas
  autoPan?: boolean        // pan vertical sutil
  scale?: number           // escala global do conteúdo
}

export default function BotLoopVisualizerUltra({
  className,
  speed = 1,
  accent = '#7dd3fc',
  glow = 0.8,
  density = 0.7,
  autoPan = true,
  scale = 0.96,
}: BotLoopVisualizerUltraProps) {
  const prefersReduced = useReducedMotion()
  const W = 420, H = 260
  const T = 9 / Math.max(0.25, speed) // duração do loop

  // Nós (em losango) para dar dinâmica
  const cx = W/2, cy = H/2, offX = 120, offY = 78
  const nodes = useMemo(() => ([
    { id: 'scrape',   x: cx - offX, y: cy - offY, label: 'Scrape\nGroups' },
    { id: 'parse',    x: cx + offX, y: cy - offY, label: 'Parse\nPosts' },
    { id: 'reply',    x: cx + offX, y: cy + offY, label: 'Generate\nReply' },
    { id: 'comment',  x: cx - offX, y: cy + offY, label: 'Post\nComment' },
  ]), [cx, cy])
  const pathOrder = ['scrape','parse','reply','comment','scrape'] as const
  const map = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes])

  // Path curvo (bezier) entre nós
  const segs = useMemo(() => {
    const arr: {A:{x:number;y:number};B:{x:number;y:number};d:string}[] = []
    for (let i=0;i<pathOrder.length-1;i++){
      const A = map[pathOrder[i] as keyof typeof map]
      const B = map[pathOrder[i+1] as keyof typeof map]
      const mx = (A.x+B.x)/2, my = (A.y+B.y)/2
      const curv = 0.65
      const cx1 = (A.x* (1-curv)) + (mx*curv)
      const cy1 = (A.y* (1-curv)) + (my*curv)
      const cx2 = (B.x* (1-curv)) + (mx*curv)
      const cy2 = (B.y* (1-curv)) + (my*curv)
      const d = `M ${A.x} ${A.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${B.x} ${B.y}`
      arr.push({A,B,d})
    }
    return arr
  }, [map])

  // Pan (sensação de scroll)
  const pan = useAnimationControls()
  useEffect(() => {
    if (!autoPan || prefersReduced) return
    let mounted = true
    ;(async () => {
      while(mounted){
        await pan.start({ y: -16, transition: { duration: T*0.8, ease: 'easeInOut' } })
        await pan.start({ y:  12, transition: { duration: T*0.8, ease: 'easeInOut' } })
      }
    })()
    return () => { mounted = false }
  }, [autoPan, prefersReduced, T, pan])

  // Partículas (near/far) + fios conectores
  const near = useMemo(() => genParticles(Math.round(90 * density), W, H), [density])
  const far  = useMemo(() => genParticles(Math.round(140* density), W, H), [density])

  return (
    <div className={className}>
      <motion.svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
        animate={pan}
        style={{ willChange:'transform' }}
      >
        <defs>
          <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={2 + 4*glow} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Container vidro + gradiente de sombra superior/inferior */}
        <g transform={`scale(${scale}) translate(${(W*(1-scale))/(scale*2)}, ${(H*(1-scale))/(scale*2)})`}>
          <rect x={10} y={10} width={W-20} height={H-20} rx={22} fill="url(#glass)" stroke="rgba(255,255,255,0.22)" />
          <rect x={10} y={10} width={W-20} height={H-20} rx={22} fill="url(#glass)" opacity={0.18} />

          {/* camada far (parallax lento) */}
          <ParallaxLayer dots={far} k={0.4} dur={T*2.6} opacity={0.16} />

          {/* paths com brilho pulsante e dash animado */}
          {segs.map((s, i) => (
            <g key={i} filter="url(#glow)">
              <path d={s.d} stroke="rgba(255,255,255,0.24)" strokeWidth={1.2} fill="none" />
              <motion.path d={s.d} stroke={accent} strokeWidth={2.4} fill="none" strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0.4 }}
                animate={{ pathLength: [0,1,0], opacity: [0.4,1,0.4] }}
                transition={{ duration: T/4, repeat: Infinity, ease: 'easeInOut', delay: (i*T)/4 }}
              />
            </g>
          ))}

          {/* cartões/nós com depth, tilt e ripple quando o bot chega */}
          {nodes.map((n, idx) => (
            <NodeCard key={n.id} x={n.x} y={n.y} label={n.label} delay={(idx*T)/4} accent={accent} T={T} />
          ))}

          {/* bot com cometa/trail e pulso no nó de chegada */}
          <CometTrail segs={segs} T={T} color={accent} />

          {/* camada near (parallax rápido + conectores ocasionais) */}
          <ParallaxLayer dots={near} k={0.9} dur={T*1.3} opacity={0.28} linkEvery={10} />

          {/* comentários em cascata (mais vivos) */}
          <Cascade text="Price?" x={cx+40}  y={35}  T={T} />
          <Cascade text="We can help ✨" x={cx-150}  y={H-40} left T={T} />
          <Cascade text="Sent you a DM." x={cx+60}  y={H-36} T={T} />
        </g>
      </motion.svg>

      {/* máscara de fade fora do svg para sensação de viewport */}
      <div className="pointer-events-none absolute inset-0" style={{
        background:'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 15%, rgba(0,0,0,0) 85%, rgba(0,0,0,0.3) 100%)',
        mixBlendMode:'soft-light'
      }}/>
    </div>
  )
}

/* ================= subcomponentes ================= */
function NodeCard({ x, y, label, delay, accent, T }:{ x:number;y:number;label:string;delay:number;accent:string;T:number }){
  return (
    <g>
      <motion.g
        initial={{ rotateX: 12, rotateY: -6, opacity: 0.92 }}
        animate={{ rotateX: [12,8,12], rotateY: [-6,-4,-6], opacity:[0.92,1,0.92] }}
        transition={{ duration: T/3, repeat: Infinity, ease: 'easeInOut', delay }}
        style={{ transformOrigin: `${x}px ${y}px` }}
      >
        <rect x={x-64} y={y-26} rx={14} width={128} height={52} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.34)" />
        <text x={x} y={y} fill="white" fontSize={12} fontFamily="ui-sans-serif, system-ui" textAnchor="middle" dominantBaseline="middle">
          {label}
        </text>
      </motion.g>

      {/* ripple quando o cometa passa por aqui (sincronizado pelo delay) */}
      <motion.circle cx={x} cy={y} r={6} fill="none" stroke={accent} strokeWidth={2}
        initial={{ opacity: 0.0, r: 6 }}
        animate={{ opacity: [0.0, 0.8, 0.0], r: [6, 22, 30] }}
        transition={{ duration: T/4, repeat: Infinity, ease: 'easeOut', delay }}
      />
    </g>
  )
}

function CometTrail({ segs, T, color }:{ segs:{d:string;A:{x:number;y:number};B:{x:number;y:number}}[]; T:number; color:string }){
  // a animação percorre cada segmento, depositando partículas fading (trail)
  return (
    <>
      {segs.map((s, i) => (
        <motion.circle key={`c-${i}`} r={6} fill={color} filter="url(#glow)"
          initial={{ offsetDistance: '0%', opacity: 0.9 }}
          animate={{ offsetDistance: ['0%','100%'] }}
          transition={{ duration: T/4, repeat: Infinity, ease: 'easeInOut', delay: (i*T)/4 }}
          style={{ offsetPath: `path('${s.d}')` as any }}
        />
      ))}
      {segs.map((s, i) => (
        <motion.circle key={`t-${i}`} r={14} fill={color}
          initial={{ offsetDistance: '0%', opacity: 0.18 }}
          animate={{ offsetDistance: ['0%','100%'], opacity: [0.18, 0.02] }}
          transition={{ duration: T/4, repeat: Infinity, ease: 'easeInOut', delay: (i*T)/4 }}
          style={{ offsetPath: `path('${s.d}')` as any, filter: 'blur(8px)' }}
        />
      ))}
    </>
  )
}

function Cascade({ text, x, y, left=false, T }:{ text:string; x:number;y:number; left?:boolean; T:number }){
  const w = Math.max(120, Math.min(200, 10*text.length))
  const tx = left ? x : x - w
  return (
    <motion.g initial={{ opacity: 0, y }} animate={{ opacity: [0,1,1,0], y: [y+10,y-6,y-16,y-28] }} transition={{ duration: 3.2, delay: 0.1*T, repeat: Infinity }}>
      <rect x={tx} y={y-28} rx={12} width={w} height={26} fill="rgba(15,15,15,0.76)" stroke="rgba(255,255,255,0.18)" />
      <text x={tx+10} y={y-11} fill="white" fontSize={11} fontFamily="ui-sans-serif, system-ui">{text}</text>
    </motion.g>
  )
}

function ParallaxLayer({ dots, k, dur, opacity, linkEvery }:{ dots:Dot[]; k:number; dur:number; opacity:number; linkEvery?:number }){
  return (
    <g opacity={opacity}>
      {/* conexões ocasionais */}
      {linkEvery ? dots.map((d,i) => (i%linkEvery===0 && dots[i+1]) ? (
        <motion.line key={`ln-${i}`} x1={d.x} y1={d.y} x2={dots[i+1].x} y2={dots[i+1].y}
          stroke="white" strokeOpacity={0.25} strokeWidth={0.6}
          initial={{ opacity: 0 }} animate={{ opacity: [0,0.6,0] }}
          transition={{ duration: dur*(0.6 + (i%7)/10), repeat: Infinity, ease:'easeInOut', delay:(i%9)*0.22 }}
        />
      ) : null) : null}

      {dots.map((d,i) => (
        <motion.circle key={i} r={d.r} fill={d.c} cx={d.x}
          animate={{ cy: [d.y - 8*k, d.y + 8*k, d.y - 8*k] }}
          transition={{ duration: dur*(0.6 + (i%11)/12), repeat: Infinity, ease: 'easeInOut', delay: (i%13)*0.12 }}
        />
      ))}
    </g>
  )
}

type Dot = { x:number; y:number; r:number; c:string }
function genParticles(n:number, W:number, H:number): Dot[]{
  const arr:Dot[] = []
  for(let i=0;i<n;i++){
    const x = 16 + Math.random()*(W-32)
    const y = 16 + Math.random()*(H-32)
    const r = Math.random() < 0.85 ? 1.4 : 2.2
    const c = 'white'
    arr.push({ x,y,r,c })
  }
  return arr
}

// ============================================================================
// Uso no AuthLayout (lado direito):
// ----------------------------------------------------------------------------
// import BotLoopVisualizerUltra from '@/components/animations/BotLoopVisualizerUltra'
// <div className="absolute inset-0 max-w-[640px] mx-auto">
//   <BotLoopVisualizerUltra className="absolute inset-0 p-4" speed={1.15} accent="#93c5fd" glow={0.9} density={0.8} />
// </div>
