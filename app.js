import { firebaseConfig } from './firebase-config.js';

/* =====================================================================
   Constantes
   ===================================================================== */
const CATS_SAIDA = [
  { id: 'moradia', nome: 'Moradia', ic: '🏠' },
  { id: 'comida', nome: 'Comida', ic: '🍽️' },
  { id: 'carro', nome: 'Carro', ic: '🚗' },
  { id: 'saude', nome: 'Saúde', ic: '🩺' },
  { id: 'lazer', nome: 'Lazer', ic: '🎉' },
  { id: 'pessoal', nome: 'Pessoal', ic: '👤' },
  { id: 'viagem', nome: 'Viagem', ic: '✈️' },
  { id: 'investimento', nome: 'Investimento', ic: '📈' },
  { id: 'outros', nome: 'Outros', ic: '📦' },
];
const CATS_ENTRADA = [
  { id: 'salario', nome: 'Salário', ic: '💼' },
  { id: 'extra', nome: 'Renda extra', ic: '💰' },
  { id: 'rendimentos', nome: 'Rendimentos', ic: '📈' },
  { id: 'outros_e', nome: 'Outros', ic: '🎁' },
];
const TODAS_CATS = Object.fromEntries([...CATS_SAIDA, ...CATS_ENTRADA].map(c => [c.id, c]));

const PERIODOS = {
  unica: 'Uma única vez',
  semanal: 'Semanal',
  mensal: 'Mensal',
  bimestral: 'Bimestral (a cada 2 meses)',
  trimestral: 'Trimestral (a cada 3 meses)',
  semestral: 'Semestral (a cada 6 meses)',
  anual: 'Anual',
  parcelado: 'Parcelado',
};
const PERIODO_CURTO = {
  unica: 'Única', semanal: 'Semanal', mensal: 'Mensal', bimestral: 'Bimestral',
  trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', parcelado: 'Parcelado',
};
const PASSO_MESES = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
const MESES_PREVISAO = 12;

const SETTINGS_PADRAO = {
  saldoInicial: 0,          // saldo em conta no início do mês atual
  mesesMedia: 3,            // quantos meses usar na média de gastos variáveis
  incluirEntradasAvulsas: false,
  metas: [],
};

/* =====================================================================
   Estado
   ===================================================================== */
const hoje = new Date();
const state = {
  transacoes: [],
  settings: { ...SETTINGS_PADRAO },
  aba: 'resumo',
  ano: hoje.getFullYear(),
  mes: hoje.getMonth(),
  filtro: 'todos',
  sync: '',
  editandoId: null,
  editandoMetaId: null,
};
let backend = null;

/* =====================================================================
   Utilidades
   ===================================================================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCompacto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const brl = n => fmtBRL.format(Math.round((n || 0) * 100) / 100);
const brlC = n => fmtCompacto.format(n || 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function parseValor(str) {
  if (typeof str === 'number') return str;
  let s = String(str || '').replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}
const valorParaInput = n => (n ? n.toFixed(2).replace('.', ',') : '');

function parseData(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function dataISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const idxMes = (ano, mes) => ano * 12 + mes;
const idxDe = d => idxMes(d.getFullYear(), d.getMonth());
const deIdx = i => ({ ano: Math.floor(i / 12), mes: i % 12 });
const idxHoje = () => idxDe(new Date());
const nomeMes = (ano, mes, curto = false) => {
  const s = new Date(ano, mes, 1).toLocaleDateString('pt-BR', curto ? { month: 'short' } : { month: 'long', year: 'numeric' }).replace('.', '');
  return curto ? s : s.charAt(0).toUpperCase() + s.slice(1);
};
const nomeMesAno = i => { const { ano, mes } = deIdx(i); return `${nomeMes(ano, mes, true)}/${String(ano).slice(2)}`; };
function diaNoMes(ano, mes, dia) {
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  return new Date(ano, mes, Math.min(dia, ultimo));
}
const diasEntre = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2600);
}

/* =====================================================================
   Motor de cálculo
   ===================================================================== */

/** Ocorrências de um lançamento dentro de um mês. Retorna [{data, valor, parcela?, de?}] */
function ocorrencias(t, ano, mes) {
  const ini = parseData(t.data);
  const fim = t.dataFim ? parseData(t.dataFim) : null;
  const inicioMes = new Date(ano, mes, 1);
  const fimMes = new Date(ano, mes + 1, 0);
  const out = [];
  const valor = Number(t.valor) || 0;

  if (t.periodicidade === 'unica') {
    if (ini >= inicioMes && ini <= fimMes) out.push({ data: ini, valor });
    return out;
  }

  if (t.periodicidade === 'semanal') {
    if (ini > fimMes) return out;
    let n = 0;
    if (ini < inicioMes) n = Math.ceil(diasEntre(ini, inicioMes) / 7);
    for (;; n++) {
      const d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + n * 7);
      if (d > fimMes || (fim && d > fim)) break;
      out.push({ data: d, valor });
    }
    return out;
  }

  const dif = idxMes(ano, mes) - idxDe(ini);
  if (dif < 0) return out;

  if (t.periodicidade === 'parcelado') {
    const n = Math.max(1, Number(t.parcelas) || 1);
    if (dif >= n) return out;
    out.push({ data: diaNoMes(ano, mes, ini.getDate()), valor: valor / n, parcela: dif + 1, de: n });
    return out;
  }

  const passo = PASSO_MESES[t.periodicidade] || 1;
  if (dif % passo !== 0) return out;
  const d = diaNoMes(ano, mes, ini.getDate());
  if (fim && d > fim) return out;
  out.push({ data: d, valor });
  return out;
}

const ehFixa = t => t.periodicidade !== 'unica';

/** Lançamentos reais (registrados) de um mês */
function itensDoMes(ano, mes) {
  const itens = [];
  for (const t of state.transacoes) {
    for (const oc of ocorrencias(t, ano, mes)) itens.push({ t, ...oc });
  }
  itens.sort((a, b) => b.data - a.data || (b.t.criadoEm || 0) - (a.t.criadoEm || 0));
  return itens;
}

function resumoMes(ano, mes) {
  const r = { entradas: 0, saidas: 0, fixas: 0, variaveis: 0, porCategoria: {} };
  for (const it of itensDoMes(ano, mes)) {
    if (it.t.tipo === 'entrada') r.entradas += it.valor;
    else {
      r.saidas += it.valor;
      if (ehFixa(it.t)) r.fixas += it.valor; else r.variaveis += it.valor;
      r.porCategoria[it.t.categoria] = (r.porCategoria[it.t.categoria] || 0) + it.valor;
    }
  }
  return r;
}

