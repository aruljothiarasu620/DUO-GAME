// client/src/game/ParticleSystem.ts

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;     // 0–1, decreasing
  maxLife: number;
  radius: number;
  color: string;
  gravity: number;
}

export class ParticleSystem {
  private pool: Particle[] = [];

  burst(x: number, y: number, count: number, color: string, speed: number) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const spd = speed * (0.4 + Math.random() * 0.6);
      this.pool.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - speed * 0.3,
        life: 1,
        maxLife: 0.4 + Math.random() * 0.4,
        radius: 2 + Math.random() * 4,
        color,
        gravity: 400,
      });
    }
  }

  trail(x: number, y: number, color: string) {
    this.pool.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 30,
      vy: -20 - Math.random() * 30,
      life: 1,
      maxLife: 0.2 + Math.random() * 0.2,
      radius: 1 + Math.random() * 2,
      color,
      gravity: 0,
    });
  }

  update(dt: number) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt / p.maxLife;
      if (p.life <= 0) this.pool.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.pool) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
