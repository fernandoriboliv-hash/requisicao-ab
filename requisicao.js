const SURL='https://nyijprhukndlyijqljbm.supabase.co';
const SKEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55aWpwcmh1a25kbHlpanFsamJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MjUwMDgsImV4cCI6MjA5MjIwMTAwOH0.Vzljd9xesi1ZJ-l7du00v-elUSDQObRCUz2jPyqL5p8';
const sb = supabase.createClient(SURL, SKEY);
let user=null, ings=[], itens=[], itemAtual=null, detAtual=null;

async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

window.addEventListener('DOMContentLoaded', async () => {
  user = JSON.parse(sessionStorage.getItem('rw_user') || 'null');
  if (!user || user.perfil !== 'operacional' || user.subtipo !== 'pdv') { location.href = 'index.html'; return; }
  document.getElementById('user-nome').textContent = user.nome;
  document.getElementById('pdv-label').textContent = user.pdv || 'Sem PDV';
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('entrega-prevista').value = hoje;
  const m = new Date(); m.setDate(m.getDate()-30);
  document.getElementById('hist-ini').value = m.toISOString().split('T')[0];
  document.getElementById('hist-fim').value = hoje;
  const {data} = await sb.from('ingredientes').select('id,nome,unidade').eq('ativo',true).order('nome');
  ings = data || [];
  await verificarNotifs();
  carregarHistorico();
});

function logout() { sessionStorage.clear(); location.href = 'index.html'; }

function showTab(id, el) {
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('pane-'+id).classList.add('active');
  el.classList.add('active');
  if (id === 'rascunhos') carregarRascunhos();
  if (id === 'historico') carregarHistorico();
}

async function verificarNotifs() {
  const {data} = await sb.from('requisicoes').select('id,status,motivo_rejeicao').eq('pdv',user.pdv).in('status',['aprovada','rejeitada']).order('aprovado_em',{ascending:false}).limit(5);
  const rec = (data||[]).filter(r => !localStorage.getItem('visto_'+r.id));
  if (!rec.length) return;
  const ap = rec.filter(r=>r.status==='aprovada').length, rj = rec.filter(r=>r.status==='rejeitada').length;
  let msg = '';
  if (ap) msg += `${ap} requisicao(oes) aprovada(s). `;
  if (rj) msg += `${rj} rejeitada(s).`;
  document.getElementById('notif-text').textContent = msg;
  document.getElementById('notif-bar').classList.add('show');
  rec.forEach(r => localStorage.setItem('visto_'+r.id,'1'));
}

function buscarIng(q) {
  const ac = document.getElementById('ac-list');
  if (!q || q.length < 2) { ac.style.display='none'; return; }
  const res = ings.filter(i => i.nome.toLowerCase().includes(q.toLowerCase())).slice(0,10);
  if (!res.length) { ac.style.display='none'; return; }
  ac.innerHTML = res.map(i => `<div class="ac-item" onclick="selIng('${i.id}')">${i.nome} <span class="text-muted">(${i.unidade||'-'})</span></div>`).join('');
  ac.style.display = 'block';
}

document.addEventListener('click', e => {
  if (!e.target.closest('#busca-item') && !e.target.closest('#ac-list'))
    document.getElementById('ac-list').style.display = 'none';
});

function selIng(id) {
  itemAtual = ings.find(i => i.id===id);
  if (!itemAtual) return;
  document.getElementById('busca-item').value = itemAtual.nome;
  document.getElementById('un-item').value = itemAtual.unidade || '-';
  document.getElementById('ac-list').style.display = 'none';
  document.getElementById('qtd-item').focus();
}

function adicionarItem() {
  if (!itemAtual) { alert('Selecione um ingrediente.'); return; }
  const q = parseFloat(document.getElementById('qtd-item').value);
  if (!q || q<=0) { alert('Informe a quantidade.'); return; }
  const c = document.getElementById('coment-item').value.trim();
  const ex = itens.findIndex(i => i.id===itemAtual.id);
  if (ex>=0) itens[ex].quantidade += q;
  else itens.push({id:itemAtual.id, nome:itemAtual.nome, unidade:itemAtual.unidade||'-', quantidade:q, comentario:c});
  ['busca-item','qtd-item','un-item','coment-item'].forEach(id => { document.getElementById(id).value = ''; });
  itemAtual = null;
  renderItens();
}

