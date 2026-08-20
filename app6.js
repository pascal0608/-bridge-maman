
const SUITS=['♣','♦','♥','♠','SA'];
const CARD_SUITS=['♠','♥','♦','♣'];
const RANKS=['A','R','D','V','10','9','8','7','6','5','4','3','2'];
const RV={A:14,R:13,D:12,V:11,'10':10,'9':9,'8':8,'7':7,'6':6,'5':5,'4':4,'3':3,'2':2};
const HCP={A:4,R:3,D:2,V:1};
const P=['W','N','E','S'];
const NAME={W:'Ouest',N:'Nord',E:'Est',S:'Sud'};
let hands={}, dealer='S', turn='S', auction=[], selectedLevel=1, selectedStrain='♣', dealNo=0;
let phase='auction', contract=null, declarer=null, dummy=null, leader=null, current=null, trick=[], leadSuit=null, tricksNS=0, tricksEW=0, dummyShown=false;
let lastDealSnapshot=null, runToken=0;

const $=id=>document.getElementById(id);
const cloneHands=src=>Object.fromEntries(P.map(p=>[p,(src[p]||[]).map(c=>({...c}))]));
function later(fn,ms){const token=runToken;setTimeout(()=>{if(token===runToken)fn()},ms)}
function deck(){
  let d=[]; for(const s of CARD_SUITS)for(const r of RANKS)d.push({s,r});
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}
  return d;
}
function sortHand(h){
  const suitOrder=['♠','♥','♣','♦'];
  const buckets={};
  suitOrder.forEach(s=>buckets[s]=h.filter(c=>c.s===s).sort((a,b)=>RANKS.indexOf(a.r)-RANKS.indexOf(b.r)));
  const result=[];
  let more=true;
  while(more){
    more=false;
    for(const s of suitOrder){
      if(buckets[s].length){ result.push(buckets[s].shift()); more=true; }
    }
  }
  return result;
}
function hcp(h){return h.reduce((n,c)=>n+(HCP[c.r]||0),0)}
function shape(h){return CARD_SUITS.map(s=>h.filter(c=>c.s===s).length)}
function fmtCard(c){return c.r+c.s}
function isRed(c){return c.s==='♥'||c.s==='♦'}
function next(p){return P[(P.indexOf(p)+1)%4]}
function side(p){return (p==='N'||p==='S')?'NS':'EW'}

function bidRank(b){
  if(!b || b.type!=='bid') return -1;
  return (b.level-1)*5+SUITS.indexOf(b.strain);
}
function lastRealBid(){for(let i=auction.length-1;i>=0;i--)if(auction[i].type==='bid')return auction[i];return null}
function lastNonPass(){for(let i=auction.length-1;i>=0;i--)if(auction[i].type!=='pass')return auction[i];return null}
function legalBid(level,strain){const last=lastRealBid(); return !last || ((level-1)*5+SUITS.indexOf(strain))>bidRank(last)}
function canDouble(){
  const x=lastNonPass(); if(!x||x.type!=='bid')return false;
  return side(x.player)!==side(turn);
}
function canRedouble(){
  const x=lastNonPass(); if(!x||x.type!=='double')return false;
  return side(x.player)!==side(turn);
}
function auctionEnded(){
  if(auction.length<4)return false;
  const tail=auction.slice(-3);
  return tail.every(x=>x.type==='pass') && auction.some(x=>x.type==='bid');
}
function passedOut(){return auction.length===4 && auction.every(x=>x.type==='pass')}

function renderAuction(){
  const body=$('auctionBody'); body.innerHTML='';
  let rows=[]; let row=['','','','']; let started=false;
  for(const a of auction){
    const idx=P.indexOf(a.player);
    if(started && idx===0){rows.push(row);row=['','','','']}
    started=true;
    row[idx]=a.type==='pass'?'Passe':a.type==='double'?'X':a.type==='redouble'?'XX':`${a.level}${a.strain}`;
  }
  rows.push(row);
  rows.forEach(r=>{const tr=document.createElement('tr');r.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td)});body.appendChild(tr)});
}
function seatActive(p){
  ['W','N','E','S'].forEach(x=>$('seat'+x).classList.toggle('active',x===p));
}

