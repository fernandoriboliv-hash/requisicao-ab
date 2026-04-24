const SURL='https://nyijprhukndlyijqljbm.supabase.co';
const SKEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55aWpwcmh1a25kbHlpanFsamJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MjUwMDgsImV4cCI6MjA5MjIwMTAwOH0.Vzljd9xesi1ZJ-l7du00v-elUSDQObRCUz2jPyqL5p8';
const sb = supabase.createClient(SURL, SKEY);
let user = null, reqAtual = null;

async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

window.addEventListener('DOMContentLoaded', async () => {
  user = JSON.parse(sessionStorage.getItem('rw_user') || 'null');
  if (!user || user.perfil !== 'master') { location.href = 'index.html'; return; }
  document.getElementById('user-nome').textContent = user.nome;
  const hoje = new Date();
  document.getElementById('data-hoje').textContent = hoje.toLocaleDateString('pt-BR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  document.getElementById('fc-ini').value = document.getElementById('fc-fim').value = hoje.toISOString().split('T')[0];
  await carregarDashboard();
  await carregarIngsMaster();
});

function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  el.classList.add('active');
  if (id === 'aprovacao') carregarAprovacao();
  if (id === 'programados') carregarProgramados();
  if (id === 'lista-compras') carregarListaCompras();
  if (id === 'usuarios') carregarUsers();
  if (id === 'requisicao') { document.getElementById('mreq-entrega').value = new Date().toISOString().split('T')[0]; }
}

function logout() { sessionStorage.clear(); location.href = 'index.html'; }

async function carregarDashboard() {
  const hoje = new Date().toISOString().split('T')[0];
  const { count: pend } = await sb.from('requisicoes').select('*',{count:'exact',head:true}).eq('status','aberta');
  document.getElementById('val-pend').textContent = pend || 0;
  const b = document.getElementById('badge-nav'), ba = document.getElementById('badge-apr');
  if (pend > 0) { b.textContent = ba.textContent = pend; b.style.display = ba.style.display = 'inline-block'; }
  else { b.style.display = ba.style.display = 'none'; }

  const { count: cnt } = await sb.from('contagens').select('*',{count:'exact',head:true}).eq('data', hoje);
  document.getElementById('val-cont').textContent = cnt || 0;

  const { data: rh } = await sb.from('requisicoes').select('requisicao_itens(*)').eq('status','aprovada').gte('aprovado_em', hoje+'T00:00:00').lte('aprovado_em', hoje+'T23:59:59');
  let ti = 0; (rh||[]).forEach(r => { ti += (r.requisicao_itens||[]).length; });
  document.getElementById('val-itens').textContent = ti;

  const { count: ua } = await sb.from('usuarios').select('*',{count:'exact',head:true}).eq('ativo', true);
  document.getElementById('val-users').textContent = ua || 0;

  await carregarComparativo();
}

async function carregarComparativo() {
  const hoje = new Date(), ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  const hs = hoje.toISOString().split('T')[0], os = ontem.toISOString().split('T')[0];
  const { data: hc } = await sb.from('contagens').select('item,quantidade').eq('data', hs);
  const { data: oc } = await sb.from('contagens').select('item,quantidade').eq('data', os);
  const el = document.getElementById('comp-cont');
  if (!hc || !hc.length) { el.innerHTML = '<div class="empty">Nenhuma contagem hoje.</div>'; return; }
  const map = {};
  (oc||[]).forEach(c => { map[c.item] = { ontem: c.quantidade, hoje: null }; });
  hc.forEach(c => { if (!map[c.item]) map[c.item] = { ontem: null, hoje: null }; map[c.item].hoje = c.quantidade; });
  const al = Object.entries(map).filter(([,v]) => v.ontem !== null && v.hoje !== null && Math.abs(v.hoje - v.ontem) / Math.max(v.ontem,1) > 0.3);
  if (!al.length) { el.innerHTML = '<div class="empty" style="color:#2ecc71">Nenhuma variacao anormal detectada.</div>'; return; }
  let html = '<table><thead><tr><th>Item</th><th>Ontem</th><th>Hoje</th><th>Variacao</th></tr></thead><tbody>';
  al.forEach(([item, v]) => {
    const d = v.hoje - v.ontem, p = ((d / Math.max(v.ontem,1)) * 100).toFixed(0);
    html += `<tr><td>${item}</td><td>${v.ontem}</td><td>${v.hoje}</td><td style="color:${d<0?'#e74c3c':'#2ecc71'}">${d>0?'+':''}${p}%</td></tr>`;
  });
  el.innerHTML = html + '</tbody></table>';
}