function renderItens() {
  const el = document.getElementById('item-list');
  document.getElementById('count-itens').textContent = `(${itens.length})`;
  if (!itens.length) { el.innerHTML = '<div class="empty">Nenhum item adicionado.</div>'; return; }
  el.innerHTML = itens.map((it,i) => `
    <div class="item-row">
      <span class="nome">${it.nome}</span>
      <input class="qtd-inp" type="number" value="${it.quantidade}" min="0.01" step="0.01" onchange="itens[${i}].quantidade=parseFloat(this.value)||0">
      <span class="un-lbl">${it.unidade}</span>
      <input class="com-inp" type="text" value="${it.comentario||''}" placeholder="comentario..." onchange="itens[${i}].comentario=this.value">
      <button class="rm-btn" onclick="itens.splice(${i},1);renderItens()">×</button>
    </div>`).join('');
}

function limpar() { if(confirm('Limpar todos os itens?')) { itens=[]; renderItens(); } }

async function salvarRascunho() {
  if (!itens.length) { alert('Adicione ao menos um item.'); return; }
  const {count} = await sb.from('requisicoes').select('*',{count:'exact',head:true}).eq('pdv',user.pdv).eq('status','rascunho');
  if (count >= 10) { alert('Limite de 10 rascunhos atingido.'); return; }
  const ep = document.getElementById('entrega-prevista').value;
  const {data:req, error} = await sb.from('requisicoes').insert({pdv:user.pdv, criado_por:user.id, status:'rascunho', entrega_prevista:ep||null}).select().single();
  if (error || !req) { alert('Erro ao salvar.'); return; }
  await sb.from('requisicao_itens').insert(itens.map(i=>({requisicao_id:req.id, ingrediente_id:i.id, item_nome:i.nome, quantidade:i.quantidade, unidade:i.unidade, comentario:i.comentario||null})));
  alert('Rascunho salvo!');
}

function abrirModalEnvio() {
  if (!itens.length) { alert('Adicione ao menos um item.'); return; }
  let html = '';
  itens.forEach(i => { html += `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #222"><span>${i.nome}</span><span>${i.quantidade} ${i.unidade}</span></div>`; });
  document.getElementById('modal-resumo').innerHTML = html;
  document.getElementById('modal-envio').classList.add('open');
}

async function enviarRequisicao() {
  const ep = document.getElementById('entrega-prevista').value;
  const obs = document.getElementById('obs-geral').value.trim();
  const {data:req, error} = await sb.from('requisicoes').insert({pdv:user.pdv, criado_por:user.id, status:'aberta', entrega_prevista:ep||null, observacao:obs||null}).select().single();
  if (error || !req) { alert('Erro: '+(error?.message||'desconhecido')); return; }
  await sb.from('requisicao_itens').insert(itens.map(i=>({requisicao_id:req.id, ingrediente_id:i.id, item_nome:i.nome, quantidade:i.quantidade, unidade:i.unidade, comentario:i.comentario||null})));
  document.getElementById('modal-envio').classList.remove('open');
  itens=[]; renderItens();
  document.getElementById('obs-geral').value = '';
  alert('Requisicao enviada! Aguardando aprovacao.');
  carregarHistorico();
}

async function carregarRascunhos() {
  const {data} = await sb.from('requisicoes').select('*,requisicao_itens(*)').eq('pdv',user.pdv).eq('status','rascunho').order('criado_em',{ascending:false});
  const el = document.getElementById('lista-rascunhos');
  document.getElementById('count-rasc').textContent = `(${(data||[]).length}/10)`;
  if (!data || !data.length) { el.innerHTML = '<div class="empty">Nenhum rascunho salvo.</div>'; return; }
  let html = '<table><thead><tr><th>Data</th><th>Itens</th><th>Entrega</th><th>Acoes</th></tr></thead><tbody>';
  data.forEach(r => {
    const entrega = r.entrega_prevista ? new Date(r.entrega_prevista+'T12:00:00').toLocaleDateString('pt-BR') : '-';
    html += `<tr><td>${new Date(r.criado_em).toLocaleString('pt-BR')}</td><td>${(r.requisicao_itens||[]).length}</td><td>${entrega}</td><td style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" onclick="editarRasc('${r.id}')">Editar</button><button class="btn btn-primary btn-sm" onclick="enviarRasc('${r.id}')">Enviar</button><button class="btn btn-danger btn-sm" onclick="excluirRasc('${r.id}')">×</button></td></tr>`;
  });
  el.innerHTML = html + '</tbody></table>';
}