function enableFingerSelection(el,player){
  let active=false, chosen=null, pointerId=null;
  const clear=()=>{
    el.querySelectorAll('.card.preview').forEach(c=>c.classList.remove('preview'));
    chosen=null;
  };
  const chooseAt=(x,y)=>{
    const hit=document.elementFromPoint(x,y)?.closest('.card');
    const card=hit && hit.parentElement===el && hit.classList.contains('playable') ? hit : null;
    if(card===chosen)return;
    clear();
    if(card){chosen=card;card.classList.add('preview')}
  };
  el.onpointerdown=e=>{
    const card=e.target.closest('.card.playable');
    if(!card)return;
    active=true; pointerId=e.pointerId;
    try{el.setPointerCapture(pointerId)}catch(_e){}
    chooseAt(e.clientX,e.clientY);
    e.preventDefault();
  };
  el.onpointermove=e=>{
    if(!active||e.pointerId!==pointerId)return;
    chooseAt(e.clientX,e.clientY);
    e.preventDefault();
  };
  const finish=e=>{
    if(!active||e.pointerId!==pointerId)return;
    chooseAt(e.clientX,e.clientY);
    const card=chosen;
    const index=card?Number(card.dataset.index):-1;
    clear(); active=false;
    try{el.releasePointerCapture(pointerId)}catch(_e){}
    pointerId=null;
    if(index>=0) humanCard(player,index);
    e.preventDefault();
  };
  el.onpointerup=finish;
  el.onpointercancel=()=>{clear();active=false;pointerId=null};
}

function renderHand(player,elId,clickable){
  const el=$(elId); el.innerHTML='';
  el.classList.toggle('playable-hand',clickable);
  const legal=phase==='play' ? legalCards(player) : hands[player].map((_,i)=>i);
  hands[player].forEach((c,i)=>{
    const isLegal=legal.includes(i);
    const d=document.createElement('div');
    d.className='card '+(isRed(c)?'red ':'')+((phase==='play'&&clickable&&!isLegal)?'illegal ':'')+(clickable&&isLegal?'playable':'');
    d.dataset.index=String(i); d.dataset.player=player;
    d.innerHTML=`${c.r}<br>${c.s}`;
    const n=hands[player].length;
    const mid=(n-1)/2;
    const off=i-mid;
    const angle=off*(n>=11?2.15:n>=8?2.5:3.0);
    const drop=Math.pow(Math.abs(off),1.34)*0.62;
    d.style.setProperty('--card-drop',`${drop}px`);
    d.style.setProperty('--card-angle',`${angle}deg`);
    d.style.zIndex=String(i+1);
    el.appendChild(d);
  });
  if(clickable)enableFingerSelection(el,player);
  else {el.onpointerdown=el.onpointermove=el.onpointerup=el.onpointercancel=null}
}
function renderHands(){
  const southIsDummy = dummyShown && dummy==='S';
  const southClickable = phase==='play' && current==='S';
  renderHand('S','handS', southClickable);
  $('southHcp').textContent=`(${hcp(hands.S)} H)`;
  $('southLabel').innerHTML=(southIsDummy?'Mort — Sud ':'Votre main — Sud ')+`<span id="southHcp">(${hcp(hands.S)} H)</span>`;

  if(dummyShown && dummy!=='S'){
    $('dummyWrap').classList.remove('hidden');
    $('dummyLabel').textContent=`Mort — ${NAME[dummy]} (${hcp(hands[dummy])} H)`;
    renderHand(dummy,'dummyHand', phase==='play' && declarer==='S' && current===dummy);
  }else{
    $('dummyWrap').classList.add('hidden');
  }
}
function renderTrick(){
  ['N','E','S','W'].forEach(p=>{
    const x=trick.find(t=>t.p===p); const e=$('trick'+p);
    e.textContent=x?fmtCard(x.c):'—'; e.style.color=x&&isRed(x.c)?'#d41d2c':'#111';
  });
  $('scoreLine').textContent=`Nord-Sud ${tricksNS} pli(s) • Est-Ouest ${tricksEW} pli(s)`;
}

