// Painel de Atendimentos
// Os dados ficam salvos no navegador (localStorage), sem precisar de servidor.

const CHAVE = "painel-atendimentos";

const NOMES_STATUS = {
  "pendente": "Falta agendar",
  "sem-equipe": "Sem equipe",
  "agendado": "Agendado",
  "concluido": "Concluído"
};

let atendimentos = carregar();

// ---------- Armazenamento ----------

function carregar() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) || [];
  } catch {
    return [];
  }
}

function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(atendimentos));
  } catch {
    // Se o navegador bloquear o armazenamento, o painel continua funcionando na sessão atual.
  }
}

// ---------- Regras ----------

function hojeISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Um atendimento agendado sem equipe definida é tratado como "sem equipe".
function statusReal(a) {
  if (a.status === "agendado" && !a.equipe) return "sem-equipe";
  return a.status;
}

function estaAtrasado(a) {
  return a.status !== "concluido" && a.data < hojeISO();
}

function doMesSelecionado() {
  const mes = document.getElementById("filtroMes").value; // formato AAAA-MM
  return atendimentos.filter(a => a.data.startsWith(mes));
}

function formatarData(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// ---------- Indicadores ----------

function atualizarKpis(lista) {
  const contar = s => lista.filter(a => statusReal(a) === s).length;
  document.getElementById("kpiTotal").textContent = lista.length;
  document.getElementById("kpiPendentes").textContent = contar("pendente");
  document.getElementById("kpiSemEquipe").textContent = contar("sem-equipe");
  document.getElementById("kpiAgendados").textContent = contar("agendado");
  document.getElementById("kpiConcluidos").textContent = contar("concluido");
}

function desenharGrafico(lista) {
  const canvas = document.getElementById("grafico");
  const ctx = canvas.getContext("2d");
  const escala = window.devicePixelRatio || 1;
  const largura = canvas.clientWidth;
  const altura = 220;
  canvas.width = largura * escala;
  canvas.height = altura * escala;
  ctx.scale(escala, escala);
  ctx.clearRect(0, 0, largura, altura);

  const [ano, mes] = document.getElementById("filtroMes").value.split("-").map(Number);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const porDia = Array(diasNoMes).fill(0);
  lista.forEach(a => porDia[Number(a.data.slice(8, 10)) - 1]++);

  const maximo = Math.max(1, ...porDia);
  const margem = { topo: 10, base: 24, esq: 24 };
  const areaAltura = altura - margem.topo - margem.base;
  const passo = (largura - margem.esq) / diasNoMes;
  const hoje = hojeISO();

  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = "#6b7486";
  ctx.fillText(maximo, 2, margem.topo + 8);
  ctx.fillText("0", 2, altura - margem.base);

  porDia.forEach((qtd, i) => {
    const h = (qtd / maximo) * areaAltura;
    const x = margem.esq + i * passo + passo * 0.15;
    const y = altura - margem.base - h;
    const dataDia = `${ano}-${String(mes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    ctx.fillStyle = dataDia === hoje ? "#16a34a" : "#2563eb";
    ctx.fillRect(x, y, passo * 0.7, h);

    if ((i + 1) % 5 === 0 || i === 0) {
      ctx.fillStyle = "#6b7486";
      ctx.fillText(i + 1, x, altura - 8);
    }
  });
}

function mostrarAlertas() {
  const caixa = document.getElementById("alertas");
  const atrasados = atendimentos.filter(estaAtrasado).length;
  const hojeSemEquipe = atendimentos.filter(a => a.data === hojeISO() && statusReal(a) === "sem-equipe").length;
  const mensagens = [];
  if (atrasados) mensagens.push(`⚠️ ${atrasados} atendimento(s) com data vencida e não concluído(s).`);
  if (hojeSemEquipe) mensagens.push(`🚨 ${hojeSemEquipe} atendimento(s) hoje ainda sem equipe.`);
  caixa.innerHTML = mensagens.map(m => `<div class="aviso-item">${m}</div>`).join("");
}

// ---------- Tabela ----------

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function renderizarTabela(lista) {
  const busca = document.getElementById("busca").value.trim().toLowerCase();
  const filtro = document.getElementById("filtroStatus").value;

  const filtrados = lista
    .filter(a => !filtro || statusReal(a) === filtro)
    .filter(a => !busca || `${a.cliente} ${a.servico}`.toLowerCase().includes(busca))
    .sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")));

  document.getElementById("tabela").innerHTML = filtrados.map(a => {
    const s = statusReal(a);
    const podeAvancar = a.status !== "concluido";
    return `
      <tr class="${estaAtrasado(a) ? "atrasado" : ""}">
        <td>${formatarData(a.data)} ${a.hora || ""}</td>
        <td>${escapar(a.cliente)}</td>
        <td>${escapar(a.servico)}</td>
        <td>${a.equipe ? escapar(a.equipe) : "—"}</td>
        <td><span class="badge ${s}">${NOMES_STATUS[s]}</span></td>
        <td class="acoes">
          <button class="mini" data-acao="equipe" data-id="${a.id}">Equipe</button>
          ${podeAvancar ? `<button class="mini" data-acao="avancar" data-id="${a.id}">Avançar</button>` : ""}
          <button class="mini" data-acao="excluir" data-id="${a.id}">Excluir</button>
        </td>
      </tr>`;
  }).join("");

  document.getElementById("vazio").style.display = filtrados.length ? "none" : "block";
}

function atualizarTela() {
  const lista = doMesSelecionado();
  atualizarKpis(lista);
  desenharGrafico(lista);
  mostrarAlertas();
  renderizarTabela(lista);
}

// ---------- Ações ----------

function adicionar(evento) {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.target));
  atendimentos.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    cliente: dados.cliente.trim(),
    servico: dados.servico.trim(),
    data: dados.data,
    hora: dados.hora,
    equipe: dados.equipe.trim(),
    status: dados.status
  });
  salvar();
  evento.target.reset();
  document.getElementById("filtroMes").value = dados.data.slice(0, 7);
  atualizarTela();
}

function tratarCliqueTabela(evento) {
  const botao = evento.target.closest("button[data-acao]");
  if (!botao) return;
  const item = atendimentos.find(a => a.id === botao.dataset.id);
  if (!item) return;

  if (botao.dataset.acao === "avancar") {
    item.status = item.status === "pendente" ? "agendado" : "concluido";
  } else if (botao.dataset.acao === "equipe") {
    const nome = prompt("Nome da equipe:", item.equipe || "");
    if (nome === null) return;
    item.equipe = nome.trim();
  } else if (botao.dataset.acao === "excluir") {
    if (!confirm(`Excluir o atendimento de ${item.cliente}?`)) return;
    atendimentos = atendimentos.filter(a => a !== item);
  }
  salvar();
  atualizarTela();
}

function exportarCsv() {
  const cabecalho = ["Data", "Hora", "Cliente", "Serviço", "Equipe", "Status"];
  const linhas = doMesSelecionado().map(a =>
    [formatarData(a.data), a.hora, a.cliente, a.servico, a.equipe, NOMES_STATUS[statusReal(a)]]
      .map(v => `"${String(v || "").replace(/"/g, '""')}"`)
      .join(";")
  );
  // O BOM no início faz o Excel reconhecer os acentos corretamente.
  const csv = "\ufeff" + [cabecalho.join(";"), ...linhas].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `atendimentos-${document.getElementById("filtroMes").value}.csv`;
  link.click();
}

