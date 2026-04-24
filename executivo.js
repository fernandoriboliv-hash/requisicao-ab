const SURL='https://nyijprhukndlyijqljbm.supabase.co';
const SKEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55aWpwcmh1a25kbHlpanFsamJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MjUwMDgsImV4cCI6MjA5MjIwMTAwOH0.Vzljd9xesi1ZJ-l7du00v-elUSDQObRCUz2jPyqL5p8';
const sb = supabase.createClient(SURL, SKEY);
let user=null, ings=[], itens=[], itemAtual=null;

async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

window.addEventListener('DOMContentLoaded', async () => {
  user = JSON.parse(sessionStorage.getItem('rw_user') || 'null');
  if (!user || user.perfil !== 'executivo') { location.href = 'index.html'; return; }
  document.getElementById('user-nome').textContent = user.nome;
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('req-entrega').value = hoje;
  const m = new Date(); m.setDate(m.getDate()-30);
  document.getElementById('hist-ini').value = document.getElementById('cons-ini').value = m.toISOString().split('T')[0];
  document.getElementById('hist-fim').value = document.getElementById('cons-fim').value = hoje;
  const {data} = await sb.from('ingredientes').select('id,nome,unidade').eq('ativo',true).order('nome');
  ings = data || [];
  await carregarDashboard();
  carregarHistorico();
});

function logout() { sessionStorage.clear(); location.href = 'index.html'; }

function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  el.classList.add('active');
  if (id === 'historico') carregarHistorico();
}

async function carregarDashboard() {
  const pdv = document.getElementById('filtro-pdv').value;
  const hoje = new Date().toISOString().split('T')[0];
  let q = sb.from('requisicoes').select('*,usuarios(nome),requisicao_itens(*)');
  if (pdv) q = q.eq('pdv', pdv);
  const {data: reqs} = await q.order('criado_em',{ascending:false}).limit(50);
  const hr = (reqs||[]).filter(r => r.criado_em.startsWith(hoje));
  document.getElementById('val-hoje').textContent = hr.length;
  document.getElementById('val-aprov').textContent = (reqs||[]).filter(r=>r.status==='aprovada').length;
  document.getElementById('val-pend').textContent = (reqs||[]).filter(r=>r.status==='aberta').length;
  const el = document.getElementById('dash-body');
  if (!reqs || !reqs.length) { el.innerHTML = '<div class="empty">Nenhuma requisicao encontrada.</div>'; return; }
  let html = '<table><thead><tr><th>Data</th><th>PDV</th><th>Solicitante</th><th>Itens</th><th>Status</th><th>Acoes</th></tr></thead><tbody>';
  reqs.slice(0,30).forEach(r => {
    html += `<tr><td>${new Date(r.criado_em).toLocaleDateString('pt-BR')}</td><td><strong>${r.pdv||'-'}</strong></td><td>${r.usuarios?.nome||'-'}</td><td>${(r.requisicao_itens||[]).length}</td><td><span class="status ${r.status}">${r.status}</span></td><td><button class="btn btn-ghost btn-sm" onclick="verDet('${r.id}')">Ver</button></td></tr>`;
  });
  el.innerHTML = html + '</tbody></table>';
}

function buscarIng(q) {
  const ac = document.getElementById('req-ac');
  if (!q || q.length < 2) { ac.style.display='none'; return; }
  const res = ings.filter(i => i.nome.toLowerCase().includes(q.toLowerCase())).slice(0,10);
  if (!res.length) { ac.style.display='none'; return; }
  ac.innerHTML = res.map(i => `<div class="ac-item" onclick="selIng('${i.id}')">${i.nome} <span class="text-muted">(${i.unidade||'-'})</span></div>`).join('');
  ac.style.display = 'block';
}

document.addEventListener('click', e => {
  if (!e.target.closest('#req-busca') && !e.target.closest('#req-ac'))
    document.getElementById('req-ac').style.display = 'none';
});

function selIng(id) {
  itemAtual = ings.find(i => i.id===id);
  if (!itemAtual) return;
  document.getElementById('req-busca').value = itemAtual.nome;
  document.getElementById('req-un').value = itemAtual.unidade || '-';
  document.getElementById('req-ac').style.display = 'none';
  document.getElementById('req-qtd').focus();
}

function addItem() {
  if (!itemAtual) { alert('Selecione um ingrediente.'); return; }
  const q = parseFloat(document.getElementById('req-qtd').value);
  if (!q || q<=0) { alert('Informe a quantidade.'); return; }
  const c = document.getElementById('req-com').value.trim();
  const ex = itens.findIndex(i => i.id===itemAtual.id);
  if (ex>=0) itens[ex].quantidade += q;
  else itens.push({id:itemAtual.id, nome:itemAtual.nome, unidade:itemAtual.unidade||'-', quantidade:q, comentario:c});
  ['req-busca','req-qtd','req-un','req-com'].forEach(id => { document.getElementById(id).value = ''; });
  itemAtual = null;
  renderItens();
}

function renderItens() {
  const el = document.getElementById('req-list');
  document.getElementById('req-cnt').textContent = `(${itens.length})`;
  if (!itens.length) { el.innerHTML = '<div class="empty">Nenhum item.</div>'; return; }
  el.innerHTML = itens.map((it,i) => `
    <div class="item-row">
      <span class="nome">${it.nome}</span>
      <input class="qtd-inp" type="number" value="${it.quantidade}" min="0.01" step="0.01" onchange="itens[${i}].quantidade=parseFloat(this.value)||0">
      <span class="un-lbl">${it.unidade}</span>
      <input class="com-inp" type="text" value="${it.comentario||''}" placeholder="comentario..." onchange="itens[${i}].comentario=this.value">
      <button class="rm-btn" onclick="itens.splice(${i},1);renderItens()">×</button>
    </div>`).join('');
}

