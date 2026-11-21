// Testes das regras de negócio. Rode com: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  statusReal, podeMudar, prazoSla, situacaoSla, estaAtrasado, calcularKpis,
  variacao, contagemPorDia, ranking, ocupacao, validar, filtrar, ordenar, paginar, mesAnterior, paraCsv
} from "../js/regras.js";

const base = {
  id: "1", protocolo: "ATD-0001", cliente: "Cliente A", servico: "Vistoria",
  prioridade: "media", data: "2026-11-20", hora: "10:00", equipeId: "eq1",
  status: "agendado", criadoEm: "2026-11-18T10:00:00.000Z", concluidoEm: null, historico: []
};
const novo = extra => ({ ...base, ...extra });

test("agendado sem equipe vira 'sem-equipe'", () => {
  assert.equal(statusReal(novo({ equipeId: "" })), "sem-equipe");
  assert.equal(statusReal(base), "agendado");
});

test("transições de status permitidas e bloqueadas", () => {
  assert.ok(podeMudar("pendente", "agendado"));
  assert.ok(podeMudar("em-andamento", "concluido"));
  assert.ok(!podeMudar("pendente", "concluido"));
  assert.ok(!podeMudar("concluido", "agendado"));
});

test("prazo do SLA depende da prioridade", () => {
  assert.equal(prazoSla(novo({ prioridade: "urgente" })).toISOString(), "2026-11-18T14:00:00.000Z");
  assert.equal(prazoSla(novo({ prioridade: "baixa" })).toISOString(), "2026-11-21T10:00:00.000Z");
});

test("situação do SLA", () => {
  const agora = new Date("2026-11-19T10:00:00.000Z"); // 24h depois da criação, SLA de 48h
  assert.equal(situacaoSla(base, agora), "no-prazo");
  assert.equal(situacaoSla(base, new Date("2026-11-20T03:00:00.000Z")), "em-risco");
  assert.equal(situacaoSla(base, new Date("2026-11-21T00:00:00.000Z")), "estourado");
  assert.equal(situacaoSla(novo({ status: "concluido", concluidoEm: "2026-11-19T00:00:00.000Z" })), "cumprido");
  assert.equal(situacaoSla(novo({ status: "concluido", concluidoEm: "2026-11-25T00:00:00.000Z" })), "violado");
  assert.equal(situacaoSla(novo({ status: "cancelado" })), "n/a");
});

test("atraso só conta para agendados ou em andamento", () => {
  assert.ok(estaAtrasado(base, "2026-11-21"));
  assert.ok(!estaAtrasado(base, "2026-11-20"));
  assert.ok(!estaAtrasado(novo({ status: "concluido" }), "2026-11-30"));
});

test("indicadores do mês", () => {
  const lista = [
    novo({ id: "1", status: "concluido", concluidoEm: "2026-11-19T10:00:00.000Z" }),          // 24h, no SLA
    novo({ id: "2", status: "concluido", concluidoEm: "2026-11-23T10:00:00.000Z" }),          // 120h, fora
    novo({ id: "3", status: "pendente", data: "" }),
    novo({ id: "4", status: "cancelado" })
  ];
  const k = calcularKpis(lista, new Date("2026-11-19T00:00:00.000Z"));
  assert.equal(k.total, 4);
  assert.equal(k.abertos, 1);
  assert.equal(k.taxaConclusao, 2 / 3);
  assert.equal(k.percentualSla, 0.5);
  assert.equal(k.tempoMedioHoras, 72);
  assert.equal(k.porStatus.cancelado, 1);
});

test("variação percentual entre meses", () => {
  assert.equal(variacao(15, 10), 0.5);
  assert.equal(variacao(5, 10), -0.5);
  assert.equal(variacao(0, 0), 0);
  assert.equal(mesAnterior("2026-01"), "2025-12");
});

test("contagem por dia e ranking", () => {
  const lista = [novo({ data: "2026-11-01" }), novo({ data: "2026-11-01", cliente: "B" }), novo({ data: "2026-11-30", cliente: "B" })];
  const dias = contagemPorDia(lista, "2026-11");
  assert.equal(dias.length, 30);
  assert.equal(dias[0], 2);
  assert.equal(dias[29], 1);
  assert.deepEqual(ranking(lista, "cliente")[0], { nome: "B", total: 2 });
});

test("ocupação e aviso de capacidade da equipe", () => {
  const equipe = { id: "eq1", nome: "Equipe 1", capacidadeDia: 1 };
  assert.deepEqual(ocupacao([base], equipe, "2026-11-20"), { usados: 1, capacidade: 1, livre: 0 });
  const r = validar(novo({ id: undefined }), { atendimentos: [base], equipes: [equipe], hoje: "2026-11-01" });
  assert.ok(r.valido);
  assert.match(r.avisos[0], /capacidade/);
});

test("validação de campos obrigatórios", () => {
  const r = validar({ cliente: "", servico: "", prioridade: "x", status: "agendado", data: "" });
  assert.equal(r.valido, false);
  assert.equal(r.erros.length, 4);
});

test("filtro, ordenação e paginação", () => {
  const lista = [novo({ id: "1", prioridade: "baixa" }), novo({ id: "2", prioridade: "urgente", cliente: "Zeta" })];
  assert.equal(filtrar(lista, { busca: "zeta" }).length, 1);
  assert.equal(ordenar(lista, "prioridade", "desc")[0].prioridade, "urgente");
  const p = paginar(Array.from({ length: 25 }, (_, i) => i), 3, 10);
  assert.deepEqual([p.itens.length, p.totalPaginas], [5, 3]);
});

test("CSV escapa aspas e usa ponto e vírgula", () => {
  assert.equal(paraCsv([["a", 'diz "oi"']]), '\ufeff"a";"diz ""oi"""');
});