async function carregarAprovacao() {
  const { data: reqs } = await sb.from('requisicoes')
    .select('*,usuarios(nome),requisicao_itens(*,ingredientes(nome,unidade))')
    .eq('status','aberta').order('criado_em',{ascending:true});
  const el = document.getElementById('lista-aprov');
  if (!reqs || !reqs.length) { el.innerHTML = '<div class="empty">Nenhuma requisicao pendente.</div>'; return; }
  let html = '<table><thead><tr><th>Data</th><th>PDV / Solicitante</th><th>Itens</th><th>Entrega</th><th>Acoes</th></tr></thead><tbody>';
  reqs.forEach(r => {
    const data = new Date(r.criado_em).toLocaleString('pt-BR');
    const pdv = r.pdv || '-';
    const sol = r.usuarios?.nome || '-';
    const itens = (r.requisicao_itens||[]).length;
    const entrega = r.entrega_prevista ? new Date(r.entrega_prevista+'T12:00:00').toLocaleDateString('pt-BR') : '-';
    html += `<tr><td>${data}</td><td><strong>${pdv}</strong><br><span style="color:#666;font-size:11px">${sol}</span></td><td>${itens}</td><td>${entrega}</td><td><button class="btn btn-ghost btn-sm" onclick="abrirReq('${r.id}')">Ver/Aprovar</button></td></tr>`;
  });
  el.innerHTML = html + '</tbody></table>';
}

async function abrirReq(id) {
  const { data: r } = await sb.from('requisicoes')
    .select('*,usuarios(nome),requisicao_itens(*,ingredientes(nome,unidade))')
    .eq('id', id).single();
  reqAtual = r;
  document.getElementById('modal-aprov-titulo').textContent = `Requisicao - ${r.pdv||'Sem PDV'} / ${r.usuarios?.nome||''}`;
  let html = '<table style="width:100%"><thead><tr><th>Item</th><th>Qtd</th><th>Un</th><th>Comentario</th></tr></thead><tbody>';
  (r.requisicao_itens||[]).forEach(i => {
    html += `<tr><td>${i.ingredientes?.nome||i.item_nome||'-'}</td><td>${i.quantidade}</td><td>${i.unidade||'-'}</td><td style="color:#666">${i.comentario||''}</td></tr>`;
  });
  document.getElementById('modal-aprov-itens').innerHTML = html + '</tbody></table>';
  document.getElementById('div-rejeitar').style.display = 'none';
  document.getElementById('modal-aprov').classList.add('open');
}

async function aprovar() {
  if (!reqAtual) return;
  await sb.from('requisicoes').update({ status:'aprovada', aprovado_por: user.id, aprovado_em: new Date().toISOString() }).eq('id', reqAtual.id);
  document.getElementById('modal-aprov').classList.remove('open');
  carregarAprovacao(); carregarDashboard();
}

async function rejeitar() {
  if (!reqAtual) return;
  const m = document.getElementById('motivo-rej').value.trim();
  if (!m) { alert('Informe o motivo.'); return; }
  await sb.from('requisicoes').update({ status:'rejeitada', aprovado_por: user.id, aprovado_em: new Date().toISOString(), motivo_rejeicao: m }).eq('id', reqAtual.id);
  document.getElementById('modal-aprov').classList.remove('open');
  carregarAprovacao(); carregarDashboard();
}

