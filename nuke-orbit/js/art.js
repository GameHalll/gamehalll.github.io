/* =========================================================================
   NUKE ORBIT — art.js
   All procedural cartoon art: characters, bombs, environments, props.
   Everything is drawn with Canvas paths — no image assets required.
   ========================================================================= */
'use strict';

NO.Art = (function () {
  const OUT = '#1d1530';            // cartoon outline colour
  const TAU = Math.PI * 2;

  /* ------------------------------ helpers ------------------------------ */
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const smooth = (t) => t * t * (3 - 2 * t);
  function noise1(x) { const i = Math.floor(x), f = x - i; return hash(i) + (hash(i + 1) - hash(i)) * smooth(f); }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeIn = (t) => Math.pow(clamp(t, 0, 1), 2);

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // Flat vector style: shapes are filled only, no black outlines.
  function fillStroke(ctx, fill) {
    ctx.fillStyle = fill; ctx.fill();
  }
  function circle(ctx, x, y, r, fill, lw = 3) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    if (fill) fillStroke(ctx, fill, lw);
  }
  function ellipse(ctx, x, y, rx, ry, fill, lw = 3, rot = 0) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    if (fill) fillStroke(ctx, fill, lw);
  }
  // flat two-tone shading: darken the right part of the current path
  function shade(ctx, x0, y0, w, h, a = 0.16) {
    ctx.save(); ctx.clip(); ctx.fillStyle = `rgba(25,12,70,${a})`; ctx.fillRect(x0, y0, w, h); ctx.restore();
  }
  // thick outlined limb (two strokes)
  function limb(ctx, x1, y1, x2, y2, w, color) {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }

  /* =====================================================================
     CHARACTERS
     Local frame: origin at feet, ~100 units tall, y up = negative.
     ===================================================================== */
  const LOOK = {
    kim:       { skin: '#f6d2ac', suit: '#2c2c36', pants: '#2c2c36', shoe: '#111', sleeve: '#2c2c36' },
    general:   { skin: '#efc19a', suit: '#55642f', pants: '#4a5728', shoe: '#1a1a1a', sleeve: '#55642f' },
    donny:     { skin: '#f7a052', suit: '#1f3a7a', pants: '#1f3a7a', shoe: '#2a1a10', sleeve: '#1f3a7a' },
    president: { skin: '#c58a5c', suit: '#1e1e26', pants: '#f2f0e6', shoe: '#5a3417', sleeve: '#1e1e26' },
    scientist: { skin: '#f3dcc8', suit: '#f4f6f8', pants: '#3b3f58', shoe: '#222', sleeve: '#f4f6f8' },
    alien:     { skin: '#7ee36b', suit: '#b9c3d3', pants: '#9aa6ba', shoe: '#6b7891', sleeve: '#b9c3d3' },
  };

  // Arm/leg angle convention: 0 = pointing down, +PI/2 = forward (+x), PI = up.
  const dirX = (a) => Math.sin(a), dirY = (a) => Math.cos(a);

  function swingAngle(p) {
    if (p < 0.45) return lerp(0.78, -2.5, easeOut(p / 0.45));
    if (p < 0.55) return lerp(-2.5, 0.7, easeIn((p - 0.45) / 0.1));
    if (p < 0.72) return lerp(0.7, 2.1, easeOut((p - 0.55) / 0.17));
    return 2.1;
  }

  // Returns pose for a character at launch progress p (null = idle)
  function pose(style, p, t) {
    const idleArm = 0.12 + Math.sin(t * 2.2) * 0.06;
    const P = { armF: idleArm, armB: -idleArm * 0.8, legF: 0.08, legB: -0.08, bx: 0, by: Math.sin(t * 3) * 1.2, lean: 0, tool: style };
    if (p == null) {
      if (style === 'beam') P.by = -6 + Math.sin(t * 2.5) * 3;
      if (style === 'ray') { P.armF = 0.6 + Math.sin(t * 2) * 0.05; }
      if (style === 'mallet' || style === 'golf' || style === 'cricket') { P.armF = 0.78 + Math.sin(t * 2.2) * 0.04; P.armB = P.armF - 0.15; }
      return P;
    }
    switch (style) {
      case 'mallet': case 'golf': case 'cricket': {
        const a = swingAngle(p);
        P.armF = a; P.armB = a - 0.15;
        P.lean = p < 0.45 ? -0.12 * easeOut(p / 0.45) : lerp(-0.12, 0.18, easeOut((p - 0.45) / 0.25));
        if (style === 'mallet') P.by = -Math.sin(clamp((p - 0.2) / 0.4, 0, 1) * Math.PI) * 18;
        if (style === 'golf') P.legF = 0.15 + P.lean;
        break;
      }
      case 'kick': {
        const a = p < 0.45 ? lerp(0.08, -1.1, easeOut(p / 0.45)) : p < 0.55 ? lerp(-1.1, 1.5, easeIn((p - 0.45) / 0.1)) : lerp(1.5, 1.2, easeOut((p - 0.55) / 0.3));
        P.legF = a; P.legB = -0.15;
        P.bx = p < 0.45 ? 0 : lerp(0, 14, easeOut((p - 0.45) / 0.15));
        P.lean = p < 0.55 ? -0.1 : -0.2;
        P.armF = p < 0.55 ? -0.6 : lerp(-0.6, 2.9, easeOut((p - 0.55) / 0.2)); // fist pump
        P.armB = 0.9;
        break;
      }
      case 'ray': {
        P.armF = lerp(0.6, 1.55, easeOut(p / 0.3));
        P.armB = -0.3;
        if (p > 0.55) { P.armF += Math.max(0, 0.6 - (p - 0.55) * 3) * 0.6; P.lean = -0.08; }
        break;
      }
      case 'beam': {
        P.armF = lerp(0.2, 1.45, easeOut(p / 0.25));
        P.armB = lerp(-0.1, 1.3, easeOut(p / 0.25));
        P.by = -6 - Math.sin(clamp(p, 0, 1) * Math.PI) * 12;
        if (p > 0.55) P.armF = P.armB = lerp(1.45, 2.4, easeOut((p - 0.55) / 0.2));
        break;
      }
    }
    return P;
  }

  function drawTool(ctx, tool) {
    switch (tool) {
      case 'mallet':
        limb(ctx, 0, 26, 0, 74, 5, '#a0642d');
        rr(ctx, -16, 70, 32, 22, 5); fillStroke(ctx, '#e63946');
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(-16, 78, 32, 5);
        break;
      case 'golf':
        limb(ctx, 0, 26, 0, 84, 3, '#cfd6e0');
        rr(ctx, -2, 80, 16, 8, 3); fillStroke(ctx, '#8a95a5', 2.5);
        break;
      case 'cricket':
        limb(ctx, 0, 24, 0, 46, 5, '#3a2a1a');
        rr(ctx, -7, 44, 14, 44, 4); fillStroke(ctx, '#f0d9a6', 3);
        ctx.strokeStyle = 'rgba(120,80,30,.4)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(0, 84); ctx.stroke();
        break;
      case 'ray':
        rr(ctx, -6, 24, 12, 24, 4); fillStroke(ctx, '#8d99ae', 2.5);
        circle(ctx, 0, 50, 6, '#ff4fd8', 2.5);
        rr(ctx, -9, 30, 18, 6, 2); fillStroke(ctx, '#ffd23f', 2);
        break;
    }
  }

  function drawHead(ctx, id, L, t, p) {
    const hx = 0, hy = -88;
    switch (id) {
      case 'kim': {
        ellipse(ctx, hx, hy, 26, 24, L.skin); shade(ctx, hx + 9, hy - 50, 60, 100);
        // flat-top hair with shaved sides
        ctx.beginPath();
        ctx.moveTo(-24, hy - 4); ctx.lineTo(-23, hy - 22); ctx.quadraticCurveTo(0, hy - 34, 23, hy - 22); ctx.lineTo(24, hy - 6);
        ctx.lineTo(18, hy - 12); ctx.lineTo(-18, hy - 12); ctx.closePath(); fillStroke(ctx, '#151515');
        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(-25, hy - 10, 6, 8); ctx.fillRect(19, hy - 10, 6, 8);
        // happy closed eyes
        ctx.strokeStyle = OUT; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(-9, hy - 2, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(11, hy - 2, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.fillStyle = 'rgba(255,90,90,.45)'; circle(ctx, -15, hy + 6, 5); ctx.fill(); circle(ctx, 18, hy + 6, 5); ctx.fill();
        // big grin
        ctx.beginPath(); ctx.moveTo(-6, hy + 9); ctx.quadraticCurveTo(3, hy + 20, 14, hy + 8); ctx.closePath(); fillStroke(ctx, '#7a1f2b', 2.5);
        break;
      }
      case 'general': {
        ellipse(ctx, hx, hy, 23, 24, L.skin); shade(ctx, hx + 8, hy - 50, 60, 100);
        // aviators
        rr(ctx, -10, hy - 6, 13, 9, 3); fillStroke(ctx, '#111', 2); rr(ctx, 6, hy - 6, 13, 9, 3); fillStroke(ctx, '#111', 2);
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(-8, hy - 5, 4, 2); ctx.fillRect(8, hy - 5, 4, 2);
        // huge moustache
        ctx.beginPath(); ctx.moveTo(4, hy + 6);
        ctx.quadraticCurveTo(-14, hy + 2, -22, hy + 12); ctx.quadraticCurveTo(-6, hy + 12, 4, hy + 9);
        ctx.quadraticCurveTo(14, hy + 12, 30, hy + 10); ctx.quadraticCurveTo(22, hy + 2, 4, hy + 6); fillStroke(ctx, '#6b3e1f', 2.5);
        // peaked cap
        ctx.beginPath(); ctx.moveTo(-24, hy - 12); ctx.quadraticCurveTo(-26, hy - 34, 0, hy - 36); ctx.quadraticCurveTo(28, hy - 34, 26, hy - 12); ctx.closePath(); fillStroke(ctx, '#4d5a2c');
        ctx.fillStyle = '#c1121f'; ctx.fillRect(-24, hy - 17, 50, 6); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(-24, hy - 17, 50, 6);
        ctx.beginPath(); ctx.moveTo(-6, hy - 11); ctx.quadraticCurveTo(22, hy - 13, 36, hy - 6); ctx.lineTo(24, hy - 11); ctx.closePath(); fillStroke(ctx, '#111', 2.5);
        circle(ctx, 4, hy - 25, 5, '#ffd23f', 2);
        break;
      }
      case 'donny': {
        ellipse(ctx, hx, hy, 24, 25, L.skin); shade(ctx, hx + 8, hy - 50, 60, 100);
        // pale goggle tan
        ctx.fillStyle = '#fbd9b0'; ellipse(ctx, -7, hy - 2, 7, 5); ctx.fill(); ellipse(ctx, 11, hy - 2, 7, 5); ctx.fill();
        circle(ctx, -6, hy - 2, 2.5, OUT, 0); ctx.fillStyle = OUT; ctx.fill(); circle(ctx, 12, hy - 2, 2.5); ctx.fill();
        ctx.strokeStyle = '#e8c070'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-14, hy - 10); ctx.lineTo(-2, hy - 8); ctx.moveTo(5, hy - 8); ctx.lineTo(18, hy - 11); ctx.stroke();
        // pursed mouth
        ellipse(ctx, 6, hy + 11, 4.5, 3.5, '#b8433a', 2.5);
        // legendary swoop
        ctx.beginPath(); ctx.moveTo(-26, hy - 2);
        ctx.quadraticCurveTo(-30, hy - 30, 0, hy - 32);
        ctx.quadraticCurveTo(30, hy - 32, 38, hy - 14 + Math.sin(t * 6) * 1.5);
        ctx.quadraticCurveTo(26, hy - 20, 14, hy - 16);
        ctx.quadraticCurveTo(-6, hy - 18, -18, hy - 4); ctx.closePath(); fillStroke(ctx, '#ffd84a');
        ctx.strokeStyle = '#e0b52a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-18, hy - 22); ctx.quadraticCurveTo(8, hy - 30, 30, hy - 18); ctx.stroke();
        break;
      }
      case 'president': {
        ellipse(ctx, hx, hy, 23, 24, L.skin); shade(ctx, hx + 8, hy - 50, 60, 100);
        // round glasses
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
        circle(ctx, -6, hy - 2, 6); ctx.stroke(); circle(ctx, 12, hy - 2, 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, hy - 2); ctx.lineTo(6, hy - 2); ctx.stroke();
        ctx.fillStyle = OUT; circle(ctx, -5, hy - 2, 2); ctx.fill(); circle(ctx, 13, hy - 2, 2); ctx.fill();
        // neat moustache + smile
        ctx.beginPath(); ctx.moveTo(-4, hy + 8); ctx.quadraticCurveTo(5, hy + 3, 16, hy + 8); ctx.quadraticCurveTo(5, hy + 10, -4, hy + 8); fillStroke(ctx, '#222', 2);
        ctx.beginPath(); ctx.arc(6, hy + 11, 5, 0.2, Math.PI - 0.2); ctx.stroke();
        // karakul (Jinnah) cap
        ctx.beginPath(); ctx.moveTo(-21, hy - 12); ctx.lineTo(-18, hy - 32); ctx.lineTo(20, hy - 32); ctx.lineTo(22, hy - 12); ctx.closePath(); fillStroke(ctx, '#5d5d66');
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        for (let i = 0; i < 9; i++) { circle(ctx, -14 + (i % 5) * 7 + (i > 4 ? 3 : 0), hy - 26 + (i > 4 ? 8 : 0), 2.4); ctx.fill(); }
        break;
      }
      case 'scientist': {
        // wild hair behind head
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const a = Math.PI * 0.9 + (i / 14) * Math.PI * 1.25;
          const r = (i % 2 ? 26 : 40) + Math.sin(t * 8 + i) * 2;
          ctx.lineTo(hx + Math.cos(a) * r, hy - 4 + Math.sin(a) * r);
        }
        ctx.closePath(); fillStroke(ctx, '#f1f1f1');
        ellipse(ctx, hx, hy, 22, 24, L.skin); shade(ctx, hx + 8, hy - 50, 60, 100);
        // goggles on forehead
        ctx.fillStyle = '#5a4a3a'; ctx.fillRect(-22, hy - 16, 44, 5);
        circle(ctx, -7, hy - 14, 7, '#ffb703', 2.5); circle(ctx, 10, hy - 14, 7, '#ffb703', 2.5);
        // crazy eyes
        circle(ctx, -6, hy, 5.5, '#fff', 2); circle(ctx, 11, hy - 1, 7, '#fff', 2);
        ctx.fillStyle = OUT; circle(ctx, -5 + Math.sin(t * 5) * 1.5, hy, 2.2); ctx.fill(); circle(ctx, 12 + Math.cos(t * 4) * 2, hy - 1, 2.8); ctx.fill();
        // toothy grin
        ctx.beginPath(); ctx.moveTo(-6, hy + 9); ctx.lineTo(18, hy + 8); ctx.quadraticCurveTo(8, hy + 20, -6, hy + 9); fillStroke(ctx, '#fff', 2.5);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4, hy + 11); ctx.lineTo(16, hy + 10); ctx.stroke();
        break;
      }
      case 'alien': {
        // antennae
        const w = Math.sin(t * 4) * 4;
        ctx.strokeStyle = OUT; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-8, hy - 26); ctx.quadraticCurveTo(-14, hy - 40, -18 + w, hy - 48); ctx.moveTo(8, hy - 26); ctx.quadraticCurveTo(14, hy - 40, 18 - w, hy - 48); ctx.stroke();
        circle(ctx, -18 + w, hy - 48, 5, '#ff4fd8', 2.5); circle(ctx, 18 - w, hy - 48, 5, '#ff4fd8', 2.5);
        ellipse(ctx, hx, hy - 4, 28, 30, L.skin); shade(ctx, hx + 10, hy - 50, 60, 100);
        ellipse(ctx, -9, hy - 2, 8, 12, '#111', 2, -0.35); ellipse(ctx, 13, hy - 2, 8, 12, '#111', 2, 0.35);
        ctx.fillStyle = '#fff'; circle(ctx, -11, hy - 7, 2.5); ctx.fill(); circle(ctx, 11, hy - 7, 2.5); ctx.fill();
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(3, hy + 14, 4, 0.1, Math.PI - 0.1); ctx.stroke();
        break;
      }
    }
  }

  function drawTorso(ctx, id, L) {
    switch (id) {
      case 'president':
        rr(ctx, -19, -72, 38, 58, 9); fillStroke(ctx, L.suit); shade(ctx, 8, -80, 30, 80);
        ctx.fillStyle = '#d4a017'; for (let i = 0; i < 5; i++) { circle(ctx, 4, -64 + i * 9, 2.2); ctx.fill(); }
        rr(ctx, -6, -76, 20, 6, 3); fillStroke(ctx, L.suit, 2);
        break;
      case 'scientist':
        rr(ctx, -20, -72, 40, 56, 9); fillStroke(ctx, L.suit); shade(ctx, 9, -80, 30, 80, 0.1);
        ctx.fillStyle = '#5bd36e'; ctx.beginPath(); ctx.moveTo(-6, -72); ctx.lineTo(10, -72); ctx.lineTo(2, -52); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#c4cad3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(2, -52); ctx.lineTo(2, -18); ctx.stroke();
        rr(ctx, 6, -48, 9, 8, 2); fillStroke(ctx, '#e8edf3', 2);
        ctx.fillStyle = '#e63946'; ctx.fillRect(8, -52, 2, 6); ctx.fillStyle = '#457b9d'; ctx.fillRect(12, -53, 2, 7);
        break;
      default: {
        rr(ctx, -20, -72, 40, 44, 10); fillStroke(ctx, L.suit); shade(ctx, 9, -80, 30, 60);
        if (id === 'donny') {
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-6, -72); ctx.lineTo(12, -72); ctx.lineTo(3, -56); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(1, -70); ctx.lineTo(6, -70); ctx.lineTo(8, -22); ctx.lineTo(3, -16); ctx.lineTo(-1, -22); ctx.closePath(); fillStroke(ctx, '#e11d2e', 2);
        } else if (id === 'kim') {
          ctx.fillStyle = '#8d8d99'; for (let i = 0; i < 4; i++) { circle(ctx, 4, -64 + i * 10, 2); ctx.fill(); }
          ctx.strokeStyle = '#4a4a55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, -72); ctx.lineTo(4, -66); ctx.lineTo(16, -72); ctx.stroke();
        } else if (id === 'general') {
          // ridiculous medal wall
          const cols = ['#e63946', '#ffd23f', '#2a9d8f', '#457b9d', '#f4a261', '#9b5de5'];
          for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = cols[(r * 4 + c) % 6]; ctx.fillRect(-14 + c * 6, -66 + r * 5, 5, 4); }
          ctx.fillStyle = '#ffd23f'; for (let c = 0; c < 3; c++) { circle(ctx, -11 + c * 8, -42, 3, '#ffd23f', 1.5); }
          rr(ctx, -24, -73, 14, 6, 3); fillStroke(ctx, '#ffd23f', 2); rr(ctx, 10, -73, 14, 6, 3); fillStroke(ctx, '#ffd23f', 2);
        } else if (id === 'alien') {
          circle(ctx, 2, -56, 8, '#ff4fd8', 2.5);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Z', 2, -55.5);
        }
      }
    }
  }

  function drawLeg(ctx, L, a, front) {
    const hx = front ? 4 : -4, hy = -30;
    const ex = hx + dirX(a) * 26, ey = hy + dirY(a) * 26;
    limb(ctx, hx, hy, ex, ey, 11, L.pants);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(-a);
    ellipse(ctx, 5, 2, 10, 5.5, L.shoe, 2.5);
    ctx.restore();
  }

  function drawArm(ctx, L, a, withTool, tool) {
    const sx = 0, sy = -64;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(-a);
    if (withTool) drawTool(ctx, tool);
    limb(ctx, 0, 0, 0, 24, 10, L.sleeve);
    circle(ctx, 0, 27, 6, L.skin, 2.5);
    ctx.restore();
  }

  /**
   * drawCharacter(ctx, id, x, y, s, t, p)
   *  x,y = screen pos of feet; s = px per unit; t = time; p = launch progress or null
   */
  function drawCharacter(ctx, id, x, y, s, t, p = null) {
    const ch = NO.byId(NO.CHARACTERS, id);
    const L = LOOK[ch.id];
    const P = pose(ch.style, p, t);
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(P.bx, 1, 26 - Math.abs(P.by) * 0.3, 5, 0, 0, TAU); ctx.fill();
    ctx.translate(P.bx, P.by); ctx.rotate(P.lean);
    const twoHanded = ch.style === 'mallet' || ch.style === 'golf' || ch.style === 'cricket';
    drawArm(ctx, L, P.armB, false);
    drawLeg(ctx, L, P.legB, false);
    drawLeg(ctx, L, P.legF, true);
    drawTorso(ctx, ch.id, L);
    drawHead(ctx, ch.id, L, t, p);
    drawArm(ctx, L, P.armF, twoHanded || ch.style === 'ray', ch.style);
    ctx.restore();
  }

  /* =====================================================================
     BOMBS — local frame 100 units long, nose pointing +x
     ===================================================================== */
  /* NUKE ORBIT emblem: a little planet with a tilted ring and a bomb dot riding the ring. */
  function drawEmblem(ctx, x, y, r, planet, ring, bg, t = 0) {
    ctx.save(); ctx.translate(x, y);
    if (bg) { ctx.fillStyle = bg; circle(ctx, 0, 0, r); ctx.fill(); }
    const rx = r * 0.86, ry = r * 0.3, rot = -0.42;
    ctx.lineWidth = r * 0.13; ctx.strokeStyle = ring; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, rot, Math.PI, Math.PI * 2); ctx.stroke();     // back half
    ctx.fillStyle = planet; circle(ctx, 0, 0, r * 0.46); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; circle(ctx, -r * 0.15, -r * 0.15, r * 0.14); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, rot, 0, Math.PI); ctx.stroke();               // front half
    const a = t * 2.2;
    const px = Math.cos(a) * rx, py = Math.sin(a) * ry;
    const dx = px * Math.cos(rot) - py * Math.sin(rot), dy = px * Math.sin(rot) + py * Math.cos(rot);
    if (Math.sin(a) > 0 || Math.hypot(dx, dy) > r * 0.46) { ctx.fillStyle = ring; circle(ctx, dx, dy, r * 0.15); ctx.fill(); }
    ctx.restore();
  }

  function bombPalette(id, t) {
    switch (id) {
      case 'golden':    return { body: '#f7c948', dark: '#b8860b', fin: '#d4a017', band: '#fff3b0', sym: '#7a5a00', symBg: '#ffe680' };
      case 'christmas': return { body: '#d62828', dark: '#8d0f0f', fin: '#2a9d4f', band: '#ffffff', sym: '#2a9d4f', symBg: '#fff' };
      case 'neon':      return { body: '#15102a', dark: '#000', fin: '#1f1640', band: '#00f5ff', sym: '#ff2bd6', symBg: '#15102a', glow: '#00f5ff' };
      case 'rainbow':   return { body: `hsl(${(t * 120) % 360},90%,60%)`, dark: '#444', fin: `hsl(${(t * 120 + 180) % 360},90%,55%)`, band: '#fff', sym: '#222', symBg: '#fff' };
      case 'alienbomb': return { body: '#7ee36b', dark: '#2f8f3a', fin: '#8b5cf6', band: '#c4b5fd', sym: '#111', symBg: '#c6ffb8', glow: '#9dff8a' };
      default:          return { body: '#f4d03f', dark: '#9a7d0a', fin: '#4a4e5a', band: '#2b2d35', sym: '#1d1d1d', symBg: '#f4d03f' };
    }
  }

  function drawBomb(ctx, id, x, y, len, angle, t, squash = 0) {
    const C = bombPalette(id, t);
    const s = len / 100;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.scale(s * (1 + squash * 0.35), s * (1 - squash * 0.35));
    if (C.glow) { ctx.shadowColor = C.glow; ctx.shadowBlur = 18; }
    // fins
    ctx.beginPath(); ctx.moveTo(-28, -10); ctx.lineTo(-54, -30); ctx.lineTo(-58, -30); ctx.lineTo(-50, -4); ctx.closePath(); fillStroke(ctx, C.fin, 4);
    ctx.beginPath(); ctx.moveTo(-28, 10); ctx.lineTo(-54, 30); ctx.lineTo(-58, 30); ctx.lineTo(-50, 4); ctx.closePath(); fillStroke(ctx, C.fin, 4);
    rr(ctx, -56, -8, 22, 16, 4); fillStroke(ctx, C.fin, 4);
    // body
    ctx.beginPath(); ctx.ellipse(4, 0, 42, 28, 0, 0, TAU);
    if (id === 'golden') {
      const g = ctx.createLinearGradient(0, -28, 0, 28); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.45, '#f7c948'); g.addColorStop(1, '#a8740a');
      fillStroke(ctx, g, 4);
    } else if (id === 'rainbow') {
      ctx.save(); ctx.clip();
      for (let i = -6; i < 8; i++) { ctx.fillStyle = `hsl(${(i * 50 + t * 200) % 360},90%,60%)`; ctx.fillRect(i * 12 - 4, -30, 12, 60); }
      ctx.restore(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
    } else {
      fillStroke(ctx, C.body, 4);
    }
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.ellipse(4, 0, 42, 28, 0, 0, TAU); shade(ctx, -40, 8, 90, 30, 0.18);
    // shine
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(10, -15, 20, 6, -0.1, 0, TAU); ctx.fill();
    // band
    ctx.save(); ctx.beginPath(); ctx.ellipse(4, 0, 42, 28, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = C.band; ctx.fillRect(-22, -30, 9, 60);
    if (id === 'christmas') { ctx.fillStyle = '#fff'; for (let i = -1; i < 3; i++) { ctx.fillRect(i * 22 + 4, -30, 5, 60); } }
    ctx.restore();
    // nose cap
    ctx.beginPath(); ctx.arc(40, 0, 10, -Math.PI / 2, Math.PI / 2); ctx.closePath(); fillStroke(ctx, C.dark, 3);
    // emblem
    if (id === 'alienbomb') {
      ellipse(ctx, 14, 0, 12, 14, '#c6ffb8', 2.5);
      ellipse(ctx, 14, 2, 6, 9, '#111', 0); ctx.fillStyle = '#111'; ctx.fill();
      ctx.fillStyle = '#fff'; circle(ctx, 12, -2, 2); ctx.fill();
    } else {
      drawEmblem(ctx, 14, 0, 14, C.sym, C.sym, C.symBg, t);
    }
    if (id === 'christmas') {
      // bow on top
      ctx.save(); ctx.translate(-6, -27);
      ellipse(ctx, -7, -4, 8, 5, '#2a9d4f', 2.5, -0.4); ellipse(ctx, 7, -4, 8, 5, '#2a9d4f', 2.5, 0.4);
      circle(ctx, 0, -2, 4, '#ffd23f', 2.5); ctx.restore();
    }
    if (id === 'golden') {
      const tw = (Math.sin(t * 6) + 1) / 2;
      ctx.fillStyle = `rgba(255,255,255,${0.4 + tw * 0.6})`; star(ctx, 26, -14, 6 + tw * 3, 2);
    }
    if (id === 'neon') {
      ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 12; ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(4, 0, 37, 23, 0, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function star(ctx, x, y, R, r) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const rad = i % 2 ? r : R; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
    ctx.closePath(); ctx.fill();
  }

  /* =====================================================================
     ENVIRONMENTS
     view: { W, H, camX, camY, ppm, sx(wx), sy(wy), t, zoom }
     ===================================================================== */
  /* Flat vector environments: stacked silhouette layers with atmospheric colour steps. */
  const ENV_STYLE = {
    country: {
      sky: ['#2f62d6', '#79b2ff'], sun: '#fff4c9', glow: 'rgba(255,245,200,.35)', streak: 'rgba(255,255,255,.16)', cloud: 'rgba(255,255,255,.55)',
      layers: [
        { f: 0.04, c: '#6690ea', type: 'peaks', amp: 13, freq: 0.07, seed: 1 },
        { f: 0.08, c: '#5079dc', type: 'peaks', amp: 9, freq: 0.1, seed: 2 },
        { f: 0.12, c: '#3f66cf', type: 'water', line: 'rgba(255,255,255,.35)' },
        { f: 0.28, c: '#2f8a3c', type: 'hills', amp: 2.4, freq: 0.12, seed: 3, tree: '#1f6a2c' },
      ],
      ground: '#3fa346', tuft: '#8be45f', soil: '#2c7a33', soil2: '#24692b',
    },
    desert: {
      sky: ['#ff7a45', '#ffd59a'], sun: '#fff1c2', glow: 'rgba(255,240,190,.4)', streak: 'rgba(255,255,255,.18)', cloud: 'rgba(255,240,220,.55)',
      layers: [
        { f: 0.04, c: '#f6a774', type: 'mesas', amp: 10, freq: 0.05, seed: 4 },
        { f: 0.09, c: '#ec8f5c', type: 'mesas', amp: 6, freq: 0.08, seed: 5 },
        { f: 0.28, c: '#dc7a45', type: 'hills', amp: 2.2, freq: 0.09, seed: 6, cactus: '#a9552c' },
      ],
      ground: '#eaa65e', tuft: '#c9853f', soil: '#d48f4b', soil2: '#c27f3e',
    },
    snow: {
      sky: ['#4b6fc4', '#b9d4f7'], sun: '#ffffff', glow: 'rgba(255,255,255,.35)', streak: 'rgba(255,255,255,.2)', cloud: 'rgba(255,255,255,.6)',
      layers: [
        { f: 0.04, c: '#a9bfe8', type: 'peaks', amp: 16, freq: 0.06, seed: 7, cap: '#ffffff' },
        { f: 0.09, c: '#8aa5db', type: 'peaks', amp: 11, freq: 0.09, seed: 8, cap: '#eef4ff' },
        { f: 0.28, c: '#dfeafb', type: 'hills', amp: 2.4, freq: 0.12, seed: 9, tree: '#4f6ea6' },
      ],
      ground: '#f3f8ff', tuft: '#cfdff4', soil: '#c9daf0', soil2: '#b5c9e6',
    },
    city: {
      sky: ['#24164f', '#7c3a8c', '#e0708a'], sun: '#ffd7a0', glow: 'rgba(255,200,160,.3)', streak: 'rgba(255,190,220,.14)', cloud: 'rgba(255,200,230,.35)',
      layers: [
        { f: 0.05, c: '#5a3a8f', type: 'city', w: 3.2, h: 9, seed: 1, lit: 'rgba(255,220,140,.55)' },
        { f: 0.12, c: '#432a78', type: 'city', w: 4, h: 6, seed: 2, lit: 'rgba(255,225,150,.75)' },
        { f: 0.3, c: '#2c1a57', type: 'city', w: 5, h: 3.5, seed: 3, lit: '#ffe38f' },
      ],
      ground: '#59597a', tuft: '#6d6d92', soil: '#3a3a52', soil2: '#2f2f45',
    },
    ocean: {
      sky: ['#1f8fe0', '#9fdcff'], sun: '#fff6c8', glow: 'rgba(255,250,210,.4)', streak: 'rgba(255,255,255,.2)', cloud: 'rgba(255,255,255,.6)',
      layers: [
        { f: 0.03, c: '#6ab9e8', type: 'islands', amp: 5, freq: 0.04, seed: 10 },
        { f: 0.06, c: '#2f9be0', type: 'water', line: 'rgba(255,255,255,.4)', top: 0 },
        { f: 0.2, c: '#2386d2', type: 'water', line: 'rgba(255,255,255,.3)', top: -0.6 },
      ],
      ground: '#1e88e5', tuft: '#fff', soil: '#1565c0', soil2: '#0d47a1',
    },
    space: {
      sky: ['#07041a', '#2a1666'], sun: '#fff', glow: 'rgba(170,140,255,.25)', streak: 'rgba(180,150,255,.08)', cloud: 'rgba(200,180,255,.3)',
      layers: [
        { f: 0.05, c: '#3b2d78', type: 'peaks', amp: 8, freq: 0.06, seed: 11 },
        { f: 0.1, c: '#2f2463', type: 'hills', amp: 4, freq: 0.08, seed: 12 },
        { f: 0.28, c: '#251c50', type: 'hills', amp: 2, freq: 0.15, seed: 13, crater: '#1c153f' },
      ],
      ground: '#77739b', tuft: '#8f8bb5', soil: '#5c5880', soil2: '#4e4a70',
    },
  };

  function layerBase(view, factor) {
    const g0 = view.H * view.groundFrac;
    return g0 + (view.sy(0) - g0) * factor;
  }

  // height function for a layer, in layer-metres
  function layerHeight(L, x) {
    switch (L.type) {
      case 'peaks': {
        const k = x * L.freq, i = Math.floor(k), f = k - i;
        const h = L.amp * (0.45 + hash(i * 3.1 + L.seed) * 0.55);
        const tri = 1 - Math.abs(f - 0.5) * 2;
        return h * tri + noise1(x * 0.6 + L.seed) * 0.6;
      }
      case 'mesas': {
        const n = noise1(x * L.freq + L.seed);
        return n > 0.58 ? L.amp : n > 0.45 ? L.amp * 0.45 : L.amp * 0.12;
      }
      case 'islands': {
        const n = noise1(x * L.freq + L.seed);
        return n > 0.62 ? (n - 0.62) * L.amp * 6 : 0;
      }
      default: return 0.4 + noise1(x * L.freq + L.seed) * L.amp;   // hills
    }
  }

  function silhouette(ctx, view, L, baseY, step = 6) {
    const off = view.camX * view.ppmBG * L.f;
    ctx.beginPath(); ctx.moveTo(-10, view.H + 10);
    for (let sx = -10; sx <= view.W + step + 10; sx += step) {
      ctx.lineTo(sx, baseY - layerHeight(L, (sx + off) / view.ppmBG) * view.ppmBG);
    }
    ctx.lineTo(view.W + 20, view.H + 10); ctx.closePath();
    ctx.fillStyle = L.c; ctx.fill();
  }

  function layerItems(view, factor, spacing, fn) {
    const off = view.camX * view.ppmBG * factor;
    const l0 = Math.floor((off - 200) / view.ppmBG / spacing), l1 = Math.ceil((off + view.W + 200) / view.ppmBG / spacing);
    for (let i = l0; i <= l1; i++) fn(i, i * spacing * view.ppmBG - off, i * spacing);
  }

  function pill(ctx, x, y, w, h) { rr(ctx, x, y, w, h, h / 2); ctx.fill(); }

  function drawSky(ctx, env, view) {
    const S = ENV_STYLE[env];
    const { W, H, t } = view;
    const g = ctx.createLinearGradient(0, 0, 0, H * view.groundFrac);
    S.sky.forEach((c, i) => g.addColorStop(i / (S.sky.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (env !== 'space' && view.camY > 5) {
      ctx.fillStyle = `rgba(8,12,60,${clamp(view.camY / 600, 0, 0.5)})`; ctx.fillRect(0, 0, W, H);
    }
    if (env === 'space' || env === 'city') {
      const n = env === 'space' ? 170 : 45;
      for (let i = 0; i < n; i++) {
        const px = ((hash(i) * W * 3 - view.camX * view.ppmBG * 0.02) % W + W) % W;
        const py = hash(i + 99) * H * (env === 'space' ? 1 : 0.4);
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
        const s = hash(i + 7) > 0.85 ? 3 : 1.6;
        ctx.fillStyle = `rgba(255,255,255,${(env === 'space' ? 0.45 : 0.25) + tw * 0.5})`;
        ctx.fillRect(px, py, s, s);
      }
    }
    // sun / moon with flat glow rings
    const sx = W * 0.8, sy = H * (env === 'city' ? 0.42 : 0.17), sr = Math.max(22, H * 0.055);
    if (env === 'space') {
      const ex = W * 0.8 - (view.camX * view.ppmBG * 0.01) % (W * 1.6), ey = H * 0.22, er = H * 0.1;
      ctx.fillStyle = S.glow; circle(ctx, ex, ey, er * 1.35); ctx.fill();
      ctx.fillStyle = '#3b82f6'; circle(ctx, ex, ey, er); ctx.fill();
      ctx.fillStyle = '#4ade80';
      ellipse(ctx, ex - er * 0.25, ey - er * 0.15, er * 0.38, er * 0.24); ctx.fill();
      ellipse(ctx, ex + er * 0.35, ey + er * 0.35, er * 0.28, er * 0.15); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,40,.25)'; ctx.beginPath(); ctx.arc(ex, ey, er, -Math.PI / 2, Math.PI / 2); ctx.fill();
      const px = W * 0.2 - (view.camX * view.ppmBG * 0.03) % (W * 1.8) + W * 0.9, py = H * 0.45;
      ctx.fillStyle = '#f59e5b'; circle(ctx, px, py, H * 0.05); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,170,.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(px, py, H * 0.09, H * 0.022, -0.3, 0, TAU); ctx.stroke();
    } else {
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 0.05);
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(H * 0.9, -H * 0.07); ctx.lineTo(H * 0.9, H * 0.07); ctx.closePath(); if (i % 2) ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = S.glow; circle(ctx, sx, sy, sr * 2.1); ctx.fill(); circle(ctx, sx, sy, sr * 1.5); ctx.fill();
      ctx.fillStyle = S.sun; circle(ctx, sx, sy, sr); ctx.fill();
    }
    // little flocks of birds
    if (env === 'country' || env === 'ocean' || env === 'snow') {
      ctx.strokeStyle = 'rgba(30,30,80,.45)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let f = 0; f < 2; f++) {
        const span = W + 300;
        const fx = ((hash(f * 17) * span + t * (25 + f * 10) - view.camX * view.ppmBG * 0.06) % span + span) % span - 150;
        const fy = H * (0.15 + f * 0.12);
        for (let k = 0; k < 4; k++) {
          const bx = fx + k * 22 - (k % 2) * 8, by = fy + (k % 2) * 12 + k * 3, fl = Math.sin(t * 9 + k + f) * 4;
          ctx.beginPath(); ctx.moveTo(bx - 7, by - fl); ctx.quadraticCurveTo(bx - 3, by - 3, bx, by); ctx.quadraticCurveTo(bx + 3, by - 3, bx + 7, by - fl); ctx.stroke();
        }
      }
    }
    // long flat cloud streaks
    const off = view.camX * view.ppmBG * 0.03 + t * 6;
    for (let i = 0; i < 9; i++) {
      const span = W + 400;
      const w = 80 + hash(i * 5.5) * 220, h = 12 + hash(i * 2.7) * 14;
      const x = ((hash(i * 3) * span - off * (0.6 + hash(i) * 0.6)) % span + span) % span - 200;
      const y = H * (0.06 + hash(i * 9.1) * 0.38) + (view.sy(0) - H * view.groundFrac) * 0.03;
      ctx.fillStyle = S.streak; pill(ctx, x, y, w, h);
      if (hash(i * 4.4) > 0.5) pill(ctx, x + w * 0.3, y + h * 1.35, w * 0.6, h);
    }
  }

  function drawBackLayers(ctx, env, view) {
    const S = ENV_STYLE[env];
    S.layers.forEach((L, li) => {
      const base = layerBase(view, L.f);
      if (li === S.layers.length - 1) {
        // atmospheric haze between distant layers and the near hills
        const hz = ctx.createLinearGradient(0, base - 9 * view.ppmBG, 0, base);
        hz.addColorStop(0, 'rgba(255,255,255,0)'); hz.addColorStop(1, S.haze || 'rgba(255,255,255,.28)');
        ctx.fillStyle = hz; ctx.fillRect(0, base - 9 * view.ppmBG, view.W, 9 * view.ppmBG);
      }
      if (L.type === 'water') {
        const top = base - (1.4 + (L.top || 0)) * view.ppmBG;
        ctx.fillStyle = L.c; ctx.fillRect(0, top, view.W, view.H - top + 10);
        ctx.fillStyle = L.line;
        const off = view.camX * view.ppmBG * L.f;
        layerItems(view, L.f, 3, (i, sx) => {
          const y = top + (0.25 + hash(i * 2.3) * 1.0) * view.ppmBG;
          if (y < base) pill(ctx, sx + hash(i) * 30 + Math.sin(view.t + i) * 4, y, 14 + hash(i * 7) * 34, 3);
        });
        void off;
        return;
      }
      if (L.type === 'city') {
        layerItems(view, L.f, L.w, (i, sx) => {
          const w = L.w * view.ppmBG * (0.72 + hash(i * 3 + L.seed) * 0.26);
          const h = view.ppmBG * (2 + hash(i * 7 + L.seed) * L.h);
          ctx.fillStyle = L.c; ctx.fillRect(sx, base - h, w, h + 2);
          if (hash(i + L.seed * 5) > 0.7) ctx.fillRect(sx + w * 0.45, base - h - view.ppmBG, 3, view.ppmBG);
          const ws = Math.max(3, view.ppmBG * 0.32);
          ctx.fillStyle = L.lit;
          for (let yy = base - h + ws; yy < base - ws * 1.5; yy += ws * 1.7)
            for (let xx = sx + ws * 0.6; xx < sx + w - ws; xx += ws * 1.6)
              if (hash(xx * 0.13 + yy * 0.71 + i) > 0.5) ctx.fillRect(xx, yy, ws * 0.7, ws * 0.85);
        });
        return;
      }
      silhouette(ctx, view, L, base, L.type === 'peaks' ? 4 : 6);
      if (L.cap) {
        // flat snow caps on each peak
        ctx.fillStyle = L.cap;
        const segW = 1 / L.freq;
        layerItems(view, L.f, segW, (i, sx, lx) => {
          const ax = sx + segW * 0.5 * view.ppmBG;
          const h = layerHeight(L, lx + segW * 0.5) * view.ppmBG;
          const ay = base - h, q = 0.3;
          const hw = segW * 0.5 * view.ppmBG * q;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + hw, ay + h * q);
          ctx.lineTo(ax + hw * 0.4, ay + h * q * 0.75); ctx.lineTo(ax, ay + h * q); ctx.lineTo(ax - hw * 0.4, ay + h * q * 0.75);
          ctx.lineTo(ax - hw, ay + h * q); ctx.closePath(); ctx.fill();
        });
      }
      if (L.tree) {
        ctx.fillStyle = L.tree;
        layerItems(view, L.f, 1.1, (i, sx, lx) => {
          if (hash(i * 2.3 + L.seed) > 0.55) return;
          const y = base - layerHeight(L, lx) * view.ppmBG + 3, h = view.ppmBG * (0.9 + hash(i) * 0.9);
          ctx.beginPath(); ctx.moveTo(sx, y - h); ctx.lineTo(sx + h * 0.32, y); ctx.lineTo(sx - h * 0.32, y); ctx.closePath(); ctx.fill();
        });
      }
      if (L.cactus) {
        ctx.fillStyle = L.cactus;
        layerItems(view, L.f, 2.5, (i, sx, lx) => {
          if (hash(i * 3.9 + L.seed) > 0.35) return;
          const y = base - layerHeight(L, lx) * view.ppmBG + 2, h = view.ppmBG * (1 + hash(i) * 0.8), w = h * 0.2;
          pill(ctx, sx - w / 2, y - h, w, h + 2); pill(ctx, sx - w * 2.2, y - h * 0.7, w * 0.8, h * 0.35); pill(ctx, sx - w * 2.2, y - h * 0.45, w * 2.2, w * 0.8);
          pill(ctx, sx + w * 1.3, y - h * 0.85, w * 0.8, h * 0.35); pill(ctx, sx, y - h * 0.58, w * 2.1, w * 0.8);
        });
      }
      if (L.crater) {
        ctx.fillStyle = L.crater;
        layerItems(view, L.f, 4, (i, sx, lx) => {
          if (hash(i * 5.1) > 0.5) return;
          const y = base - layerHeight(L, lx) * view.ppmBG + view.ppmBG * 0.8;
          ellipse(ctx, sx, y, view.ppmBG * 0.9, view.ppmBG * 0.22); ctx.fill();
        });
      }
    });
  }

  /* ---------------- world-space high-altitude decoration ---------------- */
  function drawSkyDecor(ctx, env, view) {
    const S = ENV_STYLE[env];
    const spacing = 70;
    const x0 = Math.floor((view.camX - view.W / view.ppm) / spacing) - 1;
    const x1 = Math.ceil((view.camX + view.W / view.ppm) / spacing) + 1;
    for (let i = x0; i <= x1; i++) {
      if (i < 1) continue;
      for (let k = 0; k < 2; k++) {
        if (hash(i * 13.3 + k * 7.1) > 0.7) continue;
        const wx = i * spacing + hash(i + k * 3) * spacing;
        const alt = 35 + hash(i * 2.2 + k) * (k ? 600 : 220);
        const sx = view.sx(wx), sy = view.sy(alt);
        const sc = view.ppm * (0.12 + hash(i + k) * 0.1);
        if (sy < -200 || sy > view.H + 100 || sx < -400 || sx > view.W + 200) continue;
        if (env === 'space') {
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(view.t * 0.3 + i);
          ctx.fillStyle = '#6f6596'; ctx.beginPath();
          for (let j = 0; j < 9; j++) { const a = j / 9 * TAU, r2 = sc * 18 * (0.75 + hash(i * 9 + j) * 0.4); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); }
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#574e7c'; circle(ctx, sc * 4, -sc * 3, sc * 4); ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = S.cloud;
          pill(ctx, sx, sy, sc * 80, sc * 14); pill(ctx, sx + sc * 22, sy - sc * 12, sc * 46, sc * 14);
        }
      }
    }
  }

  /* ------------------------------ ground ------------------------------- */
  function drawGround(ctx, env, view) {
    const S = ENV_STYLE[env];
    const { W, H, t } = view;
    const gy = view.sy(0);
    if (gy > H + 50) return;
    const ppm = view.ppm;
    if (env === 'ocean') {
      ctx.beginPath(); ctx.moveTo(0, H + 10);
      for (let sx = 0; sx <= W + 8; sx += 8) {
        const wx = view.camX + (sx - view.W * view.anchorX) / ppm;
        ctx.lineTo(sx, gy + Math.sin(wx * 0.5 + t * 2.5) * 0.18 * ppm + Math.sin(wx * 1.3 - t * 3) * 0.08 * ppm);
      }
      ctx.lineTo(W, H + 10); ctx.closePath();
      ctx.fillStyle = '#1b7fd6'; ctx.fill();
      ctx.fillStyle = '#156cc0'; ctx.fillRect(0, gy + Math.max(14, ppm * 0.9), W, H);
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      const step = 4, k0 = Math.floor((view.camX - W / ppm) / step);
      for (let k = k0; k < k0 + W / ppm / step * 2 + 4; k++) {
        const sx = view.sx(k * step + hash(k) * 2), d = 0.4 + hash(k * 3) * 2.5;
        pill(ctx, sx, gy + d * ppm, ppm * (0.6 + hash(k) * 1.4), Math.max(3, ppm * 0.08));
      }
      return;
    }
    const topH = Math.max(12, ppm * 0.7);
    ctx.fillStyle = S.soil; ctx.fillRect(0, gy, W, H - gy + 10);
    ctx.fillStyle = S.ground; ctx.fillRect(0, gy, W, topH);
    const stripe = 1.6;
    const k0 = Math.floor((view.camX - W / ppm) / stripe) - 1, kN = Math.ceil(W / ppm / stripe) * 2 + 4;
    for (let k = k0; k < k0 + kN; k++) {
      const sx = view.sx(k * stripe);
      if (sx > W + 20) break;
      if (sx < -stripe * ppm - 20) continue;
      const r = hash(k * 1.91);
      // soil specks
      ctx.fillStyle = S.soil2;
      pill(ctx, sx + hash(k) * stripe * ppm, gy + topH + (0.4 + hash(k * 3) * 2.2) * ppm, ppm * 0.5, Math.max(3, ppm * 0.14));
      switch (env) {
        case 'country': case 'desert': case 'snow': {
          if (r > (env === 'country' ? 0.75 : 0.35)) break;
          // grass-blade tuft: cluster of rounded vertical bars
          ctx.fillStyle = S.tuft;
          const n = 3 + Math.floor(hash(k * 4.4) * 4), bx = sx + hash(k * 5) * stripe * ppm;
          const bw = Math.max(2, ppm * 0.07);
          for (let j = 0; j < n; j++) {
            const bh = ppm * (0.18 + hash(k * 7 + j) * 0.32);
            pill(ctx, bx + j * bw * 1.8, gy + topH * 0.35 - bh, bw, bh + bw);
          }
          break;
        }
        case 'city':
          ctx.fillStyle = '#ffd23f';
          if (k % 2 === 0) pill(ctx, sx, gy + topH + ppm * 0.9, stripe * ppm * 0.55, Math.max(3, ppm * 0.12));
          ctx.fillStyle = S.tuft; ctx.fillRect(sx, gy, Math.max(1, ppm * 0.05), topH);
          break;
        case 'space':
          if (r < 0.4) {
            ctx.fillStyle = S.soil2;
            ellipse(ctx, sx + hash(k) * stripe * ppm, gy + topH * 0.55, ppm * (0.3 + hash(k * 2) * 0.6), ppm * 0.1); ctx.fill();
          }
          break;
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(0, gy + topH, W, Math.max(3, ppm * 0.1));
  }

  function drawCloud(ctx, x, y, s, color) { ctx.fillStyle = color; pill(ctx, x, y, 90 * s, 18 * s); pill(ctx, x + 25 * s, y - 15 * s, 50 * s, 18 * s); }

  /* ------------------------------ props -------------------------------- */
  const PROPS = {
    country: ['tree', 'tree', 'fence', 'cow', 'barn', 'hay', 'flowers', 'tree'],
    desert:  ['cactus', 'cactus', 'rock', 'skull', 'tumbleweed', 'cactus', 'oilpump'],
    snow:    ['pine', 'pine', 'snowman', 'igloo', 'pine', 'rock'],
    city:    ['lamp', 'car', 'hydrant', 'billboard', 'lamp', 'cone', 'car'],
    ocean:   ['buoy', 'shark', 'duck', 'lighthouse', 'buoy', 'island'],
    space:   ['flag', 'rover', 'crystal', 'rock', 'dish', 'greenie'],
  };

  function drawProps(ctx, env, view, startX) {
    const spacing = 11;
    const list = PROPS[env];
    const i0 = Math.floor((view.camX - view.W * view.anchorX / view.ppm) / spacing) - 2;
    const i1 = Math.ceil((view.camX + view.W / view.ppm) / spacing) + 2;
    for (let i = i0; i <= i1; i++) {
      const wx = i * spacing + hash(i * 1.37) * spacing * 0.6;
      if (wx < startX + 6) continue;
      if (hash(i * 3.71 + env.length) > 0.62) continue;
      const kind = list[Math.floor(hash(i * 9.1) * list.length)];
      drawProp(ctx, kind, view.sx(wx), view.sy(0), view.ppm, view.t, i);
    }
  }

  function drawProp(ctx, kind, x, y, m, t, seed) {
    // m = px per metre
    if (x < -m * 12 || x > ctx.canvas.width + m * 12) return;
    const lw = Math.max(1.2, m * 0.07);
    ctx.save(); ctx.translate(x, y);
    switch (kind) {
      case 'tree': {
        const h = m * (3 + hash(seed) * 2);
        rr(ctx, -m * 0.25, -h * 0.55, m * 0.5, h * 0.56, m * 0.1); fillStroke(ctx, '#8b5a2b', lw);
        circle(ctx, 0, -h * 0.75, h * 0.32, '#3fa34d', lw); circle(ctx, -h * 0.2, -h * 0.6, h * 0.22, '#4cb85a', lw); circle(ctx, h * 0.22, -h * 0.62, h * 0.2, '#45ad53', lw);
        if (hash(seed * 2) > 0.5) { ctx.fillStyle = '#e63946'; [[0.1, 0.8], [-0.15, 0.6], [0.25, 0.6]].forEach(([a, b]) => { circle(ctx, a * h, -b * h, m * 0.14); ctx.fill(); }); }
        break;
      }
      case 'fence':
        ctx.fillStyle = '#f1e3c6'; ctx.strokeStyle = OUT; ctx.lineWidth = lw;
        for (let i = 0; i < 4; i++) { rr(ctx, i * m * 1.2, -m * 1.3, m * 0.25, m * 1.3, m * 0.08); fillStroke(ctx, '#f1e3c6', lw); }
        rr(ctx, -m * 0.1, -m * 1.0, m * 3.9, m * 0.2, 2); fillStroke(ctx, '#f1e3c6', lw);
        rr(ctx, -m * 0.1, -m * 0.55, m * 3.9, m * 0.2, 2); fillStroke(ctx, '#f1e3c6', lw);
        break;
      case 'cow': {
        const b = Math.sin(t * 3 + seed) * m * 0.05;
        ctx.fillStyle = '#fff';
        [[-0.9, 0], [-0.5, 0], [0.5, 0], [0.9, 0]].forEach(([lx]) => { rr(ctx, lx * m, -m * 0.8, m * 0.2, m * 0.8, 2); fillStroke(ctx, '#fff', lw); });
        ellipse(ctx, 0, -m * 1.1 + b, m * 1.3, m * 0.6, '#fff', lw);
        ctx.fillStyle = '#222'; ellipse(ctx, -m * 0.4, -m * 1.2 + b, m * 0.35, m * 0.25); ctx.fill(); ellipse(ctx, m * 0.5, -m * 0.95 + b, m * 0.25, m * 0.2); ctx.fill();
        ellipse(ctx, m * 1.35, -m * 1.4 + b, m * 0.45, m * 0.38, '#fff', lw);
        ellipse(ctx, m * 1.6, -m * 1.3 + b, m * 0.22, m * 0.18, '#f7a8b8', lw);
        ctx.fillStyle = '#222'; circle(ctx, m * 1.35, -m * 1.5 + b, m * 0.06); ctx.fill();
        break;
      }
      case 'barn':
        rr(ctx, -m * 2.2, -m * 3.2, m * 4.4, m * 3.2, 2); fillStroke(ctx, '#c1121f', lw);
        ctx.beginPath(); ctx.moveTo(-m * 2.6, -m * 3.1); ctx.lineTo(0, -m * 4.8); ctx.lineTo(m * 2.6, -m * 3.1); ctx.closePath(); fillStroke(ctx, '#7a0b14', lw);
        rr(ctx, -m * 0.8, -m * 1.9, m * 1.6, m * 1.9, 2); fillStroke(ctx, '#f1e3c6', lw);
        ctx.strokeStyle = OUT; ctx.beginPath(); ctx.moveTo(-m * 0.8, -m * 1.9); ctx.lineTo(m * 0.8, 0); ctx.moveTo(m * 0.8, -m * 1.9); ctx.lineTo(-m * 0.8, 0); ctx.stroke();
        break;
      case 'hay':
        ellipse(ctx, 0, -m * 0.6, m * 0.9, m * 0.6, '#f2c14e', lw);
        ctx.strokeStyle = '#c99a2e'; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(0, -m * 0.6, m * 0.35, 0, TAU); ctx.stroke();
        break;
      case 'flowers':
        for (let i = 0; i < 5; i++) {
          const fx = (i - 2) * m * 0.35, fh = m * (0.4 + hash(seed + i) * 0.3);
          ctx.strokeStyle = '#2d7a2d'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, -fh); ctx.stroke();
          circle(ctx, fx, -fh, m * 0.13, ['#ff6b6b', '#ffd23f', '#c77dff', '#fff'][i % 4], lw * 0.7);
        }
        break;
      case 'cactus': {
        const h = m * (2 + hash(seed) * 1.6);
        rr(ctx, -m * 0.35, -h, m * 0.7, h, m * 0.35); fillStroke(ctx, '#2f9e44', lw);
        rr(ctx, -m * 1.1, -h * 0.75, m * 0.45, h * 0.35, m * 0.22); fillStroke(ctx, '#2f9e44', lw);
        rr(ctx, -m * 1.1, -h * 0.45, m * 0.9, m * 0.4, m * 0.2); fillStroke(ctx, '#2f9e44', lw);
        rr(ctx, m * 0.6, -h * 0.85, m * 0.45, h * 0.35, m * 0.22); fillStroke(ctx, '#2f9e44', lw);
        rr(ctx, m * 0.2, -h * 0.55, m * 0.85, m * 0.4, m * 0.2); fillStroke(ctx, '#2f9e44', lw);
        if (hash(seed * 3) > 0.5) circle(ctx, 0, -h, m * 0.2, '#ff70a6', lw);
        break;
      }
      case 'rock':
        ctx.beginPath(); ctx.moveTo(-m * 1.1, 0); ctx.lineTo(-m * 0.8, -m * 0.8); ctx.lineTo(0, -m * 1.1); ctx.lineTo(m * 0.9, -m * 0.6); ctx.lineTo(m * 1.1, 0); ctx.closePath();
        fillStroke(ctx, '#9a8c7e', lw);
        break;
      case 'skull':
        circle(ctx, 0, -m * 0.45, m * 0.45, '#f5f0e1', lw);
        ctx.fillStyle = OUT; circle(ctx, -m * 0.15, -m * 0.5, m * 0.1); ctx.fill(); circle(ctx, m * 0.15, -m * 0.5, m * 0.1); ctx.fill();
        break;
      case 'tumbleweed': {
        const roll = (t * 1.5 + seed) % 10;
        ctx.translate(roll * m * 0.6, -m * 0.6 - Math.abs(Math.sin(t * 4 + seed)) * m * 0.4);
        ctx.rotate(t * 3);
        ctx.strokeStyle = '#a5732f'; ctx.lineWidth = lw;
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(0, 0, m * 0.6, m * 0.3, i, 0, TAU); ctx.stroke(); }
        break;
      }
      case 'oilpump': {
        rr(ctx, -m * 1.2, -m * 0.3, m * 2.4, m * 0.3, 2); fillStroke(ctx, '#444', lw);
        ctx.beginPath(); ctx.moveTo(-m * 0.5, -m * 0.3); ctx.lineTo(0, -m * 2); ctx.lineTo(m * 0.5, -m * 0.3); ctx.strokeStyle = OUT; ctx.lineWidth = lw * 1.5; ctx.stroke();
        ctx.save(); ctx.translate(0, -m * 2); ctx.rotate(Math.sin(t * 2 + seed) * 0.3);
        rr(ctx, -m * 1.6, -m * 0.2, m * 3, m * 0.4, 3); fillStroke(ctx, '#ffb703', lw);
        rr(ctx, m * 1.2, -m * 0.4, m * 0.5, m * 0.9, 3); fillStroke(ctx, '#ffb703', lw);
        ctx.restore();
        break;
      }
      case 'pine': {
        const h = m * (3.5 + hash(seed) * 2.5);
        rr(ctx, -m * 0.2, -m * 0.8, m * 0.4, m * 0.8, 2); fillStroke(ctx, '#6b4423', lw);
        for (let i = 0; i < 3; i++) {
          const y0 = -m * 0.6 - i * h * 0.25, w = h * (0.38 - i * 0.08);
          ctx.beginPath(); ctx.moveTo(-w, y0); ctx.lineTo(0, y0 - h * 0.42); ctx.lineTo(w, y0); ctx.closePath(); fillStroke(ctx, '#2d6a4f', lw);
          ctx.beginPath(); ctx.moveTo(-w * 0.35, y0 - h * 0.27); ctx.lineTo(0, y0 - h * 0.42); ctx.lineTo(w * 0.35, y0 - h * 0.27); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
        }
        break;
      }
      case 'snowman':
        circle(ctx, 0, -m * 0.7, m * 0.7, '#fff', lw); circle(ctx, 0, -m * 1.75, m * 0.5, '#fff', lw); circle(ctx, 0, -m * 2.5, m * 0.36, '#fff', lw);
        ctx.fillStyle = OUT; circle(ctx, -m * 0.12, -m * 2.58, m * 0.05); ctx.fill(); circle(ctx, m * 0.12, -m * 2.58, m * 0.05); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -m * 2.48); ctx.lineTo(m * 0.5, -m * 2.42); ctx.lineTo(0, -m * 2.38); ctx.fillStyle = '#ff8c42'; ctx.fill();
        rr(ctx, -m * 0.35, -m * 3.2, m * 0.7, m * 0.5, 2); fillStroke(ctx, '#222', lw); rr(ctx, -m * 0.5, -m * 2.78, m * 1.0, m * 0.12, 2); fillStroke(ctx, '#222', lw);
        ctx.fillStyle = '#e63946'; ctx.fillRect(-m * 0.45, -m * 2.2, m * 0.9, m * 0.18);
        break;
      case 'igloo':
        ctx.beginPath(); ctx.arc(0, 0, m * 1.6, Math.PI, 0); ctx.closePath(); fillStroke(ctx, '#eaf4ff', lw);
        ctx.beginPath(); ctx.arc(m * 1.2, 0, m * 0.6, Math.PI, 0); ctx.closePath(); fillStroke(ctx, '#2b3a55', lw);
        ctx.strokeStyle = '#b7cde6'; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(0, 0, m * 1.05, Math.PI, Math.PI * 1.7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, m * 0.5, Math.PI, Math.PI * 1.6); ctx.stroke();
        break;
      case 'lamp': {
        rr(ctx, -m * 0.1, -m * 4, m * 0.2, m * 4, 2); fillStroke(ctx, '#3a3a48', lw);
        rr(ctx, -m * 0.1, -m * 4.1, m * 1.0, m * 0.18, 2); fillStroke(ctx, '#3a3a48', lw);
        const g = ctx.createRadialGradient(m * 0.8, -m * 3.85, 1, m * 0.8, -m * 3.85, m * 2);
        g.addColorStop(0, 'rgba(255,230,140,.6)'); g.addColorStop(1, 'rgba(255,230,140,0)');
        ctx.fillStyle = g; ctx.fillRect(-m * 1.5, -m * 6, m * 4.5, m * 4.5);
        ellipse(ctx, m * 0.8, -m * 3.85, m * 0.25, m * 0.12, '#fff3b0', lw);
        break;
      }
      case 'car': {
        const col = ['#e63946', '#ffb703', '#3a86ff', '#8338ec', '#06d6a0'][Math.floor(hash(seed * 5) * 5)];
        rr(ctx, -m * 2, -m * 1.2, m * 4, m * 0.8, m * 0.3); fillStroke(ctx, col, lw);
        rr(ctx, -m * 1.2, -m * 1.9, m * 2.2, m * 0.8, m * 0.3); fillStroke(ctx, col, lw);
        ctx.fillStyle = '#bde0fe'; ctx.fillRect(-m * 1.0, -m * 1.75, m * 0.85, m * 0.5); ctx.fillRect(0, -m * 1.75, m * 0.85, m * 0.5);
        circle(ctx, -m * 1.2, -m * 0.4, m * 0.42, '#222', lw); circle(ctx, m * 1.2, -m * 0.4, m * 0.42, '#222', lw);
        break;
      }
      case 'hydrant':
        rr(ctx, -m * 0.3, -m * 1.0, m * 0.6, m * 1.0, m * 0.15); fillStroke(ctx, '#e63946', lw);
        circle(ctx, 0, -m * 1.0, m * 0.3, '#e63946', lw); rr(ctx, -m * 0.5, -m * 0.7, m * 1.0, m * 0.2, 2); fillStroke(ctx, '#c1121f', lw);
        break;
      case 'billboard': {
        rr(ctx, -m * 0.15, -m * 4, m * 0.3, m * 4, 2); fillStroke(ctx, '#555', lw);
        rr(ctx, -m * 2.6, -m * 6, m * 5.2, m * 2.4, 4); fillStroke(ctx, '#fff8e7', lw);
        const msgs = ['NUKE NEWS 24/7', 'BUY BUNKERS!', 'DUCK & COVER', 'SPF 9000', 'KEEP CALM & BOOM'];
        ctx.fillStyle = '#e63946'; ctx.font = `700 ${Math.max(6, m * 0.55)}px "Fredoka", "Arial Rounded MT Bold", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(msgs[Math.floor(hash(seed * 7) * msgs.length)], 0, -m * 4.8);
        break;
      }
      case 'cone':
        ctx.beginPath(); ctx.moveTo(-m * 0.45, 0); ctx.lineTo(0, -m * 1.1); ctx.lineTo(m * 0.45, 0); ctx.closePath(); fillStroke(ctx, '#ff7b00', lw);
        ctx.fillStyle = '#fff'; ctx.fillRect(-m * 0.22, -m * 0.6, m * 0.44, m * 0.15);
        break;
      case 'buoy': {
        const bob = Math.sin(t * 2.5 + seed) * m * 0.15;
        ctx.translate(0, bob);
        ctx.beginPath(); ctx.moveTo(-m * 0.6, 0); ctx.lineTo(-m * 0.3, -m * 1.6); ctx.lineTo(m * 0.3, -m * 1.6); ctx.lineTo(m * 0.6, 0); ctx.closePath(); fillStroke(ctx, '#ff4d4d', lw);
        ctx.fillStyle = '#fff'; ctx.fillRect(-m * 0.45, -m * 0.9, m * 0.9, m * 0.3);
        circle(ctx, 0, -m * 1.8, m * 0.2, '#ffd23f', lw);
        break;
      }
      case 'shark': {
        const sx = Math.sin(t * 0.8 + seed) * m * 2;
        ctx.beginPath(); ctx.moveTo(sx - m * 0.6, m * 0.05); ctx.quadraticCurveTo(sx - m * 0.1, -m * 0.6, sx + m * 0.2, -m * 1.3); ctx.quadraticCurveTo(sx + m * 0.3, -m * 0.5, sx + m * 0.7, m * 0.05); ctx.closePath();
        fillStroke(ctx, '#5c6f84', lw);
        break;
      }
      case 'duck': {
        const bob = Math.sin(t * 3 + seed) * m * 0.1;
        ctx.translate(0, bob);
        ellipse(ctx, 0, -m * 0.35, m * 0.7, m * 0.4, '#ffd23f', lw);
        circle(ctx, m * 0.45, -m * 0.95, m * 0.35, '#ffd23f', lw);
        ctx.beginPath(); ctx.moveTo(m * 0.75, -m * 0.95); ctx.lineTo(m * 1.15, -m * 0.88); ctx.lineTo(m * 0.75, -m * 0.8); ctx.closePath(); fillStroke(ctx, '#ff8c42', lw * 0.8);
        ctx.fillStyle = OUT; circle(ctx, m * 0.55, -m * 1.05, m * 0.06); ctx.fill();
        break;
      }
      case 'lighthouse':
        ctx.beginPath(); ctx.ellipse(0, 0, m * 2.2, m * 0.7, 0, Math.PI, 0); ctx.closePath(); fillStroke(ctx, '#8d8172', lw);
        ctx.beginPath(); ctx.moveTo(-m * 0.8, -m * 0.4); ctx.lineTo(-m * 0.5, -m * 5); ctx.lineTo(m * 0.5, -m * 5); ctx.lineTo(m * 0.8, -m * 0.4); ctx.closePath(); fillStroke(ctx, '#fff', lw);
        ctx.fillStyle = '#e63946'; ctx.fillRect(-m * 0.7, -m * 2.2, m * 1.4, m * 0.6); ctx.fillRect(-m * 0.6, -m * 3.8, m * 1.2, m * 0.6);
        rr(ctx, -m * 0.6, -m * 6, m * 1.2, m * 1.0, 3); fillStroke(ctx, '#ffd23f', lw);
        ctx.save(); ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 3); ctx.fillStyle = '#fff6a8';
        ctx.beginPath(); ctx.moveTo(0, -m * 5.5); ctx.lineTo(m * 8, -m * 7.5); ctx.lineTo(m * 8, -m * 3.5); ctx.closePath(); ctx.fill(); ctx.restore();
        break;
      case 'island':
        ctx.beginPath(); ctx.ellipse(0, 0, m * 2.4, m * 0.8, 0, Math.PI, 0); ctx.closePath(); fillStroke(ctx, '#f4d58d', lw);
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = m * 0.22; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, -m * 0.6); ctx.quadraticCurveTo(m * 0.3, -m * 2, m * 0.1, -m * 3.2); ctx.stroke();
        ctx.fillStyle = '#2f9e44';
        for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(m * 0.1, -m * 3.2); ctx.rotate(-2.6 + i * 0.75 + Math.sin(t * 2) * 0.05); ellipse(ctx, m * 0.9, 0, m * 0.95, m * 0.25, '#2f9e44', lw); ctx.restore(); }
        break;
      case 'flag':
        ctx.strokeStyle = '#ddd'; ctx.lineWidth = lw * 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -m * 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -m * 3); for (let i = 0; i <= 6; i++) ctx.lineTo(i * m * 0.25, -m * 3 + Math.sin(t * 4 + i) * m * 0.08); ctx.lineTo(m * 1.5, -m * 2.1); ctx.lineTo(0, -m * 2.1); ctx.closePath();
        fillStroke(ctx, '#ff4fd8', lw);
        drawEmblem(ctx, m * 0.7, -m * 2.55, m * 0.38, '#fff', '#fff', null, t);
        break;
      case 'rover':
        rr(ctx, -m * 1.3, -m * 1.4, m * 2.6, m * 0.7, 4); fillStroke(ctx, '#e0e0e0', lw);
        circle(ctx, -m * 0.9, -m * 0.4, m * 0.4, '#555', lw); circle(ctx, 0, -m * 0.4, m * 0.4, '#555', lw); circle(ctx, m * 0.9, -m * 0.4, m * 0.4, '#555', lw);
        ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(m * 0.8, -m * 1.4); ctx.lineTo(m * 0.8, -m * 2.2); ctx.stroke();
        circle(ctx, m * 0.8, -m * 2.3, m * 0.2, '#ff4d4d', lw);
        break;
      case 'crystal':
        ctx.save(); ctx.shadowColor = '#7df9ff'; ctx.shadowBlur = m * 0.8;
        [[-0.4, 1.6, -0.25], [0.2, 2.2, 0.1], [0.6, 1.2, 0.35]].forEach(([dx, h, r]) => {
          ctx.save(); ctx.translate(dx * m, 0); ctx.rotate(r);
          ctx.beginPath(); ctx.moveTo(-m * 0.25, 0); ctx.lineTo(-m * 0.25, -h * m * 0.7); ctx.lineTo(0, -h * m); ctx.lineTo(m * 0.25, -h * m * 0.7); ctx.lineTo(m * 0.25, 0); ctx.closePath();
          fillStroke(ctx, '#7df9ff', lw); ctx.restore();
        });
        ctx.restore();
        break;
      case 'dish':
        ctx.strokeStyle = OUT; ctx.lineWidth = lw * 1.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -m * 1.5); ctx.stroke();
        ctx.save(); ctx.translate(0, -m * 1.7); ctx.rotate(-0.6 + Math.sin(t * 0.7 + seed) * 0.3);
        ctx.beginPath(); ctx.arc(0, 0, m * 1.2, 0, Math.PI); ctx.closePath(); fillStroke(ctx, '#d8dde6', lw);
        ctx.restore();
        break;
      case 'greenie': {
        const wave = Math.sin(t * 6 + seed) * 0.5;
        ellipse(ctx, 0, -m * 0.6, m * 0.35, m * 0.6, '#7ee36b', lw);
        circle(ctx, 0, -m * 1.5, m * 0.45, '#7ee36b', lw);
        ctx.fillStyle = OUT; ellipse(ctx, -m * 0.15, -m * 1.5, m * 0.1, m * 0.16); ctx.fill(); ellipse(ctx, m * 0.15, -m * 1.5, m * 0.1, m * 0.16); ctx.fill();
        limb(ctx, m * 0.3, -m * 0.9, m * 0.3 + Math.sin(wave + 1) * m * 0.5, -m * 1.4, Math.max(2, m * 0.12), '#7ee36b');
        break;
      }
    }
    ctx.restore();
  }

  /* ------------------------- distance markers --------------------------- */
  function drawMarkers(ctx, view, best) {
    const visibleM = view.W / view.ppm;
    const steps = [10, 25, 50, 100, 250, 500, 1000, 2500];
    let step = steps.find((s) => s * view.ppm > 180) || 5000;
    void visibleM;
    const k0 = Math.max(1, Math.floor((view.camX - view.W / view.ppm) / step));
    const k1 = Math.ceil((view.camX + view.W / view.ppm) / step);
    const gy = view.sy(0), m = view.ppm;
    const size = clamp(m * 0.5, 9, 22);
    for (let k = k0; k <= k1; k++) {
      const wx = k * step, x = view.sx(wx);
      ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 2, gy - size * 2.6, 4, size * 2.6);
      rr(ctx, x - size * 1.9, gy - size * 3.8, size * 3.8, size * 1.4, 4); fillStroke(ctx, '#fff3d6', 2);
      ctx.fillStyle = '#5b3a1e'; ctx.font = `700 ${size * 0.9}px "Fredoka", "Arial Rounded MT Bold", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(wx >= 1000 ? (wx / 1000).toFixed(wx % 1000 ? 1 : 0) + 'km' : wx + 'm', x, gy - size * 3.05);
    }
    // personal best flag
    if (best > 5) {
      const x = view.sx(best);
      if (x > -50 && x < view.W + 50) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - size * 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, gy - size * 6); ctx.lineTo(x + size * 3.2, gy - size * 5.3); ctx.lineTo(x, gy - size * 4.5); ctx.closePath(); fillStroke(ctx, '#ff3366', 2);
        ctx.fillStyle = '#fff'; ctx.font = `700 ${size * 0.7}px "Fredoka", "Arial Rounded MT Bold", sans-serif`; ctx.textAlign = 'left';
        ctx.fillText('BEST', x + 4, gy - size * 5.25);
      }
    }
  }

  /* Full environment render used for gameplay & world-select thumbnails */
  function drawWorldBack(ctx, env, view) {
    drawSky(ctx, env, view);
    drawBackLayers(ctx, env, view);
    drawSkyDecor(ctx, env, view);
  }
  function drawWorldFront(ctx, env, view, best, startX) {
    drawGround(ctx, env, view);
    drawMarkers(ctx, view, best);
    drawProps(ctx, env, view, startX);
  }

  return {
    drawCharacter, drawBomb, drawEmblem, ENV_STYLE, drawWorldBack, drawWorldFront, drawProp, drawCloud,
    hash, lerp, clamp, easeOut, easeIn, rr, fillStroke, circle, star, OUT,
  };
})();
