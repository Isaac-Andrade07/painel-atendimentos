// Funções que montam o HTML de cada tela a partir do estado.

import {
  STATUS, PRIORIDADES, TRANSICOES, statusReal, situacaoSla, prazoSla, estaAtrasado,
  calcularKpis, variacao, contagemPorDia, ranking, ocupacao, doMes, mesAnterior, dataISO
} from "./regras.js";
import { graficoBarras, graficoRosca } from "./graficos.js";

export const COR_STATUS = {
  "pendente": "var(--vermelho)",
  "sem-equipe": "var(--amarelo)",
  "agendado": "var(--azul)",
  "em-andamento": "var(--roxo)",
  "concluido": "var(--verde)",
  "cancelado": "var(--cinza)"
};

const COR_PRIORIDADE = {
  urgente: "var(--vermelho)", alta: "var(--amarelo)", media: "var(--azul)", baixa: "var(--cinza)"
};

const SLA = {
  "no-prazo": ["No prazo", "var(--verde)"],
  "em-risco": ["Em risco", "var(--amarelo)"],
  "estourado": ["Estourado", "var(--vermelho)"],
  "cumprido": ["Cumprido", "var(--verde)"],
  "violado": ["Fora do prazo", "var(--vermelho)"],
  "n/a": ["—", "var(--cinza)"]
};

const $ = id => document.getElementById(id);

// ---------- Utilitários ----------

export function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const badge = (texto, cor) => `<span class="badge" style="--c:${cor}">${esc(texto)}</span>`;
export const badgeStatus = a => badge(STATUS[statusReal(a)], COR_STATUS[statusReal(a)]);
const badgePrioridade = a => badge(PRIORIDADES[a.prioridade].nome, COR_PRIORIDADE[a.prioridade]);
const badgeSla = a => badge(...SLA[situacaoSla(a)]);

export function formatarData(iso) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function formatarDataHora(iso) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const pct = v => `${Math.round(v * 100)}%`;
const nomeEquipe = (equipes, id) => equipes.find(e => e.id === id)?.nome || "—";

export function toast(mensagem, tipo = "info") {
  const cores = { info: "var(--azul)", ok: "var(--verde)", erro: "var(--vermelho)" };
  const el = document.createElement("div");
  el.className = "toast";
  el.style.setProperty("--c", cores[tipo]);
  el.textContent = mensagem;
  $("toasts").append(el);
  setTimeout(() => el.remove(), 3500);
}

export function confirmar(texto) {
  const modal = $("modalConfirmar");
  $("textoConfirmar").textContent = texto;
  modal.returnValue = "";
  modal.showModal();
  return new Promise(resolve => {
    modal.addEventListener("close", () => resolve(modal.returnValue === "sim"), { once: true });
  });
}

export function preencherSelect(select, opcoes, primeira) {
  const valor = select.value;
  select.innerHTML = (primeira ? `<option value="">${esc(primeira)}</option>` : "") +
    opcoes.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
  if ([...select.options].some(o => o.value === valor)) select.value = valor;
}

// ---------- Dashboard ----------

function cartaoKpi(rotulo, valor, { anterior, formato = v => v, inverso = false } = {}) {
  let comparacao = "";
  if (anterior !== undefined) {
    const v = variacao(valor, anterior);
    const melhor = inverso ? v < 0 : v > 0;
    const classe = v === 0 ? "" : melhor ? "sobe" : "desce";
    const seta = v > 0 ? "▲" : v < 0 ? "▼" : "•";
    comparacao = `<small><span class="${classe}">${seta} ${pct(Math.abs(v))}</span> vs. mês anterior</small>`;
  }
  return `<div class="kpi"><span>${rotulo}</span><strong>${formato(valor)}</strong>${comparacao}</div>`;
}