async function editarRasc(id) {
  const {data:r} = await sb.from('requisicoes').select('*,requisicao_itens(*,ingredientes(nome,unidade))').eq('id',id).single();
  itens = (r.requisicao_itens||[]).map(i=>({id:i.ingrediente_id, nome:i.ingredientes?.nome||i.item_nome||'?', unidade:i.unidade||i.ingredientes?.unidade||'-', quantidade:i.quantidade, comentario:i.comentario||''}));
  document.getElementById('entrega-prevista').value = r.entrega_prevista || '';
  renderItens();
  const primTab = document.querySelectorAll('.tab')[0];
  showTab('nova', primTab);
  await sb.from('requisicao_itens').delete().eq('requisicao_id', id);
  await sb.from('requisicoes').delete().eq('id', id);
}

async function enviarRasc(id) {
  await sb.from('requisicoes').update({status:'aberta'}).eq('id', id);
  alert('Requisicao enviada!'); carregarRascunhos();
}

async function excluirRasc(id) {
  if (!confirm('Excluir este rascunho?')) return;
  await sb.from('requisicao_itens').delete().eq('requisicao_id', id);
  await sb.from('requisicoes').delete().eq('id', id);
  carregarRascunhos();
}

async function carregarHistorico() {
  const ini=document.getElementById('hist-ini').value, fim=document.getElementById('hist-fim').value, st=document.getElementById('hist-status').value;
  let q = sb.from('requisicoes').select('*,requisicao_itens(*)').eq('pdv',user.pdv).order('criado_em',{ascending:false});
  if (ini) q=q.gte('criado_em',ini+'T00:00:00'); if (fim) q=q.lte('criado_em',fim+'T23:59:59'); if (st) q=q.eq('status',st);
  const {data} = await q;
  const el = document.getElementById('lista-historico');
  if (!data || !data.length) { el.innerHTML = '<div class="empty">Nenhuma requisicao encontrada.</div>'; return; }
  let html = '<table><thead><tr><th>Data</th><th>Status</th><th>Itens</th><th>Entrega</th><th>Motivo Rej.</th><th>Acoes</th></tr></thead><tbody>';
  data.forEach(r => {
    const entrega = r.entrega_prevista ? new Date(r.entrega_prevista+'T12:00:00').toLocaleDateString('pt-BR') : '-';
    html += `<tr><td>${new Date(r.criado_em).toLocaleDateString('pt-BR')}</td><td><span class="status ${r.status}">${r.status}</span></td><td>${(r.requisicao_itens||[]).length}</td><td>${entrega}</td><td style="color:#666;font-size:11px">${r.motivo_rejeicao||''}</td><td><button class="btn btn-ghost btn-sm" onclick="verDet('${r.id}')">Ver</button></td></tr>`;
  });
  el.innerHTML = html + '</tbody></table>';
}

async function verDet(id) {
  const {data:r} = await sb.from('requisicoes').select('*,requisicao_itens(*,ingredientes(nome,unidade))').eq('id',id).single();
  detAtual = r;
  document.getElementById('det-titulo').textContent = `${r.pdv||'-'} - ${new Date(r.criado_em).toLocaleDateString('pt-BR')}`;
  let html = `<div style="margin-bottom:10px"><span class="status ${r.status}">${r.status}</span>${r.motivo_rejeicao?`<span style="color:#e74c3c;font-size:11px;margin-left:8px">${r.motivo_rejeicao}</span>`:''}</div>`;
  html += '<table><thead><tr><th>Item</th><th>Qtd</th><th>Un</th><th>Comentario</th></tr></thead><tbody>';
  (r.requisicao_itens||[]).forEach(i => {
    html += `<tr><td>${i.ingredientes?.nome||i.item_nome||'?'}</td><td>${i.quantidade}</td><td>${i.unidade||'-'}</td><td style="color:#666">${i.comentario||''}</td></tr>`;
  });
  document.getElementById('det-body').innerHTML = html + '</tbody></table>';
  document.getElementById('modal-detalhe').classList.add('open');
}

function repetirPedido() {
  if (!detAtual) return;
  itens = (detAtual.requisicao_itens||[]).map(i=>({id:i.ingrediente_id, nome:i.ingredientes?.nome||i.item_nome||'?', unidade:i.unidade||i.ingredientes?.unidade||'-', quantidade:i.quantidade, comentario:i.comentario||''}));
  document.getElementById('modal-detalhe').classList.remove('open');
  renderItens();
  const primTab = document.querySelectorAll('.tab')[0];
  showTab('nova', primTab);
}
