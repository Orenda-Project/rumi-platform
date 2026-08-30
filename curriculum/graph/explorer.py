#!/usr/bin/env python3
"""explorer.py — build a self-contained (offline, no-CDN) HTML viewer from graph.json + the vendored
vis-network. Run build_graph.py --export first.

    python3 explorer.py <graph.json> [<out.html>]

Views: one book (Book→Chapter→Lesson→SLO), the SLO DAG (per-strand progression + co-teaching),
the pure SLO sequence (trace an SLO back to its strand's first outcome), the semantic prerequisite
DAG and similarity graph (present only if semantic_slos.py has been run), and the Lesson→SkillType
map. Click any node to inspect it; follow arrows backward to reach an outcome's prerequisites."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

TMPL = r'''<!doctype html><html><head><meta charset="utf-8"><title>Curriculum Knowledge Graph</title>
<script>__VIS__</script>
<style>
body{margin:0;font-family:-apple-system,sans-serif;background:#0b1a2b;color:#e8eefc}
#bar{padding:10px 16px;background:#08131f;display:flex;gap:14px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #1c3149}
#bar b{color:#F5B301}select{background:#12263c;color:#e8eefc;border:1px solid #2b4a6b;border-radius:6px;padding:6px 10px;font-size:14px}
#net{width:100vw;height:calc(100vh - 132px)}
.legend span{display:inline-block;margin-right:12px;font-size:13px}.dot{display:inline-block;width:11px;height:11px;border-radius:50%;vertical-align:-1px;margin-right:4px}
#info{position:fixed;right:0;top:52px;width:360px;max-height:74vh;overflow:auto;background:#0e1f33ee;border-left:1px solid #1c3149;padding:14px;font-size:13px;display:none}
#info h3{margin:0 0 6px;color:#F5B301}#info div{margin:3px 0;color:#b9c8e0}#info b{color:#e8eefc}
#stats{padding:6px 16px;background:#08131f;font-size:12px;color:#8aa0bf;border-top:1px solid #1c3149}
</style></head><body>
<div id="bar">
  <b>Curriculum Knowledge Graph</b>
  <label>View: <select id="mode">
    <option value="slo-dag">SLO DAG &mdash; strands + co-teaching (one book)</option>
    <option value="book">One book (Book&#8594;Chapter&#8594;Lesson&#8594;SLO)</option>
    <option value="slo-seq">Pure SLO graph &mdash; per-strand sequence (one book)</option>
    <option value="slo-prereq">Prerequisite DAG &mdash; semantic, cross-grade (one subject)</option>
    <option value="slo-similar">Similar / equivalent SLOs &mdash; semantic (one subject)</option>
    <option value="slo-share">Cross-book SLO sharing (spiral)</option>
    <option value="skill">Lesson&#8594;SkillType map (one book)</option>
  </select></label>
  <label id="bookwrap">Book: <select id="book"></select></label>
  <label id="subjwrap" style="display:none">Subject: <select id="subject"></select></label>
  <span class="legend">
   <span><i class="dot" style="background:#F5B301"></i>Book</span>
   <span><i class="dot" style="background:#5b8cff"></i>Chapter</span>
   <span><i class="dot" style="background:#2ecc71"></i>Lesson</span>
   <span><i class="dot" style="background:#e056fd"></i>SLO</span>
   <span><i class="dot" style="background:#ff7979"></i>SkillType</span>
  </span>
</div>
<div id="net"></div>
<div id="stats"></div>
<div id="info"></div>
<script>
const G = __DATA__;
const BOOKS = __BOOKS__;
const byId = {}; G.nodes.forEach(n=>byId[n.id]=n);
const STRANDCOL={}, STRANDPAL=['#F5B301','#5b8cff','#2ecc71','#e056fd','#ff7979','#7ed6df','#e67e22','#9b59b6','#1abc9c','#f1c40f','#3498db','#e74c3c','#16a085','#d35400','#8e44ad','#27ae60','#c0392b','#2980b9'];
function strandColor(st){if(!(st in STRANDCOL))STRANDCOL[st]=STRANDPAL[Object.keys(STRANDCOL).length%STRANDPAL.length];return STRANDCOL[st];}
const bookSel=document.getElementById('book'), modeSel=document.getElementById('mode'), subjSel=document.getElementById('subject');
BOOKS.forEach(b=>{const o=document.createElement('option');o.value=b;o.textContent=b;bookSel.appendChild(o);});
const subjectOf=n=>(n.label==='SLO'&&n.props.code)?String(n.props.code).split('-')[0]:null;
const SUBJECTS=[...new Set(G.nodes.map(subjectOf).filter(Boolean))].sort();
SUBJECTS.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;subjSel.appendChild(o);});
const SEMANTIC=new Set(['slo-prereq','slo-similar']);
function draw(){
  const mode=modeSel.value, book=bookSel.value, subject=subjSel.value;
  document.getElementById('bookwrap').style.display = (mode==='slo-share'||SEMANTIC.has(mode))?'none':'';
  document.getElementById('subjwrap').style.display = SEMANTIC.has(mode)?'':'none';
  let keep=new Set(), edges=[], levelOf=null;
  if(mode==='slo-dag'){
    let bws=[...new Set(G.edges.filter(e=>e.rel==='PRECEDES_SLO').map(e=>e.props.book))];
    let b=book; if(!bws.includes(b) && bws.length){ b=bws[0]; bookSel.value=b; }
    G.edges.forEach(e=>{if((e.rel==='PRECEDES_SLO'||e.rel==='CO_TAUGHT_WITH') && e.props && e.props.book===b){keep.add(e.s);keep.add(e.t);edges.push(e);}});
    levelOf={}; const seq=edges.filter(e=>e.rel==='PRECEDES_SLO');
    [...keep].forEach(id=>levelOf[id]=0);
    for(let pass=0;pass<seq.length+1;pass++){let ch=false;
      seq.forEach(e=>{if(levelOf[e.t]<levelOf[e.s]+1){levelOf[e.t]=levelOf[e.s]+1;ch=true;}});
      if(!ch)break;}
  } else if(mode==='slo-prereq'){
    const inSubj=id=>subjectOf(byId[id])===subject;
    G.edges.forEach(e=>{if(e.rel==='PREREQUISITE_OF' && inSubj(e.s) && inSubj(e.t)){keep.add(e.s);keep.add(e.t);edges.push(e);}});
    levelOf={}; [...keep].forEach(id=>{const gr=parseInt(byId[id].props.code_grade); levelOf[id]=isNaN(gr)?0:gr;});
  } else if(mode==='slo-similar'){
    const inSubj=id=>subjectOf(byId[id])===subject;
    G.edges.forEach(e=>{if((e.rel==='SIMILAR_TO'||e.rel==='EQUIVALENT_TO') && inSubj(e.s) && inSubj(e.t)){keep.add(e.s);keep.add(e.t);edges.push(e);}});
  } else if(mode==='slo-seq'){
    let bws=[...new Set(G.edges.filter(e=>e.rel==='PRECEDES_SLO').map(e=>e.props.book))];
    let b=book; if(!bws.includes(b) && bws.length){ b=bws[0]; bookSel.value=b; }
    G.edges.forEach(e=>{if(e.rel==='PRECEDES_SLO' && e.props && e.props.book===b){keep.add(e.s);keep.add(e.t);edges.push(e);}});
  } else if(mode==='slo-share'){
    const slolg={};
    G.edges.filter(e=>e.rel==='TEACHES').forEach(e=>{const s=byId[e.t],l=byId[e.s];(slolg[s.id]=slolg[s.id]||new Set()).add(l.props.grade);});
    const multi=new Set(Object.keys(slolg).filter(k=>slolg[k].size>1));
    G.edges.forEach(e=>{if(e.rel==='TEACHES'&&multi.has(byId[e.t].id)){keep.add(e.s);keep.add(e.t);edges.push(e);}});
  } else {
    const rel = mode==='skill' ? ['CONTAINS','HAS_SKILL'] : ['CONTAINS','TEACHES'];
    const inBook=n=> (n.props.book===book)||(n.label==='Book'&&n.props.id===book);
    G.edges.forEach(e=>{const a=byId[e.s];
      if(rel.includes(e.rel) && (inBook(a)||a.props.id===book)){keep.add(e.s);keep.add(e.t);edges.push(e);}});
  }
  const nodes=[...keep].map(id=>{const n=byId[id];return {id:n.id,
    label:n.label==='SLO'?n.props.id:(n.name||n.props.id),
    color:n.label!=='SLO'?n.color
      :mode==='slo-dag'?strandColor(n.props.strand)
      :mode==='slo-prereq'?strandColor('g'+n.props.code_grade)
      :mode==='slo-similar'?strandColor(n.props.strand)
      :n.color,
    shape:n.label==='Book'?'star':n.label==='SLO'?'diamond':'dot',
    size:n.label==='Book'?26:n.label==='Chapter'?18:n.label==='SLO'?12:10,font:{color:'#cfe0f7',size:11},
    ...(levelOf?{level:levelOf[n.id]||0}:{})};});
  const npre=edges.filter(e=>e.rel==='PRECEDES_SLO').length, nco=edges.filter(e=>e.rel==='CO_TAUGHT_WITH').length;
  const neq=edges.filter(e=>e.rel==='EQUIVALENT_TO').length;
  document.getElementById('stats').textContent=nodes.length+' nodes · '+edges.length+' edges shown'
    +(mode==='slo-dag'?'  ('+npre+' strand-sequence + '+nco+' co-teaching)':'')
    +(mode==='slo-similar'?'  ('+neq+' equivalent, rest similar)':'')
    +'  —  full graph: '+G.nodes.length+' nodes / '+G.edges.length+' edges';
  const network=new vis.Network(document.getElementById('net'),
    {nodes:new vis.DataSet(nodes),edges:new vis.DataSet(edges.map((e,i)=>{
        const co=e.rel==='CO_TAUGHT_WITH',sim=e.rel==='SIMILAR_TO',eq=e.rel==='EQUIVALENT_TO',pr=e.rel==='PREREQUISITE_OF';
        const prBloom=pr&&e.props&&e.props.method==='bloom';
        return {id:i,from:e.s,to:e.t,
          arrows:(co||sim||eq)?'':'to',
          dashes:co||sim||prBloom,
          width:eq?2.5:1,
          color:{color: pr?(prBloom?'#F5B301':'#2ecc71') : eq?'#e056fd' : sim?'#243a56' : co?'#20344d' : '#33517a'},
          label:e.rel==='PRECEDES'?'→':'',font:{size:8,color:'#5f7aa0'}};}))},
    (mode==='slo-dag'||mode==='slo-prereq')
      ? {layout:{hierarchical:{enabled:true,direction:'UD',levelSeparation:90,nodeSpacing:45,treeSpacing:110,blockShifting:true,edgeMinimization:true}},physics:false,interaction:{hover:true}}
      : {physics:{stabilization:{iterations:120},barnesHut:{gravitationalConstant:-8000,springLength:90}},interaction:{hover:true}});
  network.on('click',p=>{const info=document.getElementById('info');
    if(!p.nodes.length){info.style.display='none';return;}
    const n=byId[p.nodes[0]];info.style.display='block';
    info.innerHTML='<h3>'+n.label+'</h3>'+Object.entries(n.props).map(([k,v])=>'<div><b>'+k+':</b> '+String(v).slice(0,220)+'</div>').join('');});
}
modeSel.onchange=draw;bookSel.onchange=draw;subjSel.onchange=draw;
subjSel.value=SUBJECTS[0];
bookSel.value=BOOKS[0];draw();
</script></body></html>'''


def build_html(graph_json_path, out_path=None):
    g = json.load(open(graph_json_path))
    books = sorted({n["props"]["id"] for n in g["nodes"] if n["label"] == "Book"})
    vis = open(os.path.join(HERE, "vendor", "vis-network.min.js")).read()
    doc = (TMPL.replace("__VIS__", vis)
              .replace("__DATA__", json.dumps(g, ensure_ascii=False))
              .replace("__BOOKS__", json.dumps(books)))
    out_path = out_path or os.path.join(os.path.dirname(graph_json_path), "explorer.html")
    open(out_path, "w").write(doc)
    return out_path, len(doc), len(books)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: explorer.py <graph.json> [<out.html>]")
    out, size, nb = build_html(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print(f"wrote {out} {round(size/1e6,2)}MB · self-contained (0 CDN) · {nb} book(s)")