/** Média mensal dos lançamentos avulsos ("uma única vez") nos últimos N meses fechados. */
function mediaAvulsas() {
  const atual = idxHoje();
  const N = Math.max(1, Number(state.settings.mesesMedia) || 3);
  const datas = state.transacoes.map(t => idxDe(parseData(t.data)));
  const primeiro = datas.length ? Math.min(...datas) : atual;
  let meses = [];
  for (let i = 1; i <= N; i++) if (atual - i >= primeiro) meses.push(atual - i);
  const parcial = meses.length === 0;
  if (parcial) meses = [atual];

  let saida = 0, entrada = 0;
  const porCat = {};
  for (const i of meses) {
    const { ano, mes } = deIdx(i);
    for (const t of state.transacoes) {
      if (t.periodicidade !== 'unica') continue;
      for (const oc of ocorrencias(t, ano, mes)) {
        if (t.tipo === 'entrada') entrada += oc.valor;
        else if (t.categoria !== 'investimento') {
          saida += oc.valor;
          porCat[t.categoria] = (porCat[t.categoria] || 0) + oc.valor;
        }
      }
    }
  }
  for (const k in porCat) porCat[k] /= meses.length;
  return { saida: saida / meses.length, entrada: entrada / meses.length, porCat, meses: meses.length, parcial };
}

/** Projeção de um mês (índice). Gastos variáveis = o maior entre o já registrado e a média. */
function projetarMes(i, media) {
  const { ano, mes } = deIdx(i);
  let entRec = 0, entAv = 0, fixas = 0, avInv = 0, avOutras = 0, invest = 0;
  for (const t of state.transacoes) {
    for (const oc of ocorrencias(t, ano, mes)) {
      if (t.tipo === 'entrada') {
        if (ehFixa(t)) entRec += oc.valor; else entAv += oc.valor;
      } else {
        if (ehFixa(t)) fixas += oc.valor;
        else if (t.categoria === 'investimento') avInv += oc.valor;
        else avOutras += oc.valor;
        if (t.categoria === 'investimento') invest += oc.valor;
      }
    }
  }
  const variaveis = Math.max(avOutras, media.saida);
  const entradasAvulsas = state.settings.incluirEntradasAvulsas ? Math.max(entAv, media.entrada) : entAv;
  const entradas = entRec + entradasAvulsas;
  const saidas = fixas + avInv + variaveis;
  const resultado = entradas - saidas;
  return {
    i, entradas, fixas, variaveis, investimentos: invest, saidas, resultado,
    // o que sobra para guardar: resultado + o que já foi lançado como investimento
    capacidade: resultado + invest,
  };
}

function previsao() {
  const media = mediaAvulsas();
  const inicio = idxHoje();
  let acumulado = Number(state.settings.saldoInicial) || 0;
  const meses = [];
  for (let k = 0; k < MESES_PREVISAO; k++) {
    const p = projetarMes(inicio + k, media);
    acumulado += p.resultado;
    p.acumulado = acumulado;
    meses.push(p);
  }
  const soma = campo => meses.reduce((s, m) => s + m[campo], 0);
  return {
    media,
    meses,
    entradasMedia: soma('entradas') / meses.length,
    fixasMedia: soma('fixas') / meses.length,
    variaveisMedia: soma('variaveis') / meses.length,
    investMedia: soma('investimentos') / meses.length,
    resultadoMedio: soma('resultado') / meses.length,
    capacidadeMedia: soma('capacidade') / meses.length,
  };
}

function planoMeta(meta, cap) {
  const falta = Math.max(0, (meta.valor || 0) - (meta.guardado || 0));
  const atual = idxHoje();
  const r = { falta, cap, concluida: falta <= 0 };
  r.mesesComSobra = cap > 0 ? Math.ceil(falta / cap) : null;
  if (meta.prazo) {
    const [y, m] = meta.prazo.split('-').map(Number);
    r.mesesAtePrazo = Math.max(1, idxMes(y, m - 1) - atual + 1);
    r.necessario = falta / r.mesesAtePrazo;
    r.viavel = cap > 0 && r.necessario <= cap + 0.005;
  }
  return r;
}
const mesesParaData = n => nomeMesAno(idxHoje() + n - 1);
function textoMeses(n) {
  if (n == null) return '—';
  if (n < 12) return `${n} ${n === 1 ? 'mês' : 'meses'}`;
  const a = Math.floor(n / 12), m = n % 12;
  return `${a} ${a === 1 ? 'ano' : 'anos'}${m ? ` e ${m} ${m === 1 ? 'mês' : 'meses'}` : ''}`;
}

/* =====================================================================
   Gráficos (SVG)
   ===================================================================== */
function escalaY(min, max, altura, topo) {
  const span = max - min || 1;
  return v => topo + (max - v) / span * altura;
}
function ticks(min, max) {
  const span = max - min || 1;
  const bruto = span / 3;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 2.5, 5, 10].map(f => f * pot).find(p => p >= bruto) || pot * 10;
  const out = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max + 1e-9; v += passo) out.push(Math.round(v * 100) / 100);
  return out;
}

function larguraGrafico() {
  const w = ($('#conteudo')?.clientWidth || 640) - 66;
  return Math.max(300, Math.min(640, w));
}
const rotuloX = (m, k, slot) => {
  const { ano, mes } = deIdx(m.i);
  if (slot < 34 && k % 2) return '';
  return mes === 0 || k === 0 ? nomeMesAno(m.i) : nomeMes(ano, mes, true);
};

