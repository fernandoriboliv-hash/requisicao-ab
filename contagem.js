const SURL='https://nyijprhukndlyijqljbm.supabase.co';
const SKEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55aWpwcmh1a25kbHlpanFsamJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MjUwMDgsImV4cCI6MjA5MjIwMTAwOH0.Vzljd9xesi1ZJ-l7du00v-elUSDQObRCUz2jPyqL5p8';
const sb = supabase.createClient(SURL, SKEY);
let user=null, checklistItens=[], valores={}, historicoData=[];

window.addEventListener('DOMContentLoaded', async () => {
  user = JSON.parse(sessionStorage.getItem('rw_user') || 'null');
  if (!user || user.perfil !== 'operacional' || user.subtipo !== 'estoque') { location.href = 'index.html'; return; }
  document.getElementById('user-nome').textContent = user.nome;
  document.getElementById('busca-data').value = new Date().toISOString().split('T')[0];
  await carregarChecklist();
  await carregarHistoricoCompleto();
});

function logout() { sessionStorage.clear(); location.href = 'index.html'; }

function showTab(id, el) {
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('pane-'+id).classList.add('active');
  el.classList.add('active');
}

async function carregarChecklist() {
  const {data} = await sb.from('checklist_itens').select('*').eq('ativo',true).order('area').order('ordem');
  checklistItens = data || [];
  const areas = {};
  checklistItens.forEach(it => {
    if (!areas[it.area]) areas[it.area] = {};
    const s = it.secao || '__';
    if (!areas[it.area][s]) areas[it.area][s] = [];
    areas[it.area][s].push(it);
  });
  const container = document.getElementById('checklist-container');
  let html = '';
  Object.entries(areas).forEach(([area, secoes]) => {
    const aid = area.replace(/\s/g,'_');
    const total = Object.values(secoes).flat().length;
    html += `<div class="area-section"><div class="area-header" onclick="toggleArea('${aid}')"><h3>${area}</h3><span class="area-prog" id="prog-area-${aid}">0/${total}</span></div><div class="area-body" id="body-area-${aid}">`;
    Object.entries(secoes).forEach(([sec, itens]) => {
      if (sec !== '__') html += `<div class="secao-label">${sec}</div>`;
      itens.forEach(it => {
        html += `<div class="item-row" id="row-${it.id}">
          <div class="item-check" id="check-${it.id}" onclick="toggleCheck('${it.id}')"></div>
          <div><div class="item-nome">${it.item}</div>${it.nota?`<div class="item-nota">${it.nota}</div>`:''}</div>
          <span class="item-un">${it.unidade_padrao||'-'}</span>
          <input class="item-input" type="number" id="input-${it.id}" min="0" step="0.01" placeholder="0" oninput="onInput('${it.id}',this.value)" onchange="onInput('${it.id}',this.value)">
        </div>`;
      });
    });
    html += '</div></div>';
  });
  container.innerHTML = html;
  atualizarProgresso();
}

function toggleArea(id) {
  const b = document.getElementById('body-area-'+id);
  b.style.display = b.style.display === 'none' ? 'block' : 'none';
}

function onInput(id, val) {
  const v = parseFloat(val);
  valores[id] = isNaN(v) ? null : v;
  const inp = document.getElementById('input-'+id);
  inp.classList.toggle('filled', v >= 0 && val !== '');
  const ch = document.getElementById('check-'+id);
  if (val !== '' && v >= 0) { ch.classList.add('checked'); ch.textContent = '✓'; }
  else { ch.classList.remove('checked'); ch.textContent = ''; }
  atualizarProgresso();
}

function toggleCheck(id) {
  const ch = document.getElementById('check-'+id), inp = document.getElementById('input-'+id);
  if (ch.classList.contains('checked')) {
    ch.classList.remove('checked'); ch.textContent = '';
    inp.value = ''; valores[id] = null;
  } else {
    ch.classList.add('checked'); ch.textContent = '✓';
    if (!inp.value) { inp.value = '0'; valores[id] = 0; inp.classList.add('filled'); }
  }
  atualizarProgresso();
}

function atualizarProgresso() {
  const total = checklistItens.length;
  const pre = Object.values(valores).filter(v => v !== null).length;
  const pct = total > 0 ? Math.round((pre/total)*100) : 0;
  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('prog-pct').textContent = pct + '%';
  document.getElementById('prog-label').textContent = `${pre} de ${total} itens contados`;
  const am = {};
  checklistItens.forEach(it => {
    if (!am[it.area]) am[it.area] = {t:0, f:0};
    am[it.area].t++;
    if (valores[it.id] !== undefined && valores[it.id] !== null) am[it.area].f++;
  });
  Object.entries(am).forEach(([a, v]) => {
    const el = document.getElementById('prog-area-'+a.replace(/\s/g,'_'));
    if (el) el.textContent = `${v.f}/${v.t}`;
  });
}