function carregarExemplo() {
  const clientes = ["Cliente A", "Cliente B", "Cliente C", "Cliente D", "Cliente E"];
  const servicos = ["Vistoria", "Instalação", "Recuperação", "Manutenção"];
  const equipes = ["Equipe Norte", "Equipe Sul", "Equipe Centro", ""];
  const [ano, mes] = document.getElementById("filtroMes").value.split("-").map(Number);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const hoje = hojeISO();

  for (let i = 0; i < 40; i++) {
    const dia = 1 + Math.floor(Math.random() * diasNoMes);
    const data = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const passado = data < hoje;
    const sorteio = Math.random();
    let status = "agendado";
    if (passado && sorteio < 0.85) status = "concluido";
    else if (sorteio < 0.25) status = "pendente";

    atendimentos.push({
      id: Date.now().toString(36) + i,
      cliente: clientes[i % clientes.length],
      servico: servicos[Math.floor(Math.random() * servicos.length)],
      data,
      hora: `${String(8 + Math.floor(Math.random() * 10)).padStart(2, "0")}:00`,
      // Concluídos sempre têm equipe; alguns agendados ficam sem, para mostrar o alerta.
      equipe: status === "pendente" ? ""
        : status === "concluido" ? equipes[i % 3]
        : equipes[Math.floor(Math.random() * equipes.length)],
      status
    });
  }
  salvar();
  atualizarTela();
}

// ---------- Início ----------

document.getElementById("filtroMes").value = hojeISO().slice(0, 7);
document.getElementById("form").addEventListener("submit", adicionar);
document.getElementById("tabela").addEventListener("click", tratarCliqueTabela);
document.getElementById("filtroMes").addEventListener("change", atualizarTela);
document.getElementById("busca").addEventListener("input", atualizarTela);
document.getElementById("filtroStatus").addEventListener("change", atualizarTela);
document.getElementById("btnExportar").addEventListener("click", exportarCsv);
document.getElementById("btnExemplo").addEventListener("click", carregarExemplo);
window.addEventListener("resize", () => desenharGrafico(doMesSelecionado()));

atualizarTela();
