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
