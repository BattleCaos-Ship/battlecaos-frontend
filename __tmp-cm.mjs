import { io } from 'socket.io-client';
import { createHmac } from 'crypto';
import Redis from 'ioredis';
const SECRET='126f79293d3077349309f1290062755ca4e2a53178a108e091a484c772183dc9';
const redis=new Redis('redis://localhost:6379');
function b64(o){return Buffer.from(JSON.stringify(o)).toString('base64url');}
function tok(sub,name){const h=b64({alg:'HS256',typ:'JWT'});const n=Math.floor(Date.now()/1000);const p=b64({sub,name,picture:'',iat:n,exp:n+3600});return `${h}.${p}.`+createHmac('sha256',SECRET).update(`${h}.${p}`).digest('base64url');}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,t=15000){const e=Date.now()+t;while(Date.now()<e){if(fn())return true;await wait(80);}return false;}
const FLEET=[{id:'portaaviones',size:5,x:0,y:0,horizontal:false},{id:'acorazado',size:4,x:1,y:0,horizontal:false},{id:'crucero',size:3,x:2,y:0,horizontal:false},{id:'submarino',size:3,x:3,y:0,horizontal:false},{id:'destructor',size:2,x:4,y:0,horizontal:false}];
function conn(name,sub){const s=io('http://localhost:3000',{auth:{token:tok(sub,name)},transports:['websocket']});const st={s,sub,last:null,cm:0,err:[]};s.on('game:state',x=>st.last=x);s.on('poder:contramedida-disponible',()=>st.cm++);s.on('game:error',e=>st.err.push(e.error));return st;}
const ana=conn('Ana','cm-ana'), beto=conn('Beto','cm-beto');
await until(()=>ana.s.connected&&beto.s.connected); await wait(300);
let codigo=null; ana.s.on('room:created',({codigo:c})=>codigo=c);
ana.s.emit('room:create',{modo:'1v1',name:'Ana'}); await until(()=>codigo);
beto.s.emit('room:join',{codigo,name:'Beto'}); await until(()=>ana.last?.fase==='COLOCACION');
ana.s.emit('colocacion:set',{codigo,ships:FLEET}); beto.s.emit('colocacion:set',{codigo,ships:FLEET});
await until(()=>ana.last?.fase==='TURNOS',15000);

async function energiaB(){return await redis.get(`sala:${codigo}:energia:B`);}
// CASO 1: Beto con 5E usa contramedida → debe quedar en 2E
await until(()=>ana.last?.turno?.jugadorActual==='cm-ana');
await redis.set(`sala:${codigo}:energia:A`,'5'); await redis.set(`sala:${codigo}:energia:B`,'5');
ana.s.emit('poder:usar',{codigo,powerType:'bombardeo',target:{x:7,y:7}});
await until(()=>beto.cm>0,6000);
console.log('CASO 1 — Beto (5E) activa contramedida:');
beto.s.emit('contramedida:activar',{codigo}); await wait(800);
console.log('  energía B tras contramedida (5→esperado 2):', await energiaB(), (await energiaB())==='2'?'✓ costó 3E':'✗');
console.log('  ¿canceló el poder? contramedidaActiva:', JSON.parse(await redis.get(`sala:${codigo}`)).contramedidaActiva===null?'✓':'(en curso)');

await wait(6000); // dejar que expire cualquier ventana / poder
// CASO 2: Beto con 2E intenta contramedida → debe RECHAZARSE (no alcanza 3E)
await until(()=>ana.last?.turno?.jugadorActual==='cm-ana',20000);
await redis.set(`sala:${codigo}:energia:A`,'5'); await redis.set(`sala:${codigo}:energia:B`,'2');
beto.err.length=0; beto.cm=0;
ana.s.emit('poder:usar',{codigo,powerType:'bombardeo',target:{x:8,y:8}});
await until(()=>beto.cm>0,6000);
console.log('CASO 2 — Beto (2E) intenta contramedida:');
beto.s.emit('contramedida:activar',{codigo}); await wait(800);
console.log('  error recibido:', beto.err.join(',')||'ninguno', beto.err.includes('energia_insuficiente')?'✓ rechazado por falta de energía':'✗');
console.log('  energía B sigue 2 (no se descontó):', await energiaB(), (await energiaB())==='2'?'✓':'✗');
ana.s.disconnect(); beto.s.disconnect(); await redis.quit(); process.exit(0);