async function confirmarContagem() {
  const pre = Object.entries(valores).filter(([,v]) => v !== null);
  if (!pre.length) { alert('Nenhum item contado.'); return; }
  if (!confirm(`Confirmar contagem de ${pre.length} itens?`)) return;
  const hoje = new Date().toISOString().split('T')[0];
  await sb.from('contagens').delete().eq('data', hoje);
  const regs = pre.map(([id, qtd]) => {
    const it = checklistItens.find(c => c.id===id);
    return { data: hoje, item: it?.item||id, area: it?.area||'-', quantidade: qtd, contado_por: user.id };
  });
  const {error} = await sb.from('contagens').insert(regs);
  if (error) { alert('Erro ao salvar: '+error.message); return; }
  alert(`Contagem salva! ${regs.length} itens registrados.`);
  await carregarHistoricoCompleto();
}

async function carregarHistoricoCompleto() {
  const {data} = await sb.from('contagens').select('*').order('data',{ascending:false}).limit(500);
  historicoData = data || [];
  renderHistorico(historicoData);
}

function filtrarHistorico(q) {
  if (!q) { renderHistorico(historicoData); return; }
  renderHistorico(historicoData.filter(c => c.item.toLowerCase().includes(q.toLowerCase())));
}

function renderHistorico(data) {
  const el = document.getElementById('historico-body');
  if (!data || !data.length) { el.innerHTML = '<div class="empty">Nenhum registro encontrado.</div>'; return; }
  const pi = {};
  data.forEach(c => { if (!pi[c.item]) pi[c.item]=[]; pi[c.item].push(c); });
  let html = '<table><thead><tr><th>Item</th><th>Data</th><th>Quantidade</th><th>Variacao</th></tr></thead><tbody>';
  Object.entries(pi).forEach(([item, regs]) => {
    regs.forEach((c, i) => {
      const ant = regs[i+1];
      let vh = '-';
      if (ant) {
        const d = c.quantidade - ant.quantidade, p = ((d/Math.max(ant.quantidade,1))*100).toFixed(0);
        vh = `<span style="color:${d<0?'#e74c3c':'#2ecc71'}">${d>0?'+':''}${p}%</span>`;
      }
      html += `<tr><td>${i===0?`<strong>${item}</strong>`:''}</td><td>${new Date(c.data+'T12:00:00').toLocaleDateString('pt-BR')}</td><td>${c.quantidade}</td><td>${vh}</td></tr>`;
    });
  });
  el.innerHTML = html + '</tbody></table>';
}

async function buscarPorIngrediente(q) {
  const el = document.getElementById('busca-resultado');
  if (!q || q.length < 2) { el.innerHTML = '<div class="empty">Digite ao menos 2 caracteres.</div>'; return; }
  const data = document.getElementById('busca-data').value || new Date().toISOString().split('T')[0];
  const {data:reqs} = await sb.from('requisicoes')
    .select('pdv,requisicao_itens(item_nome,quantidade,unidade,ingredientes(nome))')
    .eq('status','aprovada').gte('criado_em',data+'T00:00:00').lte('criado_em',data+'T23:59:59');
  const res = [];
  (reqs||[]).forEach(r => {
    (r.requisicao_itens||[]).forEach(i => {
      const n = i.ingredientes?.nome||i.item_nome||'?';
      if (n.toLowerCase().includes(q.toLowerCase())) res.push({pdv:r.pdv, item:n, qtd:i.quantidade, un:i.unidade||'-'});
    });
  });
  if (!res.length) { el.innerHTML = `<div class="empty">Nenhuma requisicao com "${q}" em ${new Date(data+'T12:00:00').toLocaleDateString('pt-BR')}.</div>`; return; }
  let html = `<h3 style="margin-bottom:12px;font-size:14px">Requisicoes com "${q}" em ${new Date(data+'T12:00:00').toLocaleDateString('pt-BR')}</h3>`;
  html += '<table><thead><tr><th>PDV</th><th>Item</th><th>Qtd</th><th>Unidade</th></tr></thead><tbody>';
  res.forEach(r => { html += `<tr><td><strong>${r.pdv}</strong></td><td>${r.item}</td><td>${r.qtd}</td><td>${r.un}</td></tr>`; });
  el.innerHTML = html + '</tbody></table>';
}