export function renderDashboard(estado, mes) {
  const lista = doMes(estado.atendimentos, mes);
  const antes = doMes(estado.atendimentos, mesAnterior(mes));
  const k = calcularKpis(lista);
  const ka = calcularKpis(antes);

  $("kpis").innerHTML = [
    cartaoKpi("Recebidos no mês", k.total, { anterior: ka.total }),
    cartaoKpi("Em aberto", k.abertos),
    cartaoKpi("Taxa de conclusão", k.taxaConclusao, { anterior: ka.taxaConclusao, formato: pct }),
    cartaoKpi("Concluídos no SLA", k.percentualSla, { anterior: ka.percentualSla, formato: pct }),
    cartaoKpi("Tempo médio de conclusão", k.tempoMedioHoras, {
      anterior: ka.tempoMedioHoras, inverso: true, formato: h => `${h.toFixed(1)} h`
    })
  ].join("");

  const hoje = dataISO();
  const dias = contagemPorDia(lista, mes);
  graficoBarras($("grafBarras"), dias, { destaque: hoje.startsWith(mes) ? Number(hoje.slice(8)) - 1 : -1 });

  const partes = Object.keys(STATUS).map(s => ({ rotulo: STATUS[s], valor: k.porStatus[s], cor: corCss(COR_STATUS[s]) }));
  graficoRosca($("grafRosca"), partes);
  $("legendaRosca").innerHTML = Object.keys(STATUS)
    .map(s => `<li style="--c:${COR_STATUS[s]}"><i></i>${STATUS[s]}<b>${k.porStatus[s]}</b></li>`).join("");

  renderAlertas(estado);

  const rank = ranking(lista, "cliente");
  const max = Math.max(1, ...rank.map(r => r.total));
  $("rankClientes").innerHTML = rank.length
    ? rank.map(r => barraH(r.nome, r.total, r.total / max)).join("")
    : `<p class="vazio">Sem dados neste mês.</p>`;

  $("ocupacaoHoje").innerHTML = estado.equipes.length
    ? estado.equipes.map(e => {
      const o = ocupacao(estado.atendimentos, e, hoje);
      return barraH(e.nome, `${o.usados}/${o.capacidade}`, o.usados / o.capacidade, corOcupacao(o));
    }).join("")
    : `<p class="vazio">Nenhuma equipe cadastrada.</p>`;
}

function renderAlertas(estado) {
  const hoje = dataISO();
  const abertos = estado.atendimentos;
  const itens = [];
  const estourados = abertos.filter(a => situacaoSla(a) === "estourado").length;
  const risco = abertos.filter(a => situacaoSla(a) === "em-risco").length;
  const atrasados = abertos.filter(a => estaAtrasado(a, hoje)).length;
  const hojeSemEquipe = abertos.filter(a => a.data === hoje && statusReal(a) === "sem-equipe").length;
  const pendentes = abertos.filter(a => a.status === "pendente").length;
  const lotadas = estado.equipes.filter(e => ocupacao(abertos, e, hoje).livre < 0).map(e => e.nome);

  if (estourados) itens.push(["var(--vermelho)", `${estourados} atendimento(s) com SLA estourado.`]);
  if (hojeSemEquipe) itens.push(["var(--vermelho)", `${hojeSemEquipe} atendimento(s) hoje ainda sem equipe.`]);
  if (atrasados) itens.push(["var(--amarelo)", `${atrasados} atendimento(s) com data vencida e não finalizado(s).`]);
  if (risco) itens.push(["var(--amarelo)", `${risco} atendimento(s) perto de estourar o SLA.`]);
  if (lotadas.length) itens.push(["var(--amarelo)", `Acima da capacidade hoje: ${lotadas.join(", ")}.`]);
  if (pendentes) itens.push(["var(--azul)", `${pendentes} atendimento(s) aguardando agendamento.`]);

  $("alertas").innerHTML = itens.length
    ? itens.map(([c, t]) => `<li style="--c:${c}">${esc(t)}</li>`).join("")
    : `<li class="ok">Tudo em dia. Nenhum ponto de atenção.</li>`;
}

function barraH(nome, valor, fracao, cor = "var(--azul)") {
  return `<div class="barra-h"><span class="nome" title="${esc(nome)}">${esc(nome)}</span>
    <div class="trilho"><div class="preench" style="width:${Math.min(100, fracao * 100)}%;--c:${cor}"></div></div>
    <b>${esc(valor)}</b></div>`;
}