async function enviarReq() {
  const pdv = document.getElementById('req-pdv').value;
  if (!pdv) { alert('Selecione o PDV.'); return; }
  if (!itens.length) { alert('Adicione ao menos um item.'); return; }
  const ep = document.getElementById('req-entrega').value;
  const obs = document.getElementById('req-obs').value.trim();
  const {data:req, error} = await sb.from('requisicoes').insert({pdv, criado_por:user.id, status:'aberta', entrega_prevista:ep||null, observacao:obs||null}).select().single();
  if (error) { alert('Erro: '+error.message); return; }
  await sb.from('requisicao_itens').insert(itens.map(i=>({requisicao_id:req.id, ingrediente_id:i.id, item_nome:i.nome, quantidade:i.quantidade, unidade:i.unidade, comentario:i.comentario||null})));
  alert('Requisicao enviada com sucesso!');
  itens=[]; renderItens();
  carregarDashboard();
}

async function carregarHistorico() {
  const pdv=document.getElementById('hist-pdv').value, ini=document.getElementById('hist-ini').value, fim=document.getElementById('hist-fim').value, st=document.getElementById('hist-st').value;
  let q = sb.from('requisicoes').select('*,usuarios(nome),requisicao_itens(*)').order('criado_em',{ascending:false});
  if (pdv) q=q.eq('pdv',pdv); if (ini) q=q.gte('criado_em',ini+'T00:00:00'); if (fim) q=q.lte('criado_em',fim+'T23:59:59'); if (st) q=q.eq('status',st);
  const {data} = await q.limit(100);
  const el = document.getElementById('hist-body');
  if (!data || !data.length) { el.innerHTML = '<div class="empty">Nenhuma requisicao encontrada.</div>'; return; }
  let html = '<table><thead><tr><th>Data</th><th>PDV</th><th>Solicitante</th><th>Itens</th><th>Status</th><th>Acoes</th></tr></thead><tbody>';
  data.forEach(r => {
    html += `<tr><td>${new Date(r.criado_em).toLocaleDateString('pt-BR')}</td><td><strong>${r.pdv||'-'}</strong></td><td>${r.usuarios?.nome||'-'}</td><td>${(r.requisicao_itens||[]).length}</td><td><span class="status ${r.status}">${r.status}</span></td><td><button class="btn btn-ghost btn-sm" onclick="verDet('${r.id}')">Ver</button></td></tr>`;
  });
  el.innerHTML = html + '</tbody></table>';
}

async function carregarConsumo() {
  const ini=document.getElementById('cons-ini').value, fim=document.getElementById('cons-fim').value;
  const {data:reqs} = await sb.from('requisicoes').select('pdv,requisicao_itens(item_nome,quantidade,ingredientes(nome))').eq('status','aprovada').gte('aprovado_em',ini+'T00:00:00').lte('aprovado_em',fim+'T23:59:59');
  const pp={};
  (reqs||[]).forEach(r => {
    if (!pp[r.pdv||'-']) pp[r.pdv||'-'] = {};
    (r.requisicao_itens||[]).forEach(i => {
      const n = i.ingredientes?.nome||i.item_nome||'?';
      pp[r.pdv||'-'][n] = (pp[r.pdv||'-'][n]||0) + (Number(i.quantidade)||0);
    });
  });
  const el = document.getElementById('cons-body');
  if (!Object.keys(pp).length) { el.innerHTML = '<div class="empty">Nenhum dado no periodo.</div>'; return; }
  let html = '';
  Object.entries(pp).forEach(([pdv, its]) => {
    html += `<div class="section" style="margin-bottom:16px"><div class="section-header"><h3>${pdv}</h3></div><table><thead><tr><th>Item</th><th>Total Requisitado</th></tr></thead><tbody>`;
    Object.entries(its).sort(([,a],[,b])=>b-a).forEach(([n,q]) => { html += `<tr><td>${n}</td><td><strong>${q}</strong></td></tr>`; });
    html += '</tbody></table></div>';
  });
  el.innerHTML = html;
}

async function verDet(id) {
  const {data:r} = await sb.from('requisicoes').select('*,usuarios(nome),requisicao_itens(*,ingredientes(nome,unidade))').eq('id',id).single();
  document.getElementById('det-titulo').textContent = `${r.pdv||'-'} - ${new Date(r.criado_em).toLocaleDateString('pt-BR')}`;
  let html = `<div style="margin-bottom:12px"><span class="status ${r.status}">${r.status}</span> <span style="color:#666;font-size:12px;margin-left:8px">por ${r.usuarios?.nome||'-'}</span>${r.motivo_rejeicao?`<div style="color:#e74c3c;font-size:12px;margin-top:6px">Motivo: ${r.motivo_rejeicao}</div>`:''}</div>`;
  html += '<table><thead><tr><th>Item</th><th>Qtd</th><th>Un</th><th>Comentario</th></tr></thead><tbody>';
  (r.requisicao_itens||[]).forEach(i => {
    html += `<tr><td>${i.ingredientes?.nome||i.item_nome||'?'}</td><td>${i.quantidade}</td><td>${i.unidade||'-'}</td><td style="color:#666">${i.comentario||''}</td></tr>`;
  });
  document.getElementById('det-body').innerHTML = html + '</tbody></table>';
  document.getElementById('modal-det').classList.add('open');
}