function addBid(obj){
  obj.player=turn; auction.push(obj); renderAuction(); turn=next(turn); seatActive(turn);
  if(passedOut()){ $('status').textContent='Passe général. Nouvelle donne.'; later(newDeal,800); return; }
  if(auctionEnded()){ finishAuction(); return; }
  if(turn!=='S') later(botAuction,420);
  else $('status').textContent='À vous, Sud.';
}
function humanBid(type){
  if(phase!=='auction'||turn!=='S')return;
  if(type==='pass')addBid({type:'pass'});
  if(type==='double'&&canDouble())addBid({type:'double'});
  if(type==='redouble'&&canRedouble())addBid({type:'redouble'});
}
function makeHumanBid(){
  if(phase!=='auction'||turn!=='S')return;
  if(!legalBid(selectedLevel,selectedStrain)){ $('status').textContent='Enchère insuffisante.'; return; }
  addBid({type:'bid',level:selectedLevel,strain:selectedStrain});
}

function botOpening(p){
  const H=hcp(hands[p]), sh=shape(hands[p]);
  if(H<12)return {type:'pass'};
  if(H>=15&&H<=17&&Math.max(...sh)<=5&&Math.min(...sh)>=2)return {type:'bid',level:1,strain:'SA'};
  if(sh[0]>=5 || sh[1]>=5){
    const strain=sh[0]>=sh[1]?'♠':'♥';
    if(legalBid(1,strain))return {type:'bid',level:1,strain};
  }
  const m=sh[3]>=sh[2]?'♣':'♦'; if(legalBid(1,m))return {type:'bid',level:1,strain:m};
  return {type:'pass'};
}
function partnerLastBid(p){
  for(let i=auction.length-1;i>=0;i--){
    const a=auction[i]; if(a.type==='bid'&&side(a.player)===side(p)&&a.player!==p)return a;
  } return null;
}
function botResponse(p){
  const H=hcp(hands[p]), sh=shape(hands[p]), pb=partnerLastBid(p);
  if(!pb)return botOpening(p);
  if(H<6)return {type:'pass'};
  if(pb.strain==='♠'||pb.strain==='♥'){
    const suitIdx=CARD_SUITS.indexOf(pb.strain), fit=sh[suitIdx];
    if(fit>=3){
      let level=H>=13?4:H>=10?3:2;
      if(legalBid(level,pb.strain))return {type:'bid',level,strain:pb.strain};
    }
  }
  if(H>=6){
    const own = sh[0]>=4?'♠':sh[1]>=4?'♥':sh[2]>=4?'♦':'♣';
    if(legalBid(1,own))return {type:'bid',level:1,strain:own};
    if(H>=10&&legalBid(2,'SA'))return {type:'bid',level:2,strain:'SA'};
  }
  return {type:'pass'};
}
function botAuction(){
  if(phase!=='auction')return;
  const b=botResponse(turn);
  addBid(b);
}
function finishAuction(){
  const lb=lastRealBid(); contract={level:lb.level,strain:lb.strain,doubled:false,redoubled:false};
  const nonpass=lastNonPass(); if(nonpass?.type==='double')contract.doubled=true; if(nonpass?.type==='redouble')contract.redoubled=true;
  // declarer = first player on declaring side who bid final strain
  const declSide=side(lb.player);
  declarer=auction.find(a=>a.type==='bid'&&a.strain===contract.strain&&side(a.player)===declSide).player;
  dummy=next(next(declarer)); leader=next(declarer); current=leader; phase='play';
  $('contractLine').textContent=`Contrat : ${contract.level}${contract.strain}${contract.redoubled?'XX':contract.doubled?'X':''} par ${NAME[declarer]}`;
  $('bidControls').classList.add('hidden'); $('playControls').classList.remove('hidden'); $('playPanel').classList.remove('hidden');
  seatActive(current); $('status').textContent=`Entame : ${NAME[leader]}.`;
  if(current!=='S') later(botCard,500);
}
function legalCards(p){
  const h=hands[p].map((c,i)=>({c,i}));
  if(!leadSuit)return h.map(x=>x.i);
  const f=h.filter(x=>x.c.s===leadSuit);
  return (f.length?f:h).map(x=>x.i);
}
function trumpSuit(){return contract?.strain==='SA'?null:contract?.strain}
function beats(a,b){
  const tr=trumpSuit();
  if(a.s===b.s)return RV[a.r]>RV[b.r];
  if(tr && a.s===tr && b.s!==tr)return true;
  return false;
}
function winner(){
  let w=trick[0];
  for(let i=1;i<trick.length;i++){
    const x=trick[i];
    if(x.c.s===w.c.s && RV[x.c.r]>RV[w.c.r])w=x;
    else if(trumpSuit() && x.c.s===trumpSuit() && w.c.s!==trumpSuit())w=x;
    else if(w.c.s!==trumpSuit() && x.c.s===leadSuit && w.c.s!==leadSuit)w=x;
  }
  return w.p;
}
function cheapWinningIndex(p){
  const inds=legalCards(p);
  if(!trick.length)return inds.sort((a,b)=>RV[hands[p][a].r]-RV[hands[p][b].r])[0];
  // choose smallest card that would currently win, otherwise smallest legal
  const wins=inds.filter(i=>{
    const tmp=trick.concat([{p,c:hands[p][i]}]);
    let w=tmp[0];
    for(let k=1;k<tmp.length;k++){
      const x=tmp[k];
      if(x.c.s===w.c.s && RV[x.c.r]>RV[w.c.r])w=x;
      else if(trumpSuit() && x.c.s===trumpSuit() && w.c.s!==trumpSuit())w=x;
      else if(w.c.s!==trumpSuit() && x.c.s===leadSuit && w.c.s!==leadSuit)w=x;
    }
    return w.p===p;
  });
  const pool=wins.length?wins:inds;
  return pool.sort((a,b)=>RV[hands[p][a].r]-RV[hands[p][b].r])[0];
}
function playCard(p,i){
  if(!legalCards(p).includes(i))return;
  const c=hands[p].splice(i,1)[0];
  if(!trick.length)leadSuit=c.s;
  trick.push({p,c});
  if(!dummyShown && trick.length===1){dummyShown=true;renderHands()}
  renderHands(); renderTrick();
  if(trick.length===4){
    const w=winner(); if(side(w)==='NS')tricksNS++;else tricksEW++;
    $('status').textContent=`Pli pour ${NAME[w]}.`;
    later(()=>{
      trick=[];leadSuit=null;current=w;renderTrick();
      if(hands.S.length===0){endPlay();return}
      seatActive(current); advancePlay();
    },650);
  }else{
    current=next(p); seatActive(current); advancePlay();
  }
}
function humanCard(p,i){
  if(phase!=='play'||current!==p)return;
  const canHumanPlay = (p==='S') || (declarer==='S' && p===dummy);
  if(!canHumanPlay)return;
  if(!legalCards(p).includes(i)){ $('status').textContent='Vous devez fournir à la couleur.'; return; }
  playCard(p,i);
}
function botCard(){
  if(phase!=='play')return;
  const i=cheapWinningIndex(current); playCard(current,i);
}
function advancePlay(){
  renderHands();
  const humanControls = (current==='S') || (declarer==='S' && current===dummy);
  if(humanControls){
    $('status').textContent=current==='S'?(dummy==='S'?'Sud est le mort : choisissez vous-même la carte à jouer.':'À vous, Sud.'):`À vous de jouer depuis le mort (${NAME[dummy]}).`;
  }else{
    $('status').textContent=(dummy==='S' && current==='S')?'Sud est le mort : Nord joue cette carte.':`${NAME[current]} joue…`;
    later(botCard,420);
  }
}
function endPlay(){
  phase='done'; const target=6+contract.level; const won=side(declarer)==='NS'?tricksNS:tricksEW; const diff=won-target;
  let txt=diff>=0?`Contrat réussi${diff?` +${diff}`:''}.`:`Contrat chuté de ${-diff}.`;
  $('status').textContent=`${txt} ${won} pli(s) pour le camp déclarant.`;
  $('playControls').classList.remove('hidden');
}
function analysis(){
  if(!contract)return;
  const target=6+contract.level; const won=side(declarer)==='NS'?tricksNS:tricksEW;
  $('status').textContent=`Analyse : contrat ${contract.level}${contract.strain} par ${NAME[declarer]}. Objectif ${target} plis. Réalisés jusqu’ici : ${won}. Le robot privilégie la fourniture, la prise économique et l’atout.`;
}
function hintBid(){
  if(phase!=='auction'||turn!=='S')return;
  const b=botResponse('S'); $('status').textContent='Conseil SEF simplifié : '+(b.type==='pass'?'Passe':b.type==='bid'?`${b.level}${b.strain}`:b.type);
}
function hintCard(){
  if(phase!=='play')return;
  const human=(current==='S'&&dummy!=='S')||(declarer==='S'&&current===dummy); if(!human){$('status').textContent='Attendez le robot.';return}
  const i=cheapWinningIndex(current); $('status').textContent=`Conseil : ${fmtCard(hands[current][i])}.`;
}
function autoFinish(){
  if(phase!=='play')return;
  // switch all remaining play to robots
  const old=side(declarer);
  function loop(){
    if(phase!=='play')return;
    const i=cheapWinningIndex(current); playCard(current,i);
    if(hands.S.length) later(loop,80);
  }
  loop();
}
function startDeal(initialHands, initialDealer, infoText){
  runToken++;
  hands=cloneHands(initialHands);
  dealer=initialDealer;turn=dealer;auction=[];phase='auction';contract=null;declarer=dummy=leader=current=null;trick=[];leadSuit=null;tricksNS=tricksEW=0;dummyShown=false;
  $('dealInfo').textContent=infoText;
  $('contractLine').textContent='Enchères en cours.';
  $('bidControls').classList.remove('hidden');$('playControls').classList.add('hidden');$('playPanel').classList.add('hidden');
  renderAuction();renderHands();renderTrick();seatActive(turn);
  $('status').textContent=`${NAME[dealer]} donne. ${hcp(hands.S)} H pour Sud.`;
  if(turn!=='S')later(botAuction,500); else $('status').textContent=`À vous d’ouvrir. ${hcp(hands.S)} H.`;
}
function newDeal(){
  dealNo++; const d=deck();
  const fresh={
    W:sortHand(d.slice(0,13)),N:sortHand(d.slice(13,26)),E:sortHand(d.slice(26,39)),S:sortHand(d.slice(39,52))
  };
  const freshDealer=P[(dealNo-1)%4];
  lastDealSnapshot={dealNo, dealer:freshDealer, hands:cloneHands(fresh)};
  startDeal(fresh,freshDealer,`Donne ${dealNo} • Donneur ${NAME[freshDealer]}`);
}
function replayLastDeal(){
  if(!lastDealSnapshot){$('status').textContent='Aucune donne à rejouer.';return}
  const snap=lastDealSnapshot;
  startDeal(snap.hands,snap.dealer,`Donne ${snap.dealNo} • Rejouée • Donneur ${NAME[snap.dealer]}`);
  $('status').textContent=`Même donne : à vous de rejouer. ${hcp(hands.S)} H pour Sud.`;
}