async function carregarProgramados() {
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
  const { data: reqs } = await sb.from('requisicoes')
    .select('*,usuarios(nome),requisicao_itens(*,ingredientes(lead_time))')
    .eq('status','aberta').gt('entrega_prevista', amanha.toISOString().split('T')[0]);
  const el = document.getElementById('lista-prog');
  if (!reqs || !reqs.length) { el.innerHTML = '<div class="empty">Nenhum pedido programado.</div>'; return; }
  const grupos = {};
  reqs.forEach(r => {
    const lt = r.requisicao_itens?.[0]?.ingredientes?.lead_time || 1;
    const d = new Date(r.entrega_prevista+'T12:00:00'); d.setDate(d.getDate() - lt);
    const k = d.toISOString().split('T')[0];
    if (!grupos[k]) grupos[k] = [];
    grupos[k].push(r);
  });
  let html = '';
  Object.entries(grupos).sort(([a],[b]) => a.localeCompare(b)).forEach(([dia, lista]) => {
    const diaFmt = new Date(dia+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
    html += `<div class="section" style="margin-bottom:16px"><div class="section-header"><h3>Comprar em: ${diaFmt}</h3><button class="btn btn-primary btn-sm" onclick="alert('Itens adicionados a lista do dia!')">+ Adicionar a Lista</button></div><table><thead><tr><th>PDV</th><th>Solicitante</th><th>Itens</th><th>Entrega</th></tr></thead><tbody>`;
    lista.forEach(r => {
      html += `<tr><td>${r.pdv||'-'}</td><td>${r.usuarios?.nome||'-'}</td><td>${(r.requisicao_itens||[]).length}</td><td>${new Date(r.entrega_prevista+'T12:00:00').toLocaleDateString('pt-BR')}</td></tr>`;
    });
    html += '</tbody></table></div>';
  });
  el.innerHTML = html;
}

async function carregarListaCompras() {
  const hoje = new Date().toISOString().split('T')[0];
  const { data: reqs } = await sb.from('requisicoes')
    .select('requisicao_itens(*,ingredientes(nome,unidade))')
    .eq('status','aprovada').gte('aprovado_em', hoje+'T00:00:00').lte('aprovado_em', hoje+'T23:59:59');
  const mapa = {};
  (reqs||[]).forEach(r => {
    (r.requisicao_itens||[]).forEach(i => {
      const n = i.ingredientes?.nome || i.item_nome || '?';
      if (!mapa[n]) mapa[n] = { q: 0, u: i.unidade || '-' };
      mapa[n].q += Number(i.quantidade) || 0;
    });
  });
  const el = document.getElementById('lista-compras-body');
  if (!Object.keys(mapa).length) { el.innerHTML = '<div class="empty">Nenhum item aprovado hoje.</div>'; return; }
  let html = '<table><thead><tr><th>Item</th><th>Quantidade</th><th>Unidade</th></tr></thead><tbody>';
  Object.entries(mapa).sort(([a],[b]) => a.localeCompare(b)).forEach(([n, v]) => {
    html += `<tr><td>${n}</td><td><strong>${v.q}</strong></td><td>${v.u}</td></tr>`;
  });
  el.innerHTML = html + '</tbody></table>';
}

async function carregarFoodCost() {
  const ini = document.getElementById('fc-ini').value, fim = document.getElementById('fc-fim').value;
  if (!ini || !fim) { alert('Selecione o periodo.'); return; }
  const { data: reqs } = await sb.from('requisicoes')
    .select('pdv,requisicao_itens(item_nome,quantidade,unidade,ingredientes(nome))')
    .eq('status','aprovada').gte('aprovado_em', ini+'T00:00:00').lte('aprovado_em', fim+'T23:59:59');
  const { data: precos } = await sb.from('precos').select('item,preco_unitario').eq('ativo', true);
  const mp = {}; (precos||[]).forEach(p => { mp[p.item.toLowerCase()] = p.preco_unitario; });
  const pp = {};
  (reqs||[]).forEach(r => {
    const p = r.pdv || '-';
    if (!pp[p]) pp[p] = { total: 0, itens: [] };
    (r.requisicao_itens||[]).forEach(i => {
      const n = i.ingredientes?.nome || i.item_nome || '?';
      const pr = mp[n.toLowerCase()] || 0;
      const c = pr * (Number(i.quantidade) || 0);
      pp[p].total += c;
      pp[p].itens.push({ n, q: i.quantidade, u: i.unidade, pr, c });
    });
  });
  const el = document.getElementById('fc-body');
  if (!Object.keys(pp).length) { el.innerHTML = '<div class="empty">Nenhum dado no periodo.</div>'; return; }
  let html = '';
  Object.entries(pp).forEach(([pdv, d]) => {
    html += `<div style="padding:16px;border-bottom:1px solid #222"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><strong style="color:#c9a96e">${pdv}</strong><span style="font-size:18px;font-weight:700">R$ ${d.total.toFixed(2)}</span></div><table><thead><tr><th>Item</th><th>Qtd</th><th>Preco</th><th>Custo</th></tr></thead><tbody>`;
    d.itens.forEach(i => {
      html += `<tr><td>${i.n}</td><td>${i.q} ${i.u||''}</td><td>${i.pr ? 'R$ '+i.pr.toFixed(2) : 'sem preco'}</td><td style="color:#c9a96e">${i.c > 0 ? 'R$ '+i.c.toFixed(2) : '-'}</td></tr>`;
    });
    html += '</tbody></table></div>';
  });
  el.innerHTML = html;
}

async function carregarUsers() {
  const { data } = await sb.from('usuarios').select('*').order('nome');
  const el = document.getElementById('lista-users');
  if (!data || !data.length) { el.innerHTML = '<div class="empty">Nenhum usuario.</div>'; return; }
  let html = '<table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>PDV</th><th>Status</th><th>Acoes</th></tr></thead><tbody>';
  data.forEach(u => {
    const status = u.ativo ? 'aprovada' : 'rejeitada';
    const label = u.ativo ? 'Ativo' : 'Inativo';
    html += `<tr><td>${u.nome}</td><td>${u.email}</td><td><span class="pill">${u.perfil}${u.subtipo?' / '+u.subtipo:''}</span></td><td>${u.pdv||'-'}</td><td><span class="status ${status}">${label}</span></td><td><button class="btn btn-ghost btn-sm" onclick="editUser('${u.id}')">Editar</button></td></tr>`;
  });
  el.innerHTML = html + '</tbody></table>';
}

function abrirModalUser() {
  document.getElementById('modal-user-titulo').textContent = 'Novo Usuario';
  document.getElementById('uid').value = '';
  ['u-nome','u-email','u-senha'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('u-perfil').value = 'operacional';
  document.getElementById('u-sub').value = 'pdv';
  document.getElementById('u-pdv').value = '';
  document.getElementById('u-ativo').value = 'true';
  toggleSub();
  document.getElementById('modal-user').classList.add('open');
}

async function editUser(id) {
  const { data: u } = await sb.from('usuarios').select('*').eq('id', id).single();
  document.getElementById('modal-user-titulo').textContent = 'Editar Usuario';
  document.getElementById('uid').value = u.id;
  document.getElementById('u-nome').value = u.nome;
  document.getElementById('u-email').value = u.email;
  document.getElementById('u-senha').value = '';
  document.getElementById('u-perfil').value = u.perfil === 'master' ? 'executivo' : u.perfil;
  document.getElementById('u-sub').value = u.subtipo || 'pdv';
  document.getElementById('u-pdv').value = u.pdv || '';
  document.getElementById('u-ativo').value = u.ativo ? 'true' : 'false';
  toggleSub();
  document.getElementById('modal-user').classList.add('open');
}

function toggleSub() {
  const p = document.getElementById('u-perfil').value;
  document.getElementById('sub-grp').style.display = p === 'operacional' ? 'block' : 'none';
  document.getElementById('pdv-grp').style.display = (p === 'operacional' && document.getElementById('u-sub').value === 'pdv') ? 'block' : 'none';
}

async function salvarUser() {
  const id = document.getElementById('uid').value;
  const nome = document.getElementById('u-nome').value.trim();
  const email = document.getElementById('u-email').value.trim();
  const senha = document.getElementById('u-senha').value;
  const perfil = document.getElementById('u-perfil').value;
  const subtipo = perfil === 'operacional' ? document.getElementById('u-sub').value : null;
  const pdv = subtipo === 'pdv' ? document.getElementById('u-pdv').value : null;
  const ativo = document.getElementById('u-ativo').value === 'true';
  if (!nome || !email) { alert('Preencha nome e e-mail.'); return; }
  const payload = { nome, email, perfil, subtipo, pdv, ativo };
  if (senha) payload.senha_hash = await sha256(senha);
  if (id) await sb.from('usuarios').update(payload).eq('id', id);
  else { if (!senha) { alert('Informe a senha.'); return; } await sb.from('usuarios').insert({ ...payload }); }
  document.getElementById('modal-user').classList.remove('open');
  carregarUsers();
}

// ========== REQUISIÇÃO MASTER ==========
let ingsMaster = [], itensMaster = [], itemAtualMaster = null;

async function carregarIngsMaster() {
  if (ingsMaster.length > 0) return;
  const {data} = await sb.from('ingredientes').select('id,nome,unidade').eq('ativo',true).order('nome');
  ingsMaster = data || [];
}

function buscarIngMaster(q) {
  const ac = document.getElementById('mreq-ac');
  if (!q || q.length < 2) { ac.style.display='none'; return; }
  const res = ingsMaster.filter(i => i.nome.toLowerCase().includes(q.toLowerCase())).slice(0,10);
  if (!res.length) { ac.style.display='none'; return; }
  ac.innerHTML = res.map(i => `<div style="padding:10px 14px;font-size:13px;cursor:pointer;color:#ccc;border-bottom:1px solid #252525" onmouseover="this.style.background='#2a2a2a'" onmouseout="this.style.background=''" onclick="selIngMaster('${i.id}')">${i.nome} <span style="color:#666">(${i.unidade||'-'})</span></div>`).join('');
  ac.style.display='block';
}

document.addEventListener('click', e => {
  const ac = document.getElementById('mreq-ac');
  if (ac && !e.target.closest('#mreq-busca') && !e.target.closest('#mreq-ac')) ac.style.display='none';
});

function selIngMaster(id) {
  itemAtualMaster = ingsMaster.find(i => i.id===id);
  if (!itemAtualMaster) return;
  document.getElementById('mreq-busca').value = itemAtualMaster.nome;
  document.getElementById('mreq-un').value = itemAtualMaster.unidade || '-';
  document.getElementById('mreq-ac').style.display = 'none';
  document.getElementById('mreq-qtd').focus();
}

function adicionarItemMaster() {
  if (!itemAtualMaster) { alert('Selecione um ingrediente.'); return; }
  const q = parseFloat(document.getElementById('mreq-qtd').value);
  if (!q || q <= 0) { alert('Informe a quantidade.'); return; }
  const c = document.getElementById('mreq-com').value.trim();
  const ex = itensMaster.findIndex(i => i.id===itemAtualMaster.id);
  if (ex >= 0) itensMaster[ex].quantidade += q;
  else itensMaster.push({id:itemAtualMaster.id, nome:itemAtualMaster.nome, unidade:itemAtualMaster.unidade||'-', quantidade:q, comentario:c});
  ['mreq-busca','mreq-qtd','mreq-un','mreq-com'].forEach(id => { document.getElementById(id).value=''; });
  itemAtualMaster = null;
  renderItensMaster();
}

function renderItensMaster() {
  const el = document.getElementById('mreq-list');
  document.getElementById('mreq-cnt').textContent = `(${itensMaster.length})`;
  if (!itensMaster.length) { el.innerHTML = '<div class="empty">Nenhum item adicionado.</div>'; return; }
  el.innerHTML = itensMaster.map((it,i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:#111;border:1px solid #222;border-radius:8px;margin-bottom:8px">
      <span style="flex:2;font-size:13px;color:#ddd">${it.nome}</span>
      <input type="number" value="${it.quantidade}" min="0.01" step="0.01" style="width:80px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#fff;font-size:13px;padding:6px 8px;text-align:center;outline:none" onchange="itensMaster[${i}].quantidade=parseFloat(this.value)||0">
      <span style="font-size:12px;color:#666;width:60px">${it.unidade}</span>
      <input type="text" value="${it.comentario||''}" placeholder="comentario..." style="flex:2;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#ccc;font-size:12px;padding:6px 8px;outline:none" onchange="itensMaster[${i}].comentario=this.value">
      <button style="background:none;border:none;color:#555;font-size:18px;cursor:pointer;padding:0 4px" onmouseover="this.style.color='#e74c3c'" onmouseout="this.style.color='#555'" onclick="itensMaster.splice(${i},1);renderItensMaster()">×</button>
    </div>`).join('');
}

async function enviarReqMaster() {
  const pdv = document.getElementById('mreq-pdv').value;
  if (!pdv) { alert('Selecione o PDV.'); return; }
  if (!itensMaster.length) { alert('Adicione ao menos um item.'); return; }
  const ep = document.getElementById('mreq-entrega').value;
  const obs = document.getElementById('mreq-obs').value.trim();
  const {data:req, error} = await sb.from('requisicoes').insert({
    pdv, criado_por: user.id, status:'aberta',
    entrega_prevista: ep||null, observacao: obs||null
  }).select().single();
  if (error||!req) { alert('Erro ao enviar: '+(error?.message||'desconhecido')); return; }
  await sb.from('requisicao_itens').insert(itensMaster.map(i=>({
    requisicao_id:req.id, ingrediente_id:i.id, item_nome:i.nome,
    quantidade:i.quantidade, unidade:i.unidade, comentario:i.comentario||null
  })));
  alert(`✅ Requisicao enviada para ${pdv}!\nStatus: Aguardando aprovacao.`);
  itensMaster=[]; renderItensMaster();
  document.getElementById('mreq-pdv').value='';
  document.getElementById('mreq-obs').value='';
  carregarDashboard();
}
