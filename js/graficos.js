// Gráficos desenhados direto no <canvas>, sem bibliotecas externas.

function cor(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

function prepararCanvas(canvas, altura) {
  const escala = window.devicePixelRatio || 1;
  const largura = canvas.clientWidth;
  canvas.width = largura * escala;
  canvas.height = altura * escala;
  canvas.style.height = `${altura}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(escala, escala);
  ctx.clearRect(0, 0, largura, altura);
  ctx.font = "11px system-ui, sans-serif";
  return { ctx, largura, altura };
}

// Barras verticais, com destaque opcional para um índice (ex.: o dia de hoje).
export function graficoBarras(canvas, valores, { destaque = -1, altura = 220 } = {}) {
  const { ctx, largura } = prepararCanvas(canvas, altura);
  const margem = { topo: 12, base: 22, esq: 28 };
  const maximo = Math.max(1, ...valores);
  const areaAltura = altura - margem.topo - margem.base;
  const passo = (largura - margem.esq) / valores.length;

  // Linhas de grade
  ctx.strokeStyle = cor("--borda");
  ctx.fillStyle = cor("--suave");
  [0, 0.5, 1].forEach(f => {
    const y = margem.topo + areaAltura * (1 - f);
    ctx.beginPath();
    ctx.moveTo(margem.esq, y);
    ctx.lineTo(largura, y);
    ctx.stroke();
    if (f !== 0.5 || maximo >= 2) ctx.fillText(Math.round(maximo * f), 2, y + 4);
  });

  valores.forEach((v, i) => {
    const h = (v / maximo) * areaAltura;
    const x = margem.esq + i * passo + passo * 0.15;
    ctx.fillStyle = i === destaque ? cor("--verde") : cor("--azul");
    ctx.beginPath();
    ctx.roundRect(x, margem.topo + areaAltura - h, passo * 0.7, h, [3, 3, 0, 0]);
    ctx.fill();
    if (i === 0 || (i + 1) % 5 === 0) {
      ctx.fillStyle = cor("--suave");
      ctx.fillText(i + 1, x, altura - 6);
    }
  });

  canvas.setAttribute("aria-label", `Gráfico de barras: ${valores.join(", ")}`);
}

// Gráfico de rosca com o total no centro.
export function graficoRosca(canvas, partes, { altura = 220 } = {}) {
  const { ctx, largura } = prepararCanvas(canvas, altura);
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const cx = largura / 2;
  const cy = altura / 2;
  const raio = Math.min(cx, cy) - 8;

  if (!total) {
    ctx.strokeStyle = cor("--borda");
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(cx, cy, raio - 11, 0, Math.PI * 2);
    ctx.stroke();
  }

  let inicio = -Math.PI / 2;
  partes.filter(p => p.valor > 0).forEach(p => {
    const fim = inicio + (p.valor / total) * Math.PI * 2;
    ctx.strokeStyle = p.cor;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(cx, cy, raio - 11, inicio, fim);
    ctx.stroke();
    inicio = fim;
  });

  ctx.fillStyle = cor("--texto");
  ctx.textAlign = "center";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillText(total, cx, cy + 6);
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = cor("--suave");
  ctx.fillText("atendimentos", cx, cy + 24);
  ctx.textAlign = "start";

  canvas.setAttribute("aria-label", partes.map(p => `${p.rotulo}: ${p.valor}`).join(", "));
}