function setupControls(){
  const bl=$('bidLevels'); for(let i=1;i<=7;i++){const b=document.createElement('button');b.textContent=i;b.onclick=()=>{selectedLevel=i;[...bl.children].forEach(x=>x.classList.remove('selected'));b.classList.add('selected')};if(i===1)b.classList.add('selected');bl.appendChild(b)}
  const sr=$('strainRow'); SUITS.forEach(s=>{const b=document.createElement('button');b.textContent=s;b.onclick=()=>{selectedStrain=s;[...sr.children].forEach(x=>x.classList.remove('selected'));b.classList.add('selected');makeHumanBid()};if(s==='♣')b.classList.add('selected');sr.appendChild(b)})
  $('passBtn').onclick=()=>humanBid('pass');$('doubleBtn').onclick=()=>humanBid('double');$('redoubleBtn').onclick=()=>humanBid('redouble');
  $('hintBidBtn').onclick=hintBid;$('hintCardBtn').onclick=hintCard;$('analysisBtn').onclick=analysis;$('claimBtn').onclick=autoFinish;
  $('replayDealBtn').onclick=replayLastDeal;$('newDealBtn').onclick=newDeal;$('installBtn').onclick=()=>alert('Dans Safari : Partager → Ajouter à l’écran d’accueil.');
}
setupControls();newDeal();
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))}