function corOcupacao(o) {
  if (o.livre < 0) return "var(--vermelho)";
  if (o.livre === 0) return "var(--amarelo)";
  return "var(--verde)";
}

// O canvas não entende var(--x), então convertemos para a cor real.
function corCss(valor) {
  const nome = valor.match(/var\((--[\w-]+)\)/)?.[1];
  return nome ? getComputedStyle(document.documentElement).getPropertyValue(nome).trim() : valor;
}

// ---------- Tabela ----------

export function renderTabela(itens, equipes, ordem) {
  $("tabelaCorpo").innerHTML = itens.map(a => `
    <tr data-id="${a.id}" class="${estaAtrasado(a) ? "atrasado" : ""}" tabindex="0">
      <td class="protocolo">${esc(a.protocolo)}</td>
      <td>${formatarData(a.data)} ${esc(a.hora)}</td>
      <td>${esc(a.cliente)}</td>
      <td>${esc(a.servico)}</td>
      <td>${badgePrioridade(a)}</td>
      <td>${esc(nomeEquipe(equipes, a.equipeId))}</td>
      <td>${badgeStatus(a)}</td>
      <td>${badgeSla(a)}</td>
    </tr>`).join("");
  $("tabelaVazia").hidden = itens.length > 0;

  document.querySelectorAll("th[data-campo]").forEach(th => {
    th.querySelector(".seta")?.remove();
    if (th.dataset.campo === ordem.campo) {
      th.insertAdjacentHTML("beforeend", `<span class="seta">${ordem.direcao === "asc" ? "↑" : "↓"}</span>`);
    }
  });
}

export function renderPaginacao({ pagina, totalPaginas }, total) {
  $("paginacao").innerHTML = `
    <span>${total} atendimento(s) · página ${pagina} de ${totalPaginas}</span>
    <div>
      <button class="btn sec mini" data-pagina="${pagina - 1}" ${pagina <= 1 ? "disabled" : ""}>‹ Anterior</button>
      <button class="btn sec mini" data-pagina="${pagina + 1}" ${pagina >= totalPaginas ? "disabled" : ""}>Próxima ›</button>
    </div>`;
}

// ---------- Kanban ----------

export const COLUNAS_KANBAN = ["pendente", "agendado", "em-andamento", "concluido"];

export function renderKanban(estado) {
  const visiveis = estado.atendimentos
    .filter(a => a.status !== "cancelado")
    .filter(a => a.status !== "concluido" || (a.concluidoEm && Date.now() - new Date(a.concluidoEm) < 7 * 864e5));

  $("kanban").innerHTML = COLUNAS_KANBAN.map(status => {
    const cartoes = visiveis
      .filter(a => a.status === status)
      .sort((x, y) => PRIORIDADES[y.prioridade].peso - PRIORIDADES[x.prioridade].peso);
    const titulo = status === "concluido" ? "Concluído (7 dias)" : STATUS[status];
    return `<div class="coluna" data-status="${status}">
      <h3>${titulo}<span>${cartoes.length}</span></h3>
      ${cartoes.map(a => `
        <div class="cartao" draggable="true" data-id="${a.id}" style="--c:${COR_PRIORIDADE[a.prioridade]}">
          <span class="protocolo">${esc(a.protocolo)}</span>
          <strong>${esc(a.cliente)}</strong>
          ${esc(a.servico)}
          <div class="meta"><span>${formatarData(a.data)}</span><span>${esc(nomeEquipe(estado.equipes, a.equipeId))}</span></div>
          <div class="meta">${badgePrioridade(a)}${badgeSla(a)}</div>
        </div>`).join("")}
    </div>`;
  }).join("");
}

// ---------- Equipes ----------