function graficoBarras(meses) {
  const W = larguraGrafico(), H = 220, esq = 58, dir = 8, topo = 10, base = 24;
  const valores = meses.map(m => m.resultado);
  let min = Math.min(0, ...valores), max = Math.max(0, ...valores);
  if (min === max) max = 1;
  const tk = ticks(min, max);
  min = Math.min(min, tk[0]); max = Math.max(max, tk[tk.length - 1]);
  const y = escalaY(min, max, H - topo - base, topo);
  const slot = (W - esq - dir) / meses.length;
  const lb = Math.min(28, slot * 0.6);
  let s = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Resultado previsto por mês">`;
  for (const v of tk) s += `<line class="grade" x1="${esq}" x2="${W - dir}" y1="${y(v)}" y2="${y(v)}"/><text x="${esq - 6}" y="${y(v) + 4}" text-anchor="end">${esc(brlC(v))}</text>`;
  meses.forEach((m, k) => {
    const cx = esq + slot * k + slot / 2;
    const y0 = y(0), y1 = y(m.resultado);
    const h = Math.max(1, Math.abs(y1 - y0));
    s += `<rect class="${m.resultado >= 0 ? 'bpos' : 'bneg'}" x="${cx - lb / 2}" y="${Math.min(y0, y1)}" width="${lb}" height="${h}" rx="3"/>`;
    s += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${esc(rotuloX(m, k, slot))}</text>`;
    s += `<rect class="alvo" x="${esq + slot * k}" y="${topo}" width="${slot}" height="${H - topo - base}" data-tip="${k}"/>`;
  });
  s += `<line class="zero" x1="${esq}" x2="${W - dir}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
  return s;
}

function graficoLinha(meses) {
  const W = larguraGrafico(), H = 200, esq = 58, dir = 14, topo = 12, base = 24;
  const valores = meses.map(m => m.acumulado);
  let min = Math.min(0, ...valores), max = Math.max(0, ...valores);
  if (min === max) max = 1;
  const tk = ticks(min, max);
  min = Math.min(min, tk[0]); max = Math.max(max, tk[tk.length - 1]);
  const y = escalaY(min, max, H - topo - base, topo);
  const slot = (W - esq - dir) / meses.length;
  const x = k => esq + slot * k + slot / 2;
  let s = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo acumulado previsto">`;
  for (const v of tk) s += `<line class="${v === 0 ? 'zero' : 'grade'}" x1="${esq}" x2="${W - dir}" y1="${y(v)}" y2="${y(v)}"/><text x="${esq - 6}" y="${y(v) + 4}" text-anchor="end">${esc(brlC(v))}</text>`;
  s += `<polyline class="linha-acum" points="${meses.map((m, k) => `${x(k)},${y(m.acumulado)}`).join(' ')}"/>`;
  meses.forEach((m, k) => {
    s += `<circle class="ponto-acum" cx="${x(k)}" cy="${y(m.acumulado)}" r="4"/>`;
    s += `<text x="${x(k)}" y="${H - 6}" text-anchor="middle">${esc(rotuloX(m, k, slot))}</text>`;
    s += `<rect class="alvo" x="${esq + slot * k}" y="${topo}" width="${slot}" height="${H - topo - base}" data-tip="${k}"/>`;
  });
  return s + '</svg>';
}

function ligarTooltips(wrap, meses, conteudo) {
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.hidden = true;
  wrap.appendChild(tip);
  const mostrar = alvo => {
    const k = Number(alvo.dataset.tip);
    tip.innerHTML = conteudo(meses[k]);
    const rw = wrap.getBoundingClientRect(), ra = alvo.getBoundingClientRect();
    let left = ra.left - rw.left + ra.width / 2;
    left = Math.max(80, Math.min(rw.width - 80, left));
    tip.style.left = left + 'px';
    tip.style.top = (ra.top - rw.top + 10) + 'px';
    tip.hidden = false;
  };
  $$('.alvo', wrap).forEach(a => {
    a.addEventListener('mouseenter', () => mostrar(a));
    a.addEventListener('click', () => mostrar(a));
  });
  wrap.addEventListener('mouseleave', () => (tip.hidden = true));
}

/* =====================================================================
   Telas
   ===================================================================== */
function render() {
  const mostraMes = state.aba === 'resumo' || state.aba === 'lancamentos';
  $('#mes-nav').style.visibility = mostraMes ? 'visible' : 'hidden';
  $('#mes-titulo').textContent = nomeMes(state.ano, state.mes);
  $('#status-sync').textContent = state.sync;
  $$('.abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === state.aba));
  $('#btn-novo').hidden = state.aba === 'config' || state.aba === 'metas';
  const telas = { resumo: telaResumo, lancamentos: telaLancamentos, previsao: telaPrevisao, metas: telaMetas, config: telaConfig };
  const c = $('#conteudo');
  c.innerHTML = telas[state.aba]();
  if (state.aba === 'previsao') ligarGraficos();
  if (state.aba === 'metas') ligarSimuladores();
}

function telaResumo() {
  const r = resumoMes(state.ano, state.mes);
  const saldo = r.entradas - r.saidas;
  const p = previsao();
  const cats = Object.entries(r.porCategoria).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 1;

  let destaque;
  const metas = state.settings.metas || [];
  if (!state.transacoes.length) {
    destaque = `<div class="card destaque"><h3>Bem-vindo! 👋</h3>
      <p style="margin:0">Comece lançando suas <b>entradas fixas</b> (salário) e <b>despesas fixas</b> (aluguel, contas, parcelas). Depois vá lançando os gastos do dia a dia. Quanto mais dados, melhor fica a previsão.</p></div>`;
  } else if (metas.length) {
    const m = metas[0];
    const pl = planoMeta(m, p.capacidadeMedia);
    const valorMes = m.prazo ? pl.necessario : p.capacidadeMedia;
    const nMeses = m.prazo ? pl.mesesAtePrazo : pl.mesesComSobra;
    destaque = `<div class="card destaque"><small>Meta: ${esc(m.nome)}</small>
      ${pl.concluida ? '<div class="grande">Meta atingida! 🎉</div>' :
        valorMes > 0 && nMeses ? `<div class="grande num">${brl(valorMes)}/mês</div><small>por ${textoMeses(nMeses)} (até ${mesesParaData(nMeses)}) para chegar a ${brl(m.valor)}</small>` :
        `<div class="grande">Sem sobra prevista</div><small>Com os dados atuais, os gastos superam as entradas.</small>`}</div>`;
  } else {
    destaque = `<div class="card destaque"><small>Sobra média prevista para guardar</small>
      <div class="grande num">${brl(p.capacidadeMedia)}/mês</div>
      <small>Crie uma meta na aba 🎯 Metas para saber em quantos meses você chega lá.</small></div>`;
  }

  const totalDiv = r.fixas + r.variaveis || 1;
  return `
    ${destaque}
    <div class="kpis">
      <div class="kpi"><div class="rot">Entradas</div><div class="val num pos">${brl(r.entradas)}</div></div>
      <div class="kpi"><div class="rot">Saídas</div><div class="val num neg">${brl(r.saidas)}</div></div>
      <div class="kpi"><div class="rot">Saldo do mês</div><div class="val num ${saldo >= 0 ? 'pos' : 'neg'}">${brl(saldo)}</div></div>
    </div>
    ${r.saidas > 0 ? `
    <div class="card">
      <div class="card-cab"><h3>Fixas × variáveis</h3></div>
      <div class="divisao">
        <div style="width:${r.fixas / totalDiv * 100}%;background:var(--barra)"></div>
        <div style="width:${r.variaveis / totalDiv * 100}%;background:var(--barra-fraca)"></div>
      </div>
      <div class="legenda">
        <span><i style="background:var(--barra)"></i>Fixas/recorrentes: <b class="num">${brl(r.fixas)}</b></span>
        <span><i style="background:var(--barra-fraca)"></i>Variáveis: <b class="num">${brl(r.variaveis)}</b></span>
      </div>
    </div>
    <div class="card">
      <div class="card-cab"><h3>Gastos por categoria</h3><span class="muted">${nomeMes(state.ano, state.mes, true)}</span></div>
      <div class="barras-cat">
        ${cats.map(([id, v]) => {
          const c = TODAS_CATS[id] || { nome: id, ic: '•' };
          return `<div class="barra-cat"><div class="linha"><span>${c.ic} ${esc(c.nome)}</span>
            <span class="num"><b>${brl(v)}</b><span class="pct">${Math.round(v / r.saidas * 100)}%</span></span></div>
            <div class="trilho"><div class="preench" style="width:${v / maxCat * 100}%"></div></div></div>`;
        }).join('')}
      </div>
    </div>` : `<div class="card vazio"><div class="ic-grande">🧾</div>Nenhuma saída neste mês.<br>Toque no <b>+</b> para lançar.</div>`}
  `;
}

function telaLancamentos() {
  let itens = itensDoMes(state.ano, state.mes);
  const f = state.filtro;
  if (f === 'entrada' || f === 'saida') itens = itens.filter(i => i.t.tipo === f);
  if (f === 'fixos') itens = itens.filter(i => ehFixa(i.t));
  if (f === 'variaveis') itens = itens.filter(i => !ehFixa(i.t));
  const chips = [['todos', 'Todos'], ['saida', 'Saídas'], ['entrada', 'Entradas'], ['fixos', 'Fixos/recorrentes'], ['variaveis', 'Variáveis']];

  let html = `<div class="filtros">${chips.map(([k, n]) => `<button class="chip ${f === k ? 'ativo' : ''}" data-filtro="${k}">${n}</button>`).join('')}</div>`;
  if (!itens.length) return html + `<div class="card vazio"><div class="ic-grande">📭</div>Nada por aqui neste mês.</div>`;

  const total = itens.reduce((s, i) => s + (i.t.tipo === 'entrada' ? i.valor : -i.valor), 0);
  html += `<div class="aviso">${itens.length} lançamento(s) · total <b class="num ${total >= 0 ? 'pos' : 'neg'}">${brl(total)}</b></div>`;

  let diaAtual = '';
  let aberto = false;
  for (const it of itens) {
    const dia = it.data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    if (dia !== diaAtual) {
      if (aberto) html += '</div>';
      html += `<div class="grupo-dia">${esc(dia)}</div><div class="lista">`;
      diaAtual = dia; aberto = true;
    }
    const c = TODAS_CATS[it.t.categoria] || { nome: it.t.categoria, ic: '•' };
    const tag = it.t.periodicidade === 'parcelado' ? `${it.parcela}/${it.de}` : (it.t.periodicidade !== 'unica' ? PERIODO_CURTO[it.t.periodicidade] : '');
    const sinal = it.t.tipo === 'entrada' ? '+' : '−';
    html += `<button class="item" data-editar="${esc(it.t.id)}">
      <span class="ic">${c.ic}</span>
      <span class="meio"><div class="desc">${esc(it.t.descricao)}</div>
        <div class="meta">${esc(c.nome)}${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</div></span>
      <span class="valor num ${it.t.tipo === 'entrada' ? 'pos' : 'neg'}">${sinal} ${brl(it.valor)}</span>
    </button>`;
  }
  if (aberto) html += '</div>';
  return html;
}

function telaPrevisao() {
  const p = previsao();
  const m = p.media;
  const baseTxt = m.parcial
    ? 'Ainda não há meses completos de histórico, então a média de gastos variáveis usa o que foi lançado <b>neste mês</b>. A previsão fica mais precisa a cada mês.'
    : `Média de gastos variáveis calculada com os últimos <b>${m.meses} ${m.meses === 1 ? 'mês' : 'meses'}</b> completos.`;
  const catsVar = Object.entries(m.porCat).sort((a, b) => b[1] - a[1]);

  return `
    <div class="aviso">${baseTxt} Ajuste em ⚙️ Ajustes.</div>
    <div class="card">
      <h3>Média mensal prevista (próximos ${MESES_PREVISAO} meses)</h3>
      <div class="resumo-linhas">
        <div><span>Entradas previstas</span><b class="num pos">${brl(p.entradasMedia)}</b></div>
        <div><span>Despesas fixas / recorrentes</span><b class="num neg">− ${brl(p.fixasMedia)}</b></div>
        <div><span>Gastos variáveis (média)</span><b class="num neg">− ${brl(p.variaveisMedia)}</b></div>
        <div class="total"><span>Sobra mensal média</span><b class="num ${p.resultadoMedio >= 0 ? 'pos' : 'neg'}">${brl(p.resultadoMedio)}</b></div>
        ${p.investMedia > 0 ? `<div><span class="muted">+ já lançado como Investimento</span><span class="num muted">${brl(p.investMedia)}</span></div>
        <div class="total"><span>Capacidade de guardar</span><b class="num">${brl(p.capacidadeMedia)}</b></div>` : ''}
      </div>
    </div>
    <div class="card">
      <div class="card-cab"><h3>Resultado de cada mês</h3><span class="muted">entradas − saídas</span></div>
      <div class="graf-wrap" id="graf-barras">${graficoBarras(p.meses)}</div>
    </div>
    <div class="card">
      <div class="card-cab"><h3>Saldo acumulado em conta</h3><span class="muted">partindo de ${brl(state.settings.saldoInicial)}</span></div>
      <div class="graf-wrap" id="graf-linha">${graficoLinha(p.meses)}</div>
    </div>
    <div class="card">
      <h3>Mês a mês</h3>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Mês</th><th>Resultado</th><th>Acumulado</th><th>Entradas</th><th>Fixas</th><th>Variáveis</th></tr></thead>
        <tbody>${p.meses.map((x, k) => `<tr class="${k === 0 ? 'atual' : ''}">
          <td>${esc(nomeMesAno(x.i))}</td>
          <td class="num ${x.resultado >= 0 ? 'pos' : 'neg'}">${brl(x.resultado)}</td>
          <td class="num ${x.acumulado >= 0 ? '' : 'neg'}">${brl(x.acumulado)}</td>
          <td class="num">${brl(x.entradas)}</td>
          <td class="num">${brl(x.saidas - x.variaveis)}</td><td class="num">${brl(x.variaveis)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
    ${catsVar.length ? `<div class="card"><h3>Média de gastos variáveis por categoria</h3><div class="resumo-linhas">
      ${catsVar.map(([id, v]) => `<div><span>${TODAS_CATS[id]?.ic || ''} ${esc(TODAS_CATS[id]?.nome || id)}</span><span class="num">${brl(v)}/mês</span></div>`).join('')}
    </div></div>` : ''}
  `;
}

function ligarGraficos() {
  const p = previsao();
  ligarTooltips($('#graf-barras'), p.meses, m => `<b>${esc(nomeMes(deIdx(m.i).ano, deIdx(m.i).mes))}</b>
    Entradas: ${brl(m.entradas)}<br>Saídas: ${brl(m.saidas)}<br>Resultado: ${brl(m.resultado)}`);
  ligarTooltips($('#graf-linha'), p.meses, m => `<b>${esc(nomeMes(deIdx(m.i).ano, deIdx(m.i).mes))}</b>Saldo acumulado: ${brl(m.acumulado)}`);
}

function telaMetas() {
  const p = previsao();
  const metas = state.settings.metas || [];
  let html = `<div class="card destaque"><small>Sua capacidade média de guardar</small>
    <div class="grande num">${brl(p.capacidadeMedia)}/mês</div>
    <small>= entradas − despesas fixas − média de variáveis${p.investMedia > 0 ? ' (lançamentos em Investimento contam como dinheiro guardado)' : ''}. Cada meta abaixo considera toda essa sobra indo para ela.</small></div>`;

  if (!metas.length) {
    html += `<div class="card vazio"><div class="ic-grande">🎯</div>Nenhuma meta ainda.<br><br>
      <button class="btn btn-primario" data-acao="nova-meta">Criar minha primeira meta</button></div>`;
    return html;
  }

  for (const m of metas) {
    const pl = planoMeta(m, p.capacidadeMedia);
    const pct = Math.min(100, (m.guardado || 0) / (m.valor || 1) * 100);
    let plano = '';
    if (pl.concluida) {
      plano = `<p class="pos" style="margin:12px 0 0;font-weight:700">Meta atingida! 🎉</p>`;
    } else {
      const boxes = [];
      if (m.prazo) {
        boxes.push(`<div class="box"><div class="rot">Para chegar no prazo</div><div class="val num">${brl(pl.necessario)}/mês</div>
          <div class="sub">por ${textoMeses(pl.mesesAtePrazo)} <span class="selo ${pl.viavel ? 'ok' : 'ruim'}">${pl.viavel ? 'cabe no orçamento' : 'acima da sua sobra'}</span></div></div>`);
      }
      boxes.push(`<div class="box"><div class="rot">Guardando toda a sobra</div><div class="val num">${pl.mesesComSobra ? textoMeses(pl.mesesComSobra) : 'Sem sobra'}</div>
        <div class="sub">${pl.mesesComSobra ? `${brl(pl.cap)}/mês · até ${mesesParaData(pl.mesesComSobra)}` : 'gastos ≥ entradas'}</div></div>`);

      const sugestao = m.aporte || (m.prazo ? pl.necessario : pl.cap) || 500;
      const maxSlider = Math.max(pl.cap * 1.5, (pl.necessario || 0) * 1.3, sugestao * 1.3, 500);
      const passo = maxSlider > 5000 ? 50 : 10;
      plano = `<div class="plano">${boxes.join('')}</div>
        <div class="simulador">
          <div class="linha"><span>Simular: quanto vou guardar por mês?</span><b class="num" data-sim-valor="${esc(m.id)}"></b></div>
          <input type="range" min="${passo}" max="${Math.ceil(maxSlider / passo) * passo}" step="${passo}" value="${Math.round(sugestao / passo) * passo}" data-sim="${esc(m.id)}">
          <div class="muted" data-sim-res="${esc(m.id)}" style="font-size:14px;margin-top:4px"></div>
        </div>`;
    }
    html += `<div class="card meta-card">
      <div class="card-cab"><h3>🎯 ${esc(m.nome)}</h3><span class="num"><b>${brl(m.valor)}</b></span></div>
      ${m.prazo ? `<div class="muted" style="font-size:13px;margin-top:-8px">Prazo: ${esc(nomeMesAno(idxMes(+m.prazo.slice(0, 4), +m.prazo.slice(5, 7) - 1)))}</div>` : ''}
      <div class="progresso"><div style="width:${pct}%"></div></div>
      <div class="numeros"><span>Guardado: <b class="num">${brl(m.guardado)}</b> (${Math.round(pct)}%)</span><span>Falta: <b class="num">${brl(pl.falta)}</b></span></div>
      ${plano}
      <div class="acoes-meta">
        <button class="btn btn-pequeno btn-primario" data-aporte="${esc(m.id)}">+ Registrar valor guardado</button>
        <button class="btn btn-pequeno" data-editar-meta="${esc(m.id)}">Editar</button>
      </div>
    </div>`;
  }
  html += `<button class="btn btn-largo" data-acao="nova-meta">+ Nova meta</button>`;
  return html;
}

function ligarSimuladores() {
  for (const r of $$('input[data-sim]')) {
    const id = r.dataset.sim;
    const meta = state.settings.metas.find(m => m.id === id);
    const atualizar = () => {
      const v = Number(r.value);
      const falta = Math.max(0, meta.valor - (meta.guardado || 0));
      const n = Math.ceil(falta / v);
      $(`[data-sim-valor="${CSS.escape(id)}"]`).textContent = brl(v) + '/mês';
      $(`[data-sim-res="${CSS.escape(id)}"]`).innerHTML = `Você chega lá em <b>${textoMeses(n)}</b> (${mesesParaData(n)}).`;
    };
    r.addEventListener('input', atualizar);
    r.addEventListener('change', () => { meta.aporte = Number(r.value); salvarSettings(false); });
    atualizar();
  }
}

function telaConfig() {
  const s = state.settings;
  const local = backend?.tipo === 'local';
  return `
    <div class="card">
      <h3>Previsão</h3>
      <div class="opcao"><div class="txt">Saldo em conta no início deste mês<small>Ponto de partida do saldo acumulado</small></div>
        <input type="text" inputmode="decimal" id="cfg-saldo" value="${valorParaInput(s.saldoInicial)}" placeholder="0,00"></div>
      <div class="opcao"><div class="txt">Meses para a média de variáveis<small>Últimos meses completos usados no cálculo</small></div>
        <select id="cfg-meses">${[1, 2, 3, 4, 6, 9, 12].map(n => `<option value="${n}" ${n === Number(s.mesesMedia) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="opcao"><div class="txt">Contar entradas avulsas na previsão<small>Usa a média de entradas "uma única vez" (freelas, extras)</small></div>
        <input type="checkbox" id="cfg-avulsas" ${s.incluirEntradasAvulsas ? 'checked' : ''}></div>
    </div>
    <div class="card">
      <h3>Seus dados</h3>
      <div class="opcao"><div class="txt">Backup completo<small>Arquivo .json com tudo (para guardar ou restaurar)</small></div>
        <button class="btn btn-pequeno" data-acao="exportar">Exportar</button></div>
      <div class="opcao"><div class="txt">Restaurar backup<small>Junta os lançamentos do arquivo com os atuais</small></div>
        <button class="btn btn-pequeno" data-acao="importar">Importar</button></div>
      <div class="opcao"><div class="txt">Planilha<small>Exporta os lançamentos em .csv (abre no Excel)</small></div>
        <button class="btn btn-pequeno" data-acao="csv">Exportar CSV</button></div>
      <input type="file" id="arquivo-import" accept=".json,application/json" hidden>
    </div>
    <div class="card">
      <h3>Conta</h3>
      ${local ? `<p class="muted" style="margin:0">Modo local: os dados ficam salvos apenas neste navegador. Para sincronizar entre celular e computador, configure o Firebase (veja o arquivo LEIAME.md).</p>`
      : `<div class="opcao"><div class="txt">Conectado como<small>${esc(backend?.usuario?.email || '')}</small></div>
        <button class="btn btn-pequeno btn-perigo" data-acao="sair">Sair</button></div>`}
    </div>
    <p class="muted" style="text-align:center;font-size:12px">Minhas Finanças · ${state.transacoes.length} lançamento(s)</p>
  `;
}

/* =====================================================================
   Modal de lançamento
   ===================================================================== */
const formL = () => $('#form-lanc');

function montarCategorias(tipo, selecionada) {
  const cats = tipo === 'entrada' ? CATS_ENTRADA : CATS_SAIDA;
  const sel = cats.some(c => c.id === selecionada) ? selecionada : cats[0].id;
  $('#grade-cat').innerHTML = cats.map(c => `<label><input type="radio" name="categoria" value="${c.id}" ${c.id === sel ? 'checked' : ''}><span><b>${c.ic}</b>${esc(c.nome)}</span></label>`).join('');
}

function atualizarCamposPeriodo() {
  const f = formL();
  const per = f.periodicidade.value;
  $('#campo-parcelas').hidden = per !== 'parcelado';
  $('#campo-fim').hidden = per === 'unica' || per === 'parcelado';
  $('#rotulo-valor').textContent = per === 'parcelado' ? 'Valor total da compra (R$)' : (per === 'unica' ? 'Valor (R$)' : 'Valor de cada ocorrência (R$)');
  $('#rotulo-data').textContent = per === 'unica' ? 'Data' : (per === 'parcelado' ? 'Data da 1ª parcela' : 'Primeira ocorrência');
  if (per === 'parcelado') {
    const v = parseValor(f.valor.value), n = Number(f.parcelas.value) || 1;
    $('#info-parcela').textContent = v > 0 ? `${n}x de ${brl(v / n)}` : '';
  }
}

function abrirLancamento(id = null) {
  const f = formL();
  f.reset();
  state.editandoId = id;
  const t = id ? state.transacoes.find(x => x.id === id) : null;
  $('#modal-titulo').textContent = t ? 'Editar lançamento' : 'Novo lançamento';
  $('#btn-excluir').hidden = !t;
  const tipo = t?.tipo || 'saida';
  f.querySelector(`input[name="tipo"][value="${tipo}"]`).checked = true;
  montarCategorias(tipo, t?.categoria);
  f.valor.value = t ? valorParaInput(t.valor) : '';
  f.descricao.value = t?.descricao || '';
  f.periodicidade.value = t?.periodicidade || 'unica';
  f.parcelas.value = t?.parcelas || 2;
  // data padrão: hoje se estiver no mês atual, senão dia 1 do mês visualizado
  const padrao = (state.ano === hoje.getFullYear() && state.mes === hoje.getMonth()) ? new Date() : new Date(state.ano, state.mes, 1);
  f.data.value = t?.data || dataISO(padrao);
  f.dataFim.value = t?.dataFim || '';
  atualizarCamposPeriodo();
  $('#modal-lanc').showModal();
  if (!t) setTimeout(() => f.valor.focus(), 50);
}

function salvarLancamento(ev) {
  ev.preventDefault();
  const f = formL();
  const valor = parseValor(f.valor.value);
  if (!(valor > 0)) { toast('Informe um valor válido'); f.valor.focus(); return; }
  const per = f.periodicidade.value;
  const existente = state.editandoId ? state.transacoes.find(x => x.id === state.editandoId) : null;
  const t = {
    id: state.editandoId || novoId(),
    tipo: f.tipo.value,
    descricao: f.descricao.value.trim(),
    valor: Math.round(valor * 100) / 100,
    categoria: f.categoria.value,
    periodicidade: per,
    data: f.data.value,
    criadoEm: existente?.criadoEm || Date.now(),
  };
  if (per === 'parcelado') t.parcelas = Math.max(2, Math.min(120, Number(f.parcelas.value) || 2));
  if (per !== 'unica' && per !== 'parcelado' && f.dataFim.value) t.dataFim = f.dataFim.value;
  backend.salvarTransacao(t);
  $('#modal-lanc').close();
  toast(existente ? 'Lançamento atualizado' : 'Lançamento salvo');
}

function excluirLancamento() {
  const t = state.transacoes.find(x => x.id === state.editandoId);
  if (!t) return;
  const extra = t.periodicidade !== 'unica' ? '\n\nIsso remove TODAS as ocorrências (passadas e futuras). Para só parar daqui pra frente, use "Termina em".' : '';
  if (!confirm(`Excluir "${t.descricao}"?${extra}`)) return;
  backend.excluirTransacao(t.id);
  $('#modal-lanc').close();
  toast('Lançamento excluído');
}

/* =====================================================================
   Metas e ajustes
   ===================================================================== */
function salvarSettings(rerender = true) {
  backend.salvarSettings(JSON.parse(JSON.stringify(state.settings)));
  if (rerender) render();
}

function abrirMeta(id = null) {
  const f = $('#form-meta');
  f.reset();
  state.editandoMetaId = id;
  const m = id ? state.settings.metas.find(x => x.id === id) : null;
  $('#meta-titulo').textContent = m ? 'Editar meta' : 'Nova meta';
  $('#btn-excluir-meta').hidden = !m;
  f.nome.value = m?.nome || '';
  f.valor.value = m ? valorParaInput(m.valor) : '';
  f.guardado.value = m ? valorParaInput(m.guardado) : '';
  f.prazo.value = m?.prazo || '';
  $('#modal-meta').showModal();
}

function salvarMeta(ev) {
  ev.preventDefault();
  const f = $('#form-meta');
  const valor = parseValor(f.valor.value);
  const guardado = parseValor(f.guardado.value) || 0;
  if (!(valor > 0)) { toast('Informe o valor da meta'); return; }
  if (isNaN(guardado) || guardado < 0) { toast('Valor guardado inválido'); return; }
  const metas = state.settings.metas || (state.settings.metas = []);
  const existente = metas.find(x => x.id === state.editandoMetaId);
  const m = existente || { id: novoId() };
  Object.assign(m, { nome: f.nome.value.trim(), valor, guardado, prazo: f.prazo.value || '' });
  if (!existente) metas.push(m);
  $('#modal-meta').close();
  salvarSettings();
  toast('Meta salva');
}

function excluirMeta() {
  const m = state.settings.metas.find(x => x.id === state.editandoMetaId);
  if (!m || !confirm(`Excluir a meta "${m.nome}"?`)) return;
  state.settings.metas = state.settings.metas.filter(x => x.id !== m.id);
  $('#modal-meta').close();
  salvarSettings();
}

function registrarAporte(id) {
  const m = state.settings.metas.find(x => x.id === id);
  const txt = prompt(`Quanto você guardou para "${m.nome}"?\n(use valor negativo para retirar)`, '');
  if (txt == null) return;
  const v = parseValor(txt);
  if (!v || isNaN(v)) { toast('Valor inválido'); return; }
  m.guardado = Math.max(0, Math.round(((m.guardado || 0) + v) * 100) / 100);
  salvarSettings();
  toast(`Guardado agora: ${brl(m.guardado)}`);
}

function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarJSON() {
  const dados = { app: 'minhas-financas', versao: 1, exportadoEm: new Date().toISOString(), transacoes: state.transacoes, settings: state.settings };
  baixar(`financas-backup-${dataISO(new Date())}.json`, JSON.stringify(dados, null, 2), 'application/json');
}

function exportarCSV() {
  const cab = ['Tipo', 'Descrição', 'Valor', 'Categoria', 'Periodicidade', 'Parcelas', 'Data', 'Termina em'];
  const linhas = state.transacoes.map(t => [
    t.tipo === 'entrada' ? 'Entrada' : 'Saída', t.descricao, String(t.valor).replace('.', ','),
    TODAS_CATS[t.categoria]?.nome || t.categoria, PERIODO_CURTO[t.periodicidade], t.parcelas || '', t.data, t.dataFim || '',
  ]);
  const csv = [cab, ...linhas].map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  baixar(`financas-${dataISO(new Date())}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}

async function importarJSON(arquivo) {
  try {
    const dados = JSON.parse(await arquivo.text());
    if (!Array.isArray(dados.transacoes)) throw new Error('formato');
    const validas = dados.transacoes.filter(t => t && t.id && t.tipo && t.valor > 0 && t.data && t.periodicidade);
    if (!confirm(`Importar ${validas.length} lançamento(s)${dados.settings ? ' e as configurações/metas' : ''}? Lançamentos com o mesmo ID serão substituídos.`)) return;
    await backend.importar(validas);
    if (dados.settings) { state.settings = { ...SETTINGS_PADRAO, ...dados.settings }; salvarSettings(); }
    toast('Backup importado');
  } catch (e) {
    console.error(e);
    alert('Não foi possível ler este arquivo. Ele precisa ser um backup exportado por este app.');
  }
}

/* =====================================================================
   Armazenamento: local (navegador) ou Firebase (nuvem)
   ===================================================================== */
const limpar = o => JSON.parse(JSON.stringify(o)); // remove undefined

function criarBackendLocal(onDados) {
  const K = 'minhas-financas-v1';
  let dados;
  try { dados = JSON.parse(localStorage.getItem(K)) || {}; } catch { dados = {}; }
  dados.transacoes ||= [];
  const emitir = () => onDados({ transacoes: dados.transacoes.slice(), settings: dados.settings || null });
  const gravar = () => { localStorage.setItem(K, JSON.stringify(dados)); emitir(); };
  window.addEventListener('storage', e => { if (e.key === K) { dados = JSON.parse(e.newValue || '{}'); dados.transacoes ||= []; emitir(); } });
  return {
    tipo: 'local',
    iniciar: emitir,
    salvarTransacao(t) {
      const i = dados.transacoes.findIndex(x => x.id === t.id);
      if (i >= 0) dados.transacoes[i] = t; else dados.transacoes.push(t);
      gravar();
    },
    excluirTransacao(id) { dados.transacoes = dados.transacoes.filter(x => x.id !== id); gravar(); },
    salvarSettings(s) { dados.settings = s; gravar(); },
    async importar(lista) {
      const mapa = new Map(dados.transacoes.map(t => [t.id, t]));
      lista.forEach(t => mapa.set(t.id, t));
      dados.transacoes = [...mapa.values()];
      gravar();
    },
  };
}

async function criarBackendFirebase(onDados, onErro) {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [appMod, A, F] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js'),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch {
    db = F.getFirestore(app);
  }
  let unsubs = [];
  let uid = null;
  const erro = e => { console.error(e); onErro?.(e); };
  const docT = id => F.doc(db, 'users', uid, 'transacoes', id);
  const docS = () => F.doc(db, 'users', uid, 'config', 'settings');

  return {
    tipo: 'firebase',
    usuario: null,
    onAuth(cb) { A.onAuthStateChanged(auth, u => { this.usuario = u; cb(u); }); },
    loginGoogle: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    loginEmail: (e, s) => A.signInWithEmailAndPassword(auth, e, s),
    criarConta: (e, s) => A.createUserWithEmailAndPassword(auth, e, s),
    async sair() { unsubs.forEach(u => u()); unsubs = []; await A.signOut(auth); },
    iniciar(user) {
      uid = user.uid;
      unsubs.forEach(u => u());
      unsubs = [
        F.onSnapshot(F.collection(db, 'users', uid, 'transacoes'), { includeMetadataChanges: true }, snap => {
          onDados({
            transacoes: snap.docs.map(d => ({ ...d.data(), id: d.id })),
            sync: snap.metadata.hasPendingWrites ? '⟳ Sincronizando…' : (snap.metadata.fromCache ? '○ Offline' : '✓ Sincronizado'),
          });
        }, erro),
        F.onSnapshot(docS(), d => onDados({ settings: d.exists() ? d.data() : null }), erro),
      ];
    },
    salvarTransacao(t) { const { id, ...resto } = t; F.setDoc(docT(id), limpar(resto)).catch(erro); },
    excluirTransacao(id) { F.deleteDoc(docT(id)).catch(erro); },
    salvarSettings(s) { F.setDoc(docS(), limpar(s)).catch(erro); },
    async importar(lista) {
      for (let i = 0; i < lista.length; i += 400) {
        const lote = F.writeBatch(db);
        lista.slice(i, i + 400).forEach(t => { const { id, ...resto } = t; lote.set(docT(id), limpar(resto)); });
        await lote.commit();
      }
    },
  };
}

function receberDados(d) {
  if (d.transacoes) state.transacoes = d.transacoes;
  if ('settings' in d) state.settings = { ...SETTINGS_PADRAO, ...(d.settings || {}), metas: d.settings?.metas || [] };
  if (d.sync) state.sync = d.sync;
  // não re-renderiza enquanto o usuário arrasta um simulador ou digita nos ajustes
  const foco = document.activeElement;
  if (foco && foco.closest && foco.closest('#conteudo') && (foco.matches('input[type=range]') || foco.matches('input[type=text]'))) {
    $('#status-sync').textContent = state.sync;
    return;
  }
  render();
}

function mensagemErroAuth(e) {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'E-mail ou senha incorretos.';
  if (c.includes('email-already-in-use')) return 'Este e-mail já tem conta. Use "Entrar".';
  if (c.includes('weak-password')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (c.includes('invalid-email')) return 'E-mail inválido.';
  if (c.includes('popup-closed')) return 'Login cancelado.';
  if (c.includes('unauthorized-domain')) return 'Este endereço não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).';
  if (c.includes('operation-not-allowed')) return 'Este método de login não está ativado no Firebase.';
  if (c.includes('network')) return 'Sem conexão com a internet.';
  return 'Erro: ' + (e?.message || c);
}

/* =====================================================================
   Eventos
   ===================================================================== */
function ligarEventos() {
  $('.abas').addEventListener('click', e => {
    const b = e.target.closest('button[data-aba]');
    if (!b) return;
    state.aba = b.dataset.aba;
    render();
    window.scrollTo(0, 0);
  });

  $('#mes-nav').addEventListener('click', e => {
    const b = e.target.closest('[data-mes]');
    if (!b) return;
    const i = idxMes(state.ano, state.mes) + Number(b.dataset.mes);
    ({ ano: state.ano, mes: state.mes } = deIdx(i));
    render();
  });
  $('#mes-titulo').addEventListener('click', () => { state.ano = hoje.getFullYear(); state.mes = hoje.getMonth(); render(); });

  $('#btn-novo').addEventListener('click', () => abrirLancamento());

  $('#conteudo').addEventListener('click', e => {
    const el = e.target.closest('[data-editar],[data-filtro],[data-acao],[data-aporte],[data-editar-meta]');
    if (!el) return;
    if (el.dataset.editar) abrirLancamento(el.dataset.editar);
    else if (el.dataset.filtro) { state.filtro = el.dataset.filtro; render(); }
    else if (el.dataset.aporte) registrarAporte(el.dataset.aporte);
    else if (el.dataset.editarMeta) abrirMeta(el.dataset.editarMeta);
    else {
      const a = el.dataset.acao;
      if (a === 'nova-meta') abrirMeta();
      if (a === 'exportar') exportarJSON();
      if (a === 'csv') exportarCSV();
      if (a === 'importar') $('#arquivo-import').click();
      if (a === 'sair' && confirm('Sair da conta neste aparelho?')) backend.sair();
    }
  });

  $('#conteudo').addEventListener('change', e => {
    const s = state.settings;
    if (e.target.id === 'cfg-saldo') {
      const v = parseValor(e.target.value);
      if (isNaN(v)) { toast('Valor inválido'); return; }
      s.saldoInicial = v; salvarSettings(false); toast('Saldo atualizado');
    }
    if (e.target.id === 'cfg-meses') { s.mesesMedia = Number(e.target.value); salvarSettings(false); toast('Média atualizada'); }
    if (e.target.id === 'cfg-avulsas') { s.incluirEntradasAvulsas = e.target.checked; salvarSettings(false); }
    if (e.target.id === 'arquivo-import' && e.target.files[0]) { importarJSON(e.target.files[0]); e.target.value = ''; }
  });

  // Modal de lançamento
  $('#sel-periodo').innerHTML = Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  const f = formL();
  f.addEventListener('submit', salvarLancamento);
  f.addEventListener('change', e => {
    if (e.target.name === 'tipo') montarCategorias(e.target.value, f.categoria?.value);
    if (e.target.name === 'periodicidade') atualizarCamposPeriodo();
  });
  f.addEventListener('input', e => { if (e.target.name === 'valor' || e.target.name === 'parcelas') atualizarCamposPeriodo(); });
  $('#btn-excluir').addEventListener('click', excluirLancamento);

  // Modal de meta
  $('#form-meta').addEventListener('submit', salvarMeta);
  $('#btn-excluir-meta').addEventListener('click', excluirMeta);

  $$('[data-fechar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
}

function ligarLogin() {
  const erro = $('#login-erro');
  const mostrar = e => { erro.textContent = mensagemErroAuth(e); erro.hidden = false; };
  $('#btn-google').addEventListener('click', () => { erro.hidden = true; backend.loginGoogle().catch(mostrar); });
  $('#form-login').addEventListener('submit', ev => {
    ev.preventDefault(); erro.hidden = true;
    backend.loginEmail($('#login-email').value.trim(), $('#login-senha').value).catch(mostrar);
  });
  $('#btn-criar-conta').addEventListener('click', () => {
    const email = $('#login-email').value.trim(), senha = $('#login-senha').value;
    if (!email || senha.length < 6) { mostrar({ code: senha.length < 6 ? 'weak-password' : 'invalid-email' }); return; }
    erro.hidden = true;
    backend.criarConta(email, senha).catch(mostrar);
  });
}

/* =====================================================================
   Inicialização
   ===================================================================== */
async function iniciar() {
  ligarEventos();
  const usaFirebase = !!(firebaseConfig && firebaseConfig.apiKey);

  if (!usaFirebase) {
    backend = criarBackendLocal(receberDados);
    state.sync = '● Modo local';
    $('#app').hidden = false;
    backend.iniciar();
  } else {
    try {
      backend = await criarBackendFirebase(receberDados, e => toast('Erro ao salvar: ' + (e.code || e.message)));
    } catch (e) {
      console.error(e);
      document.body.innerHTML = '<p style="padding:24px;font-family:system-ui">Não foi possível carregar o Firebase. Verifique a internet e recarregue a página.</p>';
      return;
    }
    ligarLogin();
    backend.onAuth(user => {
      $('#tela-login').hidden = !!user;
      $('#app').hidden = !user;
      if (user) { state.sync = '⟳ Carregando…'; render(); backend.iniciar(user); }
      else { state.transacoes = []; state.settings = { ...SETTINGS_PADRAO }; }
    });
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

iniciar();
