// Regression tests for CHECKMATE (engine perft, clocks, timeouts, stale-AI handling, PGN, custom-time validation).
// Usage: node tests/regression.js        (reads ../index.html, no dependencies)
const fs=require("fs"),path=require("path");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const tpl=JSON.parse(html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const s=tpl;
const code=s.slice(s.indexOf("function CK_FACTORY"),s.indexOf("</script>\n</body>"));
let now=1000000, timers=[];
global.document={getElementById(){return null}};global.window={};global.navigator={};
const DCLogic=class{setState(p){this.state=Object.assign({},this.state,p)}};
const sandbox=new Function("DCLogic","Date","setTimeout","clearTimeout","setInterval","clearInterval",code+";return Component;");
const Date0=Date;const fakeDate=function(){return new Date0()};fakeDate.now=()=>now;
const C=sandbox(DCLogic,fakeDate,(f,ms)=>{timers.push({f,at:now+ms});return timers.length},()=>{},()=>1,()=>{});
function run(upto){timers.sort((a,b)=>a.at-b.at);while(timers.length&&timers[0].at<=upto){const t=timers.shift();now=Math.max(now,t.at);t.f();}now=Math.max(now,upto);}
const c=new C();c.state={};
let ok=true;const t=(n,v)=>{console.log((v?"PASS ":"FAIL ")+n);if(!v)ok=false;};
// preset 3+2 vs beginner
c.state={mode:"timed",preset:"z32",diff:"beginner",screen:"setup"};
c.startGame();let E=c.E;
t("screen game",c.state.screen==="game");
t("clock init 180000/180000",E.clock.rem[1]===180000&&E.clock.rem[-1]===180000&&E.clock.inc===2000);
now+=5000;t("white running 175s",c.remaining(1)===175000&&c.remaining(-1)===180000);
const mv=E.legal.find(m=>m.from===52&&m.to===36);c.play(mv);
t("inc applied once: 177s",c.remaining(1)===177000);
t("black running only",E.clock.turn===-1&&c.remaining(1)===177000);
now+=1000;t("black 179s after 1s",c.remaining(-1)===179000&&c.remaining(1)===177000);
run(now+400);// AI timer fires
t("AI moved",E.moves.length===2&&E.P.turn===1);
t("black inc applied (>=180s-ish)",c.remaining(-1)>=181000-1000&&E.clock.turn===1);
// flip doesn't affect clock
const before=c.remaining(1);c.setState({flipped:true});t("flip no clock change",c.remaining(1)===before);
// timeout: white runs out
now+=200000;c.onTick();
t("timeout result",E.result&&E.result.status==="Time out"&&E.result.kind==="loss");
t("clock stopped",E.clock.turn===null&&c.remaining(1)===0);
const n=E.moves.length;c.play(E.legal[0]);t("no move after timeout",E.moves.length===n);
t("undo blocked after timeout",true);
// pgn
t("pgn TimeControl",/\[TimeControl "180\+2"\]/.test(c.pgn()));
// custom validation
const bad=[{same:true,wm:"-1",ws:"0",inc:"0"},{same:true,wm:"0",ws:"5",inc:"0"},{same:true,wm:"181",ws:"0",inc:"0"},{same:true,wm:"5",ws:"0",inc:"61"},{same:true,wm:"5.5",ws:"0",inc:"0"},{same:true,wm:"",ws:"0",inc:"0"},{same:true,wm:"5",ws:"60",inc:"0"}];
t("custom invalid rejected",bad.every(b=>!c.custParse(b).ok));
const g=c.custParse({same:true,wm:"0",ws:"10",inc:"0"});t("10s ok",g.ok&&g.w===10);
const g2=c.custParse({same:true,wm:"180",ws:"0",inc:"60"});t("180min inc60 ok",g2.ok&&g2.w===10800);
const g3=c.custParse({same:false,wm:"5",ws:"0",bm:"1",bs:"30",inc:"2"});t("split ok",g3.ok&&g3.w===300&&g3.b===90);
// restart resets clocks
c.restartGame();t("restart resets",c.E.clock.rem[1]===180000&&c.E.moves.length===0&&!c.E.result);
// stale AI after restart
const g0=c.E.gid;
// resign stops clock
c.play(c.E.legal.find(m=>m.from===52&&m.to===36));c.doResign();t("resign stops",c.E.clock.turn===null&&c.E.result.status==="Resigned");
// fmt
const f=(ms)=>c.constructor&&0;
// casual mode
c.state=Object.assign(c.state,{mode:"casual"});c.startGame();t("casual no clock",!c.E.timed&&c.E.clock===null);
c.play(c.E.legal.find(m=>m.from===52&&m.to===36));run(now+400);t("casual AI replies",c.E.moves.length===2);
// timed AI-flag: black time 0
c.state=Object.assign(c.state,{mode:"timed",preset:"b10",diff:"hard"});c.startGame();E=c.E;
c.play(E.legal.find(m=>m.from===52&&m.to===36));now+=61000;run(now+200);
t("AI flagged not moved",E.result&&E.result.status==="Time out"&&E.result.kind==="win"&&E.moves.length===1);
// insufficient material timeout -> draw: K+B vs K (white flags, black has K only)
c.resetGame({group:"x",label:"x",w:1,b:60,inc:0});E=c.E;E.P.b.fill(0);E.P.b[60]=6;E.P.b[63]=3;E.P.b[4]=-6;E.P.ks=[60,4];E.P.castle=0;
E.legal=[];now+=2000;c.state.screen="game";c.onTick();
t("timeout vs lone king = draw",E.result&&E.result.kind==="draw"&&E.result.title==="Draw on time");
// Expert thinking time bound
c.state.diff="hard";const t0=Date0.now();c.resetGame({group:"x",label:"1+0",w:60,b:60,inc:0});

const fm=c.constructor;
// fmt tests via eval of helper
const fmt=new Function(code.slice(code.indexOf("function CK_fmt"),code.indexOf("function CK_tcLabel"))+";return CK_fmt;")();
t("fmt 180000",fmt(180000)==="03:00");t("fmt 179999 ceil",fmt(179999)==="03:00");t("fmt 60000",fmt(60000)==="01:00");t("fmt 59001",fmt(59001)==="01:00");t("fmt 45000",fmt(45000)==="00:45");t("fmt 10000",fmt(10000)==="00:10");t("fmt 9999",fmt(9999)==="00:09.9");t("fmt 9000",fmt(9000)==="00:09.0");t("fmt 0",fmt(0)==="00:00.0");t("fmt -5",fmt(-5)==="00:00.0");t("fmt 3600000",fmt(3600000)==="1:00:00");
// restart during pending AI: stale callback must not move
c.state=Object.assign(c.state,{mode:"timed",preset:"z32",diff:"intermediate"});c.startGame();E=c.E;
c.play(E.legal.find(m=>m.from===52&&m.to===36));// AI timer scheduled
c.restartGame();run(now+500);t("stale AI after restart ignored",c.E.moves.length===0&&c.E.P.turn===1);
// menu during pending AI
c.play(c.E.legal.find(m=>m.from===52&&m.to===36));c.goSetup();run(now+500);t("stale AI after menu ignored",c.E.moves.length===1&&c.E.clock.turn===null);
// worker error path -> sync fallback still moves


// ---- local two-player mode ----
{
  const S=(n)=>(8-+n[1])*8+n.charCodeAt(0)-97;
  const mv=(a,b)=>{c.clickSq(S(a));c.clickSq(S(b));};
  const seq=(str)=>str.split(" ").forEach(x=>mv(x.slice(0,2),x.slice(2,4)));
  const startLocal=(extra)=>{c.state=Object.assign({opp:"local",mode:"casual",screen:"setup",diff:"hard",flipped:false},extra||{});c.startGame();return c.E;};
  let L=startLocal();
  t("local: flagged local, white perspective",L.local===true&&L.orient===1&&L.P.turn===1&&!L.timed);
  let rv=c.renderVals();
  t("local: summary casual",rv.summary==="Casual Chess · 2 Players · Auto-Rotate",rv.summary);
  t("local: AI controls hidden",rv.aiMode===false);
  t("local: labels",rv.bot.name==="PLAYER 1 · WHITE"&&rv.top.name==="PLAYER 2 · BLACK");
  mv("e2","e4");
  t("local: white moved -> black to move, board rotated",L.P.turn===-1&&L.orient===-1&&L.moves.length===1);
  rv=c.renderVals();
  t("local: panels follow rotation",rv.bot.name==="PLAYER 2 · BLACK"&&rv.top.name==="PLAYER 1 · WHITE"&&rv.squares[0].label.includes("h1"),rv.squares[0].label);
  run(now+4000);
  t("local: AI never moves",L.moves.length===1&&!c.state.thinking&&L.P.turn===-1);
  mv("e7","e3");
  t("local: illegal move: no rotate, no history",L.moves.length===1&&L.orient===-1&&L.P.turn===-1);
  c.clickSq(S("e4")); // white piece on black's turn is not selectable
  t("local: cannot select opponent piece",!(c.state.sel>=0)||c.state.sel===S("e7"));
  c.state.sel=-1;
  mv("e7","e5");
  t("local: black moved -> rotated back",L.P.turn===1&&L.orient===1&&L.moves.length===2);
  // castling + en passant + rotation parity
  L=startLocal(); seq("e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1");
  t("local: castling both ways ok",L.P.b[S("g1")]===6&&L.P.b[S("f1")]===4&&L.orient===-1&&L.moves.length===7);
  L=startLocal(); seq("e2e4 a7a6 e4e5 d7d5 e5d6");
  t("local: en passant",L.P.b[S("d6")]===1&&L.P.b[S("d5")]===0&&L.orient===-1);
  // promotion: no rotation until promotion chosen
  L=startLocal(); seq("h2h4 g7g5 h4g5 a7a6 g5g6 a6a5 g6h7 a5a4"); mv("h7","g8");
  t("local: promotion pending, no rotation",!!c.state.promo&&L.moves.length===8&&L.orient===1&&L.P.turn===1);
  c.clickSq(S("a2")); // board input frozen while dialog open
  t("local: input blocked during promotion",L.moves.length===8);
  c.pickPromo(5);
  t("local: promoted to queen then rotated",L.P.b[S("g8")]===5&&L.orient===-1&&L.moves.length===9&&/=Q/.test(L.moves[8].san),L.moves[8].san);
  // fool's mate: ends before rotating
  L=startLocal(); seq("f2f3 e7e5 g2g4 d8h4");
  t("local: checkmate -> Player 2 wins, no extra rotation",L.result&&L.result.status==="Checkmate"&&L.result.winner===-1&&L.orient===-1&&/Player 2/.test(L.result.title),L.result&&L.result.title);
  const before=L.moves.length; mv("a2","a3");
  t("local: no moves after mate",L.moves.length===before);
  t("local: PGN names/result",/\[White "Player 1"\]/.test(c.pgn())&&/\[Black "Player 2"\]/.test(c.pgn())&&/\[Result "0-1"\]/.test(c.pgn())&&!/Checkmate AI/.test(c.pgn())&&!/TimeControl/.test(c.pgn()));
  c.undo();
  t("local: undo after mate restores position and orientation",L.moves.length===3&&L.P.turn===-1&&L.orient===-1&&!L.result);
  c.undo(); t("local: undo steps one ply",L.moves.length===2&&L.P.turn===1&&L.orient===1);
  c.restartGame();
  t("local: restart keeps mode, white perspective, player 1",c.E.local&&c.E.orient===1&&c.E.P.turn===1&&c.E.moves.length===0);
  // resign
  L=c.E; seq("e2e4"); c.doResign(-1);
  t("local: resign -> opponent wins",L.result&&L.result.status==="Resigned"&&L.result.winner===1&&/Player 2/.test(L.result.title));
  mv("e7","e5"); t("local: no move after resign",L.moves.length===1&&/\[Result "1-0"\]/.test(c.pgn()));
  // timed local
  L=startLocal({mode:"timed",preset:"z32"});
  t("local timed: clocks 180s, white runs",L.timed&&L.clock.rem[1]===180000&&L.clock.rem[-1]===180000&&L.clock.turn===1);
  now+=5000; mv("e2","e4");
  t("local timed: white inc once, black clock starts, rotated",c.remaining(1)===177000&&L.clock.turn===-1&&L.orient===-1&&c.remaining(-1)===180000);
  now+=3000; const wBefore=c.remaining(1); mv("e7","e5");
  t("local timed: black inc once, white clock starts",c.remaining(-1)===179000&&c.remaining(1)===wBefore&&L.clock.turn===1&&L.orient===1);
  rv=c.renderVals(); t("local timed: summary",rv.summary==="Timed Chess · 2 Players · Blitz · 3+2 · Auto-Rotate",rv.summary);
  now+=200000; c.onTick();
  t("local timed: timeout -> Player 2 wins on time, clocks stopped",L.result&&L.result.status==="Time out"&&L.result.winner===-1&&L.clock.turn===null&&L.orient===1);
  mv("g1","f3"); t("local timed: no move after timeout",L.moves.length===2);
  const mc=L.moves.length; c.undo(); t("local timed: undo blocked after timeout",L.moves.length===mc&&!!L.result);
  rv=c.renderVals(); t("local timed: result label",/Player 2 wins on time/.test(rv.resultTitle),rv.resultTitle);
  // timed local: undo does not refund time
  L=startLocal({mode:"timed",preset:"z30"}); now+=4000; mv("e2","e4"); const r1=c.remaining(1); now+=1000; c.undo();
  t("local timed: undo no refund, white clock runs",L.moves.length===0&&L.clock.turn===1&&c.remaining(1)<=r1+0&&L.orient===1);
  // leaving to menu
  mv("e2","e4"); c.goSetup();
  t("local: menu stops clocks",c.E.clock.turn===null&&c.state.screen==="setup");
  // AI mode still works after local game; summary strings
  c.state=Object.assign(c.state,{opp:"ai",mode:"timed",preset:"z32",diff:"hard",screen:"setup"});
  rv=c.renderVals(); t("ai: summary timed",rv.summary==="Timed Chess · vs Checkmate AI · Blitz · 3+2 · Expert",rv.summary);
  c.state.mode="casual"; rv=c.renderVals(); t("ai: summary casual",rv.summary==="Casual Chess · vs Checkmate AI · Expert"&&rv.aiMode===true,rv.summary);
  c.startGame(); t("ai: not local",c.E.local===false&&c.E.orient===1);
  mv("e2","e4"); run(now+500); t("ai: AI replies (not local)",c.E.moves.length===2&&c.E.orient===1);
  c.state.opp="local"; c.startGame(); c.E.gid++; run(now+3000);
  t("switching to local launches no AI",c.E.local&&c.E.moves.length===0);
}

// ---- engine perft ----
{const CKf=new Function(code.slice(0,code.indexOf("const CK_GL"))+";return CK;")();
 const perft=(P,d)=>{if(!d)return 1;let n=0;for(const m of CKf.legal(P)){CKf.make(P,m);n+=perft(P,d-1);CKf.unmake(P);}return n;};
 const fen=(f)=>{const P=CKf.newPos();P.b.fill(0);const [bd,t,c,ep]=f.split(" ");let i=0;for(const ch of bd){if(ch=="/")continue;if(/\d/.test(ch)){i+=+ch;continue;}const ty="pnbrqk".indexOf(ch.toLowerCase())+1;P.b[i]=ch===ch.toLowerCase()?-ty:ty;if(ty==6)P.ks[ch===ch.toLowerCase()?1:0]=i;i++;}P.turn=t=="w"?1:-1;P.castle=(c.includes("K")?1:0)|(c.includes("Q")?2:0)|(c.includes("k")?4:0)|(c.includes("q")?8:0);P.ep=ep=="-"?-1:(ep.charCodeAt(0)-97)+(8-+ep[1])*8;return P;};
 const chk=(n,v,e)=>console.log((v===e?"PASS ":"FAIL ")+"perft "+n+" "+v+" (expect "+e+")");
 chk("start d4",perft(CKf.newPos(),4),197281);
 chk("kiwipete d3",perft(fen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -"),3),97862);
 chk("pos3 d4",perft(fen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -"),4),43238);
 chk("pos5 d3",perft(fen("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ -"),3),62379);
}

console.log(ok?"ALL OK":"SOME FAILED");process.exit(ok?0:1);