export function renderEquipes(estado) {
  const hoje = dataISO();
  $("listaEquipes").innerHTML = estado.equipes.map(e => {
    const o = ocupacao(estado.atendimentos, e, hoje);
    const abertos = estado.atendimentos.filter(a => a.equipeId === e.id && ["agendado", "em-andamento"].includes(a.status)).length;
    return `<tr data-equipe="${e.id}">
      <td><strong>${esc(e.nome)}</strong></td>
      <td>${e.capacidadeDia}</td>
      <td><div class="ocup"><div class="trilho"><div class="preench" style="width:${Math.min(100, o.usados / o.capacidade * 100)}%;--c:${corOcupacao(o)}"></div></div>${o.usados}/${o.capacidade}</div></td>
      <td>${abertos}</td>
      <td><button class="btn sec mini" data-editar-equipe="${e.id}">Editar</button>
          <button class="btn sec mini" data-excluir-equipe="${e.id}">Excluir</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" class="vazio">Nenhuma equipe cadastrada.</td></tr>`;
}

// ---------- Detalhe ----------

export function renderDetalhe(a, equipes) {
  const prazo = prazoSla(a);
  const proximos = TRANSICOES[a.status];
  $("conteudoDetalhe").innerHTML = `
    <header>
      <div><span class="protocolo">${esc(a.protocolo)}</span><h2>${esc(a.cliente)} · ${esc(a.servico)}</h2></div>
      <button type="button" class="fechar" data-fechar aria-label="Fechar">×</button>
    </header>
    <div class="detalhe-corpo">
      <div class="info">
        <div><span>Status</span>${badgeStatus(a)}</div>
        <div><span>Prioridade</span>${badgePrioridade(a)}</div>
        <div><span>SLA</span>${badgeSla(a)}</div>
        <div><span>Data</span>${formatarData(a.data)} ${esc(a.hora)}</div>
        <div><span>Equipe</span>${esc(nomeEquipe(equipes, a.equipeId))}</div>
        <div><span>Prazo do SLA</span>${formatarDataHora(prazo)}</div>
      </div>
      ${a.observacoes ? `<div><span class="dica">Observações</span><p>${esc(a.observacoes)}</p></div>` : ""}
      ${proximos.length ? `<div><span class="dica">Mudar status</span><div class="acoes-status">
        ${proximos.map(s => `<button class="btn sec mini" data-mudar="${s}">→ ${STATUS[s]}</button>`).join("")}
      </div></div>` : ""}
      <div>
        <span class="dica">Histórico</span>
        <ul class="timeline">
          ${[...a.historico].reverse().map(h => `<li><time>${formatarDataHora(h.em)}</time>${esc(h.texto)}</li>`).join("")}
        </ul>
      </div>
    </div>
    <footer>
      <button class="btn sec" data-excluir>Excluir</button>
      <button class="btn" data-editar>Editar</button>
    </footer>`;
}

// ---------- Formulário ----------

export function preencherFormulario(form, a, estado) {
  preencherSelect(form.prioridade, Object.entries(PRIORIDADES).map(([k, p]) => [k, `${p.nome} (SLA ${p.slaHoras}h)`]));
  preencherSelect(form.equipeId, estado.equipes.map(e => [e.id, e.nome]), "Sem equipe por enquanto");
  $("listaClientes").innerHTML = [...new Set(estado.atendimentos.map(x => x.cliente))]
    .map(c => `<option value="${esc(c)}">`).join("");

  form.reset();
  form.id.value = a?.id || "";
  form.cliente.value = a?.cliente || "";
  form.servico.value = a?.servico || "";
  form.prioridade.value = a?.prioridade || "media";
  form.equipeId.value = a?.equipeId || "";
  form.data.value = a?.data || "";
  form.hora.value = a?.hora || "";
  form.observacoes.value = a?.observacoes || "";
  $("tituloForm").textContent = a ? `Editar ${a.protocolo}` : "Novo atendimento";
  mostrarMensagens([], []);
}

export function mostrarMensagens(erros, avisos) {
  $("mensagensForm").innerHTML =
    erros.map(t => `<li style="--c:var(--vermelho)">${esc(t)}</li>`).join("") +
    avisos.map(t => `<li style="--c:var(--amarelo)">${esc(t)}</li>`).join("");
}
